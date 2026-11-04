const num0 = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 })
const num2 = new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const money = (n, dec = false) => (n == null || Number.isNaN(+n) ? '-' : (+n < 0 ? '-' : '') + 'S$' + (dec ? num2 : num0).format(Math.abs(+n)))
export const moneyAuto = (n) => (Math.abs(n % 1) > 0.004 ? money(n, true) : money(n))
export const compact = (n) => {
  const a = Math.abs(n)
  return (n < 0 ? '-' : '') + 'S$' + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k' : a.toFixed(0))
}
export const pct = (n, d = 2) => (n == null ? '-' : Number(n).toFixed(d) + '%')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const date = (s) => (s ? `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '-')
export const shortDate = (s) => (s ? `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}` : '-')
export const monthLabel = (s) => `${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`
export const dateTime = (s) => (s ? `${date(s.slice(0, 10))}, ${s.slice(11, 16)}` : '-')
export const titleCase = (s) => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
export const ROLE_LABEL = { FINANCE_STAFF: 'Finance Staff (Maker)', DIRECTOR: 'Director (Checker)', SYSTEM: 'System' }
export const STATUS_TONE = {
  PENDING_APPROVAL: 'amber', APPROVED: 'blue', EXECUTED: 'green', REJECTED: 'red', FAILED: 'red', WITHDRAWN: 'grey',
  ACTIVE: 'green', REDEEMED: 'grey', MATURED: 'grey', RESOLVED: 'grey', PENDING: 'amber', PAID: 'green', CANCELLED: 'grey',
  CRITICAL: 'red', WARNING: 'amber', INFO: 'blue', PASS: 'green', WARN: 'amber', FAIL: 'red',
  LOW: 'green', VERY_LOW: 'green', MEDIUM: 'amber', HIGH: 'red',
}
