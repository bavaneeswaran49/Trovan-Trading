# Vercel deployment

## Request flow

The browser calls relative, same-origin `/api/indianapi/...` URLs. Vercel rewrites `/api/*` to the single Node function in `api/index.js`. Its adapter normalizes the path and invokes the existing Express application with static serving disabled. That application authenticates the session and delegates to `server/indianApi/client.js`, which reads the server configuration derived from `process.env.INDIAN_API_KEY` and sends the provider's `X-Api-Key` header only from the function.

The existing endpoint contracts, response validation, timeouts, caching, request deduplication, and TanStack Query integration are retained. Vite serves the UI from `dist`; existing files take priority and the SPA fallback excludes API and asset paths. No permissive CORS is added. A provider response that unexpectedly echoes the configured IndianAPI key is rejected before it reaches the browser or server cache.

Vercel functions do not share a persistent local SQLite file. The adapter therefore injects an Upstash-compatible HTTP Redis store into the same Express session interface. Sessions remain opaque, HttpOnly, Secure, revocable, and expiring; Google challenges remain single-use across instances. Session tokens and challenge values are stored under HMAC-hashed keys. Google profiles are stored server-side in Redis. Local `npm run dev` and standalone `npm start` continue to use SQLite without Redis.

## Project settings

In the existing Vercel project connected to `bavaneeswaran49/Trovan-Trading`:

1. Use the repository root containing `package.json`, `vercel.json`, and `api/` as the Root Directory.
2. Keep the Framework Preset **Vite** and select **Node.js 24.x**. `package.json` also pins the Node major version.
3. Build with `npm run build`, output directory `dist`, and the standard npm install command. Remove dashboard overrides that force a static-only deployment or conflict with the checked-in routing configuration.
4. Connect an Upstash Redis database through Vercel Marketplace, or use an existing compatible database. The function requires its HTTPS REST URL and standard read/write REST token; a read-only token or Redis TCP URL will not work.
5. Add the variables below in Vercel Project Settings → Environment Variables. Scope production credentials to **Production**. Use separate credentials/settings for Preview if you enable authenticated previews.
6. Redeploy after changing variables. Existing deployments do not gain newly configured environment values.

See the official [Node function documentation](https://vercel.com/docs/functions/runtimes/node-js), [Node version settings](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Vite deployment documentation](https://vercel.com/docs/frameworks/frontend/vite), and [Upstash REST API](https://upstash.com/docs/redis/features/restapi).

## Environment variables

| Variable | Required on Vercel | Value/purpose |
| --- | --- | --- |
| `INDIAN_API_KEY` | Yes, for market data | Your IndianAPI subscription key. Server-only; never use any `VITE_*` variable for it. |
| `SESSION_SECRET` | Yes | A stable random value of at least 32 characters, shared by every instance of this deployment. Changing it invalidates existing sessions. |
| `UPSTASH_REDIS_REST_URL` | Yes, or alias below | The Redis database HTTPS REST endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes, or alias below | The database's read/write REST token. Server-only. |
| `APP_ORIGIN` | Recommended; needed for a custom production domain | The exact browser origin, such as `https://your-production-domain`, with no path. Authentication writes require this origin. When omitted, the function uses Vercel's trusted `VERCEL_URL` deployment origin. |
| `GOOGLE_CLIENT_ID` | For Google sign-in | Google OAuth Web application client ID. This ID is intentionally public; it is not a secret. Guest access works without it. |
| `INDIAN_API_BASE_URL` | Optional | Defaults to `https://stock.indianapi.in`. Only the existing official provider origins are accepted; use the one matching your subscription and v1 contract support. |
| `TRUST_PROXY` | Optional | Defaults to one trusted proxy hop in the Vercel adapter. Do not copy the local development value `0` into production. |

Marketplace integrations that supply `KV_REST_API_URL` and `KV_REST_API_TOKEN` are supported as aliases for the two Redis variables. Set one complete pair; avoid mixing credentials from different databases. `DATABASE_PATH` is for local/standalone SQLite and is not used by the Vercel session store. Do not copy the development `.env` wholesale into Vercel: its HTTP origin and placeholder session secret are unsuitable for production.

Generate a session secret locally, then enter it directly into Vercel's environment settings:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For Google sign-in, authorize the exact production HTTPS origin in Google Cloud's OAuth Web client **Authorized JavaScript origins**. This popup ID-token flow does not require a Google client secret or redirect URI. A custom domain must match both Google configuration and `APP_ORIGIN`. For a preview deployment, omit `APP_ORIGIN` to use its deployment URL or set its exact preview origin, and authorize that origin in Google if Google sign-in is needed.

Do not create or commit a real environment file as part of deployment. `.env` files are ignored by Git and excluded from the Vercel upload; `.env.example` contains empty IndianAPI and Redis credential fields. Remove any previously configured browser-prefixed IndianAPI secret variables from the Vercel dashboard, and rotate a key if it was exposed previously.

## Endpoints

Every market endpoint requires a Google or guest session cookie. All frontend services derive their URLs through the shared `marketPath` helper; no deployment URL or provider host is hardcoded in React.

- `GET /api/indianapi/search?query=...` — existing company lookup using documented provider `/stock?name=...`, rather than an unpublished provider search contract.
- `GET /api/indianapi/stock?name=...`
- `GET /api/indianapi/historical_data?stock_name=...&period=1yr&filter=price`
- `GET /api/indianapi/:endpoint` — all 20 existing published endpoint adapters, with their existing strict query contracts. These include industry/fund search, trends, active stocks, 52-week data, funds/details, IPO, news, price shockers, commodities, corporate actions, announcements, history/stats, statements, forecasts, and targets. See the complete contract table in [README](../README.md#indian-api-contracts-and-limitations).
- Existing `GET /api/market/...` URLs remain compatible aliases.
- `GET /api/health`, `GET /api/auth/config`, `GET /api/auth/session`, `POST /api/auth/google`, `POST /api/auth/guest`, and `POST /api/auth/logout` use the same function.

Useful errors remain JSON: invalid parameters `400`, unauthenticated sessions `401`, disallowed origins `403`, absent endpoints/data `404`, unsupported market methods `405`, rate limits `429` with `Retry-After`, provider failures `502`, missing IndianAPI/shared-session configuration `503`, and provider connection failures/timeouts `504`. Provider authorization failures become `502`, so an upstream key problem does not sign the user out. Provider bodies, internal exceptions, and authorization headers are never returned or logged. API responses use `Cache-Control: no-store`.

The existing market cache, deduplication, cooldown, and Express rate limits are per warm function instance. Redis coordinates sessions and challenges; it does not turn those caches or limits into global controls. Consider Vercel Firewall rules if your provider quota requires an aggregate deployment-wide limit.

## Verification and release

From the repository root:

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run check:bundle
npm.cmd run check:secrets
```

`npm test` runs the production build before the tests. The bundle check scans generated JS/CSS/HTML for secret values and server-only identifiers, rejects development React code, and checks the main JavaScript gzip budget. The repository scan searches for `INDIAN_API_KEY`, browser-prefixed variants, and `sk-` patterns without printing matched values. Test keys are clearly synthetic fixtures. No real Google login, live IndianAPI subscription, or Vercel deployment is claimed by these tests.

After push/deployment and environment setup, verify in the production browser:

1. `/api/health` returns JSON `200`; ordinary app routes and static assets still load.
2. Continue as guest, refresh, and open stock search/details/history, funds, news, IPO, commodities, and market tabs. Requests in DevTools must target same-origin `/api/indianapi/...` and return JSON.
3. Sign in with Google, refresh to restore the profile, sign out, and confirm protected market calls now return `401`.
4. Inspect response errors and built assets for credential leakage. A missing key produces safe `503 API_NOT_CONFIGURED`; invalid provider credentials produce safe `502 API_AUTH_FAILED`.

There is no automatic database migration from a standalone SQLite database. Existing local data stays local; Vercel users sign in again and their profiles/sessions are created in Redis. Provisioning Redis, entering production secrets, authorizing the Google origin, and redeploying are manual platform steps.
