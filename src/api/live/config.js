// Settings for the live (OutSystems) API adapter.
const env = import.meta.env

export const UEN = env.VITE_UEN || '202312345K' // Kopi & Co. Use SIQTEST01 for write experiments.
// In dev, Vite proxies /siq -> the OutSystems host (the service sends no CORS headers). See vite.config.js.
export const BASE = (env.VITE_API_BASE || '/siq').replace(/\/$/, '')

// Demo roles from Jiacheng: 910001 = FinanceStaff, 910002 = Director, currently registered under UEN SIQTEST01 only.
// For other UENs (Kopi & Co) the role below is used as the fallback; if GetUserRole finds an active row for the
// id AND the current UEN, its Role and UserName win.
export const USERS = [
  { id: 'u-priya', userId: Number(env.VITE_USER_MAKER || 910001), name: 'Priya Nair', title: 'Finance Executive', role: 'FINANCE_STAFF', email: 'priya@kopiandco.sg' },
  { id: 'u-daniel', userId: Number(env.VITE_USER_DIRECTOR || 910002), name: 'Daniel Lim', title: 'Director', role: 'DIRECTOR', email: 'daniel@kopiandco.sg' },
]

// ProposalWorkflow.ApproveProposal takes Decision as a free string; the docs do not list the accepted values.
export const DECISION = { approve: env.VITE_DECISION_APPROVE || 'Approve', reject: env.VITE_DECISION_REJECT || 'Reject' }

// module key -> [OutSystems module, REST API name]
export const MODULES = {
  role: ['SIQ_UserRole', 'UserRole'], holding: ['SIQ_Holding', 'Holding'], commitment: ['SIQ_CashCommitment', 'CashCommitment'],
  snapshot: ['SIQ_ForecastSnapshot', 'ForecastSnapshot'], buffer: ['SIQ_BufferSettings', 'BufferSettings'], audit: ['SIQ_AuditLog', 'AuditLog'],
  proposal: ['SIQ_Proposal', 'Proposal'], product: ['SIQ_InvestmentProduct', 'InvestmentProduct'],
  rec: ['SIQ_AllocationRecommendation', 'AllocationRecommendation'], seed: ['SIQ_SeedTransaction', 'SeedTransaction'],
  cash: ['SIQ_CashPosition', 'CashPosition'], forecast: ['SIQ_Forecast', 'Forecast'], alloc: ['SIQ_AllocationEngine', 'AllocationAPI'],
  workflow: ['SIQ_ProposalWorkflow', 'ProposalWorkflow'],
}
