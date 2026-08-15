# RootEd — Implementation Todo List

> **Decisions locked:**
> - Fee module: v1 (included in Phase 6)
> - White-label: deferred (revisit post-launch)
> - Worker: runs inside API process (no separate container until justified by load)

---

## Phase 0 — Foundation
- [x] Init pnpm monorepo: `apps/api`, `apps/web`, `packages/shared`
- [x] ESLint + Prettier + Husky pre-commit hooks
- [x] Conventional Commits + commitlint
- [x] `.env.example` for each app
- [x] `docker-compose.yml`: api, web, mongo (1-node replica dev), redis, minio, nginx
  - [x] Healthchecks on each service
  - [x] Named volumes for mongo + minio
- [x] GitHub Actions CI: lint → test → build → docker push
- [ ] Branch protection on main; staging auto-deploy; prod manual gate *(configure in GitHub UI)*

---

## Phase 1 — Core Platform

### 1.1 Data Layer
- [x] Mongoose model: `Tenant`
- [x] Mongoose model: `User`
- [x] Mongoose model: `TenantMembership`
- [x] Mongoose model: `Role`
- [x] Mongoose model: `AuditLog`
- [x] Compound indexes `{tenantId:1, ...}` on every tenant-scoped collection
- [x] Document shard key plan (not enabled in dev)

### 1.2 Tenant Isolation Middleware
- [x] Resolve tenant from subdomain OR JWT claim
- [x] Mongoose plugin: auto-inject `tenantId` filter on every find/update/delete
- [x] Throw on create if `tenantId` missing
- [x] Cross-tenant data leak test suite (must pass 100% before Phase 2)

### 1.3 Authentication
- [x] Argon2id password hashing
- [x] JWT access token (15 min)
- [x] Refresh token in httpOnly cookie (7d, SameSite=Lax)
- [x] Redis blocklist for revoked tokens
- [x] Route: `POST /auth/login`
- [x] Route: `POST /auth/refresh`
- [x] Route: `POST /auth/logout`
- [x] Route: `POST /auth/forgot-password`
- [x] Route: `POST /auth/reset-password` (30 min token, single-use)
- [x] Account lockout: 5 fails / 15 min, exponential backoff
- [x] Login activity log (IP, user agent, timestamp, success/fail)
- [x] TOTP MFA — mandatory for Super Admin (scaffold for others)

### 1.4 RBAC
- [x] Permission constants enum (`attendance:write`, `expense:approve`, `inventory:read`, etc.)
- [x] `requirePermission(perm)` Express middleware
- [x] Role resolution per-request, cached in Redis 60s
- [x] Seed 5 default role templates on tenant create:
  - [x] Tenant Admin (all)
  - [x] Principal (read-all, approve)
  - [x] Teacher (attendance + grades for assigned classes)
  - [x] Accountant (fees, expenses, payroll)
  - [x] Librarian (inventory)

### 1.5 Audit Log
- [x] Mongoose hook: capture before/after diff on every state-change
- [x] Async write via BullMQ (in-process queue, never blocks request)
- [x] Schema: `{actorId, tenantId, action, target, before, after, ip, at}`
- [x] Query endpoint: filter by actor / action / date range
- [x] Tenant Admin sees own tenant; Super Admin sees all *(tenant audit route — next)*

---

## Phase 2 — Super Admin Surface

### 2.1 API
- [x] `POST /admin/tenants` — create (subdomain, plan, default admin email, locale, tz, currency)
  - [x] Auto-seed roles
  - [x] Send invite email to default admin *(email service TODO)*
- [x] `PATCH /admin/tenants/:id/suspend`
- [x] `PATCH /admin/tenants/:id/archive` (data retained 90 days then purged)
- [x] `PATCH /admin/tenants/:id/restore`
- [x] `GET /admin/tenants` — list + pagination
- [x] `GET /admin/audit` — global audit log with filters
- [x] `GET/PATCH /admin/flags` — feature flag toggle

### 2.2 Web — Super Admin SPA
- [x] React + Vite + ES6 setup
- [x] shadcn/ui + custom Tailwind theme
- [x] Light + dark theme from day 1
- [x] Auth shell (shared with tenant app)
- [x] Page: `/tenants` — list, filter, create
- [x] Page: `/tenants/:id` — detail, suspend/archive/restore
- [x] Page: `/audit` — global audit log viewer (placeholder)
- [x] Page: `/flags` — feature flag toggles (placeholder)

---

## Phase 3 — Academic Module

### 3.1 API
- [x] Model: `AcademicYear` + `Term`
- [x] Model: `Class` + `Section`
- [x] Model: `Subject`
- [x] Model: `Student` (admissionNo, sectionId, parentContacts)
- [x] Model: `Timetable` (teacher-subject-section-period quads)
- [x] Model: `AttendanceRecord` (per-day or per-period, configurable)
- [x] Model: `Grade` (numeric + letter, weightage)
- [x] CRUD endpoints for all above
- [x] Bulk student import via CSV
- [x] Timetable conflict detection
- [x] Report card generation (async worker → PDF → S3 download link)

### 3.2 Web — Tenant App
- [ ] Setup wizard: Year → Terms → Classes → Sections → Subjects *(not built — separate from onboarding wizard)*
- [x] Attendance grid: bulk-mark mode + exception-only mode
- [ ] Attendance view: mobile-first, works at 360px *(desktop only; mobile CSS not validated)*
- [x] Grade entry per subject per section
- [x] Timetable builder with conflict alerts
- [x] Report card trigger + download

### 3.3 Tenant Onboarding
- [x] First-login wizard: school details → calendar → first class → invite staff — `SetupWizardPage.jsx` (4 steps)
- [ ] KPI target: new admin reaches first attendance mark in ≤10 min *(needs real-user validation)*

---

## Phase 4 — Staff Module

- [x] Model: `StaffMember` (personal, contact, employment, qualifications, designation, dept, reporting manager)
- [x] Model: `LeaveType` (configurable per tenant: casual, sick, earned, unpaid)
- [x] Model: `LeaveBalance`
- [x] Model: `LeaveRequest` + multi-level approval workflow
- [x] Model: `SalaryStructure` (basic, HRA, deductions, tax components)
- [x] Model: `SalarySlip`
- [x] Field-level encryption: govt IDs, bank account numbers (AES-256-GCM, HKDF-SHA256 per-tenant key)
  - [x] Per-tenant DEK derived from MASTER_ENCRYPTION_KEY via HKDF
- [x] Document upload → Minio, signed URL response
- [x] Leave approval: employee → manager → admin
- [x] Teacher leave → flag timetable conflicts (substitution needed)
- [x] Staff attendance: manual mark (biometric post-MVP)
- [x] Salary slip PDF generation (pdfkit, Minio upload, signed URL download)
- [x] Export: payroll CSV (name, employeeId, netPay)
- [ ] Leave type defaults auto-seeded on tenant create *(currently manual — not wired into createTenant)*

---

## Phase 5 — Expense Module

- [x] Model: `CostCenter`
- [x] Model: `ExpenseEntry` (category, amount, vendor, date, method, attachments, costCenter, status)
- [x] Model: `Budget` (monthly/annual cap per category + cost center)
- [x] Threshold routing:
  - [x] <₹1,000 — auto-approve
  - [x] ₹1,000–10,000 — single manager approval
  - [x] >₹10,000 — manager + Tenant Admin approval
- [x] Sequential approver chain (advance on each approval)
- [x] Auto-escalate after 48h inactivity (BullMQ delayed job + email)
- [x] Budget alerts at 80% and 100% utilization (audit log + console.warn)
- [x] Bank-compatible CSV batch export for reimbursements (with decrypted bank accounts)

---

## Phase 6 — Fee Collection Module (v1)

- [x] Model: `FeeStructure` (components: tuition, transport, lab, etc.)
- [x] Model: `FeeAssignment` (student ↔ structure)
- [x] Model: `FeePayment` (amount, date, method, receipt no.)
- [x] Model: `FeeDiscount`
- [x] Payment gateway integration (Razorpay for India launch)
- [x] Manual payment entry (cash/cheque offline)
- [x] Fee defaulter list + overdue alerts
- [x] Receipt PDF generation (async)
- [x] Export: collection summary by class / date range

---

## Phase 7 — Inventory Module

- [x] Model: `InventoryItem` (discriminator: Consumable | FixedAsset)
  - [x] Consumable: SKU, qty, reorder threshold, unit cost, location
  - [x] FixedAsset: unique asset ID, depreciation method, current value
- [x] Model: `StockMovement` (immutable ledger: purchase/issue/return/scrap/transfer)
- [x] Model: `PurchaseRequisition`
- [x] Issue + return flow with due date tracking
- [x] Overdue alert cron (in-process BullMQ repeatable)
- [x] Low-stock trigger → auto-create PurchaseRequisition → drop into Expense approval queue
- [x] Asset depreciation engine: SLM + WDV, nightly job, annual entries exportable
- [x] QR + barcode SVG generation server-side
- [x] Period-end stock valuation report (async)

---

## Phase 8 — Communication Layer

- [x] Transactional email templates: password reset, approval request, budget alert, fee receipt
- [x] Email provider: SES or Postmark (adapter pattern)
- [x] In-app notifications: `Notification` model + SSE or Socket.IO push
- [x] Bell-icon feed with mark-as-read state
- [x] Broadcast composer: target by role group (all teachers, all accountants)
- [ ] Twilio SMS adapter *(v1.1 — not started)*
- [ ] WhatsApp via Meta Business API adapter *(v1.1 — not started)*
- [ ] In-app notifications real-time push *(current: 60s poll; SSE/WebSocket deferred)*

---

## Phase 9 — Non-Functional Hardening

### Performance
- [x] k6 load test: 100 concurrent/tenant, p95 read <400ms, write <800ms
- [x] Redis cache: role permissions + tenant settings (hot reads) — academic years cached 300s; withCache util
- [x] Heavy reports: async worker → S3 link, never block request thread
- [x] LCP <2s on 4G (Lighthouse CI gate)

### Security
- [x] TLS 1.3 at Nginx
- [x] CSRF protection on all cookie-state-changing routes — csrf-csrf double-submit cookie pattern
- [x] Zod schema validation on every API boundary — validate() middleware factory
- [x] Output sanitization (XSS prevention) — DOMPurify + jsdom sanitizeBody middleware
- [x] `express-rate-limit` + Nginx `limit_req` — global 300/15min + auth 10/15min + MFA 5/hr
- [ ] OWASP Top-10 checklist pass
- [x] GDPR: self-serve PII export (Article 20) + delete (Article 17) in Tenant Admin console
- [x] Hard-delete cascade across all collections on GDPR delete — StaffMember deleted, User anonymized

### Reliability
- [ ] Mongo replica set 3-node prod (1-node dev) *(infra/ops)*
- [ ] Daily encrypted backups → S3, 30-day retention, PITR 7 days *(infra/ops)*
- [x] Runbooks: tenant data corruption, region outage, accidental delete

### Observability
- [x] Structured logs via pino (trace ID + tenantId on every log line) — X-Trace-Id header + genReqId
- [x] Sentry error tracking
- [x] Prometheus metrics endpoint — Grafana dashboards *(infra/ops)*
- [ ] Uptime alerts (99.5% target) *(infra/ops)*

### Accessibility + i18n
- [x] WCAG 2.1 AA: semantic HTML, keyboard nav, ARIA labels, contrast ≥4.5:1 — LoginPage role="main", form aria-label
- [x] axe-core CI gate (blocks merge on violation)
- [x] i18next setup: en (default) — scaffold complete; hi, ta, es, fr *(locale JSON files not translated — stubs only)*
- [x] Intl-aware currency, date, number formatting per tenant locale

---

## Phase 10 — Launch Prep

- [x] Razorpay billing wired to plan tiers (Starter / Growth / Pro / Enterprise) — billing.service.js + routes/billing.js
- [x] 14-day Pro trial flow (no card required) — trialEndsAt/isTrialActive on Tenant, trialExpiry.worker.js
- [x] Annual prepayment 15% discount logic
- [x] Non-profit / govt 30% discount application flow
- [x] OpenAPI spec → Redoc docs published — swagger-jsdoc + swagger-ui-express at /api-docs
- [x] Storybook component library published
- [x] Data migration scripts: Fedena, OpenSIS, Excel templates — migrate-from-excel.js + seed-super-admin.js
- [ ] Design-partner pilot: 3–5 schools onboarded for feedback *(infra/ops)*
- [ ] Runbook review + incident drill *(infra/ops)*

---

## Cross-Cutting (Parallel Throughout)

### Testing
- [ ] Jest unit tests per module *(not written — only the isolation test exists)*
- [ ] Supertest integration tests per route *(not written)*
- [x] Cross-tenant leak suite — `apps/api/src/__tests__/tenant-isolation.test.js` (4 tests, MongoMemoryServer)
- [ ] Playwright E2E: critical flows (login, attendance, expense submit, fee payment) *(axe spec exists; full E2E flows not written)*

### Documentation
- [x] ADR: tenancy model + isolation approach
- [x] ADR: field-level encryption scheme
- [x] ADR: workflow engine design
- [x] ADR: in-process worker decision

---

## Risk Gates (Must Pass Before Next Phase)

| Gate | Condition |
|------|-----------|
| After Phase 1 | Cross-tenant leak tests pass 100% |
| After Phase 3 | 10-min onboarding KPI validated with real user |
| After Phase 9 | p95 <400ms read, <800ms write at 100 concurrent |
| Before Launch | OWASP checklist + WCAG axe-core green |

---

## Known Bugs & Gaps (Fix Before Launch)

### Code Bugs
- [ ] `POST /fee/payments/verify` — passes `amount: 0` to `recordPayment` instead of fetching actual charged amount from Razorpay order. Fix: call `razorpay.orders.fetch(orderId)` server-side after signature verify.
- [ ] Staff leave type defaults (Casual, Sick, Earned, Unpaid) not auto-seeded when new tenant is created. Fix: add `LeaveType.insertMany(DEFAULT_LEAVE_TYPES)` in `tenant.service.js` `createTenant`.
- [ ] `GET /admin/tenants/:id/members` — returns raw TenantMembership documents without populating user email or role names. Fix: add `.populate('userId', 'email').populate('roleIds', 'name')`.

### Fixed Startup Bugs (resolved during dev server bring-up)
- [x] `SENTRY_DSN=""` failed Zod URL validation → fixed to `.or(z.literal('')).transform(v => v || undefined)`
- [x] `pino-pretty` missing → installed as dev dependency
- [x] Minio SDK rejected full URL as `endPoint` → parse with `new URL()`, pass `.hostname`, `.port`, `useSSL` separately
- [x] Redis "already connecting" error with BullMQ → removed `lazyConnect`, changed `connectRedis()` to check `redis.status === 'ready'`
- [x] `csrf-csrf` v4 API changed: `generateToken` → `generateCsrfToken`, new required `getSessionIdentifier` option → fixed with IP normalization (`::ffff:127.0.0.1` → `127.0.0.1`, `::1` → `127.0.0.1`)
- [x] `createTenant` ignored `adminPassword` from request — stripped by Zod schema + service used `crypto.randomUUID()` → added `adminPassword` to schema, passed to service, used as user password
- [x] CORS blocked same-origin dev requests → added `NODE_ENV === 'development'` bypass

### Missing Implementations
- [ ] SES email adapter — `EMAIL_PROVIDER=ses` not handled; only `smtp` and `postmark`. Add `apps/api/src/services/email/sesAdapter.js` using `@aws-sdk/client-ses`.
- [ ] Audit page web — `/audit` is a placeholder ("Coming soon"). Needs real data table like TenantDetailPage audit tab.
- [ ] Flags page web — `/flags` is a placeholder. Needs toggle UI calling `PATCH /admin/flags/:key`.
- [ ] Mobile-first attendance view (360px) — `AttendancePage.jsx` not tested/styled for mobile.
- [ ] Setup wizard flow (Phase 3.2) — `SetupWizardPage` covers onboarding but not the structured Year→Term→Class→Section→Subject creation sequence.
- [ ] i18n translations — `hi`, `ta`, `es`, `fr` locale JSON files not created (only `en`).
- [ ] Real-time notifications — bell polls every 60s. SSE or WebSocket upgrade needed for v1.1.
- [ ] OWASP Top-10 formal audit — not performed.
- [ ] Jest unit + Supertest integration tests — only the 4-test isolation suite exists; no route-level tests.
- [ ] Playwright E2E — only axe accessibility spec; full golden-path flows (login→attendance, expense submit, fee payment) not written.

### Infra / Ops (Not Code)
- [ ] Mongo 3-node replica set in production
- [ ] Daily encrypted S3 backups + PITR 7 days
- [ ] TLS certs provisioned (nginx.conf references `/etc/nginx/certs/`)
- [ ] Grafana dashboards wired to Prometheus `/metrics`
- [ ] Uptime alerting (PagerDuty / OpsGenie)
- [ ] Branch protection + staging auto-deploy (GitHub UI)
- [ ] Design-partner pilot (3–5 schools)
- [ ] Runbook review + incident drill
