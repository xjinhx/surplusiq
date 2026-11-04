# SurplusIQ

Treasury decision support for Singapore SMEs: forecast cash, protect an operating buffer, allocate the genuine
surplus, route everything through maker-checker approval, and keep an audit trail. A Vue 3 + Vite front end on the
team's OutSystems `SIQ_*` REST services (those services and their entities are the backend and database).

```bash
npm install
npm run dev     # http://localhost:5173
```

| Path | What |
|---|---|
| `src/views/*` | the 9 screens: Dashboard, Cash Forecast, Products, Allocation Recommendations, Propose Investment, Approvals, Holdings, Alerts, Audit History |
| `src/api/liveApi.js`, `src/api/live/` | the adapter: calls the SIQ services and maps them to what the screens need |
| `vite.config.js` | dev proxy: the browser calls `/siq`, Vite forwards to the OutSystems host (the services send no CORS headers) |
| `data/KopiCo_Transactions_Aug-Oct2026.xlsx` | 3 months of Kopi & Co sample transactions (267 rows) with a monthly summary; `npm run seed` regenerates it |
| `docs/LIVE_API.md` | screen-to-service map, behaviour notes, open questions |
| `docs/DEMO_SCRIPT.md` | demo walkthrough |

Copy `.env.example` to `.env` to change the UEN, proxy target, demo user ids or approval decision strings.
Submitting, approving, generating a recommendation, recalculating the forecast and checking liquidity write to the shared dev database.
Rates are illustrative and returns are never guaranteed.
