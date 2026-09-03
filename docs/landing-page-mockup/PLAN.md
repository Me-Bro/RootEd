# Landing Page — Final Direction

**Status: ✅ Approved — 2026-08-26.** `desktop.html` and `mobile.html` are signed off. Next
step when ready to build: a real `LandingPage.jsx` route, real product screenshots in place
of the labelled placeholder, and the signup page the "Start free trial" CTA hands off to
(see "Explicitly out of scope for this batch" below — still true post-approval).

This supersedes the earlier 8-concept exploration (4 desktop, 4 mobile). Based on review:
desktop's **Product-led** concept content is the one to build on; mobile needed a real
redesign, not a refinement; and the "About" section changes from person-led to
company-led. The old concept files have been removed — `desktop.html` and `mobile.html`
below are the only two mockups now, each a single, decided design.

## What changed from the exploration

1. **Desktop keeps its content direction** — hero → module tour → why-RootEd → security →
   about → process → CTA → footer, in that order, product-first. No structural change.
2. **No individual founders, no external links.** Vibhanshu Rana and David Singh Rana's
   names, roles, avatars and quotes are removed, and so is the LinkedIn link. Trust now
   comes from the product's own substance (the security section) and Rural Root Cloud as a
   *company* (mission, values, process) — not from two named individuals. The footer keeps
   one functional contact (`ruralrootcloud@gmail.com`), since a landing page needs some way
   to be reached; nothing else links out.
3. **Mobile was rebuilt, not patched.** The 4 exploration concepts were all variations on
   "stack of small white cards in a phone frame" — functional, not "brand builder" quality.
   The final mobile design instead:
   - Uses a bold, larger type scale for the hero (32px, tighter tracking) instead of a
     scaled-down desktop headline.
   - Alternates full-bleed section backgrounds (white → dark → soft-violet-tint → white) for
     visual rhythm, instead of every section looking the same.
   - Presents the module tour as large, dark, editorial swipe cards (big index numbers, one
     module in full focus at a time) instead of five identical small stacked cards.
   - Presents the mission line as its own full-bleed statement moment (large centered
     pull-quote on a dark band), not a paragraph inside a generic card.
   - Presents the process as a connected vertical stepper (a real line joining the 4 steps),
     not four disconnected rows.
   - Keeps the sticky bottom CTA bar — that idea tested well in the exploration and mirrors
     the app's own `MobileBottomBar.jsx`, so it stays.
4. **Both now carry a small brand signature**: a decorative root-branch line motif (same
   visual language as concept 1 of the logo exploration in `docs/logo-mockup/`) sits low-
   opacity behind the hero and the mission-statement band, on both desktop and mobile. Purely
   decorative texture — never load-bearing content — but it's the first time this system has
   a repeating visual motif tying the logo work and the landing page together as one brand,
   independent of which logo icon eventually gets approved.

## Content still sourced the same way

Every fact is still pulled from `ruralrootcloud.com` and this repo's `README.md`/`CLAUDE.md`
— nothing new invented, nothing new fabricated. The only change is *which* facts are used:
company-level (mission, values, process) instead of person-level (bios, quotes).

## Round 3: the hero was principal-exclusive, and mobile still wasn't landing

**1. "Principal Dashboard — live preview" undersold the product.** A school's whole staff
logs in — principal, teacher, accountant, librarian, tenant admin (the real 5 role templates,
`CLAUDE.md`) — not just the principal. Leading the hero visual with "Principal Dashboard"
told every other role this product isn't for them. Fixed in `desktop.html`: the preview now
opens with a role-pill row (Principal · Teacher · Accountant · Librarian · Tenant Admin) and
the headline "A dashboard for every role — not just one," grounded in the real RBAC fact
already used elsewhere on the page (permission-scoped views, not just hidden nav items). The
principal's dashboard is still what's shown in detail — it's the one with an approved spec
to reference (`docs/mobile-ui/20-dashboard-approved.html`) — but it's now framed as *an
example*, not *the product*.

One thing intentionally **not** added: a parent/guardian role. The codebase stores guardian
contact info on the student record (used for attendance-call chips), but there is no
parent-facing login today — only the 5 staff-side roles above authenticate. Claiming a
parent portal would be a feature that doesn't exist, which breaks this whole plan's own
no-fabrication rule — so parents aren't listed as a role that "logs in."

**2. Mobile, rebuilt a second time — same content, fancier container, still not working.**
The round-2 mobile version had the right structural ideas (bold hero, full-bleed bands,
editorial cards) but carried the *same amount of content as desktop* — every module, every
security fact, every value, every process step — just in nicer wrappers. On a phone, that
reads as a busy spec sheet, not a confident brand moment. Desktop's job is to carry the full
detail; mobile's job is to look unmistakably good and earn the tap. This version cuts content
roughly in half and roughly doubles the visual confidence:

- **Why RootEd + Security merged into one section** — 4 of the strongest facts, one line
  each, instead of two separate multi-item sections back to back.
- **Modules go from 5 full-paragraph cards to a single bold icon grid** (label only, no
  description) — "5 modules" is enough for a first impression; desktop already carries the
  detail for anyone who scrolls that far there.
- **About cut to one bold statement + a 4-word value row** — no paragraph explanations,
  which is what made the company section feel like reading, not scanning.
- **Process kept as a stepper but tightened** to a label and one short line per step.
- **The brand motif is now a real compositional element in the hero**, not a faint corner
  texture — bigger, more present, actually part of the layout instead of decoration you have
  to look for.
- Net effect: fewer scroll-stops, much bigger type, more whitespace, one CTA that isn't
  competing with four other things on screen for attention.

## Round 4: audience is bigger than "school," and a real contrast bug in mobile

**1. "Principal Dashboard" is confirmed gone from every mockup file** — `grep -rn "Principal
Dashboard" docs/landing-page-mockup/` only matches this plan's own write-up of the fix, not
`desktop.html`/`mobile.html`/`index.html`. If it's still showing, that's the browser serving a
cached copy of the old page — hard-refresh (Ctrl/Cmd+Shift+R) the tab. I also went further
this round: the mockframe now explicitly says parents and students feel the results without
needing a login of their own (see below), closing the loop on where this feedback started.

**2. The audience is genuinely bigger than "school," and it's a real product fact, not a
request to invent one.** Checked `packages/shared/src/constants/index.js`: RootEd has 5 real
org types — `school`, `college`, `tuition_center`, `coaching_center`, `study_center` — each
with its own terminology (`Grade`→`Batch`, `Student`→`Learner`) and module set. This directly
validates "coaching manager" as a real customer segment, not a stretch — the copy was simply
never written to reflect it. Fixed: the hero headline and the multi-tenant fact on both
`desktop.html` and `mobile.html` now say "schools, colleges and coaching or tuition centers"
instead of just "school." Deliberately **not** broadened everywhere: `tuition_center`/
`coaching_center`/`study_center` tenants only get `academic`, `staff`, `fee` and `billing`
modules (no `expense`, no `inventory` — see `ORG_TYPE_CONFIG`), so the 5-module tour section
stays framed around "organisation" rather than claiming every org type gets all 5 modules,
which wouldn't be true.

Still **not** added: a parent or student login. Same finding as Round 3 — only 5 staff-side
roles authenticate (`tenant_admin`, `principal`, `teacher`, `accountant`, `librarian`);
guardian/parent info is a contact field on the student record, not an account. Rather than
stay silent on this, the copy now says so *positively* — "parents and students feel the
results, without a login of their own to manage" reframes the real constraint (no parent
portal exists yet) as a real, honest selling point (one less account for a parent to manage),
instead of either fabricating a feature or ignoring the question.

**3. Real contrast bug in mobile, root cause found and fixed at the token level, not
patched per-instance.** Two separate bugs were stacked:

- `body.dark` (used for the outer dark review-chrome — the `.meta` strip, the phone bezel)
  sets a light gray text color, `#e8eaee`, meant for that dark chrome. The phone's white
  `.screen` content area never reset it back to a dark ink color, so every heading and
  paragraph *without its own explicit color* — most of the page — inherited near-white text
  on a white/light background. That's the literal bug reported: readable-looking markup,
  invisible in the browser. Fixed with one rule, `.phone .screen { color: var(--ink); }` —
  `.on-dark`/`.on-tint` sections already set their own explicit color and correctly override
  this without any further change needed.
- Separately, and worth fixing while auditing color: `--brand-grad` (the violet→cyan button/
  CTA-band gradient) paired with white text everywhere it was used as a background. Computed
  contrast of white against the cyan end, `#47bfff`, is **~2:1** — nowhere near the 4.5:1 WCAG
  AA minimum for normal text. Every single background use of this gradient in the file (CTA
  buttons, the CTA bands, module icon chips, the stepper numbers, the gradient-text headline
  accent) had this same problem. Fixed at the token itself — the blue stop is now `#1971c2`
  (~5:1 against white) — rather than touching seven separate call sites; `--brand-2`, the
  standalone bright cyan used for borders/accents on *dark* backgrounds elsewhere, is
  untouched, since darkening it there would only make that usage worse, not better.

## How to review

```bash
# from the repo root
python3 -m http.server 8080 --directory docs
# then open http://localhost:8080/landing-page-mockup/
```

`index.html` links to `desktop.html` and `mobile.html` — both are now single, final mockups,
not multi-variant explorations.
