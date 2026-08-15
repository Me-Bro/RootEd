# Theme Migration Plan — RootEd vs THEME_GUIDE.md

Generated: 2026-05-16

---

## Current State Summary

| Layer | THEME_GUIDE expects | Project has | Status |
|---|---|---|---|
| Color space | HSL (`0 0% 0%`) | OKLch (`oklch(0.205 0 0)`) | ⚠️ Different, both valid |
| Tailwind config | `tailwind.config.ts` file | CSS `@theme` inline (Tailwind 4) | ✓ Works, different approach |
| shadcn style | `new-york` | `base-nova` | ❌ Mismatch |
| ThemeProvider | next-themes wrapped | Not wired up | ❌ MISSING |
| Dark mode | Class-based toggle + persistence | CSS supports it, no UI control | ❌ Incomplete |
| Component reuse | Consistent abstractions | DataTable/SelectField/PageHeader exist but unused | ⚠️ Partial |
| Hardcoded colors | All from theme tokens | `bg-green-500`, `bg-yellow-500` in pages | ❌ Breaks theming |
| Typography plugin | `@tailwindcss/typography` | Not installed | ⚠️ Missing |

---

## Phase 1 — Critical Fixes (Breaks theming entirely)

### 1.1 Wire up ThemeProvider
**File:** `apps/web/src/main.jsx`

Wrap app root with `ThemeProvider` from `next-themes`:
```jsx
import { ThemeProvider } from 'next-themes'

<ThemeProvider attribute="class" defaultTheme="light" enableSystem>
  <App />
</ThemeProvider>
```

**Why critical:** Without this, dark mode has no persistence, no system-preference detection, and no UI-controlled toggle. The `next-themes` package is already in `package.json` v0.4.6 but completely unused.

### 1.2 Add dark mode toggle to AppShell
**File:** `apps/web/src/components/layout/AppShell.jsx`

Add a theme toggle button in the header using `useTheme()` hook from next-themes. Use the `Sun`/`Moon` icons from `lucide-react` (already installed).

### 1.3 Fix components.json style mismatch
**File:** `apps/web/components.json`

Change `"style": "base-nova"` → `"style": "new-york"` to match THEME_GUIDE and ensure future `npx shadcn@latest add` commands pull the correct component variants.

---

## Phase 2 — Color Consistency (Hardcoded colors break dynamic theming)

### 2.1 Replace hardcoded Tailwind palette colors

All pages use raw Tailwind palette colors that bypass the CSS variable system. These won't respond to theme changes.

**Pages affected:**
- `BudgetsPage.jsx` — `bg-green-500`, `bg-yellow-500`, `bg-red-500` (utilization bars)
- `ExpensesPage.jsx` — status colors
- `LeaveRequestsPage.jsx` — status colors
- `StaffPage.jsx` — status indicators

**Replace with theme-aware alternatives:**

| Current (hardcoded) | Replace with |
|---|---|
| `bg-green-500` | `bg-emerald-500` or use Badge `success` variant |
| `bg-yellow-500` | `bg-amber-500` or use Badge `warning` variant |
| `bg-red-500` | `bg-destructive` |
| `text-green-800` | `text-emerald-800` |
| `bg-green-100` | `bg-emerald-100` |

**Better fix:** Use the existing custom `Badge` component which has `success`, `warning`, `danger` variants already built with semantic class names.

### 2.2 Color space decision

The project uses OKLch; THEME_GUIDE uses HSL. **Recommendation: keep OKLch** — it's Tailwind 4's native format, more perceptually uniform, and the CSS variable system already works. Document this deviation in CLAUDE.md.

No code change needed, only documentation.

---

## Phase 3 — Component Adoption (Consistency across pages)

These components were built but not adopted. Each page currently reimplements them inline.

### 3.1 Adopt `SelectField` in all pages

**File:** `apps/web/src/components/ui/SelectField.jsx` — exists, unused.

Every page has repeated inline select markup:
```jsx
<select className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring...">
```

Replace in:
- `AcademicYearsPage.jsx` (status filter, term filter)
- `StudentsPage.jsx` (grade filter, term filter)
- `TimetablePage.jsx` (class/day filters)
- `BudgetsPage.jsx` (category filter)
- `ExpensesPage.jsx` (category/status filters)
- `FeesPage.jsx` (filters)
- `InventoryPage.jsx` (category filter)
- `LeaveRequestsPage.jsx` (type/status filters)
- `StaffPage.jsx` (department filter)

### 3.2 Adopt `DataTable` in all pages

**File:** `apps/web/src/components/ui/DataTable.jsx` — exists, unused.

Benefits: consistent loading skeletons, empty states, hover states. Currently every page manually builds `<table>` → `<thead>` → `<tbody>` with identical structure.

Pages to migrate: all 10 pages listed above.

### 3.3 Adopt `PageHeader` in all pages

**File:** `apps/web/src/components/ui/PageHeader.jsx` — exists, unused.

Every page renders its own title+description+action button layout. Replace with `PageHeader` component for consistency.

---

## Phase 4 — Missing Plugins & Config Alignment

### 4.1 Add `@tailwindcss/typography`
**File:** `apps/web/package.json`

Install:
```bash
npm install @tailwindcss/typography
```

Add to CSS `@import` or Tailwind config. Required for `prose` classes (rich text content in report cards, descriptions).

### 4.2 Add `tailwindcss-animate` (or confirm `tw-animate-css` covers it)

THEME_GUIDE requires `tailwindcss-animate`. Project uses `tw-animate-css`. Verify that Radix animation classes (`data-[state=open]:animate-in`, etc.) work — if they do, no change needed. If not, swap package.

### 4.3 Verify Framer Motion usage

THEME_GUIDE lists Framer Motion v11.13.1. Check if it's installed:
- If yes: document where/how it should be used (page transitions, modal animations)
- If no: install or remove from THEME_GUIDE reference

---

## Phase 5 — Runtime Theming (Optional / Future)

THEME_GUIDE documents a full `applyTheme()` function with color picker support and localStorage persistence. This is not implemented at all.

### 5.1 Create ThemeConfigurator component

Build a settings panel (Sheet/Dialog) with:
- Primary color picker (8 preset colors from THEME_GUIDE)
- Border radius slider
- Font family selector (6 options from THEME_GUIDE)
- Font size picker
- Dark mode toggle

**Implementation reference:** `THEME_GUIDE.md` Section 5 — the `applyTheme()` function is ready to copy.

### 5.2 Persist theme to localStorage

Key: `theme-config`. Load on app init in `main.jsx` or `App.jsx` before first render.

---

## File-by-File Change Map

| File | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|---|
| `main.jsx` | ThemeProvider | - | - | - | Load persisted theme |
| `components/layout/AppShell.jsx` | Dark toggle | - | - | - | Open theme configurator |
| `components.json` | Fix style field | - | - | - | - |
| `BudgetsPage.jsx` | - | Fix colors | SelectField, DataTable, PageHeader | - | - |
| `ExpensesPage.jsx` | - | Fix colors | SelectField, DataTable, PageHeader | - | - |
| `AcademicYearsPage.jsx` | - | - | SelectField, DataTable, PageHeader | - | - |
| `StudentsPage.jsx` | - | - | SelectField, DataTable, PageHeader | - | - |
| `TimetablePage.jsx` | - | - | SelectField, DataTable, PageHeader | - | - |
| `FeeStructuresPage.jsx` | - | - | SelectField, DataTable, PageHeader | - | - |
| `FeesPage.jsx` | - | - | SelectField, DataTable, PageHeader | - | - |
| `InventoryPage.jsx` | - | - | SelectField, DataTable, PageHeader | - | - |
| `LeaveRequestsPage.jsx` | - | Fix colors | SelectField, DataTable, PageHeader | - | - |
| `StaffPage.jsx` | - | Fix colors | SelectField, DataTable, PageHeader | - | - |
| `package.json` | - | - | - | typography plugin | framer-motion verify |
| `index.css` | - | - | - | Add typography | - |
| NEW: `ThemeConfigurator.jsx` | - | - | - | - | Phase 5 |

---

## Priority Order

1. **Phase 1** — ThemeProvider + components.json fix. Small change, high impact.
2. **Phase 2** — Hardcoded colors. Medium change, required for dark mode to look correct.
3. **Phase 3** — Component adoption. Large change (10 pages), but mechanical/repetitive.
4. **Phase 4** — Plugins. Small, low-risk.
5. **Phase 5** — Runtime theming. Optional feature, implement last.

---

## What NOT to Change

- **Color space (OKLch):** Keep it. Tailwind 4 native. Better than HSL. Document the deviation.
- **tailwind.config.ts:** Don't create one. Tailwind 4 uses CSS `@theme` inline — no config file needed.
- **Existing shadcn components:** They work. Don't re-install or regenerate.
- **Custom Badge variants:** `success`, `warning`, `danger` are project-specific additions, keep them.
- **components.json `rsc: true`:** This is a Next.js flag, may be harmless in Vite but leave as-is unless it causes issues.
