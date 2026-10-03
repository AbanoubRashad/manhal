# Manhal · منهل

[![CI](https://github.com/AbanoubRashad/manhal/actions/workflows/ci.yml/badge.svg)](https://github.com/AbanoubRashad/manhal/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An online learning platform for Egypt and the Arab world, similar to Udemy, Coursera and Yanfaa. Learners browse a bilingual catalog, buy courses with Paymob, watch lessons, keep notes, pass a checkpoint quiz and earn a certificate anyone can verify. Instructors build courses in a studio and get paid out from an earnings ledger. Admins run everything from one console.

**Live demo:** https://manhal-learning.web.app

The demo is fully interactive: the real server code runs in your browser on SQLite compiled to WebAssembly, and your data stays on your device. Sign in with one of the [demo accounts](#demo-accounts).

Node.js 22 · zero npm dependencies (`node:http`, `node:sqlite`, `node:crypto`) · vanilla JS single-page app · English and Arabic (RTL) · light and dark themes.

## Screenshots

| Home | Course page |
|---|---|
| ![Home](docs/screenshots/home.png) | ![Course](docs/screenshots/course.png) |
| **My learning** | **Lesson player** |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Player](docs/screenshots/player.png) |
| **Cart with coupon** | **Verifiable certificate** |
| ![Cart](docs/screenshots/cart.png) | ![Certificate](docs/screenshots/certificate.png) |
| **Instructor studio** | **Course editor** |
| ![Studio](docs/screenshots/studio.png) | ![Editor](docs/screenshots/course-editor.png) |
| **Earnings and payouts** | **Admin console** |
| ![Earnings](docs/screenshots/earnings.png) | ![Admin](docs/screenshots/admin.png) |
| **Admin payouts** | **Orders (dark theme)** |
| ![Payouts](docs/screenshots/admin-payouts.png) | ![Orders](docs/screenshots/admin-orders-dark.png) |

Arabic, right-to-left, at phone width:

<p>
<img src="docs/screenshots/mobile-home-ar.png" width="200" alt="Home in Arabic">
<img src="docs/screenshots/mobile-course-ar.png" width="200" alt="Course page in Arabic">
<img src="docs/screenshots/mobile-dashboard-ar.png" width="200" alt="Dashboard in Arabic">
<img src="docs/screenshots/mobile-player-ar-dark.png" width="200" alt="Lesson player in Arabic, dark theme">
</p>

## Features

**Learners:** catalog with search, category, level and price filters · learning-path builder · wishlist · cart that works before sign-in · coupons · checkout through Paymob · lesson player for YouTube, Vimeo, MP4 and protected Bunny Stream video · progress, streaks and activity heatmap · notes per lesson · checkpoint quiz · certificates with a public verification page · order history and receipts.

**Instructors:** studio to create courses, organise sections and lessons, attach videos, mark free previews and write the quiz, with publish checks · earnings ledger at a configurable revenue share (70% by default) · payout requests by bank transfer, InstaPay or mobile wallet.

**Admins:** overview with monthly revenue · users and roles · course moderation · orders and refunds · coupons · payout approvals · teaching applications · revenue-share setting.

**Platform:** email verification, password reset with expiring single-use tokens, and receipts · email provider interface (console or Resend) · idempotent Paymob webhooks · server-rendered meta tags, Open Graph and JSON-LD for course pages · `sitemap.xml` and `robots.txt` · `/healthz` · structured JSON logs with secrets redacted · CSP, CSRF and Origin checks · rate limiting · safe migrations · online database backups.

## Run locally

Requires Node.js 22.13 or newer. There is nothing to install.

```bash
npm start         # http://localhost:3000, creates data/manhal.db and seeds demo data
npm run dev       # same, restarting on file changes
npm test          # 72 tests with node:test
npm run backup    # copy the database to data/backups/
```

Emails are printed to the log in development. Open **http://localhost:3000/dev/mail** to read them and click their verification and reset links.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Learner | `learner@manhal.test` | `manhal-learn` |
| Instructor | `salma@manhal.test` | `manhal-teach` |
| Admin | `admin@manhal.test` | `manhal-admin` |

The other sample instructors use `<first name>@manhal.test` with `manhal-teach`. Coupons: `MANHAL20` (20% off) and `LAUNCH50` (50% off, 100 uses). Demo data is only seeded into an empty database, and not in production unless `SEED_DEMO=true`.

## Configuration

Copy `.env.example` to `.env`. The server reads it on start; real environment variables win.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `BASE_URL` | `http://localhost:3000` | Public URL for email links, Open Graph tags, the sitemap and Paymob callbacks. Must be `https://` in production. |
| `NODE_ENV` | `development` | `production` turns on secure cookies and refuses unsafe settings at boot |
| `DATABASE_PATH` | `data/manhal.db` | SQLite file (WAL mode) |
| `SEED_DEMO` | `true` outside production | Seed demo courses and accounts into an empty database |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `EMAIL_PROVIDER` | `console` | `console` (development only) or `resend` |
| `EMAIL_FROM` | `Manhal <hello@example.com>` | Sender. With Resend, the domain must be verified. |
| `RESEND_API_KEY` | | Resend API key |
| `PAYMENTS_PROVIDER` | `demo` | `demo` (instant fake checkout, refused in production) or `paymob` |
| `PAYMOB_BASE_URL` | `https://accept.paymob.com` | Paymob API host for your region |
| `PAYMOB_SECRET_KEY` | | Dashboard → Settings → Account info → Secret key |
| `PAYMOB_PUBLIC_KEY` | | Dashboard → Settings → Account info → Public key |
| `PAYMOB_HMAC_SECRET` | | Dashboard → Settings → Account info → HMAC |
| `PAYMOB_INTEGRATION_IDS` | | Card (and wallet) integration IDs, comma separated |
| `BUNNY_LIBRARY_ID` | | Bunny Stream library ID |
| `BUNNY_TOKEN_KEY` | | Bunny Stream library → Security → Token authentication key |
| `VIDEO_URL_TTL` | `7200` | Lifetime of signed video URLs, in seconds |
| `BACKUP_DIR` / `BACKUP_KEEP` | `data/backups` / `14` | Where backups go and how many to keep |

In production the server refuses to start while email is on `console`, payments are on `demo`, Paymob keys are missing, or `BASE_URL` isn't https, and it says which setting is wrong.

## Payments with Paymob

Manhal uses Paymob's current **Intention API + Unified Checkout** flow (the older three-step `auth/tokens` → `ecommerce/orders` → `payment_keys` + iframe flow is deprecated):

1. Checkout prices the cart on the server, creates a `pending` order and calls `POST /v1/intention/` with the amount in piasters, the items, the learner's billing details, `special_reference = manhal-<orderId>-<timestamp>`, and the callback URLs.
2. The learner is redirected to `https://accept.paymob.com/unifiedcheckout/?publicKey=…&clientSecret=…`.
3. Paymob posts the **transaction processed callback** to `/api/payments/paymob/webhook?hmac=…`. Manhal verifies the HMAC-SHA512 over Paymob's 20 documented fields, then:
   - `success` → order **paid**: enroll, credit instructors, send a receipt. The amount must match the order or nothing happens.
   - `pending` → order stays **pending** (wallets and kiosk payments complete later).
   - declined → order **failed** with Paymob's reason; a later successful attempt still pays it.
   - `is_refunded` / `is_voided` → order **refunded**: access is revoked, instructor earnings are reversed and the learner gets an email.
4. The learner returns through `/api/payments/paymob/return`, which checks the signed query string, applies the same update if the callback is late, and shows the order page.

Callbacks are idempotent: each `(transaction id, state)` pair is stored once in `payment_events`, in the same database transaction as its effects, so retries and duplicates change nothing. Admins can refund paid orders from the console; that calls Paymob's refund API and the refund callback is then ignored as already applied.

### Test-mode guide

1. Create a Paymob account and switch the dashboard to **Test mode**.
2. Under **Developers → Payment integrations**, note the **Online Card** test integration ID.
3. Under **Settings → Account info**, copy the test **Secret key**, **Public key** and **HMAC secret**.
4. Put them in `.env` with `PAYMENTS_PROVIDER=paymob`, and set `BASE_URL` to an address Paymob can reach. Locally, use a tunnel such as `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`.
5. In the integration's settings, set the **Transaction processed callback** to `BASE_URL/api/payments/paymob/webhook` and the **Transaction response callback** to `BASE_URL/api/payments/paymob/return`. Manhal also sends both URLs with every intention.
6. Confirm the learner's email (paid checkout requires it, so receipts arrive), add a paid course to the cart and check out.
7. Pay with Paymob's published **test cards** (see Paymob's "Test credentials" page for the current card numbers, expiry and CVV). Try a successful card and a declined one, then refund a paid order from **Admin → Orders**.
8. Watch the log: `order paid`, `order failed` and `order refunded` lines show each transition. Duplicate callbacks show up as `"duplicate": true` in the webhook response.

When you go live, replace the keys and integration IDs with the live ones. Nothing else changes.

## Protected video (Bunny Stream)

A lesson's video source is either a **link** (YouTube, Vimeo or a direct `.mp4`/`.webm`; these are public by nature) or **Bunny Stream**, chosen per lesson in the course editor. For Bunny lessons, `/api/lessons/:id/play` returns a signed embed URL (`token = SHA256(token key + video id + expiry)`) only to enrolled learners, the course's instructor and admins. Free-preview lessons play for everyone.

To set it up: create a Stream library, enable **Token authentication** under Security, set `BUNNY_LIBRARY_ID` and `BUNNY_TOKEN_KEY`, add your domain to the library's allowed referrers, upload videos, and paste each video's GUID into the lesson. Sample courses have no recordings, so the player shows an animated lesson outline instead.

## Instructor payouts

Each paid order credits the course's instructor with `round(amount paid × revenue share)`. The amount paid is after coupons, which are spread across items in proportion to price. The share in force at the time of sale is stored on each ledger line, so changing the setting only affects new sales. Refunds add matching negative lines. Instructors request payouts of at least 100 EGP, up to their available balance (earned − paid − requested). Admins mark requests **paid** after sending the money, or **rejected** with a note. Manhal does not move money itself.

## Operations

- **Health:** `GET /healthz` returns `{"status":"ok","db":true,"version":…,"uptime":…}`, or 503 if the database is unreachable.
- **Logs:** one JSON object per line on stdout, including a request log with request id, method, path (never the query string), status and duration. Fields that look like passwords, tokens, secrets, cookies or API keys are redacted.
- **Backups:** `npm run backup` writes a consistent copy with `VACUUM INTO`, runs an integrity check and keeps the newest `BACKUP_KEEP` files. It is safe while the server runs. Schedule it nightly (cron or Task Scheduler) and copy `BACKUP_DIR` off the machine.
- **Security:** strict CSP (`script-src 'self'`), `frame-ancestors 'none'`, nosniff, HttpOnly SameSite=Lax session cookies (Secure in production), a CSRF token on every state-changing request plus an Origin check, scrypt password hashes, hashed session and email tokens, rate limits on sign-in, reset and verification emails, and server-side prices and permissions.
- **Migrations:** `src/migrations/` holds numbered, append-only migrations that run at start-up, each in a transaction. Add a new file for every schema change and never edit one that has shipped.

## Deploying

**The real app** needs a Node 22 host with a persistent disk for the SQLite file (a VPS, Railway, Render or Fly.io with a volume). Set the variables above, run `npm start` behind HTTPS, point Paymob's callbacks at it and schedule `npm run backup`.

**The live demo** is a static build on Firebase Hosting:

```bash
npm run build:demo          # writes dist/ (course pages pre-rendered with their meta tags)
firebase deploy --only hosting
```

`scripts/build-demo.js` copies `public/` and the server code into `dist/`, swaps `src/lib/crypto.js` for a browser version (`demo/crypto.js`), and loads `demo/boot.js`. That file runs the migrations, seed and API handlers in the browser on sql.js. The demo uses the demo payment provider and keeps emails in an in-browser mailbox.

## Project structure

```
src/
  server.js          HTTP server: static files, SSR meta, /healthz, sitemap, robots, API adapter
  app.js             builds services + routes behind a transport-agnostic handle(request)
  config.js, db.js   environment config and the node:sqlite wrapper
  migrations/        numbered schema migrations
  routes/            auth, catalog, cart, learning, studio, admin, payments
  services/          users, sessions, tokens, auth, catalog, cart, orders, learning, studio, earnings, admin
  lib/               validate, router, errors, log, crypto, payments (Paymob), video (Bunny), seo, email/*
  data/catalog.js    sample courses from the design
  seed.js            demo accounts, courses and sales history
public/              index.html, css/styles.css, js/ (app, ui, router, api, i18n, studio, admin, pages/)
demo/                browser runtime for the static demo
scripts/             build-demo.js, backup.js
test/                node:test suites
```

## What you need to do by hand

- Replace the placeholder **Terms**, **Privacy** and **Refund** text in `public/js/pages/legal.js`, ideally after a lawyer has reviewed it.
- Create **Paymob** and **Resend** accounts (and **Bunny** if you want protected video), verify your sending domain, and fill in `.env`.
- Set the Paymob callback URLs and run through the test-mode guide before switching to live keys.
- Choose a host with a persistent disk, put HTTPS in front of it, and schedule backups off the machine.
- Replace the sample courses: set `SEED_DEMO=false` on a fresh database and create real courses in the studio.

## Notes and limitations

- A refund always refunds the whole order and revokes every course in it. Partial refunds made in the Paymob dashboard are treated the same way.
- Subscriptions ("Manhal Plus") and team plans are shown as coming soon.
- Rate limits live in memory, which is right for a single server process. Use a shared store if you run more than one.
- The in-browser demo hashes passwords with a simplified scheme and cannot verify Paymob signatures. It exists only to show the product.

## License

[MIT](LICENSE) © Abanoub Rashad
