# Trovan

A React 19/Vite Indian market MVP with an Express 5 server, Google Identity Services sign-in, revocable sessions, and a server-only Indian API proxy. Local and standalone deployments use SQLite; Vercel functions use shared Redis session storage. The existing React project and npm lockfile are retained.

## Interface and performance

Trovan uses cherry red (`#c52446`) for primary actions and guava green (`#16865e`) for secondary accents, with matching accessible movement colors and a dark theme. The overview includes real-data movement summaries, a market pulse strip, and a company chart workspace. The top-bar theme button saves a device-local preference; Ctrl/Cmd + K focuses stock search. Market tables support numeric sorting and paginate 25 rows at a time. Historical charts support area/line views, pointer exploration, a keyboard/touch slider, and a collapsible paginated data table.

**Typography:** Poppins is self-hosted from `@fontsource/poppins`; no Google Fonts request is needed. The primary font stack uses LT Superior for headings, branding, and large numbers, with Poppins as the fallback. LT Superior files were not supplied, so the actual font is available only when installed locally or when licensed WOFF2 assets are added. Put them in `public/fonts/` as `lt-superior-regular.woff2`, `lt-superior-medium.woff2`, and `lt-superior-semibold.woff2`, then restart Vite/rebuild. Vite detects only existing files and emits their font faces; there are no requests to missing font URLs.

**Server state:** TanStack Query manages every browser API read and authentication mutation. Market queries stay fresh for one minute (news/fund reads for five minutes), inactive entries expire after five minutes, and in-flight queries share requests. Switching screens/periods aborts unused requests. Failed refreshes preserve the previous data with a notice. Authentication transitions cancel pending reads and remove prior market data and Google challenges. The browser does not persist market data or session credentials. Focus does not trigger repeated market requests; the top-bar refresh updates active market queries and marks inactive queries stale. These choices follow the [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) and [cancellation guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

**Rendering:** Sign-in, research screens, stock details, and history charts load separately. Chart geometry and date-to-volume lookups are memoized; long series preserve bucket extrema within an 800-point drawing budget while the data table retains every record. Chart pointer movement uses a binary date lookup. Shared currency formatters avoid repeated formatter construction. Production builds explicitly select the production React runtime even when the local `.env` sets development mode. The bundle check rejects development React code and enforces a 100 KiB gzip main-JavaScript budget. No browser/Lighthouse performance score is claimed.

**Google sign-in runtime:** The backend needs outbound HTTPS to Google's public token-verification endpoints. A backend started in a network-restricted agent sandbox cannot verify Google ID tokens; launch it in a normal terminal or with approved network access. Verification network failures return `AUTH_UNAVAILABLE` rather than reporting an invalid login. The Google configuration request sets a challenge cookie, so it deliberately finishes across a brief React remount instead of consuming Query's cancellation signal; both mounts share the same pending challenge. Market and session reads retain normal cancellation. After a failed Google attempt, reload or choose “Prepare sign-in again” to obtain a fresh single-use challenge. Tests use a simulated verifier and do not establish that a real Google account can sign in.

**Link preview:** `public/og-premium.png` is the new cherry/guava preview, created with the built-in ImageGen tool; the original `og.png` is retained. The generation brief was: “Premium editorial Trovan share card, graphite background, cherry red and guava green market-line motif; exact text ‘Trovan’, ‘A clearer view of the Indian market’, ‘STOCKS · RESEARCH · PERSPECTIVE’; generous whitespace, no fake numbers, no extra text.”

## Local setup

Requires **Node.js 24 LTS** (the server uses built-in `node:sqlite`). In PowerShell:

```powershell
cd D:\TradingApp\Trovan_web\Trovan-trade
npm.cmd ci
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated random value in `SESSION_SECRET` and fill in the following server-only settings in `.env`:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth web application client ID; intentionally public when delivered to the Google sign-in button |
| `INDIAN_API_KEY` | Indian API key; stays on the server |
| `INDIAN_API_BASE_URL` | Official provider host matching your subscription; defaults to `https://stock.indianapi.in` |
| `SESSION_SECRET` | At least 32 random characters; keep stable across restarts |
| `APP_ORIGIN` | Browser origin; `http://localhost:5173` locally, HTTPS in production. Development also accepts equivalent loopback hosts on the same protocol and port. |
| `DATABASE_PATH` | Persistent SQLite file; defaults to `./data/trovan.sqlite` |
| `PORT` | Backend port, default 3001 |
| `TRUST_PROXY` | Exact number of trusted reverse-proxy hops, default 0 |
| `NODE_ENV` | `development` locally, `production` when serving the built app |

Google Identity Services returns a signed ID token. This implementation **does not require `GOOGLE_CLIENT_SECRET`**. Sessions are opaque server-side sessions, so **no JWT signing secret is needed**; `JWT_SECRET` is accepted as a backward-compatible alias for `SESSION_SECRET`. Never prefix server secrets with `VITE_`, commit `.env`, or place secrets in a browser store.

```powershell
npm.cmd run dev
```

Open **http://localhost:5173** or **http://127.0.0.1:5173**. The frontend proxies `/api` to port 3001. If Vite is already running, use `npm.cmd run dev:server` rather than starting a second frontend. Use **Continue as guest** to explore without a Google account. Guest sessions support refresh and sign-out; market data still requires the server's Indian API credentials. Missing credentials produce clear setup/error states; market data is not fabricated.

## Configure Google

1. Create a Google Cloud project and configure OAuth consent/branding. For a testing application, add the accounts that may sign in as test users.
2. Create an OAuth **Web application** client ID.
3. Add `http://localhost:5173` to **Authorized JavaScript origins**. Also authorize the exact HTTPS origin used in production. Use `localhost`, not an unconfigured `127.0.0.1` origin.
4. Set `GOOGLE_CLIENT_ID` in `.env`, restart the server, and sign in using the Google button.

No redirect URI is needed for this popup ID-token callback flow. The server uses Google's official library to verify signature, audience, issuer, and expiry. It also requires a verified email and a single-use nonce matching an HttpOnly cookie. Profiles are keyed by Google's stable `sub` identifier. A 30-day HttpOnly, SameSite=Lax cookie carries an opaque random session token; only its keyed hash is stored. Production cookies use Secure and the `__Host-` prefix. Logout deletes the server session, including for copied cookies.

Official references: [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [server token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Indian API contracts and limitations

The official **v1.0 product reference** is the source of request parameters: [API reference](https://indianapi.in/indian-stock-market). Its embedded OpenAPI describes 20 routes, uses the `X-Api-Key` header, and is saved in `docs/indian-api-v1.openapi.json`. Supplemental response examples come from the [provider documentation](https://indianapi.in/documentation/indian-stock-market). The newer dev/pro hosts describe v2; select the host allowed by your plan and verify compatibility before changing it.

| Provider endpoint | Verified query parameters |
| --- | --- |
| `/stock` | `name` |
| `/industry_search` | `query` |
| `/mutual_fund_search` | `query` |
| `/trending` | None |
| `/fetch_52_week_high_low_data` | None |
| `/NSE_most_active`, `/BSE_most_active` | None |
| `/mutual_funds` | None |
| `/mutual_funds_details` | `stock_name` (scheme name, not an invented `fund_id`) |
| `/ipo`, `/news`, `/price_shockers`, `/commodities` | None |
| `/corporate_actions`, `/recent_announcements` | `stock_name` |
| `/historical_data` | `stock_name`, `period`, `filter` |
| `/historical_stats`, `/statement` | `stock_name`, `stats` |
| `/stock_forecasts` | `stock_id`, `measure_code`, `period_type`, `data_type`, `age` |
| `/stock_target_price` | `stock_id` |
| `/search` | **No published v1 request/response contract** |

**Search gap:** `/search` is named in the provider's allowed-endpoint list but absent from both the published v1 OpenAPI and narrative documentation. Rather than guessing its query or payload, the application's authenticated `/api/market/search?query=…` uses documented `/stock?name=…` and returns the closest company match. Industry search returns multiple verified results. A direct provider `/search` adapter remains pending the provider's actual contract; it is not falsely presented as implemented.

**History:** Supported periods are `1m`, `6m`, `1yr`, `3yr`, `5yr`, `10yr`, `max`. The v1 OpenAPI requires `stock_name`, `period`, and `filter`; its narrative example incorrectly uses `symbol`, so the implementation follows the OpenAPI. The chart requests `filter=price` and reads documented `datasets[].values` date/value pairs. Volume appears only when a matching Volume dataset exists. V1 price history does not supply OHLC; those values are not fabricated.

**Unspecified responses:** Many v1 OpenAPI response schemas are `{}`. Critical stock, historical, search, and market shapes are validated. Other JSON object/record-array responses are safely rendered as structured fields, preserving actual returned data. News cards adapt title, source, date, image, description, and links only when those values exist; unknown fields remain visible. Financial, corporate action, IPO, mutual fund, and commodity screens omit absent data. Full live contract verification requires a valid API key and subscription access.

`src/api/services.js` prepares all documented endpoint integrations, including statements, forecasts, targets, and announcements. The proxy allows only published routes and exact query keys. It sanitizes text, validates enums, rejects arbitrary URLs, times out at 12 seconds, deduplicates concurrent calls, and caches public market responses for 60 seconds (news/fund responses for five minutes). A provider 429 starts a bounded cooldown using Retry-After. Provider credentials/errors are never returned raw. TanStack Query owns the browser cache and removes market queries on authentication transitions.

## Checks

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run check:bundle
npm.cmd run check:secrets
```

Tests use isolated synthetic fixtures **only within tests**. They check login/session/logout, nonce replay and token rejection, origin checks, protected routes, search and stock responses, request contracts, API key isolation, deduplication, caching, invalid JSON, timeouts, network failures, and upstream 401/403/404/429/5xx handling. Vercel tests also exercise rewritten routes, request helpers, sessions shared across independent function instances, and upstream key-echo rejection. They do not claim a real Google account or live Indian API connection was verified.

After configuring credentials, manually verify: Google login, profile name/email/image, browser refresh/session persistence, logout and protected URLs; stock search/details/history periods; funds search/details, market tabs, news, IPO, commodities; invalid-key and rate-limit messages. Browser UI and responsive visual checks require an available browser connection.

## Production

**Vercel:** Follow [the deployment guide](docs/vercel-deployment.md). `api/index.js` wraps the existing Express application; `vercel.json` routes `/api/*` to that function while Vercel serves Vite's `dist` assets. React calls relative `/api/indianapi/*` endpoints. Configure `INDIAN_API_KEY`, a stable `SESSION_SECRET`, shared Redis credentials, the production `APP_ORIGIN`, and `GOOGLE_CLIENT_ID` for Google sign-in. No IndianAPI key belongs in a `VITE_*` variable. SQLite remains the local default; it is not used for Vercel sessions.

**Standalone Node/Docker:**

```powershell
npm.cmd run build
# Set NODE_ENV=production, APP_ORIGIN=https://your-domain, and real secrets.
npm.cmd start
```

Express serves both `dist` and `/api` on port 3001. Put it behind an HTTPS reverse proxy at `APP_ORIGIN`. Set `TRUST_PROXY` to its verified hop count. The server rejects production startup without HTTPS and a suitable persistent session secret. Origins on auth writes must match exactly; `Sec-Fetch-Site: cross-site` is rejected. Helmet configures CSP, frame restrictions, and Google popup compatibility. The social preview URL is built from the configured trusted origin.

A Dockerfile is included: build with `docker build -t trovan .`, run with `--env-file .env -e NODE_ENV=production`, a configured HTTPS origin, and a persistent `/app/data` volume owned by the container's Node user. Back up that volume. Do not expose the Node port directly on the public Internet. This SQLite/in-memory-cache deployment is intended for one application instance; multiple instances require a shared session store and coordinated cache/rate limiter.

The server requires Node and is **not a Cloudflare Workers-compatible Sites deployment**. A static-only upload would omit authentication and the secure data proxy; use the Vercel function configuration or a standalone Node host. No external deployment was performed.

## Main files changed

- `server/`: configuration, Google verification, protected routes, SQLite users/sessions, Indian API contracts/client.
- `src/auth/`, `src/api/`, `src/hooks/`, `src/components/`, `src/screens/`, `src/utils/`: login, service layer, data states, chart, dashboard and feature screens.
- `src/App.jsx`, `src/App.css`, `src/index.css`: authenticated navigation, responsive layout, financial dashboard theme.
- `docs/indian-api-v1.openapi.json`, `tests/`: captured provider contract and automated checks.
- `.env.example`, `.gitignore`, `vite.config.js`, `eslint.config.js`, `package.json`, `package-lock.json`: setup, scripts, proxy, dependency and secret handling.
- `index.html`, `public/favicon.svg`, `public/og.png`: product branding and link preview.
- `Dockerfile`, `.dockerignore`, `README.md`: production packaging and setup documentation.
