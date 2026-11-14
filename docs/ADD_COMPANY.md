# Adding a company

A company in SurplusIQ is a UEN. Every service call is scoped to one UEN, and the app lists the companies a user can open on the "Your companies" page (`COMPANIES` in `src/api/live/config.js`).

To add one, three things are needed.

1. **Bank side (Arwen).** A customer with at least one deposit account at SMUtBank under the new UEN, so `GetCashPosition` returns real balances. How `GetCashPosition` maps a UEN to a bank customer needs confirming with Arwen.
2. **OutSystems data (Joshua / Jiacheng).** Rows keyed by the new UEN:
   - `SIQ_UserRole`: one row per user who may use the company, with Role FinanceStaff or Director.
   - `SIQ_BufferSettings`: the company's buffer months and any override.
   - `SIQ_SeedTransaction` and `SIQ_CashCommitment`: sample history and known payments, so forecast and buffer have inputs.
   (`SIQ_InvestmentProduct` has no UEN parameter, so the product catalogue is shared.)
3. **App (Jinhong).** Add `{ uen: '...', name: '...' }` to `COMPANIES`.

There is no service today that creates a company, and none that lists the companies a user belongs to. Either would let the app drop the fixed list.
