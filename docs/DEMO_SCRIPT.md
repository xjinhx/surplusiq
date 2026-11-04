# Kopi & Co demo script

Runs on the live SIQ services for UEN 202312345K. Numbers come from the API, so read them off the screen
(at the time of writing: cash S$420,000, buffer S$231,900, surplus S$188,100). Use the user switcher (top right)
to play Priya (Finance, user 910001) and Daniel (Director, user 910002). Demo controls (bottom left) are not part of the product.

1. **Cash position** - *Dashboard*. Total cash, required buffer (1.5 months of average outflow), pending commitments and investable surplus, with the 13-week projection. *Cash Forecast* shows where the buffer comes from and the recurring costs. Optionally add a one-off commitment due within 90 days and watch the surplus fall; remove it afterwards.
2. **Recommendation** - *Allocation Recommendations*. Shows the latest saved run with the reason per line. *Generate recommendation* runs a fresh one (it saves a run).
3. **Propose** - *Create proposals -> Submit*. A line above the approval threshold goes to a Director; one at or below it follows the auto-execute policy. Shows both routes.
4. **Approve** - switch to a Director -> *Approvals* -> *Approve and execute*. A maker cannot approve their own proposal. *Holdings* then shows the positions, labelled simulated, and cash and surplus fall.
5. **Shock** - Demo controls -> *Add supplier payment* (a one-off commitment due in 7 days; the real bank balance does not move). The forecast dips under the buffer: *Alerts* shows a projected shortfall.
6. **Rebalance** - *Alerts -> Check liquidity* returns the engine's redemption plan; *Create redemption proposal* sends it through the same approval rules. *Audit History* shows the whole chain with who and when. Demo controls -> *Remove demo commitments* tidies up.

Talking points: surplus is decided by the operating need, not a product target; the allocation and rebalancing rules are transparent; nothing executes without the approval rules; execution is simulated until the bank exposes investment placement; returns are indicative, not guaranteed.
