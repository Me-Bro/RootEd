# RootEd

_Where your school's roots grow digital._

RootEd is a multi-tenant school management platform that digitises academics, staff, expenses, and inventory in one system.

```
RootEd — Multi-tenant school management platform.
Academics · Staff · Expenses · Inventory
Built with React, Express, Node.js, and MongoDB. Containerised with Docker. Three-tier RBAC: Super Admin → Tenant Admin → Scoped Users.
```

## Getting Started

See [CLAUDE.md](CLAUDE.md) for full dev setup, commands, and architecture notes.

```bash
pnpm install
pnpm dev:api    # Express API on :3001
pnpm dev:web    # Vite frontend on :5173
```

## Tech Stack

**Backend:** Express 4, Mongoose 8, BullMQ 5, Redis, Argon2id, JWT, Zod
**Frontend:** React 19, Vite, TailwindCSS 4, React Query 5
**Infra:** Docker, Nginx, MongoDB (replica set), Redis, Minio (S3-compatible)

## License

Not yet licensed.
