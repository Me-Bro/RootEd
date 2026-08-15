# Product Requirements Document (PRD)
## RootEd — Multi-Tenant School Management Platform

| Field | Value |
|---|---|
| **Document Version** | 1.0 |
| **Date** | May 15, 2026 |
| **Status** | Draft for Review |
| **Owner** | Product Engineering |
| **Stack** | React (ES6) · Node.js · Express · MongoDB · Docker |

---

## 1. Executive Summary

RootEd is a cloud-based, multi-tenant SaaS platform that enables educational institutions to digitally manage their academic operations, staff, finances, and physical assets from a single unified interface. The platform is built on a tenant-isolated architecture, allowing a central Super Admin to onboard and govern multiple schools (tenants), while each school retains autonomy over its own users, data, and workflows through a dedicated Tenant Admin role.

The platform targets the gap between heavyweight enterprise systems (PowerSchool, Blackbaud) — which are expensive and rigid — and lightweight open-source tools (Fedena, Gibbon) — which lack modern UX, integrated finance modules, and proper multi-tenancy. RootEd positions itself as a modern, modular, mobile-responsive system priced for small to mid-sized K-12 schools, tutoring centers, and coaching institutes.

### 1.1 Vision

> *To become the operating system of every modern school by 2030 — unifying academics, people, and resources into one intuitive platform.*

### 1.2 Goals

The MVP and subsequent releases pursue four measurable objectives. First, deliver a production-ready multi-tenant platform with full data isolation between schools. Second, reduce the administrative burden on school staff by at least 40% on routine tasks such as attendance, fee collection, and expense reconciliation. Third, achieve a Net Promoter Score above 50 within the first 100 onboarded tenants. Fourth, maintain 99.5% uptime with sub-second p95 response times for all core workflows.

---

## 2. Problem Statement & Market Context

### 2.1 The Problem

Small and mid-sized schools today juggle a fragmented stack: Excel for fees, WhatsApp for parent communication, paper registers for attendance, separate payroll software for staff, and no inventory tracking at all. This fragmentation creates four concrete pains. Data silos mean the principal cannot see a unified view of academic and financial health. Manual reconciliation between systems leads to errors in fee collection and expense reporting. Onboarding new staff or students is slow because information lives in multiple places. And there is no audit trail when disputes arise around grades, payments, or asset usage.

### 2.2 Market Landscape

The global school management software market was valued at approximately USD 16.5 billion in 2024 and is projected to grow at a CAGR of 18-20% through 2030, driven by post-pandemic digital adoption and government digitization mandates in emerging markets. Existing solutions cluster into three tiers: enterprise (PowerSchool, Infinite Campus, Blackbaud) targeting large districts with six-figure annual contracts; mid-market SaaS (Classter, Schoolytics, Edsby) at USD 3-8 per student per year; and open-source / freemium (Fedena, Gibbon, OpenSIS) which are technically free but require significant self-hosting and customization effort.

RootEd targets the underserved gap: institutions of 200-3,000 students who need enterprise features (multi-campus, granular roles, integrated finance) at SMB pricing, with the polish of modern SaaS UX.

### 2.3 Differentiators

Three commitments set RootEd apart. The platform is **modular**, meaning a school can enable only the modules it needs (Academics, Staff, Expenses, Inventory) and pay accordingly rather than buying a monolithic suite. It is **truly multi-tenant**, with logical and physical isolation patterns chosen per-tier so a free-tier school cannot accidentally degrade a paid school's experience. And it is **API-first**, exposing every operation through a documented REST API so schools can integrate with their existing accounting, communication, or LMS tools.

---

## 3. Target Users & Personas

### 3.1 Persona 1 — Super Admin (Platform Operator)

The Super Admin is an internal RootEd employee responsible for onboarding new schools, provisioning their tenancy, monitoring platform-wide health, and handling escalations. Their key jobs-to-be-done include creating new tenants with a default admin, suspending or archiving tenants for non-payment, viewing aggregated usage analytics across all tenants, managing global feature flags, and reviewing audit logs across the system.

### 3.2 Persona 2 — Tenant Admin (School Principal / IT Coordinator)

The Tenant Admin is a customer-side power user — typically the principal, vice-principal, or a designated IT coordinator. They own everything inside their school's tenancy: configuring academic calendar and class structure, inviting and assigning roles to staff, defining fee structures, approving large expenses, and pulling reports for the school board. They are not technical but are comfortable with software like Google Workspace and basic Excel.

### 3.3 Persona 3 — Normal User (Staff, Teachers, Accountants)

Normal Users have scoped permissions assigned by the Tenant Admin. A class teacher marks attendance and enters grades for their assigned sections only. An accountant records fee collections and submits expense claims but cannot modify academic records. A librarian manages library inventory but cannot see staff salaries. The permission model must accommodate this granularity without exposing complexity to the end user.

### 3.4 Out of Scope for v1 — Students & Parents

Student and parent portals are explicitly deferred to v2. The MVP focuses on staff-facing operations, which is where the highest manual-effort wins exist. A read-only parent view (fee status, attendance summary) may be considered as a v1.5 stretch goal.

---

## 4. Architecture Overview

### 4.1 Tenancy Model

RootEd adopts a **hybrid multi-tenancy model**. All tenants share a single MongoDB cluster, but data is partitioned using a `tenantId` field on every collection, enforced at the application layer through a mandatory query middleware that automatically scopes every database operation to the authenticated user's tenant. This approach — sometimes called *shared database, separate schemas* via discriminator — is the industry standard for SaaS at this scale, balancing operational simplicity against isolation guarantees.

For enterprise tier customers (post-MVP), the platform will support a *dedicated database* mode where a tenant's data lives in its own MongoDB database within the cluster, addressed via a tenant-to-connection-string map. This provides stronger isolation for compliance-sensitive customers without requiring a separate deployment.

### 4.2 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     React SPA (Vite + ES6)                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ Super Admin │ │ Tenant App  │ │ Auth Shell  │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS / JWT
┌────────────────────────────▼────────────────────────────────┐
│                    Nginx Reverse Proxy                      │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│              Express.js API (Node.js 20 LTS)                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │  Auth /    │ │  Tenant    │ │  Domain    │ │  Audit / │  │
│  │  RBAC      │ │  Resolver  │ │  Modules   │ │  Logging │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
└──────┬──────────────────┬───────────────────┬──────────────┘
       │                  │                   │
┌──────▼─────┐    ┌───────▼───────┐    ┌──────▼────────┐
│  MongoDB   │    │     Redis     │    │   S3 / Minio  │
│ (Replica   │    │ (Sessions,    │    │  (File store) │
│   Set)     │    │  Cache, Jobs) │    │               │
└────────────┘    └───────────────┘    └───────────────┘
```

### 4.3 Why This Stack

The choices are deliberate. **React with ES6** gives a mature component ecosystem and the best hiring pool for frontend developers. **Express on Node 20 LTS** keeps the language consistent across the stack, easing context-switching and code sharing (validation schemas, type definitions). **MongoDB** suits the variable schema of educational data — every school has slightly different report card formats, fee components, and attendance rules — and its native horizontal scaling complements the multi-tenant model. **Redis** handles ephemeral state (session blocklists, rate limiting, background job queues via BullMQ). **Docker** ensures the seven-service stack (API, web, MongoDB, Redis, Nginx, Minio, worker) is reproducible across developer laptops, staging, and production.

---

## 5. Functional Requirements — Core Platform

### 5.1 Authentication & Identity

Every user authenticates via email and password, with passwords hashed using Argon2id (preferred over bcrypt for new systems). The session model uses short-lived JWT access tokens (15 minutes) paired with rotating refresh tokens stored in HTTP-only cookies, with a server-side blocklist in Redis for immediate revocation on logout or password change. Multi-factor authentication via TOTP is mandatory for Super Admins and optional for Tenant Admins in v1, mandatory for all admin roles in v1.1.

Password reset flows use time-boxed signed tokens delivered by email, with the reset link valid for 30 minutes and single-use. Account lockout triggers after 5 failed attempts within 15 minutes, with exponential backoff. Login activity (IP, user agent, timestamp, success/failure) is logged for every attempt.

### 5.2 Role-Based Access Control

The RBAC model is three-layered. **System roles** (Super Admin, Support Agent) operate outside any tenant. **Tenant roles** (Tenant Admin, Tenant Staff) operate within one tenant. **Module permissions** are fine-grained capabilities (e.g., `attendance:write`, `expense:approve`, `inventory:read`) assigned to custom roles created by the Tenant Admin.

Out of the box, every tenant is seeded with five default role templates: Tenant Admin (all permissions), Principal (read-all, approve), Teacher (attendance, grades for assigned classes), Accountant (fees, expenses, payroll), and Librarian (inventory). Tenant Admins can clone and modify any template, or build a role from scratch.

### 5.3 Tenant Lifecycle

The Super Admin can perform the full lifecycle: **create** a tenant (name, subdomain, plan, default admin email, locale, timezone, currency); **suspend** a tenant (read-only mode, banner shown to all users, no data deletion); **archive** a tenant (data retained for 90 days then purged, login disabled); and **restore** an archived tenant within the retention window. Subdomain routing (`{school-name}.eduflow.app`) is provisioned automatically on creation, with custom domain mapping available on the Pro plan and above.

### 5.4 Audit Log

Every state-changing operation across the platform writes an immutable audit log entry containing actor user ID, tenant ID, action verb (e.g., `expense.approved`), target entity, before/after diff, IP address, and timestamp. Logs are queryable by Tenant Admins for their tenant and by Super Admins globally, with filtering by actor, action, and date range. The 90-day retention default is configurable per plan tier.

---

## 6. Functional Requirements — Domain Modules

### 6.1 Academic Module (MVP Foundation)

The Academic module establishes the structural backbone every other module references. It manages the academic year and its terms, the class and section hierarchy (Grade 5 → Section A, B, C), subject catalog, and the master roster of enrolled students with their assignment to sections. Daily attendance is captured per class period or per day (configurable per school), with bulk-mark and exception-only entry modes. Grade entry supports both numeric scores and letter grades, with per-subject weightage rolling up to term and annual report cards. Timetable management allows Tenant Admins to define period structures and assign teacher-subject-section-period quadruples, with conflict detection.

### 6.2 Staff Management Module

Staff Management is more than a directory; it is the operational record for every person the school employs. The module captures personal details, contact information, government identification (with field-level encryption), qualifications, employment history within the school, current designation, reporting manager, and assigned classes or departments. Document storage allows uploading contracts, certificates, and identity proofs, stored in S3/Minio with signed URLs.

Attendance for staff is tracked daily — either manually marked, derived from biometric integration (post-MVP), or self-marked with geofencing. Leave management supports configurable leave types (casual, sick, earned, unpaid), with balance tracking, multi-level approval workflows (employee → manager → admin), and conflict detection against the class timetable so a teacher's leave automatically flags lessons needing substitution.

Payroll computation is included in the MVP but limited: salary structure templates with components (basic, HRA, deductions, tax), monthly salary slip generation as PDF, and payment status tracking. Full statutory compliance (provident fund, income tax filing) is deferred to v2 in favor of an export to common accounting systems like Tally and QuickBooks.

### 6.3 Expense Management Module

The Expense module digitizes the petty cash register and replaces ad-hoc reimbursement Excel sheets. Every expense entry captures category (utilities, repairs, events, transport, etc., with custom categories), amount, payment method, vendor, attached invoice or receipt image, and the cost center it should be booked against (academic department, administrative, capital expenditure).

A configurable approval workflow routes expenses based on amount thresholds: under ₹1,000 may be auto-approved if the role permits, ₹1,000-10,000 requires a single manager approval, and above ₹10,000 requires both manager and Tenant Admin approval. The workflow engine supports parallel and sequential approvers, with auto-escalation after 48 hours of inactivity.

Reimbursement claims by staff follow the same approval pipeline and, once approved, are queued for payment with batch export to bank-compatible CSV. Budget tracking allows the Tenant Admin to set monthly or annual caps per category and per cost center, with dashboard alerts at 80% and 100% utilization.

### 6.4 Inventory Management Module

Inventory tracks every consumable and asset owned by the school: classroom equipment, library books, lab instruments, sports gear, IT hardware, stationery stock. Each item has a SKU (auto-generated or user-defined), category, current quantity, reorder threshold, unit cost, location (room or store), and assigned custodian. The system distinguishes between **consumables** (depleted with use, reorder-driven) and **fixed assets** (depreciable, tagged individually with a unique asset ID).

Issue and return flows handle the common case of issuing equipment to a teacher for the term or a textbook to a student, with due date tracking and overdue alerts. Stock movements (purchase, issue, return, scrap, transfer) form an immutable ledger that supports period-end stock valuation and reconciliation. Low-stock notifications trigger when an item dips below its reorder threshold, with a one-click flow to raise a purchase requisition that drops directly into the Expense module's approval queue.

Asset depreciation supports straight-line and written-down-value methods, with annual depreciation entries auto-generated and exportable for accounting reconciliation. Barcode and QR code generation for asset tags is included; physical scanner integration is planned via the mobile app in v1.5.

### 6.5 Communication Module (Cross-Cutting)

A lightweight communication layer is embedded across modules rather than treated as a standalone module in v1. The system sends transactional emails for password resets, approval requests, and budget alerts. In-app notifications surface in a bell-icon feed with mark-as-read state. SMS and WhatsApp delivery via Twilio and Meta Business APIs respectively are pluggable, with the cost passing to the tenant on metered usage. A broadcast composer lets the Tenant Admin send targeted announcements to role groups (all teachers, all accountants).

---

## 7. Non-Functional Requirements

### 7.1 Performance

The product targets a p95 API response time below 400ms for read operations and below 800ms for write operations under a sustained load of 100 concurrent users per tenant. Page-level largest-contentful-paint on the React SPA stays under 2 seconds on a 4G mobile connection. Heavy reports (annual gradebook, full year audit log) generate asynchronously via background workers and are delivered via download link rather than blocking the request thread.

### 7.2 Scalability

The architecture must scale to 1,000 tenants and 500,000 total users without re-architecture. MongoDB sharding is enabled from day one on the `tenantId` shard key for the largest collections (audit logs, attendance, stock movements). The API runs stateless behind a load balancer with horizontal scaling on CPU and request-rate triggers. Background workers (BullMQ on Redis) handle report generation, PDF rendering, and email/SMS dispatch independently of the API tier.

### 7.3 Security

All traffic uses TLS 1.3. Application secrets are managed via environment variables sourced from a secrets manager in production (AWS Secrets Manager or HashiCorp Vault), never committed to source control. Input validation uses Zod schemas at the API boundary, with output sanitization preventing XSS in user-generated content. CSRF protection is applied to all state-changing routes that accept cookies. Rate limiting at the edge (Nginx) and application layer (express-rate-limit) protects against brute force and abuse.

Field-level encryption at rest is applied to government IDs, bank account numbers, and salary data using a per-tenant data encryption key wrapped by a master key. PII can be exported by the data subject (GDPR Article 20) and deleted on request (Article 17) through a self-serve flow in the Tenant Admin console, with hard-delete cascading correctly across all collections.

### 7.4 Reliability

Production targets 99.5% monthly uptime, equivalent to roughly 3.6 hours of allowed downtime per month. The MongoDB replica set runs with a primary and two secondaries with automatic failover. Daily encrypted backups are retained for 30 days with point-in-time recovery within the last 7 days. A documented runbook covers the common incident playbooks: tenant-specific data corruption, full-region outage, accidental deletion recovery.

### 7.5 Compliance

The MVP design accommodates GDPR for European tenants, India's DPDP Act 2023 for the primary launch market, and FERPA for any future US K-12 expansion. The architecture supports data residency selection at tenant creation (US, EU, India regions) so a tenant's data physically resides in its chosen jurisdiction — though only the India region is launched in v1.

### 7.6 Accessibility & Internationalization

The frontend conforms to WCAG 2.1 AA, with semantic HTML, keyboard navigation, ARIA labels, and a minimum contrast ratio of 4.5:1. The UI is internationalized via i18next, with English as the default and Hindi, Tamil, Spanish, and French as launch locales. Currency, date, and number formatting respect the tenant's locale setting independently of UI language.

---

## 8. Data Model — Key Entities

The following entity relationships form the core of the system. Every entity except `Tenant` and `User` carries a mandatory `tenantId` field for isolation.

```
Tenant (id, name, subdomain, plan, status, createdAt, settings)
  │
  ├─ User (id, tenantId?, email, passwordHash, systemRole?, status)
  │   └─ TenantMembership (userId, tenantId, roleIds[], status)
  │
  ├─ Role (id, tenantId, name, permissions[], isTemplate)
  │
  ├─ AcademicYear (id, tenantId, name, startDate, endDate, isActive)
  │   └─ Term (id, academicYearId, name, startDate, endDate)
  │
  ├─ Class (id, tenantId, name, gradeLevel)
  │   └─ Section (id, classId, name, classTeacherId)
  │
  ├─ Student (id, tenantId, admissionNo, name, sectionId, parentContacts)
  │
  ├─ StaffMember (id, tenantId, userId, employeeId, designation, department,
  │                 joiningDate, qualifications, documents[], salaryStructure)
  │
  ├─ AttendanceRecord (id, tenantId, subjectId?, date, entityType, entityId, status)
  │
  ├─ ExpenseEntry (id, tenantId, category, amount, vendor, date, status,
  │                 approvalChain[], attachments[], costCenter)
  │
  ├─ InventoryItem (id, tenantId, sku, name, category, type, quantity,
  │                  reorderLevel, unitCost, location, custodianId)
  │   └─ StockMovement (id, itemId, type, quantity, reason, movedBy, date)
  │
  └─ AuditLog (id, tenantId, actorId, action, target, before, after, ip, at)
```

---

## 9. User Experience Principles

The interface follows five guiding principles. **Zero training to first value**: a new Tenant Admin should be able to create a class, add a student, and mark attendance within ten minutes of login, with no documentation. **Progressive disclosure**: power features (workflow builders, custom reports) live behind a clear advanced toggle so basic users are never overwhelmed. **Mobile-equal**: every workflow a teacher needs (attendance, grade entry, leave request) is fully usable on a 360px-wide phone screen, not just a desktop-shrunk approximation. **Bulk-first**: any operation a user might do for 30 students should support a bulk path — CSV import, multi-select, keyboard shortcuts. **Consistent affordances**: the same action (delete, approve, export) looks and behaves the same across all modules.

A shared design system based on shadcn/ui primitives with a custom Tailwind theme ensures visual and behavioral consistency. Light and dark themes are supported from day one. The component library is documented in Storybook for cross-team reuse.

---

## 10. Pricing & Packaging (Reference)

| Plan | Students | Modules | Price (₹/student/year) | Notes |
|---|---|---|---|---|
| **Starter** | up to 200 | Academic only | 80 | Single admin, email support |
| **Growth** | up to 1,000 | Academic + Staff | 120 | + Custom roles, SLA support |
| **Pro** | up to 3,000 | All modules | 180 | + Custom domain, API access |
| **Enterprise** | unlimited | All + dedicated DB | Custom | + Data residency, SSO, audit |

A 14-day free trial of the Pro plan is offered on signup with no credit card required. Annual prepayment receives a 15% discount. Non-profit and government schools are eligible for a 30% standing discount on application.

---

## 11. Release Plan

### 11.1 MVP (v1.0) — Target: Q3 2026

The MVP ships with full Super Admin tooling for tenant lifecycle, complete authentication and RBAC, the Academic module with attendance and basic grading, Staff Management with directory and leave, Expense Management with single-level approval, and Inventory Management for consumables (asset tagging deferred). Reporting is limited to five canned reports per module; custom report builder is post-MVP.

### 11.2 v1.1 — Target: Q4 2026

Adds payroll PDF slips, multi-level approval workflows, asset depreciation, barcode generation, mandatory MFA for all admin roles, WhatsApp broadcast integration, and four additional locale translations.

### 11.3 v1.5 — Target: Q1 2027

Introduces the Parent Portal (read-only), the RootEd mobile app for teachers (React Native), biometric attendance device integration, and a custom report builder.

### 11.4 v2.0 — Target: Q2 2027

Adds the Student Portal with assignment submission, AI-assisted features (smart attendance anomaly detection, expense category prediction, fee defaulter risk scoring), and full LMS-light functionality including assignment workflows.

---

## 12. Success Metrics

Product success will be measured against four metric families. **Adoption metrics** track tenant signups, paid conversion rate from trial, monthly active users per tenant, and module activation rate. **Engagement metrics** monitor daily active sessions, average actions per session, and feature adoption funnel (e.g., percentage of tenants using approval workflows). **Quality metrics** include p95 latency, error rate, uptime, and support ticket volume per 100 active users. **Business metrics** cover MRR, churn rate, customer acquisition cost, and lifetime value.

The North Star metric is *Weekly Active Staff per Paid Tenant*, capturing both breadth (the school is genuinely using the product) and depth (staff beyond the admin are engaged).

---

## 13. Risks & Mitigations

The largest product risk is **scope creep on the academic module**, since every school has slightly different grading and timetable rules. Mitigation: ship a deliberately opinionated default in v1 and gather customization requests for v1.1 rather than building a configuration engine upfront. The largest technical risk is **noisy-neighbor tenants** consuming disproportionate database resources; mitigation is per-tenant request budgets at the API layer and slow-query monitoring with auto-throttling. The largest go-to-market risk is **incumbent inertia** — schools that already paid for an existing system are slow to switch; mitigation is a six-month parallel-run discount and a free migration service for tenants importing from common predecessors (Fedena, OpenSIS, Excel).

A regulatory risk worth tracking is the evolving data localization landscape, particularly the DPDP Act rules in India. The architecture's region-pinning capability is the structural hedge; staying close to the rule-making process is the operational one.

---

## 14. Open Questions

Several decisions remain open at the time of this draft. Should v1 ship with a built-in fee collection module integrated to a payment gateway, or rely on export to existing accounting systems and defer in-product fees to v1.1? Should the platform offer schools a white-label option (their logo, their domain, no RootEd branding) at the Pro tier or reserve it for Enterprise? Should background workers run as a separate container service from day one, or can they ride inside the API process until usage justifies splitting? Each of these will be resolved before development kickoff with input from design partner schools.

---

## 15. Appendix — Glossary

**Tenant**: An isolated unit of the platform owned by one customer school, with its own users, data, and configuration.
**Super Admin**: Internal RootEd employee with platform-wide privileges.
**Tenant Admin**: Customer-side primary administrator of one tenant.
**RBAC**: Role-Based Access Control, the permission model used throughout.
**JWT**: JSON Web Token, used for stateless authentication.
**SKU**: Stock Keeping Unit, the unique identifier for an inventory item.
**Cost Center**: An accounting category against which an expense is booked.
**Discriminator**: A MongoDB pattern where multiple logical schemas share a single collection, distinguished by a type field — used here for the audit log and stock movements.

---

*End of document.*
