# Live API wiring

Every screen calls the real `SIQ_*` OutSystems services through `src/api/liveApi.js` (there is no mock mode).

Dev: the services send no CORS headers, so the browser calls `/siq/...` and Vite proxies it (`vite.config.js`,
target `VITE_API_TARGET`). A deployed build needs a reverse proxy at `/siq` too.

## Screen -> real calls

| Screen / UI method | Real service calls | Writes? |
|---|---|---|
| Dashboard `getDashboard` | composed from the rows below | no |
| `getCashPosition` | CashPosition.GetCashPosition, Forecast.CalculateInvestableSurplus, Holding.GetHoldings, Proposal.GetProposals, BufferSettings.GetBufferSettings, InvestmentProduct.GetProducts | no |
| Cash Forecast `forecastCashFlow` | ForecastSnapshot.GetLatestForecast (on load), SeedTransaction.GetTransactions (history + recurring analysis, client-side). **Recalculate** button -> Forecast.ForecastCashFlow | only on Recalculate, or after a commitment / execution |
| Commitments | CashCommitment.GetCashCommitments / CreateCashCommitment (with optional `PayeeAccountId`) / UpdateCashCommitment (remove = `IsActive:false`) | yes (user action) |
| Pay commitment `payCommitment` | Payment.PayCommitment: `DryRun=true` when **Pay** opens the modal, `DryRun=false` only on the confirm click; then Forecast.ForecastCashFlow | yes (confirm only; moves tBank money) |
| Daily monitor `runDailyCheck` | Monitor.RunDailyCheck (CheckBufferAlert for every company) | yes (button only; audit row + snapshot per company) |
| Buffer + controls | BufferSettings.GetBufferSettings / UpdateBufferSettings (Director) | yes (user action) |
| Products | InvestmentProduct.GetProducts. Read-only: no update method exists | no |
| Recommendations `recommendAllocation` | AllocationRecommendation.GetLatestRecommendation on load. **Generate recommendation** -> AllocationEngine.RecommendAllocation | only on Generate |
| Propose `validateProposal` | client-side checks on the live data above (SubmitProposal re-validates server-side) | no |
| Propose `submitProposal` | ProposalWorkflow.SubmitProposal, then Proposal.GetProposal; if status is `Approved`, ProposalWorkflow.ExecuteInvestment / ExecuteRedemption | yes |
| Approvals `getProposals` | Proposal.GetProposals | no |
| Approvals `approveProposal` | ProposalWorkflow.ApproveProposal, then Execute* if still `Approved` | yes |
| Withdraw | Proposal.UpdateProposalStatus (`Status:"Withdrawn"`) | yes |
| Holdings | Holding.GetHoldings + InvestmentProduct.GetProducts | no |
| Alerts `getAlerts` | passive: cash position + latest forecast low point. **Check liquidity** -> CashPosition.CheckBufferAlert (also the redemption plan). Past alerts: AuditLog.GetAuditLog?ActionPrefix=ALERT_ | only on Check liquidity |
| Audit `getAuditLog` | AuditLog.GetAuditLog (latest 200, filtered in the browser) | no |

Page loads never write. The services that save a run on every call (RecommendAllocation, ForecastCashFlow,
EvaluateRebalancing, CheckBufferAlert) are behind buttons, as their docs advise.

## Behaviour to know about

* **Kopi & Co numbers** are the live ones: cash S$420,000, buffer **S$231,900** (1.5 x S$154,600), surplus **S$188,100**, recommendation FD6M S$150,000 + MMF S$38,000.
* **Forecast is weekly, 13 weeks** (not daily/90 days). History and the recurring-expense table are analysed client-side from `SeedTransaction` (Jul-Sep 2026 sample data).
* **A one-off supplier payment can now be paid for real** with **Pay** on Cash Forecast (tBank CreditTransfer from `0000006728` to the commitment's payee, default Bean Supply `0000006786`). This lowers real cash, so **Check liquidity** can show a true Critical breach. Return the money after a demo (SIQ_tBank CreditTransfer, CustomerId `0000003204`, from `0000006786` to `0000006728`, same amount).
* **Pay vs Mark paid.** One-off payments get **Pay**; receipts and recurring rows keep **Mark paid**, which only deactivates the row and moves no money. Payments above the approval threshold need a Director (the service says so in the modal).
* **Products** are read-only; **commitments** have no category, no "paid" status (paying or removing deactivates), and no delete.
* **Controls** shown are the ones the API stores (threshold, auto-execute policy, risk profile, max tenor, liquid %, pending window, invest trigger).
* **No what-if** on the recommendation page: `RecommendAllocation` takes no parameters.
* Timestamps are converted from UTC to Singapore time. Ids are shown as `PRP-0007` / `HLD-0005` and converted back to numbers for calls.

## Needs your confirmation

1. **`ApproveProposal` Decision strings.** The docs say only "string". The adapter sends `Approve` / `Reject` (`VITE_DECISION_APPROVE` / `VITE_DECISION_REJECT`). If the service wants e.g. `Approved`, set the env vars; the API's own error message is shown in the toast.
2. **Users: resolved.** `910001` (FinanceStaff) and `910002` (Director) are now registered under `202312345K`, so GetUserRole returns their real roles for Kopi & Co.
3. **Does `SubmitProposal` / `ApproveProposal` execute?** Unknown, so the adapter calls Execute* only when the proposal is left at `Approved`.
4. **Withdraw** relies on `UpdateProposalStatus` accepting `Withdrawn`.
5. **Proposal status names** are converted generically (`PendingApproval` -> `PENDING_APPROVAL`); other values in your workflow will show as their snake-case form.
6. **Write tests.** Reads were verified against the live service. Writes were not exercised (they change the shared dev database). Use `VITE_UEN=SIQTEST01` with `DemoMode` on in `SIQ_CashPosition` for experiments.
