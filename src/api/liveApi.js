// Live adapter: implements the UI API contract (docs/API_CONTRACT.md) on the real SIQ_* OutSystems REST services.
// Reads are side-effect free. Writes happen only on explicit user actions (submit, approve, generate, check liquidity...).
import { get, post, put, ApiError } from './live/http.js'
import { UEN, USERS, DECISION } from './live/config.js'
import { session } from './session.js'
import { analyseSeed } from './live/analysis.js'
import {
  r2, sum, sgt, day, todaySGT, addDays, diffDays, snake, camel, idOf, propId, holdId, RANK, PREF, PREF_BACK, PREF_MAX,
  mapProduct, mapHolding, mapProposal, mapCommitment, mapTxn, userRef, userName,
} from './live/map.js'
import { money, titleCase } from '../utils/format.js'

const me = () => USERS.find((u) => u.id === session.userId) || USERS[0]
const meRole = async () => (await roleOf(me())).role
const requireDirector = async () => { if ((await meRole()) !== 'DIRECTOR') throw new ApiError('Only a Director can do this', 'FORBIDDEN') }
async function roleOf(u) {
  try {
    const r = await get('role', 'GetUserRole', { UserId: u.userId })
    if (r && r.Id && r.IsActive && r.UEN === UEN) return { ...u, role: snake(r.Role) === 'DIRECTOR' ? 'DIRECTOR' : 'FINANCE_STAFF', name: r.UserName || u.name }
  } catch { /* fall back to the configured role */ }
  return u
}

/* ---------------------------------------------------------------- loaders */
const loadProducts = async () => (await get('product', 'GetProducts')).map(mapProduct)
const loadSettings = () => get('buffer', 'GetBufferSettings', { UEN })
const horizonOf = (s) => (s && s.MaxTenorMonths) || 6
async function loadHoldings(products, settings) {
  const [rows, st] = await Promise.all([get('holding', 'GetHoldings', { UEN }), settings || loadSettings()])
  return rows.map((h) => mapHolding(h, products, horizonOf(st)))
}
const loadProposalsRaw = (status) => get('proposal', 'GetProposals', { UEN, Status: status })

async function core() {
  const [cp, products, settings, proposals] = await Promise.all([get('cash', 'GetCashPosition', { UEN }), loadProducts(), loadSettings(), loadProposalsRaw()])
  const sur = await get('forecast', 'CalculateInvestableSurplus', { UEN, TotalCash: Math.max(cp.TotalCash || 0, 0.01) })
  const holdings = await loadHoldings(products, settings)
  const reserved = r2(sum(proposals.filter((p) => snake(p.Status) === 'PENDING_APPROVAL' && String(p.ProposalType).toLowerCase() === 'invest'), (p) => Number(p.Amount)))
  const active = holdings.filter((h) => h.status === 'ACTIVE')
  const buffer = {
    calculated: r2(sur.AvgMonthlyOutflow * sur.BufferMonths), override: settings.BufferOverride > 0 ? settings.BufferOverride : null, overrideReason: '', overrideBy: null,
    effective: sur.RequiredBuffer, bufferMonths: sur.BufferMonths, avgMonthlyOutflow: sur.AvgMonthlyOutflow,
  }
  const investedPrincipal = r2(sum(active, (h) => h.principal))
  const cash = {
    asOf: todaySGT(), source: cp.Source, customer: { uen: UEN, name: 'Kopi & Co Pte Ltd' },
    accounts: (cp.Accounts || []).map((a) => ({ id: a.AccountId, name: `${a.ProductName} ${a.AccountId}`, type: a.ProductName === 'CASA' ? 'CURRENT' : a.ProductName, role: 'OPERATING', currency: a.Currency, balance: Number(a.Balance), source: cp.Source === 'Demo' ? 'Demo' : 'SMUtBank' })),
    totalCash: Number(cp.TotalCash), bankBalance: Number(cp.BankBalance), heldNotTransferred: Number(cp.HeldNotTransferred), buffer, pendingCommitments: Number(sur.PendingCommitments), reservedByProposals: reserved,
    investableSurplus: Number(sur.InvestableSurplus), availableToPropose: Math.max(0, r2(sur.InvestableSurplus - reserved)), investedPrincipal, investedValue: r2(sum(active, (h) => h.currentValue)),
    totalTreasuryAssets: r2(cp.TotalCash + sum(active, (h) => h.currentValue)), bufferCoverage: buffer.effective ? r2(cp.TotalCash / buffer.effective) : null,
  }
  return { cp, sur, products, settings, proposals, holdings, cash }
}

/* ---------------------------------------------------------------- local validation (SubmitProposal re-validates server-side) */
function runChecks(body, c, excludeId) {
  const { products, holdings, settings, cash } = c
  const amount = Number(body.amount) || 0
  const checks = []; const chk = (id, label, ok, detail, warn = false) => checks.push({ id, label, status: ok ? 'PASS' : warn ? 'WARN' : 'FAIL', detail })
  const pref = PREF[settings.RiskProfile] || 'CONSERVATIVE'
  const reserved = excludeId == null ? cash.reservedByProposals : r2(sum(c.proposals.filter((p) => snake(p.Status) === 'PENDING_APPROVAL' && String(p.ProposalType).toLowerCase() === 'invest' && p.Id !== excludeId), (p) => Number(p.Amount)))
  const available = Math.max(0, r2(cash.investableSurplus - reserved))
  chk('AMOUNT', 'Amount is positive', amount > 0, amount > 0 ? money(amount) : 'Enter an amount greater than zero')
  let product = null; let holding = null; let impact = {}
  if (body.type === 'INVEST') {
    product = products.find((p) => p.id === body.productId)
    chk('PRODUCT_APPROVED', 'Product is on the approved list', !!product && product.approved, product ? product.name : 'Select a product')
    if (product) {
      chk('RISK_LIMIT', 'Within risk preference', RANK[product.riskClass] <= PREF_MAX[pref], `${product.riskClass.replace('_', ' ')} vs ${settings.RiskProfile} profile`)
      chk('MIN_INVESTMENT', 'Meets minimum investment', amount >= product.minInvestment, `Minimum ${money(product.minInvestment)}`)
      chk('STEP', 'Multiple of the investment step', amount % product.investmentStep === 0, `Steps of ${money(product.investmentStep)}`)
      chk('TENOR', 'Tenor within investment horizon', !product.tenorMonths || product.tenorMonths <= horizonOf(settings), `${product.tenorMonths || 0}M vs ${horizonOf(settings)}M limit`, true)
    }
    chk('SURPLUS', 'Within available investable surplus', amount <= available + 0.001, `${money(available)} available (${money(cash.investableSurplus)} surplus${reserved ? `, ${money(reserved)} reserved` : ''})`)
    chk('BUFFER', 'Operating buffer preserved', cash.totalCash - amount >= cash.buffer.effective + cash.pendingCommitments - 0.001, `Cash after ${money(cash.totalCash - amount)} vs ${money(cash.buffer.effective + cash.pendingCommitments)} required`)
    impact = { cashBefore: cash.totalCash, cashAfter: r2(cash.totalCash - amount), buffer: cash.buffer.effective, headroomAfter: r2(cash.totalCash - amount - cash.buffer.effective - cash.pendingCommitments), projectedReturn: product ? r2(amount * (product.rate / 100) * ((product.tenorMonths || horizonOf(settings)) / 12)) : 0 }
  } else if (body.type === 'REDEEM') {
    holding = holdings.find((h) => h.id === body.holdingId)
    product = holding && products.find((p) => p.id === holding.productId)
    chk('HOLDING', 'Holding is active', !!holding && holding.status === 'ACTIVE', holding ? `${holding.productName} (${holding.id})` : 'Select a holding')
    if (holding && holding.status === 'ACTIVE') {
      const pending = sum(c.proposals.filter((p) => snake(p.Status) === 'PENDING_APPROVAL' && String(p.ProposalType).toLowerCase() === 'redeem' && holdId(p.HoldingId) === holding.id && p.Id !== excludeId), (p) => Number(p.Amount))
      chk('WITHIN_HOLDING', 'Amount within holding principal', amount <= holding.principal - pending + 0.001, `${money(holding.principal - pending)} redeemable${pending ? ` (${money(pending)} already pending)` : ''}`)
      if (product && !product.earlyExit.allowed && holding.tenorMonths) chk('EARLY_EXIT', 'Early exit allowed', false, 'This product has no early exit')
      if (holding.earlyBreakForfeitsInterest) {
        chk('FULL_WITHDRAWAL', 'Deposit withdrawn in full', Math.abs(amount - holding.principal) < 0.01, 'Term holdings can only be withdrawn in full')
        chk('EARLY_BREAK', 'Early withdrawal penalty', false, `Forfeits accrued interest of ${money(holding.accruedInterest, true)}${holding.maturityDate ? ` (matures ${holding.maturityDate})` : ''}`, true)
      }
      const back = holding.earlyBreakForfeitsInterest ? 0 : r2(holding.accruedInterest * (amount / holding.principal))
      impact = { cashBefore: cash.totalCash, cashAfter: r2(cash.totalCash + amount + back), buffer: cash.buffer.effective, headroomAfter: r2(cash.totalCash + amount + back - cash.buffer.effective - cash.pendingCommitments), projectedReturn: -holding.projectedReturn * (amount / holding.principal), realisedInterest: back }
    }
  } else chk('TYPE', 'Valid proposal type', false, 'Type must be INVEST or REDEEM')
  const needsDirector = amount > settings.ApprovalThreshold || !settings.AutoExecBelowThreshold
  const approval = needsDirector
    ? { required: true, route: 'DIRECTOR', reason: amount > settings.ApprovalThreshold ? `Amount exceeds the ${money(settings.ApprovalThreshold)} approval threshold` : 'Policy: Director reviews all proposals' }
    : { required: false, route: 'DIRECT', reason: `At or below the ${money(settings.ApprovalThreshold)} threshold - direct execution permitted by policy` }
  return { valid: !checks.some((x) => x.status === 'FAIL'), checks, approval, impact, product: product && { id: product.id, name: product.name, rate: product.rate, tenorMonths: product.tenorMonths } }
}

/* ---------------------------------------------------------------- forecast helpers */
async function refreshForecast(totalCash) {
  const cp = totalCash ?? (await get('cash', 'GetCashPosition', { UEN })).TotalCash
  return post('forecast', 'ForecastCashFlow', null, { UEN, TotalCash: Math.max(cp || 0, 0.01) })
}
const weeksFromSnapshots = (rows) => rows.map((w) => ({ WeekNo: w.WeekNo, WeekStart: day(w.WeekStart), Inflow: Number(w.Inflow), Outflow: Number(w.Outflow), ClosingBalance: Number(w.ClosingBalance), IsLowPoint: w.IsLowPoint }))
async function latestWeeks() { const rows = await get('snapshot', 'GetLatestForecast', { UEN }); return { weeks: weeksFromSnapshots(rows), runId: rows[0] && rows[0].RunId, createdOn: rows[0] && rows[0].CreatedOn } }
const lowestOf = (weeks) => weeks.reduce((m, w) => (!m || w.ClosingBalance < m.ClosingBalance ? w : m), null)

/* ---------------------------------------------------------------- alerts (passive reads) + explicit liquidity check */
let lastCheck = null // { at, level, message, actions, runId } from CheckBufferAlert; kept for the session

function mapRedemption(r, c) {
  const p = c.products.find((x) => x.id === r.ProductCode)
  const hold = c.holdings.find((h) => h.id === holdId(r.HoldingId))
  return {
    id: `RB-${r.HoldingId}`, action: r.Action, holdingId: holdId(r.HoldingId), productId: r.ProductCode, productName: (p && p.name) || r.ProductCode, amount: Number(r.Amount), priority: 'HIGH',
    estimatedSettlement: p && !p.tenorMonths ? 'Next business day' : hold && hold.maturityDate ? `On break of the deposit (matures ${hold.maturityDate})` : '', penaltyNote: /forfeit/i.test(r.Reason) ? r.Reason.match(/Forfeits[^.]*\./i)?.[0] || null : null,
    reason: r.Reason, prefill: { type: 'REDEEM', holdingId: holdId(r.HoldingId), amount: Number(r.Amount) },
  }
}

async function runLiquidityCheck() {
  const c = await core()
  const res = await post('cash', 'CheckBufferAlert', { UEN, UserId: me().userId })
  lastCheck = { at: Date.now(), level: res.AlertLevel, message: res.Message, runId: res.RebalanceRunId, actions: (res.SuggestedRedemptions || []).map((r) => mapRedemption(r, c)), res }
  return lastCheck
}

async function passiveState() {
  const c = await core(); const { cash, settings } = c
  const { weeks, createdOn } = await latestWeeks()
  const low = lowestOf(weeks)
  const buffer = cash.buffer.effective
  const actual = Math.max(0, r2(buffer - cash.totalCash)); const projected = low ? Math.max(0, r2(buffer - low.ClosingBalance)) : 0
  const alerts = []; const now = sgt(new Date().toISOString())
  const verdict = lastCheck && Date.now() - lastCheck.at < 30 * 60e3 ? lastCheck : null
  if (actual > 0) alerts.push({ id: 'ALT-BREACH', key: 'BUFFER_BREACH', type: 'BUFFER_BREACH', severity: 'CRITICAL', status: 'ACTIVE', title: 'Cash is below the operating buffer', message: `Cash ${money(cash.totalCash)} is ${money(actual)} below the ${money(buffer)} buffer.${verdict ? ' ' + verdict.message : ' Press "Check liquidity" for a redemption plan.'}`, shortfall: actual, cash: cash.totalCash, buffer, raisedAt: now })
  else if (projected > 0) alerts.push({ id: 'ALT-PROJECTED', key: 'PROJECTED_SHORTFALL', type: 'PROJECTED_SHORTFALL', severity: 'WARNING', status: 'ACTIVE', title: 'Projected shortfall within 13 weeks', message: `Forecast cash falls to ${money(low.ClosingBalance)} in week ${low.WeekNo}, ${money(projected)} under the buffer.${verdict ? ' ' + verdict.message : ' Press "Check liquidity" for a redemption plan.'}`, shortfall: projected, cash: cash.totalCash, buffer, raisedAt: sgt(createdOn) || now })
  if (cash.availableToPropose >= settings.InvestTrigger && actual === 0) alerts.push({ id: 'ALT-IDLE', key: 'IDLE_SURPLUS', type: 'IDLE_SURPLUS', severity: 'INFO', status: 'ACTIVE', title: 'Idle cash available to invest', message: `${money(cash.availableToPropose)} is above the buffer and earning close to nothing. Review the allocation recommendation.`, shortfall: 0, cash: cash.totalCash, buffer, raisedAt: now })
  for (const h of c.holdings.filter((x) => x.status === 'ACTIVE' && x.daysToMaturity != null && x.daysToMaturity <= 30)) alerts.push({ id: `ALT-MAT-${h.id}`, key: `MATURITY:${h.id}`, type: 'MATURITY', severity: 'INFO', status: 'ACTIVE', title: `${h.productName} matures in ${h.daysToMaturity} days`, message: `${money(h.principal)} plus about ${money(h.projectedReturn)} interest returns on ${h.maturityDate}.`, holdingId: h.id, shortfall: 0, cash: cash.totalCash, buffer, raisedAt: now })
  const shortfall = Math.max(actual, projected)
  let actions
  if (shortfall > 0) actions = verdict && verdict.actions.length ? verdict.actions : [{ id: 'RB-CHECK', action: 'CHECK', priority: 'HIGH', amount: shortfall, reason: 'Press "Check liquidity" to ask the allocation engine which holdings to redeem.' }]
  else if (cash.availableToPropose >= settings.InvestTrigger) actions = [{ id: 'RB-INVEST', action: 'INVEST', priority: 'MEDIUM', amount: cash.availableToPropose, reason: `${money(cash.availableToPropose)} of investable surplus is sitting idle in the current account.`, link: 'recommendations' }]
  else actions = [{ id: 'RB-0', action: 'MAINTAIN', priority: 'LOW', amount: 0, reason: 'Cash covers the buffer for the forecast window. No change recommended.' }]
  const rebalancing = { asOf: todaySGT(), status: shortfall > 0 ? 'SHORTFALL' : actions[0].action === 'INVEST' ? 'IDLE_SURPLUS' : 'BALANCED', cash: cash.totalCash, buffer, pendingCommitments: cash.pendingCommitments, shortfall, actions, checked: !!verdict, message: verdict && verdict.message }
  return { c, alerts, rebalancing, weeks, low }
}

/* ---------------------------------------------------------------- proposals */
async function settle(id) {
  let raw = await get('proposal', 'GetProposal', { Id: id })
  if (snake(raw.Status) === 'APPROVED') {
    try { await post('workflow', String(raw.ProposalType).toLowerCase() === 'invest' ? 'ExecuteInvestment' : 'ExecuteRedemption', { ProposalId: id, UserId: me().userId }) } catch { /* surfaced through ErrorMessage / status */ }
    raw = await get('proposal', 'GetProposal', { Id: id })
  }
  if (snake(raw.Status) === 'EXECUTED') { try { await refreshForecast() } catch { /* forecast refresh is best effort */ } }
  return raw
}
const workflow = async (method, params) => {
  const r = await post('workflow', method, params)
  if (r && r.Success === false) throw new ApiError(r.Message || `${method} failed`, 'WORKFLOW_FAILED', r)
  return r
}

/* ---------------------------------------------------------------- audit */
function auditSummary(a) {
  let d = null; try { d = JSON.parse(a.Detail) } catch { /* plain text */ }
  const pid = a.ProposalId ? ` (${propId(a.ProposalId)})` : ''
  if (a.Action === 'REBALANCE_EVALUATE' && d) return d.Shortfall > 0 ? `Rebalancing check: shortfall ${money(d.Shortfall)}, ${(d.Lines || []).length} holding(s) to redeem` : 'Rebalancing check: no shortfall'
  if (a.Action === 'ALERT_SHORTFALL' && d) return `${d.Level} alert: cash ${money(d.Cash)} vs buffer ${money(d.Buffer)}, shortfall ${money(d.Shortfall)}`
  if (a.Action === 'RECOMMEND_ALLOCATION') return `Allocation recommended. ${a.Detail || ''}`.trim()
  return `${titleCase(a.Action)}${pid}${a.Detail ? ': ' + a.Detail.slice(0, 160) : ''}`
}
const mapAudit = (a) => ({
  id: `AUD-${String(a.Id).padStart(4, '0')}`, ts: sgt(a.CreatedOn), event: a.Action, entityType: a.ProposalId ? 'Proposal' : a.Action.startsWith('ALERT') ? 'Alert' : a.Action.startsWith('RECOMMEND') ? 'AllocationRecommendation' : 'Treasury',
  entityId: a.ProposalId ? propId(a.ProposalId) : '', summary: auditSummary(a), details: (() => { try { return JSON.parse(a.Detail) } catch { return { Detail: a.Detail, TbankRef: a.TbankRef } } })(), actor: userRef(a.UserId),
})

/* ---------------------------------------------------------------- public API */
export const liveApi = {
  async getUsers() { return Promise.all(USERS.map(async (u) => { const r = await roleOf(u); return { id: u.id, name: r.name, title: u.title, role: r.role, email: u.email } })) },
  async getUserRole({ userId } = {}) { const u = USERS.find((x) => x.id === (userId || session.userId)) || USERS[0]; const r = await roleOf(u); return { userId: u.id, name: r.name, role: r.role, uen: UEN, company: 'Kopi & Co Pte Ltd' } },

  async getCashPosition() { return (await core()).cash },
  async calculateInvestableSurplus() {
    const { cash } = await core()
    return { asOf: cash.asOf, totalCash: cash.totalCash, operatingBuffer: cash.buffer.effective, bufferIsOverridden: cash.buffer.override != null, pendingCommitments: cash.pendingCommitments, investableSurplus: cash.investableSurplus, reservedByProposals: cash.reservedByProposals, availableToPropose: cash.availableToPropose, formula: 'investableSurplus = max(0, totalCash - requiredBuffer - pendingCommitments)' }
  },
  async getTransactions({ from, to, category, type, limit = 500 } = {}) {
    const rows = await get('seed', 'GetTransactions', { UEN, FromDate: from, ToDate: to, Category: category, Direction: type === 'CREDIT' ? 'In' : type === 'DEBIT' ? 'Out' : undefined })
    return { total: rows.length, transactions: rows.slice(0, limit).map(mapTxn) }
  },

  async forecastCashFlow({ refresh } = {}) {
    const [c, seed] = await Promise.all([core(), get('seed', 'GetTransactions', { UEN })])
    let { weeks, runId } = await latestWeeks()
    if (refresh || !weeks.length) { const r = await refreshForecast(c.cash.totalCash); weeks = r.Weeks.map((w) => ({ ...w, WeekStart: day(w.WeekStart) })); runId = r.RunId }
    const a = analyseSeed(seed); const low = lowestOf(weeks); const buffer = c.cash.buffer.effective
    return {
      asOf: todaySGT(), runId, horizonLabel: `${weeks.length} weeks`, historyWindow: { from: a.months[0] + '-01', to: a.months[a.months.length - 1] + '-28' }, history: a.history,
      avgMonthlyOutflow: c.cash.buffer.avgMonthlyOutflow, avgMonthlyInflow: a.avgMonthlyInflow, expectedMonthlyOutflow: r2(sum(a.groups, (g) => g.expectedMonthly)), recurringItems: a.groups,
      projection: weeks.map((w) => ({ date: w.WeekStart, inflow: w.Inflow, outflow: w.Outflow, commitments: 0, balance: w.ClosingBalance, buffer })), monthlyForecast: [],
      lowestPoint30d: low ? { date: low.WeekStart, balance: low.ClosingBalance } : { date: todaySGT(), balance: c.cash.totalCash },
      assumptions: { commitmentWindowDays: c.settings.PendingWindowDays, method: 'SIQ_Forecast: weekly 13-week roll-forward from today\'s cash using recurring items from the latest month, background spend and one-off commitments. History table is analysed from SeedTransaction.' },
    }
  },

  async getCashCommitments() { return (await get('commitment', 'GetCashCommitments', { UEN })).map(mapCommitment) },
  async createCommitment(a) {
    if (!a.description || !(Number(a.amount) > 0) || !a.dueDate) throw new ApiError('Description, a positive amount and a due date are required', 'VALIDATION_FAILED')
    const id = await post('commitment', 'CreateCashCommitment', null, { UEN, Name: a.description, Amount: Number(a.amount), Direction: a.direction === 'INFLOW' ? 'In' : 'Out', DueDate: a.dueDate, IsRecurring: false, Frequency: '', CreatedBy: me().userId })
    try { await refreshForecast() } catch { /* best effort */ }
    return { id: `CMT-${String(id).padStart(4, '0')}` }
  },
  async updateCommitment({ id, status }) { return deactivateCommitment(id, status) },
  async deleteCommitment({ id }) { await deactivateCommitment(id); return { id } },

  async getBufferSettings() { const { cash } = await core(); return { ...cash.buffer } },
  async updateBufferSettings({ bufferMonths, override }) {
    await requireDirector()
    const row = await settingsRow()
    if (bufferMonths !== undefined) row.BufferMonths = Number(bufferMonths)
    if (override !== undefined) row.BufferOverride = override ? Number(override) : 0
    await put('buffer', 'UpdateBufferSettings', row)
    try { await refreshForecast() } catch { /* best effort */ }
    return this.getBufferSettings()
  },
  async getTreasuryControls() {
    const s = await loadSettings()
    return { approvalThreshold: s.ApprovalThreshold, belowThresholdPolicy: s.AutoExecBelowThreshold ? 'DIRECT' : 'DIRECTOR_ALL', riskPreference: PREF[s.RiskProfile] || 'CONSERVATIVE', horizonMonths: s.MaxTenorMonths, liquidPct: Number(s.LiquidPct), commitmentWindowDays: s.PendingWindowDays, minIdleSurplus: s.InvestTrigger }
  },
  async updateTreasuryControls(p) {
    await requireDirector()
    const row = await settingsRow()
    if (p.approvalThreshold !== undefined) row.ApprovalThreshold = Number(p.approvalThreshold)
    if (p.belowThresholdPolicy !== undefined) row.AutoExecBelowThreshold = p.belowThresholdPolicy === 'DIRECT'
    if (p.riskPreference !== undefined) row.RiskProfile = PREF_BACK[p.riskPreference] || row.RiskProfile
    if (p.horizonMonths !== undefined) row.MaxTenorMonths = Number(p.horizonMonths)
    if (p.liquidPct !== undefined) row.LiquidPct = Number(p.liquidPct)
    if (p.commitmentWindowDays !== undefined) row.PendingWindowDays = Number(p.commitmentWindowDays)
    if (p.minIdleSurplus !== undefined) row.InvestTrigger = Number(p.minIdleSurplus)
    await put('buffer', 'UpdateBufferSettings', row)
    return this.getTreasuryControls()
  },

  async getProducts() {
    const [products, s] = await Promise.all([loadProducts(), loadSettings()])
    const holdings = (await loadHoldings(products, s)).filter((h) => h.status === 'ACTIVE')
    const max = PREF_MAX[PREF[s.RiskProfile] || 'CONSERVATIVE']
    return products.map((p) => ({ ...p, eligibleForPreference: RANK[p.riskClass] <= max, heldValue: r2(sum(holdings.filter((h) => h.productId === p.id), (h) => h.currentValue)) }))
  },

  async recommendAllocation({ generate } = {}) {
    const c = await core(); const s = c.settings
    let rows; let header = null
    if (generate) {
      header = await post('alloc', 'RecommendAllocation', { UEN })
      rows = (header.Lines || []).map((l) => ({ RunId: header.RunId, ProductCode: l.ProductCode, Amount: l.Amount, IndicativeRate: l.Rate, TenorMonths: l.TenorMonths, ProjectedReturn: l.ProjectedReturn, Reason: l.Reason, CreatedOn: new Date().toISOString() }))
    } else rows = await get('rec', 'GetLatestRecommendation', { UEN })
    const runId = rows[0] ? rows[0].RunId : (header && header.RunId) || null
    const horizon = horizonOf(s); const surplus = c.cash.investableSurplus
    const lines = rows.map((l) => {
      const p = c.products.find((x) => x.id === l.ProductCode) || {}; const tenor = l.TenorMonths || 0
      return { productId: l.ProductCode, productName: p.name || l.ProductCode, productType: p.type || '', role: tenor ? 'TERM' : 'LIQUIDITY_SLEEVE', amount: Number(l.Amount), pctOfSurplus: surplus ? r2((Number(l.Amount) / surplus) * 100) : 0, rate: Number(l.IndicativeRate), tenorMonths: tenor || null, liquidity: p.liquidityTerms || '', riskClass: p.riskClass || 'LOW', reason: l.Reason, projectedReturn: Number(l.ProjectedReturn), projectedReturnBasis: tenor ? `to maturity (${tenor}M), simple interest` : `over ${horizon}M at the indicative variable yield` }
    })
    const allocated = r2(sum(lines, (l) => l.amount)); const projectedReturn = r2(sum(lines, (l) => l.projectedReturn))
    const covered = c.proposals.filter((p) => runId && p.RecommendationRunId === runId && !['REJECTED', 'WITHDRAWN'].includes(snake(p.Status)))
    const actioned = lines.length > 0 && lines.every((l) => covered.some((p) => p.ProductCode === l.productId))
    const steps = [
      { n: 1, title: 'Protect operating cash', detail: `Required buffer ${money(c.cash.buffer.effective)} (${c.cash.buffer.bufferMonths} months x ${money(c.cash.buffer.avgMonthlyOutflow)} average monthly outflow) is kept in the account.` },
      { n: 2, title: 'Identify investable surplus', detail: `${money(c.cash.totalCash)} cash - ${money(c.cash.buffer.effective)} buffer - ${money(c.cash.pendingCommitments)} commitments = ${money(surplus)}.` },
    ]
    if (header) {
      steps.push({ n: 3, title: 'Check the 13-week forecast', detail: `Forecast low point ${money(header.LowPointBalance)} leaves ${money(header.LockableAmount)} that can be locked up without dipping under the buffer.` })
      steps.push({ n: 4, title: 'Apply the liquidity floor', detail: `${s.LiquidPct}% stays liquid, so at most ${money(header.TermBudget)} goes into one term product (rounded to its step); the rest goes to the money market fund. ${money(header.UninvestedCash)} stays as cash.` })
    } else steps.push({ n: 3, title: 'Rules applied by SIQ_AllocationEngine', detail: `Liquidity floor ${s.LiquidPct}%, maximum tenor ${horizon} months, risk profile ${s.RiskProfile}. Generate a new run to see the full working.` })
    return {
      id: runId, createdAt: sgt(rows[0] && rows[0].CreatedOn), status: actioned ? 'ACTIONED' : runId ? 'ACTIVE' : 'NONE',
      inputs: { horizonMonths: horizon, riskPreference: PREF[s.RiskProfile] || 'CONSERVATIVE', liquidPct: Number(s.LiquidPct) },
      waterfall: { totalCash: c.cash.totalCash, operatingBuffer: c.cash.buffer.effective, pendingCommitments: c.cash.pendingCommitments, reservedByProposals: c.cash.reservedByProposals, investableSurplus: surplus, availableToPropose: c.cash.availableToPropose, allocated, unallocated: Math.max(0, r2(c.cash.availableToPropose - allocated)) },
      lines, excluded: [], steps,
      totals: { projectedReturn, blendedRate: allocated ? r2(sum(lines, (l) => l.amount * l.rate) / allocated) : 0, baselineReturn: 0, uplift: projectedReturn, horizonMonths: horizon },
      message: lines.length ? (header && header.Message) || null : runId ? 'The latest run recommended nothing (surplus below the invest trigger).' : 'No recommendation has been generated yet. Press "Generate recommendation".',
      disclaimer: 'Illustrative, indicative rates. Projected returns are estimates, not guarantees. Decision support only - not investment advice.',
    }
  },

  async evaluateRebalancing({ run } = {}) {
    if (run) await runLiquidityCheck()
    return (await passiveState()).rebalancing
  },

  async getAlerts({ status, check } = {}) {
    if (check) await runLiquidityCheck()
    const st = await passiveState()
    let alerts = st.alerts
    if (status === 'RESOLVED') {
      const past = (await get('audit', 'GetAuditLog', { UEN, ActionPrefix: 'ALERT_', MaxRows: 20 })).map((a) => {
        let d = {}; try { d = JSON.parse(a.Detail) } catch { /* plain */ }
        return { id: `ALT-${a.Id}`, key: `AUD:${a.Id}`, type: 'BUFFER_BREACH', severity: snake(d.Level) === 'CRITICAL' ? 'CRITICAL' : 'WARNING', status: 'RESOLVED', title: `${d.Level || 'Shortfall'} alert logged`, message: d.Cash != null ? `Cash ${money(d.Cash)} vs buffer ${money(d.Buffer)}, shortfall ${money(d.Shortfall)}.` : a.Detail, raisedAt: sgt(a.CreatedOn), resolvedAt: null }
      })
      alerts = past
    } else if (status === 'ACTIVE') alerts = alerts.filter((a) => a.status === 'ACTIVE')
    return { asOf: todaySGT(), alerts, activeCount: st.alerts.filter((a) => a.severity !== 'INFO').length, rebalancing: st.rebalancing }
  },

  async validateProposal(body) { return runChecks(body, await core()) },
  async submitProposal(body) {
    const c = await core(); const v = runChecks(body, c)
    if (!v.valid) throw new ApiError('Proposal failed validation: ' + v.checks.filter((x) => x.status === 'FAIL').map((x) => x.label).join('; '), 'VALIDATION_FAILED', v)
    const holding = body.type === 'REDEEM' ? c.holdings.find((h) => h.id === body.holdingId) : null
    const r = await workflow('SubmitProposal', { UEN, ProposalType: body.type === 'INVEST' ? 'Invest' : 'Redeem', ProductCode: holding ? holding.productId : body.productId, HoldingId: holding ? idOf(holding.id) : 0, Amount: Number(body.amount), UserId: me().userId, RecommendationRunId: body.recommendationId || '' })
    const raw = await settle(r.ProposalId)
    return mapProposal(raw, c.products, { checks: v.checks, impact: v.impact })
  },
  async getProposals({ status, makerId } = {}) {
    const c = await core(); const list = [].concat(status || [])
    const single = list.length === 1 ? camel(list[0]) : undefined
    let rows = single ? await loadProposalsRaw(single) : c.proposals
    if (list.length > 1) rows = rows.filter((p) => list.includes(snake(p.Status)))
    const out = rows.map((p) => {
      const pending = snake(p.Status) === 'PENDING_APPROVAL'
      const ev = pending ? runChecks({ type: String(p.ProposalType).toUpperCase(), productId: p.ProductCode, holdingId: p.HoldingId ? holdId(p.HoldingId) : '', amount: p.Amount }, c, p.Id) : null
      return mapProposal(p, c.products, ev ? { checks: ev.checks, impact: ev.impact } : {})
    })
    return makerId ? out.filter((p) => p.maker.id === makerId) : out
  },
  async approveProposal({ id, decision, comment = '' }) {
    await requireDirector()
    const n = idOf(id); const raw0 = await get('proposal', 'GetProposal', { Id: n })
    if (!raw0.Id) throw new ApiError(`Proposal ${id} not found`, 'NOT_FOUND')
    if (snake(raw0.Status) !== 'PENDING_APPROVAL') throw new ApiError(`Proposal is already ${snake(raw0.Status)}`, 'INVALID_STATE')
    if (raw0.MakerUserId === me().userId) throw new ApiError('Maker-checker: you cannot approve your own proposal. Ask another Director.', 'SELF_APPROVAL')
    const reject = decision === 'REJECT'
    if (reject && !comment.trim()) throw new ApiError('Please give a reason for rejecting', 'COMMENT_REQUIRED')
    await workflow('ApproveProposal', { ProposalId: n, UserId: me().userId, Decision: reject ? DECISION.reject : DECISION.approve, DecisionNote: comment.trim() || (reject ? 'Rejected' : 'Approved') })
    const raw = reject ? await get('proposal', 'GetProposal', { Id: n }) : await settle(n)
    return mapProposal(raw, (await core()).products)
  },
  async withdrawProposal({ id }) {
    const n = idOf(id); const raw = await get('proposal', 'GetProposal', { Id: n })
    if (!raw.Id) throw new ApiError(`Proposal ${id} not found`, 'NOT_FOUND')
    if (snake(raw.Status) !== 'PENDING_APPROVAL') throw new ApiError(`Proposal is already ${snake(raw.Status)}`, 'INVALID_STATE')
    const { CreatedOn, UpdatedOn, ...row } = raw
    await put('proposal', 'UpdateProposalStatus', { ...row, Status: 'Withdrawn' })
    return mapProposal(await get('proposal', 'GetProposal', { Id: n }), (await core()).products)
  },

  async getHoldings({ status } = {}) {
    const [products, s] = await Promise.all([loadProducts(), loadSettings()])
    const all = await loadHoldings(products, s); const act = all.filter((h) => h.status === 'ACTIVE')
    const principal = r2(sum(act, (h) => h.principal)); const accrued = r2(sum(act, (h) => h.accruedInterest))
    return {
      asOf: todaySGT(), holdings: all.filter((h) => !status || h.status === status),
      summary: { count: act.length, principal, accruedInterest: accrued, currentValue: r2(principal + accrued), projectedReturn: r2(sum(act, (h) => h.projectedReturn)), realisedReturn: 0, blendedRate: principal ? r2(sum(act, (h) => h.principal * h.rate) / principal) : 0, liquidWithin2Days: r2(sum(act.filter((h) => h.liquidityDays <= 2), (h) => h.principal)), simulatedCount: act.filter((h) => h.simulated).length },
    }
  },

  async getAuditLog({ event, actorId, q, from, to, limit = 300 } = {}) {
    const all = (await get('audit', 'GetAuditLog', { UEN, MaxRows: 200 })).map(mapAudit)
    const needle = (q || '').toLowerCase()
    const list = all.filter((a) => (!event || a.event === event) && (!actorId || a.actor.id === actorId) && (!from || a.ts.slice(0, 10) >= from) && (!to || a.ts.slice(0, 10) <= to) && (!needle || (a.summary + a.event + a.entityId + a.actor.name).toLowerCase().includes(needle)))
    return { total: list.length, events: list.slice(0, limit), eventTypes: [...new Set(all.map((a) => a.event))].sort(), actors: [...new Map(all.map((a) => [a.actor.id, a.actor.name])).entries()].map(([id, name]) => ({ id, name })) }
  },

  async getDashboard() {
    const [c, hold, alerts, fc, audit, rec, pend] = await Promise.all([core(), this.getHoldings(), this.getAlerts({ status: 'ACTIVE' }), latestWeeks(), this.getAuditLog({ limit: 6 }), this.recommendAllocation({}), this.getProposals({ status: 'PENDING_APPROVAL' })])
    const act = hold.holdings.filter((h) => h.status === 'ACTIVE'); const cash = c.cash
    const typeLabel = { MONEY_MARKET_FUND: 'Money market fund', FIXED_DEPOSIT: 'Fixed deposit', T_BILL: 'T-bill', BOND_FUND: 'Bond fund' }
    const byType = act.reduce((m, h) => { m[h.productType] = (m[h.productType] || 0) + h.currentValue; return m }, {})
    const buffer = cash.buffer.effective; const low = lowestOf(fc.weeks)
    const forecast30 = fc.weeks.map((w) => ({ date: w.WeekStart, inflow: w.Inflow, outflow: w.Outflow, commitments: 0, balance: w.ClosingBalance, buffer }))
    return {
      asOf: todaySGT(), customer: cash.customer, cash,
      waterfall: { totalCash: cash.totalCash, operatingBuffer: buffer, pendingCommitments: cash.pendingCommitments, investableSurplus: cash.investableSurplus, recommendedAllocation: rec.status === 'ACTIVE' ? rec.waterfall.allocated : 0, investedToDate: hold.summary.principal },
      allocation: [{ key: 'buffer', label: 'Operating buffer (cash)', value: Math.min(cash.totalCash, buffer + cash.pendingCommitments) }, { key: 'idle', label: 'Idle surplus cash', value: Math.max(0, cash.totalCash - buffer - cash.pendingCommitments) }, ...Object.entries(byType).map(([k, v]) => ({ key: k, label: typeLabel[k] || k, value: r2(v) }))].filter((s) => s.value > 0),
      utilisationPct: cash.totalTreasuryAssets ? r2((hold.summary.currentValue / cash.totalTreasuryAssets) * 100) : 0, holdingsSummary: hold.summary,
      upcomingMaturities: act.filter((h) => h.maturityDate).sort((a, b) => (a.maturityDate < b.maturityDate ? -1 : 1)).map((h) => ({ holdingId: h.id, productName: h.productName, principal: h.principal, maturityDate: h.maturityDate, daysToMaturity: h.daysToMaturity, projectedReturn: h.projectedReturn })),
      pendingApprovals: { count: pend.length, totalAmount: r2(sum(pend, (p) => p.amount)), items: pend.slice(0, 3) },
      alerts: alerts.alerts, forecast30, lowestPoint30d: low ? { date: low.WeekStart, balance: low.ClosingBalance } : { date: todaySGT(), balance: cash.totalCash },
      recentActivity: audit.events, recommendationPreview: { lines: rec.lines.map((l) => ({ productName: l.productName, amount: l.amount })), projectedReturn: rec.totals.projectedReturn },
    }
  },

  // Demo controls. The real tBank balance is not touched: the "payment" is a large one-off commitment due next week,
  // which is what the forecast docs suggest for showing a cash crunch.
  async simulateSupplierPayment({ amount = 60000, supplier = 'Alpine Equipment Supplies' } = {}) {
    const id = await post('commitment', 'CreateCashCommitment', null, { UEN, Name: `Unexpected supplier payment - ${supplier} (DEMO)`, Amount: Number(amount), Direction: 'Out', DueDate: addDays(todaySGT(), 7), IsRecurring: false, Frequency: '', CreatedBy: me().userId })
    await refreshForecast()
    return { commitmentId: id, cashPosition: (await core()).cash }
  },
  async resetDemo() {
    const rows = await get('commitment', 'GetCashCommitments', { UEN })
    for (const c of rows.filter((x) => /\(DEMO\)/.test(x.Name))) await put('commitment', 'UpdateCashCommitment', { ...c, IsActive: false })
    await refreshForecast()
    return { ok: true, note: 'Demo commitments removed. Proposals, holdings and audit rows already written to the live database are not deleted (the API has no delete methods).' }
  },
}

async function deactivateCommitment(id, status) {
  const row = (await get('commitment', 'GetCashCommitments', { UEN })).find((c) => c.Id === idOf(id))
  if (!row) throw new ApiError('Commitment not found', 'NOT_FOUND')
  const { CreatedOn, ...rest } = row
  await put('commitment', 'UpdateCashCommitment', { ...rest, IsActive: false })
  try { await refreshForecast() } catch { /* best effort */ }
  return { ...mapCommitment(row), status: status || 'CANCELLED' }
}
async function settingsRow() {
  const s = await get('buffer', 'GetBufferSettings', { UEN })
  const { CreatedOn, UpdatedOn, ...row } = s
  return { ...row, UEN, UpdatedBy: me().userId }
}
