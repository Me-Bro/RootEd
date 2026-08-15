# E2E Test Plan — RootEd (Playwright)

## Tool
Playwright — already configured at `apps/web/playwright.config.js`. Extend it.

---

## Test Organization

```
apps/web/tests/
├── axe.spec.js                   ← existing (accessibility)
├── fixtures/
│   ├── auth.js                   ← login helpers, role fixtures
│   └── data.js                   ← seed data helpers
├── auth/
│   └── login.spec.js
├── admin/
│   ├── dashboard.spec.js
│   ├── tenants.spec.js
│   └── flags.spec.js
├── academic/
│   ├── years.spec.js
│   ├── students.spec.js
│   ├── attendance.spec.js
│   ├── grades.spec.js
│   ├── timetable.spec.js
│   └── report-cards.spec.js
├── staff/
│   ├── members.spec.js
│   ├── leaves.spec.js
│   └── salary.spec.js
├── fee/
│   ├── structures.spec.js
│   └── payments.spec.js
├── expense/
│   ├── entries.spec.js
│   └── budgets.spec.js
├── inventory/
│   ├── items.spec.js
│   └── depreciation.spec.js
└── tenant/
    └── setup-wizard.spec.js
```

---

## Priority Tiers

### P0 — Critical Paths (test first)

| Spec | Coverage |
|------|----------|
| `auth/login` | Login success, wrong password, lockout after 10 tries, MFA TOTP flow, logout, token refresh |
| `academic/students` | CRUD + bulk CSV import + status change |
| `academic/attendance` | Bulk mark attendance for a section |
| `fee/payments` | Collect payment → receipt PDF download |
| `staff/leaves` | Submit → approve chain → conflict detection |
| `expense/entries` | Create → attach file → approve → mark paid |

### P1 — Core Workflows

| Spec | Coverage |
|------|----------|
| `admin/tenants` | Create, suspend, restore, discount |
| `academic/report-cards` | Generate (async job) → poll status → done |
| `staff/salary` | Generate slip → PDF download |
| `inventory/items` | Create, issue, return, low-stock alert |
| `fee/structures` | Create structure → assign to section |
| `tenant/setup-wizard` | Full 4-step onboarding |

### P2 — Edge Cases + Permissions

- RBAC: `tenant_admin` vs `staff` vs `viewer` — blocked routes redirect
- Rate limiting: MFA endpoint (5/hour)
- Bulk CSV import with malformed file
- Async job failure states
- Export CSV downloads (fee collection, payroll, reimbursements)
- GDPR export/delete flows

---

## Auth Strategy

Use Playwright `storageState` to avoid re-login on every test.

```js
// tests/fixtures/auth.js
export async function loginAs(browser, role) {
  // login once, save cookie + token to storageState
  // reuse across tests in that role
}
```

**Roles to seed:** `super_admin`, `tenant_admin`, `staff`, `viewer`

---

## Key Patterns Per Module

### Approval Workflows (leaves, expenses, requisitions)
- Need 2 roles in same test: submitter + approver
- Use `browser.newContext()` for each role

### Async Jobs (report cards, stock valuation)
- Submit → poll status endpoint until `completed`
- Set `timeout: 30_000` for job polling loop

### File Uploads (CSV import, expense attachments, staff docs)
- Use `page.setInputFiles()` with fixture files in `tests/fixtures/files/`
- Fixture files needed: `students-valid.csv`, `students-malformed.csv`, `attachment.pdf`

### PDF Downloads (receipts, salary slips)
- Assert `download` event fires + filename matches expected pattern

---

## Test Data: Shared DB Snapshot

```
tests/
└── seed/
    ├── seed.js        ← runs once before all tests
    └── snapshot.js    ← mongodump after seed, mongorestore before each suite
```

### Seed Data Requirements

| Entity | Count | Purpose |
|--------|-------|---------|
| `super_admin` user | 1 | Admin tests |
| Tenant | 1 | All tenant-scoped tests |
| `tenant_admin` user | 1 | Approval flows |
| `staff` user | 1 | Submitter flows |
| `viewer` user | 1 | RBAC tests |
| Academic year + classes + sections | 1 each | Academic tests |
| Students | 10 | Attendance, grades |
| Staff members | 3 | Leave, salary tests |
| Fee structures | 2 | Fee payment tests |
| Inventory items | 5 | Issue/return tests |

---

## CI Integration

Add to `apps/web/package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test --project=chromium",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:ui": "playwright test --ui",
    "seed:test": "node tests/seed/seed.js"
  }
}
```

### Docker / GitHub Actions Flow

```yaml
steps:
  - name: Start services
    run: docker compose up -d

  - name: Wait for API
    run: npx wait-on http://localhost:3001/health

  - name: Seed test data
    run: pnpm seed:test

  - name: Run E2E tests
    run: pnpm --filter web test:e2e
```

---

## Module Coverage Checklist

### Auth (`/login`)
- [ ] Login with valid credentials
- [ ] Login with wrong password
- [ ] Account lockout after 10 failed attempts
- [ ] MFA TOTP prompt appears for super_admin
- [ ] MFA TOTP success
- [ ] MFA TOTP failure (wrong code)
- [ ] Logout clears session
- [ ] Token refresh on expiry

### Admin Dashboard (`/dashboard`)
- [ ] Tenant stats render (active/suspended/archived counts)
- [ ] Recent audit log visible

### Admin Tenants (`/tenants`)
- [ ] List tenants with pagination
- [ ] Create new tenant
- [ ] View tenant detail + members
- [ ] Suspend tenant
- [ ] Restore archived tenant
- [ ] Apply discount

### Admin Flags (`/flags`)
- [ ] List all feature flags
- [ ] Toggle flag on/off

### Academic Years (`/academic/years`)
- [ ] Create academic year
- [ ] Activate year (deactivates others)

### Students (`/academic/students`)
- [ ] Create student
- [ ] Edit student details
- [ ] Change student status
- [ ] Bulk import via CSV (valid file)
- [ ] Bulk import error handling (malformed CSV)
- [ ] Pagination and search

### Attendance (`/academic/attendance`)
- [ ] Mark bulk attendance for a section
- [ ] View attendance by date range
- [ ] Edit existing attendance record

### Grades (`/academic/grades`)
- [ ] Bulk enter grades for a section/subject
- [ ] View grades

### Timetable (`/academic/timetable`)
- [ ] Create timetable entry
- [ ] Conflict detection on overlap
- [ ] Delete timetable entry

### Report Cards (`/academic/report-cards`)
- [ ] Trigger report card generation
- [ ] Poll job status
- [ ] Job completes successfully

### Staff Members (`/staff`)
- [ ] Create staff member
- [ ] View staff (sensitive fields gated by role)
- [ ] Upload staff document
- [ ] Edit staff member

### Leave Requests (`/staff/leaves`)
- [ ] Submit leave request
- [ ] Approve leave (tenant_admin)
- [ ] Reject leave
- [ ] Conflict detected (teacher has timetable on leave dates)

### Salary (`/staff/salary`)
- [ ] Create salary structure
- [ ] Generate salary slip
- [ ] Download salary slip PDF

### Fee Structures (`/fee/structures`)
- [ ] Create fee structure with components
- [ ] Assign structure to section

### Fee Payments (`/fee`)
- [ ] Record payment for student
- [ ] Download receipt PDF
- [ ] View fee defaulters
- [ ] Export fee collection CSV

### Expenses (`/expense`)
- [ ] Create expense entry
- [ ] Upload attachment
- [ ] Submit for approval
- [ ] Approve expense (tenant_admin)
- [ ] Mark as paid
- [ ] Budget cap alert visible

### Budgets (`/expense/budgets`)
- [ ] Create budget for cost center
- [ ] View utilization

### Inventory Items (`/inventory`)
- [ ] Create consumable item
- [ ] Create fixed asset item
- [ ] Issue item to user
- [ ] Return issued item
- [ ] Low stock alert visible
- [ ] QR code present on item detail

### Depreciation (`/inventory/depreciation`)
- [ ] View depreciation schedule for fixed assets

### Setup Wizard (`/setup`)
- [ ] Step 1: school details
- [ ] Step 2: academic year
- [ ] Step 3: classes and sections
- [ ] Step 4: staff invites
- [ ] Complete wizard → redirect to dashboard

---

## Implementation Sequence

1. **Config + fixtures** — extend `playwright.config.js`, auth fixtures, DB seed script
2. **P0 specs** — auth, students, attendance, payments, leaves, expenses
3. **P1 specs** — remaining module workflows
4. **P2 specs** — RBAC boundaries, edge cases, exports

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/tests/fixtures/auth.js` | `loginAs(browser, role)` with storageState caching |
| `apps/web/tests/fixtures/data.js` | Entity creation helpers via API |
| `apps/web/tests/seed/seed.js` | One-time DB seed script |
| `apps/web/tests/seed/snapshot.js` | mongodump/mongorestore helpers |
| `apps/web/tests/fixtures/files/students-valid.csv` | Valid bulk import fixture |
| `apps/web/tests/fixtures/files/students-malformed.csv` | Invalid CSV for error testing |
| `apps/web/tests/fixtures/files/attachment.pdf` | Expense/staff doc upload fixture |
