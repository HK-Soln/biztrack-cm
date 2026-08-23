# BizTrack CM — Desktop-v2 Functionality Map

Every user-facing capability in the desktop-v2 app, grouped by route. Grouping follows the
app's own sidebar nav (`lib/nav.tsx`) plus the pre-login auth group.

**Layout groups (from `router.tsx`):**

- **Auth group** — `RequireGuest` + `AuthShell` (not logged in).
- **App group** — `RequireAuth` + `AppShell` (logged in). Owner-only routes add `RequireOwner`.

**Gating legend:** 🔒 owner-only · 💳 plan-gated · 📶 online-only · 🏷️ status/data-state gated.

---

## 0. Authentication & Onboarding _(pre-login)_

| Route              | Screen                | Functionality                                                                                                                                                                                                                         |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/signin`          | Sign in               | Email **or** phone + password; show/hide password; "keep me signed in"; links to forgot-password, one-time-code (SSO), sign-up. Resumes an abandoned verification if the account is half-onboarded.                                   |
| `/signup`          | Create account        | Business name, full name, phone (req), email (opt), password w/ strength meter, terms; then 6-digit OTP step (phone first, then email if required) w/ masked destination + resend cooldown. Can resume via URL params / invite token. |
| `/invite`          | Accept invite         | Loads invite preview (business, inviter, role); "new user" (register, contact locked) or "existing user" (sign in) modes; decline invite. Handles expired/invalid/declined states.                                                    |
| `/sso`             | One-time-code login   | Passwordless: pick channel (Email/SMS/WhatsApp), enter contact, receive + enter 6-digit OTP (auto-submit), resend cooldown.                                                                                                           |
| `/forgot-password` | Reset password        | Request reset code via channel, enter code + new password (strong-password rule), resend cooldown.                                                                                                                                    |
| `/select-business` | Choose business       | Lists businesses the user belongs to w/ role labels; enter one (mints phase-2 token). 🏷️ incomplete businesses locked for non-owners. Offline cache fallback. Auto-selects only if exactly one ACTIVE business. Sign out.             |
| `/setup-business`  | Business setup wizard | 3 steps — Identity (name, type, slogan), Contact (phone/email/address/city), Fiscal (NIU, RCCM, VAT toggle+rate, regime). Transitions business to plan-pending.                                                                       |
| `/select-plan`     | Choose plan           | Plan picker w/ monthly/annual toggle; prices, quotas, features from real backend entitlements; recommended = BUSINESS; free-trial length backend-driven. Activates the business.                                                      |
| `/invitations`     | My invitations        | Post-login list of pending invitations; accept (join) or decline per row.                                                                                                                                                             |

---

## 1. Home — `/`

- Role-tailored dashboard **dispatcher**: renders Owner / Manager / Accountant / Cashier / General home variants (+ mobile variants at small breakpoints).
- Triggers a data sync on mount so freshly-onboarded data appears.
- KPIs/quick actions live in the per-role home components.

---

## 2. Sell (Point of Sale) — `/sell`

- **Catalog & cart:** paginated catalog w/ "load more", category chips, text search; tap to add (out-of-stock disabled). Smart add routing: simple → +1/stack; variants → VariantPicker; serialized → SerialPicker (units = qty); services → ServicePricePicker.
- **Barcode scanning:** global hardware-scanner listener + Enter-in-search resolves code → product/variant/serial; "scan miss" toast on no match.
- **Cart line edits:** +/- qty, direct numeric qty, remove line, edit serial units, Clear.
- **Customer:** attach via CustomerPicker or Walk-in; presettable via `?customer=` or the Deposits "Collect" handoff.
- **Discounts/charges:** predefined active charge types, custom charge, custom discount; each line editable PERCENT or FIXED; live totals.
- **Held sales (local only):** hold/park cart+charges+customer to localStorage; "Resume (N)" list; resume/delete tickets.
- **Payment (PaymentModal):** Cash, MTN MoMo, Orange Money, Card, Deposit (savings), Credit, Split; amount received + quick amounts + change/due; MoMo/OM reference capture. 🏷️ credit/remainder & deposit require a selected customer; force-deposit mode from Collect.
- **Receipt (SuccessModal):** live receipt preview; Print, Send (ReceiptSendDialog), Start new sale.

---

## 3. Products (Catalog)

| Route                                 | Screen           | Functionality                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/products`                           | Product list     | Paginated/searchable list (table/cards+FAB); KPI tiles (catalog/retail value, low/out-of-stock); filter by category/stock/brand/status; row → detail; inline edit/delete (confirm); New. CSV Import button disabled ("coming soon").                                                                                                                                                                                                    |
| `/products/new`, `/products/:id/edit` | Product form     | Wizard: Basics → Pricing → (Variants) → (Stock) → Online → Media. Type (SIMPLE/SERVICE/VARIABLE_QUANTITY/COMPOSITE), brand/category/model/unit, SKU, barcode+scanner; cost/price + live margin, taxable (19.25%); variant builder w/ per-variant price/cost/stock + serials; opening stock/thresholds; online/SEO fields; image + gallery, active/featured. Draft autosave to localStorage. 🏷️ serialized/serial fields locked on edit. |
| `/products/:id`                       | Product detail   | Hero + metric tiles (on-hand, stock value, margin); Edit/Delete; Restock, Adjust (direct products only), edit thresholds, stock-movement history; manage variants (SIMPLE) / serial units (serialized); pricing breakdown; online/SEO card; gallery. Some tiles placeholders (Sold/30d, Incoming, Supplier).                                                                                                                            |
| `/products/categories`                | Categories       | Paginated/searchable list w/ depth/level; desktop master-detail (products in category, paginated); mobile tap→edit + FAB; edit/delete (confirm); New.                                                                                                                                                                                                                                                                                   |
| `/products/categories/new`, `/:id`    | Category form    | Name + live slug, parent selector, description, sort order; attach/detach + reorder variant attribute groups (🏷️ leaf-only), mark required/optional; placement breadcrumb, image, Active + Show-online toggles.                                                                                                                                                                                                                         |
| `/products/brands`                    | Brands           | Paginated/searchable list w/ category+model counts; create/edit via modal (logo, name, description, category-tree multi-picker); manage models inline (add/rename/delete); linked-category chips; delete (confirm).                                                                                                                                                                                                                     |
| `/products/attributes`                | Attribute groups | List w/ option counts/swatches; create/edit (name + display type SWATCHES/CHIPS/DROPDOWN); add/edit/remove options (color when swatch), drag-reorder; delete (confirm); server guard errors surfaced.                                                                                                                                                                                                                                   |
| `/products/units`                     | Units            | List w/ abbreviation/type/role badge; create/edit (name, abbreviation, type QUANTITY/WEIGHT/VOLUME/LENGTH/CUSTOM); delete custom. 🏷️ SYSTEM units locked.                                                                                                                                                                                                                                                                               |

---

## 4. Inventory

| Route                | Screen                 | Functionality                                                                                                                                                                                                                                               |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/inventory`         | Stock levels           | Per-product on-hand/reorder/health-bar/value; KPIs (stock value, units, low/out counts); All/Low/Out tabs + search + category filter + pagination; row → product detail; "Receive stock"; low/out banner → "Generate PO" pre-seeded w/ reorder suggestions. |
| `/inventory/restock` | Receive stock (ad-hoc) | Goods receipt not tied to a PO; jump into an open PO's receive flow, or add manual product lines; per-line qty/cost, variant sub-groups, serial entry+validation; SettlementPanel (charges/discounts/payments/invoice, supplier pick).                      |

---

## 5. Purchasing

| Route                                      | Screen           | Functionality                                                                                                                                                                                    |
| ------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/purchasing/rfqs`                         | RFQ list         | List w/ number/title/status/items/quotes count + date; search + paginate; New RFQ; open (desktop drawer / mobile detail).                                                                        |
| `/purchasing/rfqs/new`                     | New RFQ          | Title + message; add item lines (product/variant + qty); select ≥1 supplier; requires ≥1 item + supplier.                                                                                        |
| `/purchasing/rfqs/:id`                     | RFQ detail       | Header/items/message; per-supplier table (status, quoted total, quote file); preview outgoing doc; per-supplier Share, Record quote (total/notes/file upload), Create PO.                        |
| `/purchasing/rfqs/:id/convert/:supplierId` | Convert RFQ → PO | Seed lines from RFQ; edit qty/price, remove, pick variants; edit title/message/expected date; live total; creates PO + closes RFQ.                                                               |
| `/purchasing/orders`                       | PO list          | List w/ number/supplier/status/received %/total/date; search + paginate; New PO; open (drawer/detail).                                                                                           |
| `/purchasing/orders/new`                   | New PO           | Supplier (req, presettable `?supplier=`), expected date, title, message, item lines (qty+price), live total; "Create" (draft) or "Create & send" (opens share). Seedable from inventory reorder. |
| `/purchasing/orders/:id`                   | PO detail        | Header/lines (ordered/received/price/totals)/message; preview doc; Share; 🏷️ Receive (unless DRAFT/RECEIVED/CANCELLED); 🏷️ Cancel (unless RECEIVED/PARTIALLY_RECEIVED/CANCELLED).                |
| `/purchasing/orders/:id/receive`           | Receive PO       | Lines prefilled w/ remaining qty + price; per-line qty/cost, variant sub-groups, serial entry+validation; SettlementPanel (supplier fixed to PO, ref defaults to PO number).                     |

---

## 6. Sales — `/sales`

- Transaction list w/ period segments (Today/Week/Month); KPIs (revenue, avg basket, items sold, refunds).
- Filter by payment method (Cash/MoMo/OM/Card/Savings/Credit) and channel (Online/In-store) + search + paginate.
- Row → full receipt/detail (mobile sheet / tablet master-detail / desktop drawer).
- Export filtered set to CSV. Read-only (no create/edit/void here).

---

## 7. Online _(💳 BUSINESS/PRO — FREE/SOLO see upsell)_

| Route              | Screen            | Functionality                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/online/orders`   | Online orders     | KPIs (sales/new/to-ship/fulfilled); search + status + fulfilment (Delivery/Pickup) filters; order drawer (customer, address, fulfilment stepper, items, totals, payment, ledger); advance fulfilment (Confirm→Preparing→Ready→Delivery/Pickup), mark Failed/Returned/Cancel; serial-unit selection modal; record payment; print packing slip.                                                                                                                   |
| `/online/products` | Online products   | Publish state per row (Draft/Live/Issues); KPIs; All/Published/Draft tabs + search; publish/unpublish (readiness pre-check: active + price + image); row → product editor; Manage Store link.                                                                                                                                                                                                                                                                   |
| `/online/store`    | Storefront config | First-run CreateStore; subdomain slug w/ availability check; profile (tagline/logo/banner/contact); layout template + theme + light/dark w/ live preview; catalog binding (snapshot/live), stock badges; order settings (notes, min order); fulfilment (delivery+fee+cities, pickup); SEO (title/meta/OG/robots) + social links; save draft + publish; publish history + rollback. 💳 custom domain PRO-locked; payments COD-only (MoMo/OM/Card "coming soon"). |

---

## 8. Contacts

| Route                                 | Screen         | Functionality                                                                                                                                                                                                                                    |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/contacts`                           | Contacts       | Searchable/paginated list w/ balance, type, last activity, aged-debt bar; tabs (All/Customers/Suppliers/Debtors/Creditors) + sort; KPIs (receivable/payable/net/count); per-row Record Payment / Pay Supplier / View (ContactPaymentModal); New. |
| `/contacts/new`, `/contacts/:id/edit` | Contact form   | Type (Customer/Supplier/Both), name (req), phones, email, address, notes; opening balance (create only, w/ direction + as-of date); KYC (ID type/number/dates, ID docs + selfie upload) for customers.                                           |
| `/contacts/:id`                       | Contact detail | Profile hero + metrics + ID card; account-statement ledger (dual tabs for Both); Record/Pay; Start sale (`/sell?customer=`) or new PO (`?supplier=`); offset receivable vs payable; share statement (DocumentShareDialog); edit/delete.          |

---

## 9. Expenses — `/expenses`

- Ledger w/ period segments (Week/Month/Year); KPIs (total vs prev %, largest category, avg/day, pending), category donut, 6-month trend bars.
- Filter by category + search + paginate.
- Add/edit expense (ExpenseFormModal): category (+ inline create w/ color), description, amount, date, paid-to, status (Paid/Pending), payment method, recurring, notes, receipt image.
- Delete (from modal); mark PENDING → paid (MarkPaidDialog + method), inline "Mark paid".

---

## 10. Deposits — `/deposits`

- Customer deposit/pre-order sessions w/ status segments (All/Open/Closed); KPIs (open count, held, collected, settled).
- New deposit session (NewDepositModal): customer, optional tagged products, initial deposit + method.
- Session detail (open): Add payment, Collect (checkout tagged items → `/sell?customer=` w/ forced Deposit tender), Close session.
- Collect (CollectModal): resolve tagged items (simple/variant/serialized), include/exclude, qty/serials.
- Close (CloseModal): deposited/collected/leftover; settle leftover as Refund (method) or Transfer (🏷️ needs a sale).
- Transaction timeline; per-transaction receipts + whole-session report PDF (DocumentShareDialog).

---

## 11. Reports — `/reports`, `/reports/:reportId`

- Overview glance KPIs (revenue, expenses, operating, receivable) w/ period selector (Month/Quarter/Year, persisted in URL).
- Searchable, categorized report library; 🏷️ unbuilt reports disabled w/ "soon" tag.
- Renders selected report as letterheaded HTML (business profile pulled in); loading/error/coming-soon states.
- Export PDF, Print, CSV (when declared), desktop Fullscreen (F11/Esc).

---

## 12. Organization

| Route                              | Screen              | Functionality                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/team`                            | Team                | Members + pending invites merged/searchable; KPIs (members/active/roles/pending); invite by email/phone + role (sends invite or shareable link); share link (WhatsApp/Email/native/copy); filter by role; per-member Change role / Deactivate-Reactivate / Remove (confirm); per-invite Resend & share / Cancel. 🏷️ owner member + self protected. |
| `/roles` 🔒                        | Roles & permissions | Browse system + custom roles (color, member count); role detail + permission matrix; inline edit permissions (except immutable owner role); Create; edit custom; delete custom (confirm, system roles protected).                                                                                                                                  |
| `/roles/new`, `/roles/:id/edit` 🔒 | Role form           | Name (req), description, color swatch; copy permissions from another role (create only); assign permissions w/ Select all/Clear + live count; save.                                                                                                                                                                                                |

---

## 13. Settings & Profile

| Route       | Screen            | Functionality                                                                                                                                                                                                                                                                                                           |
| ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings` | Business settings | In-page side-nav: **Business** profile (name/type/slogan/contact/logo/currency — 🔒📶 owner-only + online-only), language (FR/EN, local), **Security** (org 2FA toggle — prototype), **Subscription**, **Billing**, **Tax**, **Receipts**, **Notifications** (delegated section components). `?section=` deep-linkable. |
| `/profile`  | User settings     | Personal side-nav: **Profile** + **Security** (prototypes), **Appearance** (theme/appearance — functional). Own-user; no gating.                                                                                                                                                                                        |
| `/more`     | More (mobile hub) | Mobile-only. Profile hero (initials, role, business); lists all nav destinations not in the bottom tab bar (owner-filtered); gear → `/settings`; **Sign out**.                                                                                                                                                          |

---

## Navigation structure (sidebar / bottom tabs)

**Desktop/tablet sidebar** (`lib/nav.tsx`, single "Workspace" section):
Home · Sell · **Products** (All, Categories, Brands, Attributes, Units) · Inventory ·
**Purchasing** (RFQs, Purchase Orders) · Sales · **Online** (Orders, Products, Store) ·
Contacts · Expenses · Deposits · Reports · **Organization** (Team, Roles 🔒) · Settings.

**Mobile bottom tabs (5):** Home · Products · **Sell** (center) · Reports · More
→ the More hub surfaces everything else.

**Gating in nav:** only `/roles` is owner-gated (`filterNav(isOwner)`). No per-item plan
gating in nav — plan tier only shows as a read-only PlanChip in the top bar; plan
enforcement for Online happens inside those routes (upsell screen).

---

# Route ↔ API Endpoint Coverage Matrix

Each route reaches the API through `dataClient.<domain>.<method>()` → cloud-http
(`cget/cpost/cpatch/cdelete`) → REST API. In the Electron build the same call routes via IPC
to local SQLite and mirrors writes to these same endpoints through the outbox sync engine.
**All paths are relative to `/api/v1`.** A styled PDF of this table lives at
`docs/route-api-coverage-matrix.pdf`.

## Authentication & Onboarding _(pre-login)_

| Route              | dataClient                                                           | API endpoints                                                                                                                  |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/signin`          | auth.login                                                           | `POST /auth/login`, `GET /auth/session`                                                                                        |
| `/signup`          | auth.register, verifyPhone, verifyEmail, resendOtp, getInvitePreview | `POST /auth/register`, `POST /auth/verify-phone`, `POST /auth/verify-email`, `POST /auth/resend-otp`, `GET /invites/:token`    |
| `/invite`          | auth.getInvitePreview, register, login, acceptInvite, rejectInvite   | `GET /invites/:token`, `POST /invites/:token/accept`, `POST /invites/:token/reject`, `POST /auth/register`, `POST /auth/login` |
| `/sso`             | auth.requestLogin, loginOtp, resendOtp                               | `POST /auth/request-login-otp`, `POST /auth/login-otp`, `POST /auth/resend-otp`                                                |
| `/forgot-password` | auth.requestPasswordReset, resetPassword                             | `POST /auth/request-password-reset`, `POST /auth/reset-password`                                                               |
| `/select-business` | auth.listBusinesses, selectBusiness                                  | `GET /businesses/mine`, `POST /auth/select-business`                                                                           |
| `/setup-business`  | auth.setupBusiness                                                   | `POST /businesses/setup`, `POST /auth/select-business`                                                                         |
| `/select-plan`     | auth.selectPlan, listPlans                                           | `GET /plans`, `POST /plans/select`, `POST /auth/select-business`                                                               |
| `/invitations`     | invitations.list, accept, reject                                     | `GET /businesses/invitations`, `POST /businesses/invitations/:id/accept`, `.../reject`                                         |
| _(shared)_         | auth.getSession, logout                                              | `POST /auth/refresh`, `GET /auth/session`, `POST /auth/logout`                                                                 |

## Home & Point of Sale

| Route   | dataClient                                                                                                                                                                                             | API endpoints                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`     | sync.trigger                                                                                                                                                                                           | _internal sync (IPC/pull); no direct REST_                                                                                                                                                                                                |
| `/sell` | products.list/listVariants/resolveScan/listInStockSerials, categories.listSelectable, charges.listActive, contacts.get/listAllCustomers, savings.getForCustomer, sales.create/receiptHtml/printReceipt | `GET /products`, `/products/:id/variants`, `/products/scan`, `/products/:id/serial-units`, `/products/categories/selectable`, `/charges`, `/contacts`, `/contacts/:id`, `/deposits/open/:customerId`, `/sales/:id/receipt`; `POST /sales` |

## Products (Catalog)

| Route                                 | dataClient                                                                                                                                                     | API endpoints                                                                                                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/products`                           | products.list/stats/remove, categories.listAll, brands.list                                                                                                    | `GET /products`, `/products/stats`, `/products/categories`, `/brands`; `DELETE /products/:id`                                                                                                                                                         |
| `/products/new`, `/products/:id/edit` | products.get/create/update/setImages/setVariants/setSerialUnits, categories.listSelectable, attributes.listCategoryLinks, brands.get, units.list, uploads.file | `POST /products`, `PATCH /products/:id`, `POST /products/:id/images`·`/variants`·`/serial-units`, `GET /products/categories/selectable`, `GET /products/categories/:id/attribute-groups`, `GET /brands/:id`, `GET /unit-of-measures`, `POST /uploads` |
| `/products/:id`                       | products.get/remove/listImages/listVariants/listMovements                                                                                                      | `GET /products/:id`·`/images`·`/variants`, `GET /inventory/:id/movements`, `DELETE /products/:id`                                                                                                                                                     |
| `/products/categories`                | categories.list/remove, products.list                                                                                                                          | `GET /products/categories`, `DELETE /products/categories/:id`, `GET /products`                                                                                                                                                                        |
| `/products/categories/new`, `/:id`    | categories.create/update/listParentOptions/listAll, attributes.listAllGroups/listCategoryLinks/setCategoryLinks                                                | `POST`·`PATCH /products/categories[/:id]`, `GET /products/categories/parent-options`, `GET /attribute-groups`, `POST`·`PATCH`·`DELETE /products/categories/:id/attribute-groups`                                                                      |
| `/products/brands`                    | brands.list/create/update/remove/addModel/updateModel/removeModel, categories.listAll                                                                          | `GET`·`POST /brands`, `PATCH`·`DELETE /brands/:id`, `POST /brands/:id/models`, `PATCH`·`DELETE /brands/:id/models/:modelId`                                                                                                                           |
| `/products/attributes`                | attributes.listGroups/createGroup/updateGroup/deleteGroup/addOption/updateOption/deleteOption                                                                  | `GET`·`POST /attribute-groups`, `PATCH`·`DELETE /attribute-groups/:id`, `POST`·`PATCH`·`DELETE /attribute-groups/:id/options/:optionId`                                                                                                               |
| `/products/units`                     | units.list/create/update/remove                                                                                                                                | `GET`·`POST /unit-of-measures`, `PATCH`·`DELETE /unit-of-measures/:id`                                                                                                                                                                                |

## Inventory

| Route                | dataClient                                                             | API endpoints                                                                     |
| -------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/inventory`         | inventory.list/stats/reorderSuggestions, categories.listAll            | `GET /inventory`, `/inventory/stats`, `/inventory/alerts`, `/products/categories` |
| `/inventory/restock` | purchaseOrders.list, products.list/get/listVariants, inventory.restock | `GET /purchase-orders`, `/products`; `POST /inventory/restock`                    |
| _(product detail)_   | inventory.adjust, setThreshold                                         | `POST /inventory/:id/adjust`, `PATCH /inventory/:id/threshold`                    |

## Purchasing (RFQ → PO → Receive)

| Route                                      | dataClient                                                       | API endpoints                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/purchasing/rfqs`                         | rfqs.list                                                        | `GET /rfqs`                                                                                                 |
| `/purchasing/rfqs/new`                     | rfqs.create                                                      | `POST /rfqs`                                                                                                |
| `/purchasing/rfqs/:id`                     | rfqs.get/buildDocument/recordQuote, documents.send               | `GET /rfqs/:id`, `POST /rfqs/:id/quotes`, `POST /rfqs/:id/send`, `GET /rfqs/:id/document`                   |
| `/purchasing/rfqs/:id/convert/:supplierId` | rfqs.get, products.listVariants, purchaseOrders.createFromRfq    | `GET /rfqs/:id`, `POST /purchase-orders/from-rfq/:rfqId`                                                    |
| `/purchasing/orders`                       | purchaseOrders.list                                              | `GET /purchase-orders`                                                                                      |
| `/purchasing/orders/new`                   | purchaseOrders.create, contacts.listAllSuppliers                 | `POST /purchase-orders`, `GET /contacts?isActive=true`                                                      |
| `/purchasing/orders/:id`                   | purchaseOrders.get/cancel/buildDocument, documents.send          | `GET /purchase-orders/:id`, `POST /purchase-orders/:id/cancel`·`/send`, `GET /purchase-orders/:id/document` |
| `/purchasing/orders/:id/receive`           | purchaseOrders.get, products.get/listVariants, inventory.restock | `GET /purchase-orders/:id`, `POST /inventory/restock`                                                       |

## Sales

| Route    | dataClient                 | API endpoints                                                      |
| -------- | -------------------------- | ------------------------------------------------------------------ |
| `/sales` | sales.summary/list/listAll | `GET /sales`, `/sales/summary`, `/sales/:id`, `/sales/:id/receipt` |

## Online Store _(💳 BUSINESS/PRO)_

| Route              | dataClient                                                                                         | API endpoints                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/online/orders`   | online.listOrders/getOrder/updateOrderStatus/updateOrderPayment, products.get/listInStockSerials   | `GET /online-store/orders`·`/:id`, `PATCH /online-store/orders/:id/status`·`/payment`                                                                                                  |
| `/online/products` | online.getStore/listProducts/setProductPublished                                                   | `GET /online-store`·`/online-store/products`, `PATCH /online-store/products/:id`                                                                                                       |
| `/online/store`    | online.getStore/createStore/updateStore/checkSlug/publishStore/listPublications/restorePublication | `GET`·`POST`·`PATCH /online-store`, `POST /online-store/publish`, `GET /online-store/publications`, `POST /online-store/publications/:version/restore`, `GET /online-store/slug-check` |

## Contacts & Debts

| Route                        | dataClient                                                | API endpoints                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/contacts`                  | contacts.summary/list                                     | `GET /contacts`, `/contacts/summary`                                                                                                                  |
| `/contacts/new`, `/:id/edit` | contacts.get/create/update, openingBalances.upsert        | `POST /contacts`, `PATCH /contacts/:id`, `POST /contacts/:id/opening-balance`                                                                         |
| `/contacts/:id`              | contacts.get/remove, debts.statement/offset/recordPayment | `GET /contacts/:id`·`/statement`, `POST /contacts/:id/offset`, `POST /debtors/:debtId/payments`·`/creditors/:debtId/payments`, `DELETE /contacts/:id` |

## Expenses

| Route       | dataClient                                                                                   | API endpoints                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/expenses` | expenses.list/summary/trend/create/update/setStatus/remove, expenseCategories.listAll/create | `GET /expenses`·`/summary`·`/trend`, `POST /expenses`, `PATCH /expenses/:id`, `DELETE /expenses/:id`, `GET`·`POST /expense-categories` |

## Deposits (Layaway / Savings)

| Route       | dataClient                                                                                          | API endpoints                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/deposits` | deposits.summary/list/get/create/addPayment/close/receiptHtml/reportHtml (+ products._, contacts._) | `GET /deposits`·`/:id`·`/:id/statement`·`/summary`, `POST /deposits`·`/:id/payments`·`/:id/close`, `GET /deposits/:id/report`·`/transactions/:id/receipt` |

## Reports

| Route                            | dataClient                                                                                        | API endpoints                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/reports`, `/reports/:reportId` | business.getProfile, sales.summary, expenses.summary, contacts.summary, documents.downloadHtmlPdf | `GET /businesses/mine`, `/sales/summary`, `/expenses/summary`, `/contacts/summary`, `POST /documents/pdf` |

## Organization (Team & Roles)

| Route                        | dataClient                                                                                                                  | API endpoints                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/team`                      | team.listMembers/updateMemberRole/removeMember/setMemberActive/listInvites/sendInvite/resendInvite/cancelInvite, roles.list | `GET /businesses/members`, `PATCH /businesses/members/:userId/role`·`/status`, `DELETE /businesses/members/:userId`, `GET`·`POST /invites`, `POST /invites/:id/resend`, `DELETE /invites/:id` |
| `/roles` 🔒                  | roles.list/permissions/get/remove/setPermissions                                                                            | `GET /roles`·`/roles/permissions`·`/roles/:id`, `PATCH /roles/:id/permissions`, `DELETE /roles/:id`                                                                                           |
| `/roles/new`, `/:id/edit` 🔒 | roles.get/permissions/create/update/setPermissions                                                                          | `POST /roles`, `PATCH /roles/:id`·`/roles/:id/permissions`                                                                                                                                    |

## Settings & Profile

| Route            | dataClient                   | API endpoints                                    |
| ---------------- | ---------------------------- | ------------------------------------------------ |
| `/settings` 🔒📶 | business.getProfile/update   | `GET /businesses/mine`, `POST /businesses/setup` |
| `/profile`       | _local only (theme store)_   | _no API_                                         |
| `/more`          | _derived from nav + session_ | _no API_                                         |

## Appendix — client endpoints not yet surfaced in a route

Defined in the data-client / API but not consumed by any current route component:

- **Sales analytics:** `GET /sales/summary/daily-series`, `/sales/cashier-roster`, `/sales/by-product`, `/sales/by-payment-method`, `/sales/refunds`, `/sales/gross-profit`
- **Inventory analytics:** `GET /inventory/movements`, `/inventory/turnover`, `/inventory/dead-stock`, `/inventory/supplier-price-trend`
- **Debts / ageing:** `GET /contacts/:id/debts`, `/debtors/ageing`, `/creditors/ageing`, `/contacts/:id/opening-balance`
- **Notifications · Plans · Audit:** `GET /notifications`, `/notifications/unread-count`, `/plans/my-subscription`, `/plans/quota-usage`, `/audit`; `POST /plans/upgrade`, `/plans/cancel`; `PATCH /notifications/:id/read`, `/notifications/read-all`
