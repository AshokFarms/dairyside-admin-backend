# Admin API — Handoff (DDL + frontend wiring)

Status date: 2026-07-19 (updated same day). **The DDL in section 1 has been
EXECUTED** — Ashok granted DDL access and all statements ran idempotently via
`scripts/runDdl2026-07-19.js` (re-running is a no-op). Everything in
"Implemented & verified" is live in this repo and was exercised against the
shared Aiven MySQL. Nothing here modifies the customer app code (repos 1–2).

---

## Implemented & verified (mounted under `/v1/admin`)

| Resource | Endpoints | Notes |
|---|---|---|
| Dashboard | `GET /dashboard/stats`, `/revenue-chart`, `/recent-orders`, `/low-stock` | verified vs live DB |
| Orders | `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`, `POST /orders/bulk-status` | list/detail verified; writes validated only (no prod writes) |
| Customers | `GET /customers`, `/:id`, `/:id/orders`, `/:id/subscriptions`, `/:id/wallet` | verified vs live DB |
| Subscriptions | `GET /subscriptions`, `/:id`, `PATCH /:id/status` | verified; `next_delivery` computed from subscription_deliveries |
| Trial packs | `GET /trial-packs` | verified (free_trial_claims) |
| Deliveries | `GET /deliveries/today[?date&shift]`, `PATCH /deliveries/:orderId/complete`, `POST /deliveries/bulk-complete` | manifest verified; writes transactional (orders + subscription_deliveries) |
| Pincodes | `GET/POST /pincodes`, `PUT/DELETE /pincodes/:id` | verified reads + validation |
| Products | `GET/POST /products`, `GET/PUT/DELETE /products/:id`, `POST /products/:productId/variants`, `PUT /variants/:id`, `PATCH /variants/:id/stock` | verified vs live DB |
| Categories | `GET/POST /categories`, `PUT/DELETE /categories/:id` | verified |
| Legacy aliases | `GET/POST /api/products*`, `GET/POST /api/categories*` | kept for the current UI; **fixed** broken `thumbnail`/`rating` columns (now real `image_url AS thumbnail`) |

Auth seam: `middleware/adminGuard.js` — `ADMIN_AUTH_ENABLED=false` by default.
When flipped on, every `/v1/admin/*` route requires a Firebase bearer token whose
uid is in `ADMIN_UIDS`. Integration test asserts the 401 path.

---

## 1) DDL — ✅ EXECUTED 2026-07-19 (kept for reference)

All statements below ran against the shared DB via
`scripts/runDdl2026-07-19.js` (16 executed, verified). Two enum tweaks were
applied on top to match the UI contract exactly:
`coupons.discount_type ENUM('flat','percentage')` and
`contact_messages.status ENUM('pending','resolved')`.

Consequently these are now LIVE endpoints (all verified, test data cleaned up):

| Resource | Endpoints |
|---|---|
| Wallet adjust | `POST /v1/admin/customers/:id/wallet` `{type, amount, reason}` (transactional; ready — not exercised on a real customer account) |
| Pincodes | now persist `delivery_fee`, `min_order_amount`, `morning`, `evening` |
| Coupons | `GET/POST /coupons`, `GET/PUT/DELETE /coupons/:id` (409 on duplicate code) |
| Banners | `GET/POST /banners`, `PUT/DELETE /banners/:id` |
| Settings | `GET /settings` (catalog defaults merged with stored values), `PUT /settings` (map or array form) |
| Notifications | `POST /notifications` → **501** until a provider is wired |
| Delivery slots | `GET /delivery-slots` (2 canonical slots seeded), `PUT /delivery-slots/:id` |
| Contact messages | `GET /contact-messages?status=`, `PATCH /contact-messages/:id` (respond → resolved + timestamp) |

### a. Wallet manual adjustment (enables `POST /v1/admin/customers/:id/wallet`)

```sql
ALTER TABLE wallet_transactions
  MODIFY COLUMN reference_type
  ENUM('order','refund','topup','cashback','referral','trial_refund','adjustment') NULL;
```

Then un-comment the route in `routes/customerRoutes.js` (marked with a comment).
The service/model/validator are already implemented and transactional.

### b. Missing tables for UI sections that have api modules but no backing data

The admin UI's `api/index.js` declares these; the DB has no tables yet. The
resources are NOT implemented server-side (they'd be dead ends). If you want
them, run the DDL and tell me — each is then a small resource to add.

```sql
-- Coupons (couponsApi)
CREATE TABLE coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  discount_type ENUM('flat','percent') NOT NULL DEFAULT 'flat',
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(10,2) NULL,
  usage_limit INT NULL,
  used_count INT NOT NULL DEFAULT 0,
  valid_from DATE NULL,
  valid_until DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_coupons_active (is_active, valid_until)
);

-- Banners (contentApi.getBanners/…)
CREATE TABLE banners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NULL,
  image_url VARCHAR(500) NOT NULL,
  link_url VARCHAR(500) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Settings (contentApi.getSettings/updateSettings) — single-row key/value
CREATE TABLE app_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Delivery slots (serviceAreaApi.getDeliverySlots/updateDeliverySlot)
CREATE TABLE delivery_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(60) NOT NULL,          -- e.g. 'Before 7 AM', '6 PM – 9 PM'
  shift ENUM('morning','evening') NOT NULL,
  cutoff_time TIME NULL,               -- order-by time for same-day delivery
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0
);

-- Contact messages (messagesApi)
CREATE TABLE contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  subject VARCHAR(255) NULL,
  message TEXT NOT NULL,
  status ENUM('new','responded','closed') NOT NULL DEFAULT 'new',
  admin_response TEXT NULL,
  responded_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_contact_status (status, created_at)
);
```

### c. Pincode UI columns that don't exist yet (optional)

`PincodeList.jsx` renders `delivery_fee`, `min_order_amount`, `morning`,
`evening`. The API currently returns safe defaults (0 / 0 / true / true). To
make them real:

```sql
ALTER TABLE serviceable_pincodes
  ADD COLUMN delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN morning TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN evening TINYINT(1) NOT NULL DEFAULT 1;
```

Tell me when run and I'll persist/serve them (small change in
`models/adminPincodeModel.js` + validators).

### d. Recommended indexes (performance; all queried by the admin API)

```sql
CREATE INDEX idx_orders_delivery_date ON orders (delivery_date, status);
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at);
CREATE INDEX idx_subs_status ON subscriptions (status);
CREATE INDEX idx_sd_sub_date ON subscription_deliveries (subscription_id, delivery_date);
CREATE INDEX idx_wallet_tx_user_created ON wallet_transactions (user_id, created_at);
```

(Skip any that already exist — check with `SHOW INDEX FROM <table>`.)

---

## 2) Repo-3 (DairySide-admin) wiring checklist — report only, NOT changed by me

The UI today renders MOCK data on most pages; only Products/Categories hit the
network (via `src/api/axiosConfig.js` → `http://localhost:5001/api`). The full
`/v1/admin` client already exists in `src/api/index.js` (`apiClient`,
`VITE_API_BASE_URL || '/v1'`) but no page imports it yet.

To go live page by page (frontend work, needs your approval to touch repo 3):

1. `.env`: set `VITE_API_BASE_URL=http://localhost:5001/v1`.
2. Dashboard → replace mock arrays with `dashboardApi.*` calls.
3. OrderList/OrderDetail → `ordersApi.getAll/getById/updateStatus/bulkUpdateStatus`.
4. CustomerList/CustomerDetail → `customersApi.*` (detail id = numeric users.id).
5. SubscriptionList → `subscriptionsApi.*`; trial packs tab → `getTrialPacks`.
6. DeliveryManifest → `deliveriesApi.getToday/complete/bulkComplete`.
7. PincodeList → `serviceAreaApi.getPincodes/...`.
8. ProductList/CategoryList: either keep the legacy slices (they work now that
   `/api/products` is fixed) or migrate the slices to `productsApi`/
   `categoriesApi` for pagination + variants management.
9. Coupons/Banners/Settings/Delivery-slots/Messages pages: blocked on section 1b
   DDL; until then they must stay on mock data.

Response envelope everywhere:
`{ success, data, pagination? { page, limit, total, totalPages } }`, errors
`{ success: false, error, details? }`.

---

## 3) Operational notes

- `npm test` — 11 tests (unit: pagination, customerService; integration:
  health/auth-guard/404/validation). Hermetic — no DB writes.
- `npm run dev` — nodemon; `npm run start:dev` — plain node.
- `.env.example` documents every variable; startup fails fast if `DB_*` missing.
- Rate limiting + helmet + CORS allowlist active on every route.
- Graceful shutdown closes HTTP + pool on SIGTERM/SIGINT.
- Writes (order status, delivery complete, wallet adjust) are transactional and
  idempotent-safe; none have been executed against the shared prod DB from here.
