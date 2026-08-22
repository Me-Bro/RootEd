---
name: mockup-ui-rules
description: Rules for producing UI mockups in this repo (docs/mobile-ui). Trigger on "make mockups", "design screens", "mobile UI variants", "add a variant", "storyboard a workflow", or any request to propose UI for a RootEd module before writing app code.
---

# Mockup UI rules

How UI proposals get made in this repo. Output lives in `docs/mobile-ui/` as static
HTML + one shared stylesheet — no framework, no build step, openable from the filesystem
or over `python3 -m http.server`.

## Rule 1 — start plain, earn every extra

**The first variant of any screen is the simplest thing that works.** A list, standard
controls, one obvious action, and the ordinary affordances people already recognise:
search, filter, sort, a counter, empty and loading states. Nothing to teach, nothing
assumed.

Everything cleverer — gestures, smart defaults, auto-suggestions, OCR, drag-and-drop,
keyboard tricks — is a **layer on top of that plain version**. It must be opt-in,
removable, and justified by a gain you can measure in taps or seconds. If the user never
discovers the clever path, they must still finish the job.

Reference: `03-attendance.html#v7` — a class list with Present / Absent buttons on every
row. It ships first; period-awareness (`#v5`) and default-present (`#v1`) ride on the same
list afterwards.

**Corollaries**
- Filter, sort and search are table stakes, not design variants. Never present one as an idea.
- If the plain version needs a guard (nothing defaulted ⇒ rows can be left blank), build the
  guard, don't remove the honesty.
- Sequencing beats cleverness: ship the smart default first and the user's first experience
  depends on a guess about their data; ship the plain list first and the smart path is always
  an accelerator, never a prerequisite.

## Rule 2 — every variant is a different interaction model

Five concepts per screen, and they must differ in *how the work is done*, not in colour or
spacing. A re-skin is not a variant. Each one states, in its header: what it optimises for,
and what it trades away. Mark the ones worth shipping and say why at the bottom of the page.

## Rule 3 — real data only

Pull names, IDs, percentages and dates from the seeded database
(`apps/api/src/scripts/seed-bulk-data.js`, 1000 students). Query before writing markup:

```bash
docker exec rooted-mongo-1 mongosh --quiet rooted --eval '…'
```

Never invent a student, a guardian, a teacher or a percentage. If a mockup shows Friday
21 Aug for Grade 5-A, it shows what that day actually holds: 19 present, Chetan Shetty
absent, Heena Malhotra late. Wrong data is the fastest way to lose a reviewer's trust.

## Rule 4 — measure the pain against the real code

Before designing, read the page being redesigned and count what it costs today: taps of
setup, native pickers, horizontal scroll, silent failure modes. Every claim in a mockup
("11 setup taps") must be traceable to a line in `apps/web/src/pages/**`. Bugs found while
auditing go in the plan's findings section, not silently fixed in the mockup.

## Rule 5 — one product, two widths

Desktop is not the mobile screen stretched: it spends its extra space on what a phone
cannot do (a 40-section board, three panes, keyboard entry). But it is the same component
tree writing the same records through the same API. Anything only one width can do (e.g.
marking on behalf of a teacher on leave) is labelled on the record.

## Two tracks: deep exploration vs. lightweight

Not every screen needs a 5-variant exploration. As of the module tracker
(`docs/mobile-ui/index.html`), there are two tracks:

**Track A — deep exploration.** 5 interaction-model variants + a workflow storyboard +
an approved spec (3 files). Reserve this for screens with real interaction complexity
worth comparing approaches on — Attendance earned it because five genuinely different
models (default-present, swipe deck, tiles, absent-only, period-aware) were each
plausible. Most screens don't need this.

**Track B — lightweight (the default going forward).** One file,
`NN-modulename-approved.html`, containing:
1. A short "what the desktop does today" table, read from the real route/component code.
2. **Exactly 2 mockups** — Simple (mirrors the desktop feature-for-feature, mobile-shaped)
   and Smart (adds only the accelerators the *actual data shape* justifies — filter/sort
   for a 40-row roster, nothing extra for a 3-item list). State in the page why each
   addition is or isn't warranted; "we didn't add search because there are only 3 items"
   is a real, worthwhile sentence to write.
3. Pick one as approved (usually Smart, unless the smart additions aren't justified) and
   write the full engineering appendix: API contracts (real payloads, from the real
   schema/route files — not invented), state & logic (pseudocode), file & component plan,
   errors/empty/accessibility, a Definition of Done, and a sign-off block.

Use Track B for anything CRUD-shaped or list-shaped without a strong argument for Track A.
When in doubt, start Track B — escalate to Track A only if, while building the Simple/Smart
pair, you find the screen genuinely needs several different interaction models compared
side by side.

The module tracker table on `index.html` is the source of truth for what's approved, what's
exploration-only, and what hasn't been started — regenerate its status the moment a new
screen's file lands, so it's never stale.

## Mechanics

- **Files** — `docs/mobile-ui/NN-screen.html` per screen, `NN-screen-flow.html` for
  storyboards, `mockup.css` shared, `nav.js` for keyboard nav, `PLAN.md` for the written
  plan, `index.html` as the inventory hub.
- **Frames** — `.phone` is 390 × 844, `.desk` is 1240 × 780 with browser chrome. Both zoom
  with the `#fit` toggle.
- **Anchors** — every variant carries `id="vN"`, every flow section `id="fN"`, so the hub can
  deep-link into a single frame. The linked frame highlights via `:target`.
- **Workflows** — one horizontal rail of steps, each step captioned with a timestamp,
  *what the user does* and *what the system does*. Include the offline case, the mistake
  case, and what happens downstream after submit. Annotate taps with `.gesture.on-el`
  placed *inside* the control it marks (never absolute coordinates — they drift).
- **Hub** — `index.html` is generated from the pages themselves (variant titles, ship
  badges, flow metadata) so counts can't go stale. Regenerate it after adding anything.
- **Verify before handing over** — crawl every link and anchor, and check no annotation
  escapes its frame:

```bash
python3 -m http.server 8080 --directory docs/mobile-ui   # then crawl with Playwright
```

## What not to do

- Don't add a sixth variant that is variant three with different colours.
- Don't show a spinner where a count belongs, or a table where a phone needs cards.
- Don't design a flow that starts with a dropdown if the timetable or the clock already
  knows the answer — but don't *require* that inference either (rule 1).
- Don't claim a metric you haven't counted.
