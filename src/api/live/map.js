// Mappers: real PascalCase API rows -> the shapes the screens use (docs/API_CONTRACT.md).
import { USERS } from './config.js'

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
export const sum = (xs, f = (x) => x) => xs.reduce((a, x) => a + f(x), 0)
export const MS = 86400000

// Dates: the API sends UTC (…Z) and 1900-01-01 for "empty". The UI shows Singapore time.
export const sgt = (ts) => (!ts || ts.startsWith('1900') ? null : /Z$/.test(ts) ? new Date(new Date(ts).getTime() + 8 * 3600e3).toISOString().slice(0, 19) : ts)
export const day = (d) => (!d || d.startsWith('1900') ? null : d.slice(0, 10))
export const todaySGT = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
export const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / MS)
export const addDays = (s, n) => new Date(new Date(s + 'T00:00:00Z').getTime() + n * MS).toISOString().slice(0, 10)

export const snake = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()
export const camel = (s) => String(s || '').toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('')
export const pad = (n, w = 4) => String(n).padStart(w, '0')
export const idOf = (ui) => Number(String(ui).replace(/\D/g, '')) // 'PRP-0007' -> 7
export const propId = (n) => `PRP-${pad(n)}`
export const holdId = (n) => `HLD-${pad(n)}`

export const RANK = { VERY_LOW: 1, LOW: 2, MEDIUM: 3, HIGH: 4 }
export const PREF = { Conservative: 'CONSERVATIVE', Balanced: 'MODERATE', Growth: 'GROWTH' }
export const PREF_BACK = { CONSERVATIVE: 'Conservative', MODERATE: 'Balanced', GROWTH: 'Growth' }
export const PREF_MAX = { CONSERVATIVE: 2, MODERATE: 3, GROWTH: 4 }

const TYPE = { MoneyMarketFund: 'MONEY_MARKET_FUND', FixedDeposit: 'FIXED_DEPOSIT', TBill: 'T_BILL' }

export function mapProduct(p) {
  const tenor = p.TenorMonths || 0
  return {
    id: p.Code, name: p.Name, type: TYPE[p.ProductType] || snake(p.ProductType), issuer: 'Illustrative', rate: Number(p.IndicativeRate), rateBasis: 'Illustrative, % p.a.',
    tenorMonths: tenor || null, minInvestment: Number(p.MinInvestment), investmentStep: Number(p.InvestmentStep) || 1, liquidityDays: tenor ? tenor * 30 : 1,
    liquidityTerms: !tenor ? 'Redeemable on demand (1-2 business days)' : p.EarlyExitAllowed ? 'Locked to maturity; early withdrawal forfeits interest, full withdrawal only' : 'No early exit allowed',
    riskClass: snake(p.RiskLevel || 'Low').replace(' ', '_'), earlyExit: { allowed: !!p.EarlyExitAllowed, forfeitsInterest: !!tenor && !!p.EarlyExitAllowed, note: '' },
    approved: !!p.IsActive, description: '',
  }
}

export function mapHolding(h, products, horizon = 6) {
  const p = products.find((x) => x.id === h.ProductCode) || {}
  const tenor = p.tenorMonths || null
  const status = snake(h.Status || 'Active')
  const start = day(h.StartDate); const maturity = day(h.MaturityDate)
  const today = todaySGT()
  const principal = Number(h.Principal); const rate = Number(h.IndicativeRate)
  const active = status === 'ACTIVE'
  const accrued = active && start ? r2((principal * (rate / 100) * Math.max(0, diffDays(start, today))) / 365) : 0
  const projected = active ? (Number(h.ProjectedReturn) || r2(principal * (rate / 100) * ((tenor || horizon) / 12))) : 0
  const daysToMaturity = maturity ? diffDays(today, maturity) : null
  const forfeits = !!p.earlyExit && p.earlyExit.forfeitsInterest && (daysToMaturity == null || daysToMaturity > 0)
  return {
    id: holdId(h.Id), productId: h.ProductCode, productName: p.name || h.ProductCode, productType: p.type || '', riskClass: p.riskClass || 'LOW',
    principal, originalPrincipal: principal, rate, tenorMonths: tenor, startDate: start, maturityDate: maturity, status, executionMode: h.IsSimulated ? 'SIMULATED' : 'LIVE',
    simulated: !!h.IsSimulated, proposalId: h.ProposalId ? propId(h.ProposalId) : '—', tbankAccountId: h.TbankAccountId || '',
    accruedInterest: accrued, currentValue: r2(principal + accrued), projectedReturn: projected, projectedReturnBasis: tenor ? `to maturity (${tenor}M)` : `next ${horizon}M, variable`,
    daysToMaturity, liquidityDays: p.liquidityDays ?? 1, liquidityTerms: p.liquidityTerms || '', earlyBreakForfeitsInterest: active && forfeits, redeemableWithoutPenalty: active && !forfeits,
    realisedReturn: 0, closedAt: !active ? sgt(h.UpdatedOn) : null, _raw: h,
  }
}

export const userByNumeric = (n) => USERS.find((u) => u.userId === Number(n))
export const userName = (n) => (!n ? 'System' : (userByNumeric(n) || {}).name || `User ${n}`)
export const userRef = (n) => { const u = userByNumeric(n); return { id: u ? u.id : String(n), name: userName(n), role: n ? (u ? u.role : 'FINANCE_STAFF') : 'SYSTEM' } }

export function mapProposal(p, products, extra = {}) {
  const prod = products.find((x) => x.id === p.ProductCode) || {}
  const status = snake(p.Status || 'Draft')
  const type = String(p.ProposalType || '').toUpperCase()
  const decided = p.CheckerUserId > 0 || ['REJECTED', 'APPROVED', 'EXECUTED', 'FAILED'].includes(status)
  const executed = status === 'EXECUTED'
  return {
    id: propId(p.Id), type, status, productId: p.ProductCode, productName: prod.name || p.ProductCode, holdingId: p.HoldingId ? holdId(p.HoldingId) : null, amount: Number(p.Amount),
    rate: prod.rate, tenorMonths: prod.tenorMonths, projectedReturn: prod.rate ? r2(Number(p.Amount) * (prod.rate / 100) * ((prod.tenorMonths || 6) / 12)) : 0,
    maker: userRef(p.MakerUserId), createdAt: sgt(p.CreatedOn), updatedAt: sgt(p.UpdatedOn), notes: '', recommendationId: p.RecommendationRunId || null, engineReason: p.Reason || null,
    checks: extra.checks || [], impact: extra.impact || {}, approval: { required: !!p.RequiresDirector, route: p.RequiresDirector ? 'DIRECTOR' : 'DIRECT', reason: p.RequiresDirector ? 'Director approval required' : 'Direct execution permitted by policy' },
    decision: decided && status !== 'PENDING_APPROVAL' ? { outcome: p.CheckerUserId > 0 ? (status === 'REJECTED' ? 'REJECTED' : 'APPROVED') : 'AUTO_APPROVED', by: p.CheckerUserId > 0 ? userName(p.CheckerUserId) : 'Policy', byId: String(p.CheckerUserId), at: sgt(p.UpdatedOn), comment: p.DecisionNote || '' } : null,
    execution: executed || status === 'FAILED' ? { status: executed ? 'SUCCEEDED' : 'FAILED', mode: extra.simulated === false ? 'LIVE' : 'SIMULATED', reference: p.TbankRef || '', executedAt: sgt(p.UpdatedOn), message: p.ErrorMessage || (executed ? 'Executed' : 'Failed') } : null,
    events: [], _raw: p,
  }
}

export function mapCommitment(c) {
  return { id: `CMT-${pad(c.Id)}`, description: c.Name, category: c.IsRecurring ? `Recurring (${c.Frequency})` : 'One-off', direction: c.Direction === 'In' ? 'INFLOW' : 'OUTFLOW', amount: Number(c.Amount), dueDate: day(c.DueDate), status: 'PENDING', notes: '', createdBy: userName(c.CreatedBy), createdAt: sgt(c.CreatedOn), payeeAccountId: c.PayeeAccountId || '', oneOff: !c.IsRecurring, _raw: c }
}

export function mapTxn(t) {
  return { id: `TXN-${pad(t.Id)}`, date: day(t.TransactionDate), accountId: t.AccountId, description: t.Description, counterparty: t.BankName, category: t.Category, type: t.Direction === 'In' ? 'CREDIT' : 'DEBIT', amount: Number(t.Amount), balanceAfter: null, channel: t.BankName, reference: '' }
}
