# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

Warkop Mie Bara is split into two independent private git repos, usually checked out side by side:

| Folder | Stack | Remote |
|---|---|---|
| `backend/` (this repo) | REST API: Node.js (>= 22, plain ESM JS) + Express 5 + MySQL via mysql2 | `github.com/zaidandhul/warkop-mie-bara-backend` |
| `frontend/` | QR-code ordering web app: React 18 + Vite 8 + Tailwind v4 + Zustand + axios + React Router 7 | `github.com/zaidandhul/warkop-mie-bara-frontend` |

- Run git commands inside the repo you are changing. The frontend repo has a short `CLAUDE.md` that points here.
- Work on a feature branch from `main` and merge through a pull request; never push straight to `main`.
- **Never commit or push unless the user explicitly asks for it.** One commit per work item. Never print tokens or passwords in output.
- Human docs live in `docs/`:
  - `openapi.yaml`;
  - `RUNBOOK.md`;
  - `SETUP-LAPTOP-BARU.md`;
  - `CATATAN-PROPOSAL.md`;
  - `BELUM-SELESAI.md` (open work and decisions waiting for the owner).

## Domain conventions

- UI language is Indonesian. User-facing strings, API error messages, DB enum values (`menunggu`, `diproses`, `siap`, `selesai`, `dibatalkan`) and script logs are in Bahasa Indonesia; keep new ones in Indonesian.
- Currency is Rupiah stored and computed as **integers** (no decimals): `INT UNSIGNED` columns, formatted on the client with `rupiah()` in `frontend/src/utils/price.js`.
- Business time zone is **Asia/Jakarta** (WIB, UTC+7). Keep it in mind for anything date-based (daily reports, "today's orders", displayed times).
- **Prices are always recomputed on the server; the frontend is never trusted.** Any price, subtotal, fee or total sent by the client must be ignored and re-derived from the database (see `createOrder` below).
- Scope (from the owner's proposal): dine-in, 10 tables, payment at the cashier (cash / manual QRIS), **no payment gateway**. Out of scope: delivery/take away, reservations, multiple languages. Hosting is not decided yet: do not touch deployment, HTTPS, process managers, backup schedules, or production MySQL users until the owner decides.

## Commands

Backend (`npm run …` in `backend/`; scripts load `.env` via `node --env-file-if-exists`):
- `dev` (`node --watch`) / `start`. API on `PORT` (default 3000) under `/api`.
- `lint` (ESLint recommended), `test` (unit, `node:test`, `test/unit/*.test.js`), `test:integration` (`test/integration/*.test.js`; creates and drops temporary MySQL databases `mb_it_*_test`; uses `.env` then `.env.test`).
- `db:migrate` / `db:migrate:status`: migration runner (`src/database/migrator.js`, table `schema_migrations`).
  - Empty DB: runs `schema.sql` and marks every migration `baseline`.
  - Old DB without records: 001–006 are detected from their effects and marked `baseline`; anything else is run.
  - New migrations (009+) always go through the runner. Fold each one into `schema.sql` too, and add its reversal to the legacy simulation in `test/integration/migrator.test.js`.
- `db:backup`: mysqldump (`MYSQLDUMP_PATH`, Laragon/XAMPP, or PATH) to `src/database/dump/<db>_YYYY-MM-DD_HHmmss.sql` (WIB, ignored by git), verified non-empty and complete. `BACKUP_DIR` overrides the folder.
- `db:retention [-- --dry-run] [-- --days N]`: clears `customer_phone` on orders older than `PHONE_RETENTION_DAYS` (default 90); sales data untouched.
- `db:seed`: upsert categories, toppings, menu items and settings from `src/data/menu.json`. For menu items that already exist it leaves `price` and `is_active` alone (staff change those from the dashboard); `-- --force` overwrites them.
- `db:food-options`: re-sync `levels_json`/`allowed_toppings_json` from `menu.json` for categories `special` and `bara-nusantara` only.
- `db:note-only`: NULL out level/variant/topping options for `camilan`, `signature-drink`, `all-variant-drink` (those items then only accept a note). `db:seed` re-applies whatever `menu.json` says, so re-run this afterwards if needed.
- `staff:create`: create an **admin** account (prompts for username and hidden password). Non-interactive: `STAFF_PASSWORD=... npm run staff:create -- --username admin1`.

Frontend (`npm run …` in `frontend/`): `dev` (Vite :5173, LAN-visible), `build`, `preview`, `lint`, `test` (unit, `node:test`), `dev:e2e`, `test:e2e`.

End-to-end suite (Selenium + Mocha) in `frontend/e2e/`; see `frontend/e2e/README.md`:
- Backend: `npm run db:test:setup`, then `npm run staff:create:test`, then `npm run dev:test` (API :3001 on `kopi_miebara_test` via `.env.test`).
- Frontend: `npm run dev:e2e` (Vite :5174, `--mode test`, proxied to :3001), then `npm run test:e2e`. Config is in `frontend/e2e/.env.e2e`.
- **Safety:**
  - The suite aborts unless `GET /api/health` returns `testMode: true` (only when `MYSQL_DATABASE` ends in `_test`).
  - Data cleanup (`closeActiveOrders`) refuses to run unless `testDatabase` is exactly `kopi_miebara_test`.
  - `setup-test-db.js` refuses non-`_test` names. Never point E2E at the main database.
- Elements are selected by `data-testid`; keep those attributes when changing UI.
- The root hook (`e2e/support/hooks.js`) closes today's active orders left by earlier runs (paid → `selesai`, others → `dibatalkan`) so the per-table limit is not already reached. Helper `createOrder` defaults to table 1; spec B uses table 5, spec J table 2.
- React Router 7 renders navigations in `startTransition`: after a navigation, wait for elements (`waitVisible`) instead of `findElement` right away.

CI (`.github/workflows/ci.yml` in both repos):
- Backend: lint, unit, and integration test against a `mysql:8.0` service.
- Frontend: lint, unit test, and build.
- E2E runs locally only.

Every `.sql` file hardcodes `USE kopi_miebara`; never pipe them into another database as-is (the runner and the test setup rewrite the name).

Running locally (step-by-step in `docs/SETUP-LAPTOP-BARU.md`):
1. Start MySQL (Laragon or XAMPP).
2. In `backend/`: `npm install`; copy `.env.example` to `.env`; run `npm run db:migrate`, `db:seed`, `db:note-only`, `staff:create`; then `npm run dev`.
3. In `frontend/`: `npm install`; copy `.env.example` to `.env`; `npm run dev`. Open `http://localhost:5173/?tableNumber=5` to simulate a table's QR code.

Frontend `.env`:
- `VITE_API_URL` (default and recommended `/api`).
- `vite.config.js` proxies `/api` to `VITE_PROXY_TARGET` (default `http://localhost:3000`) with `xfwd: true`, and listens on the LAN (`host: true`), so tablets/phones use one origin and the staff login cookie works without CORS.
- `VITE_PUBLIC_URL` (optional): the default base URL printed in the table QR codes.

Backend `.env` keys are listed with defaults in `README.md` and `.env.example`. Notable ones:
- `JWT_SECRET`: required, ≥ 32 chars.
- `TABLE_COUNT`: default 10.
- `ORDER_RATE_LIMIT`: customer orders per IP per 10 min, default 100, `0` = off; `.env.test` sets 0.
- `MAX_ACTIVE_ORDERS_PER_TABLE`: default 5, `0` = off.
- `TRUST_PROXY`: default `loopback`.
- `LOG_LEVEL`, `PHONE_RETENTION_DAYS`.
- `NODE_ENV=production`: the server refuses to start if `JWT_SECRET` is empty/short/a placeholder, `MYSQL_USER` is empty or `root`, or `MYSQL_PASSWORD` is empty (`src/config/env.js`).

Smoke check: `GET /api/health` returns `{status:'ok', database:'connected'}` when MySQL is reachable.

## Database

- MySQL 8.0 (local: Laragon). `schema.sql` uses `utf8mb4_general_ci` so it also runs on MariaDB 10.4. Main database: `kopi_miebara`; test database: `kopi_miebara_test`.
- Backups in `src/database/dump/` contain customer data (names, phone numbers, orders): never commit them, never paste their contents anywhere. The folder is in `.gitignore`; keep it that way.
- `schema.sql` is the structural source of truth (`CREATE TABLE IF NOT EXISTS`, includes every migration). phpMyAdmin exports drop table-level CHECK constraints, so a phpMyAdmin dump is not a reliable schema reference.
- Tables:
  - `categories`, `toppings`;
  - `menu_items` (options as JSON columns `levels_json`, `options_json`, `allowed_toppings_json`);
  - `app_settings` (int key/value: `other_fee`, `level_price_step`);
  - `orders`, `order_items`;
  - `staff_users` (`is_admin`, `session_version`);
  - `staff_audit_log`;
  - `schema_migrations`.
- `orders` also stores payment (`paid_at`, `paid_method` `tunai|qris_manual`, `paid_by_staff_id`) and origin (`source` `pelanggan|kasir`, `created_by_staff_id`). `payment_method` is always `cashier` for new orders; `online` only exists in old data.
- Named CHECK constraints: `chk_orders_total` (`total = subtotal + fee`), `chk_orders_paid` (`paid_at` and `paid_method` both set or both NULL), `chk_order_items_line_total` (`line_total = unit_price * qty`), `chk_order_items_qty` (`qty > 0`), `chk_toppings_price`, `chk_menu_price` (`price >= 0`). Inserts must satisfy them. After a re-import from a phpMyAdmin dump, re-add them with `ALTER TABLE ... ADD CONSTRAINT`.
- Collation and JSON columns:
  - All tables and text columns use `utf8mb4_general_ci`.
  - On databases imported from MariaDB, JSON columns are `longtext ... utf8mb4_bin` with `json_valid` CHECKs, so never use `CONVERT TO CHARACTER SET` on them.
- Foreign keys:
  - `fk_menu_category`;
  - `fk_order_items_order` (CASCADE), `fk_order_items_menu` (SET NULL);
  - `fk_orders_paid_by`, `fk_orders_created_by`, `fk_audit_staff` (SET NULL to `staff_users`).

  `staff_users` is created before `orders` in `schema.sql` because of them. Re-check collation and FKs after any re-import.
- Migrations: `src/database/migrations/NNN_name.sql`, applied with `npm run db:migrate`; check with `db:migrate:status`. Never edit a migration that has already been applied; add a new one.
- Time: the mysql2 pool uses `timezone: 'Z'` and sets each session to `+00:00`, so `TIMESTAMP`s go in and out as UTC regardless of the machine's zone. WIB day boundaries are computed in `utils/time.js` (fixed +07:00; the MySQL tz tables are empty, so never use `CONVERT_TZ('Asia/Jakarta')`).
- Old orders predate current validation (e.g. table `09`/`30`, phones up to 15 chars, a level on a no-level item, duplicate orders #1/#2). Leave old data as is.
- `order_items` snapshots `item_name` and `toppings_snapshot` so historical orders survive menu edits.
- JSON columns may come back as strings or Buffers (MariaDB); always read them through `utils/json.js` (`jsonArray`/`jsonColumn`).
- `withTransaction(fn)` in `db.js` runs `fn(connection)` in one transaction.

## API (`src/server.js`, full spec in `docs/openapi.yaml`)

Public routes:
- `GET /api/menu`: also returns `tableCount`, and per item `bestSellerRank` (1..n from non-cancelled orders of the last 30 days among active items, ties by menu order, `null` without sales; never send sold quantities publicly).
- `POST /api/orders`: rate-limited per IP by `middleware/rateLimit.js` (in memory).
- `GET /api/orders/:id`: includes a `paid` boolean, never name/phone.
- `GET /api/health`.

Cross-cutting behaviour:
- CORS is hand-rolled middleware (no `cors` package).
- `req.ip` honours `X-Forwarded-For` only from `TRUST_PROXY`.
- Every response gets security headers (`middleware/securityHeaders.js`, CSP `default-src 'none'`); `X-Powered-By` is off.
- Requests are logged by pino (`logger.js`, `middleware/requestLog.js`: method, path without query, status, duration; never bodies, cookies, or tokens).
- Errors: services throw errors with `statusCode` (see `invalid()` in `services/orderRules.js`), and `middleware/errorHandler.js` returns them as `{error}` with that status. Anything else becomes a generic 500 and is logged with the stack. Express 5 forwards async handler rejections, so new routes need no try/catch.

Staff dashboard API:
- `POST /api/auth/login` sets the httpOnly cookie `mb_staff` (JWT HS256, 12 h, `SameSite=Lax`, `path=/api`). `POST /api/auth/logout` clears it.
- Failed logins are limited to 5 per IP+username per 15 min (`services/loginLimiter.js`: in memory, swept every minute, max 10,000 entries).
- The JWT payload is `{ sub: staffId, v }`. `v` must equal `staff_users.session_version`; a password change or reset increments it, so old sessions die.
- Everything under `/api/admin` goes through `requireStaff` (`middleware/auth.js`), which re-reads `is_admin`, `is_active`, and `session_version` on every request:
  - `GET /me`; `POST /me/password` `{currentPassword, newPassword}` (issues a fresh cookie).
  - `GET /orders?status=&date=YYYY-MM-DD` (default today WIB; includes `paidAt`, `paidMethod`, `source`, `createdBy`, `paidBy`, `history`).
  - `POST /orders`: order entered by the cashier. Same validation as the public route (shared `createOrder`), plus optional `paidMethod` (`tunai|qris_manual`) to create it already paid. An empty name becomes `Meja N`; `source = 'kasir'`; no rate limit and no per-table limit.
  - `PATCH /orders/:id/status`: 409 if another device changed it first; cancelling a paid order is rejected with 400.
  - `PATCH /orders/:id/payment`: `{method: 'tunai'|'qris_manual'}` marks it paid, `{method: null}` undoes it; 409 if already in that state; cancelled orders can't be paid.
  - `GET /menu`; `PATCH /menu/:id` with `{isActive?, price?}`.
  - `GET /reports/sales?from=&to=`: WIB dates, inclusive, default today, max 92 days. Returns summary, per day/table/hour, top items, and the order list. Revenue = non-cancelled orders, paid or not. Aggregated in JS in `services/reports.js`.
  - `GET /audit-log?limit=`.
- **Minimal roles:** `is_admin` only gates staff management (`requireAdmin`). Every staff account can use orders, menu, reports, and QR; existing accounts and `staff:create` accounts are admins. Customers never log in.
  - Admin-only endpoints: `GET/POST /staff`, `PATCH /staff/:id` `{isActive?, isAdmin?}`, `POST /staff/:id/password`.
  - You cannot deactivate or demote yourself, and at least one active admin must remain.
- Audit: order status/payment and menu price/availability changes are written to `staff_audit_log` in the same transaction (only real value changes).
- Allowed status transitions are `menunggu→diproses→siap→selesai` and `menunggu/diproses→dibatalkan` (`TRANSITIONS`/`transitionProblem` in `services/admin.js`, mirrored for the buttons in `frontend/src/admin/constants.js`).

Order flow (`services/orders.js#createOrder`; pure rules in `services/orderRules.js`; normalizers in `utils/validation.js`):
1. **Request validation:**
   - table normalized to `1`–`TABLE_COUNT` (trim, digits only, leading zeros dropped);
   - name trimmed 2–100 chars;
   - phone optional but normalized (`+62`/`62` → `0`); must match `08` + 8–11 digits;
   - `paymentMethod` must be `cashier` (`online` is rejected: there is no payment gateway);
   - ≤ 50 lines, qty 1–50 per line.
2. **Locking:** inside one transaction it locks `app_settings` `FOR UPDATE` and the menu rows.
   - The settings lock **must stay exclusive**: it serializes order creation, and the per-table limit (`MAX_ACTIVE_ORDERS_PER_TABLE`, customer orders of today only, 409) depends on it.
   - `FOR SHARE` there causes `ER_LOCK_DEADLOCK`, which E2E spec J proved.
3. **Prices:** all prices are **recomputed server-side** (`base + (level-1)*level_price_step + toppings`).
4. **Option checks:**
   - inactive items are rejected;
   - a level/variant/topping is rejected if the item's JSON list is NULL or doesn't contain it;
   - toppings must also be active in `toppings`.
5. **Errors:** every rejection is 400 with a specific Indonesian message, shown as-is by the frontend (`errorMessage()` in `src/api/orders.js`).

Idempotency:
- `POST /api/orders` accepts an optional `Idempotency-Key` header (UUID; allowed in CORS). `PaymentPage` creates one per page visit.
- A repeated key returns the existing order with 200 instead of 201, without creating a new one. The key is stored in `orders.idempotency_key` (UNIQUE); a concurrent duplicate is caught via `ER_DUP_ENTRY`.
- Order IDs are `order_code` strings `MB-<20 hex>`; the numeric `id` is internal.

`getMenu` maps DB columns to the frontend shape:
- per item: `description→desc`, `needs_price_check→check`, `best_seller→bestSeller`, `levels`, `options` (variants), `toppings` (allowed topping ids), `bestSellerRank`;
- top level: `toppings`, `fee`, `levelPriceStep`, `tableCount`.

Categories without active items are dropped.

## Frontend architecture (`frontend/`)

- Routes in `src/App.jsx`: `/` and `/order` → `MenuPage`; `/view-order` (cart review), `/payment`, `/status/:id`, `/history`, `/profile`, `/privacy`.
- Staff dashboard lives in `src/admin/` with its own axios client (`withCredentials`):
  - `/admin/login`.
  - `/admin`: `AdminLayout` checks the session via `GET /admin/me` and wraps:
    - the kanban (`AdminOrdersPage`): polls every 10 s while the tab is visible and chimes via Web Audio for new orders after "Aktifkan suara" or login. Each card (`OrderCard`) has "Lunas · Tunai/QRIS" buttons and shows "Diubah oleh …" plus the full history; the toolbar shows the unpaid count and amount.
    - `/admin/pesanan-baru` (`AdminNewOrderPage`): cashier order entry; local state, not the customer cart.
    - `/admin/menu`: availability switch and price edit; errors appear as a fixed toast.
    - `/admin/laporan` (`AdminReportsPage`): Excel export in `reportExport.js` with `write-excel-file`, loaded by dynamic `import()`.
    - `/admin/qr` (`AdminQrPage`): one printable QR per table with `qrcode.react`; the base URL is editable and kept in localStorage.
    - `/admin/staf` (`AdminStaffPage`, admins only) and `/admin/akun` (`AdminAccountPage`: change your own password; opened by clicking your name in the header).
  - Layout targets tablet landscape. All `/admin/*` routes share one transition key in `App.jsx`, so the layout isn't remounted.
- Table number comes from the QR link query `?tableNumber=N`, read once in `MenuPage`, or picked from a dropdown of `1..tableCount`. `setTable` in `cartStore` normalizes the format; `syncWithMenu` then drops a table above the server's `tableCount`.
- Menu filters live in `src/store/menuViewStore.js` (Zustand persist → `sessionStorage` `mie-bara-menu-view`): category, search (name + description, case-insensitive), sort `default|termurah|termahal|terlaris`. `filterMenu()` there is pure: the default sort renders per-category rows, other sorts one cross-category grid.
- `cartStore.syncWithMenu(menu)` runs whenever the menu page, cart review and payment page load the menu (and after a 400 on submit). It reprices every line from the live menu, drops lines whose item is gone or whose options are no longer allowed, and updates `fee`/`tableCount`. `CartSyncNotice` tells the customer what changed.
- Level/topping choices in `ItemSheet` come only from the DB menu (no frontend fallback), since the backend rejects anything not listed on the item.
- `src/api/orders.js` is the customer API client (it also exports `errorMessage()`, reused by the admin pages). Order history has no backend endpoint: created order codes are kept in `localStorage` (`mie-bara-order-history`, `[{id, at}]`, 24 h TTL, max 30) and re-fetched one by one.
- `src/store/cartStore.js` (Zustand `persist` → `sessionStorage` key `mie-bara-cart`): a cart line's identity is `keyOf(item, opts)` (id + level + sorted toppings + variant + note), so identical configurations merge.
- There is no static menu copy in the frontend. `src/utils/price.js` holds only `rupiah()` and `priceFor()` (display-only; the backend is authoritative). The seed source is `backend/src/data/menu.json`.
- Styling: Tailwind v4 via `@tailwindcss/vite`, theme tokens in `src/index.css` `@theme` (`bara-black`, `bara-panel`, `bara-line`, `bara-cyan`, `bara-chili`), dark UI, mobile-first.

## Status

`v1.0.0-pre-hosting`: all non-hosting work is done and merged. Open work (hosting phase, dependency follow-ups) and decisions waiting for the owner (16 unconfirmed prices, which items get levels/toppings, phone retention period, hosting target) are tracked in `docs/BELUM-SELESAI.md`.
