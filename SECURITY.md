# Security Policy

RootEd is a multi-tenant school management system handling authentication, PII (staff government ID, bank account, salary — field-encrypted at rest), and financial data (fees, expenses). Take security reports seriously.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, use [GitHub's private vulnerability reporting](../../security/advisories/new) for this repository (Security tab → "Report a vulnerability"). This opens a private advisory visible only to maintainers until a fix is ready.

Include:
- A description of the vulnerability and its impact (e.g. tenant isolation bypass, auth bypass, privilege escalation, PII exposure).
- Steps to reproduce, or a PoC if possible.
- Affected version/commit.

## Scope

Particularly interested in reports involving:
- Tenant isolation bypass (queries/writes missing `tenantId` scoping — see `apps/api/src/models/plugins/tenantScope.js`)
- Auth/JWT/session handling (token forgery, blocklist bypass, refresh token misuse)
- RBAC/permission bypass (System → Tenant → Module permission layers)
- Field encryption weaknesses (`apps/api/src/utils/fieldEncryption.js`)
- CSRF, XSS, injection in API routes or the React frontend

## Response

Maintainers aim to acknowledge reports within 5 business days and will coordinate disclosure timing with the reporter once a fix is available.
