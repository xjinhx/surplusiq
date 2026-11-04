// Client-side history analysis for the Cash Forecast screen, on real SeedTransaction rows.
// (The forecast API returns weekly balances only; recurring detection / monthly summary are shown here.)
import { r2, sum } from './map.js'

const NOISE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b20\d\d\b|\bweek\s*\d+\b|\d+/gi
const norm = (d) => String(d).replace(NOISE, '').replace(/\s+/g, ' ').trim().toLowerCase()
const label = (d) => String(d).replace(NOISE, '').replace(/\s+/g, ' ').trim()

export function analyseSeed(rows) {
  const months = [...new Set(rows.map((t) => t.TransactionDate.slice(0, 7)))].sort().slice(-3)
  const tx = rows.filter((t) => months.includes(t.TransactionDate.slice(0, 7)) && !['Opening', 'Investment'].includes(t.Category))
  const m = (t) => months.indexOf(t.TransactionDate.slice(0, 7))
  const outs = tx.filter((t) => t.Direction === 'Out')
  const map = new Map()
  for (const t of outs) {
    const k = norm(t.Description) || t.Category
    if (!map.has(k)) map.set(k, { key: k, category: t.Category, description: t.Description, monthlyTotals: [0, 0, 0], recurring: false, days: [], n: 0, lastDate: t.TransactionDate, lastAmount: Number(t.Amount) })
    const g = map.get(k); g.monthlyTotals[m(t)] += Number(t.Amount); g.recurring ||= !!t.IsRecurring; g.days.push(+t.TransactionDate.slice(8, 10)); g.n++
    if (t.TransactionDate >= g.lastDate) { g.lastDate = t.TransactionDate; g.lastAmount = Number(t.Amount); g.description = t.Description }
  }
  const groups = [...map.values()].map((g) => {
    const present = g.monthlyTotals.filter((x) => x > 0).length; const total = r2(sum(g.monthlyTotals))
    let type = 'ONE_OFF'
    if (present === months.length) type = g.recurring && g.n / present <= 1.2 ? 'FIXED' : 'VARIABLE'
    const d = g.days.slice().sort((a, b) => a - b)
    return { counterparty: label(g.description) || g.category, category: g.category, description: g.description, monthlyTotals: g.monthlyTotals.map(r2), expectedMonthly: r2(total / 3), type, monthsPresent: present, dayOfMonth: type === 'FIXED' ? d[Math.floor(d.length / 2)] : null, lastDate: g.lastDate, lastAmount: g.lastAmount }
  }).sort((a, b) => b.expectedMonthly - a.expectedMonthly)
  const history = months.map((mo, i) => ({
    month: mo,
    inflow: r2(sum(tx.filter((t) => t.Direction === 'In' && t.TransactionDate.startsWith(mo)), (t) => Number(t.Amount))),
    outflow: r2(sum(outs.filter((t) => t.TransactionDate.startsWith(mo)), (t) => Number(t.Amount))),
    recurring: r2(sum(groups.filter((g) => g.type === 'FIXED'), (g) => g.monthlyTotals[i])),
    variable: r2(sum(groups.filter((g) => g.type === 'VARIABLE'), (g) => g.monthlyTotals[i])),
    oneOff: r2(sum(groups.filter((g) => g.type === 'ONE_OFF'), (g) => g.monthlyTotals[i])),
  }))
  return { months, history, groups, avgMonthlyOutflow: r2(sum(history, (h) => h.outflow) / (months.length || 1)), avgMonthlyInflow: r2(sum(history, (h) => h.inflow) / (months.length || 1)) }
}
