# Academic Module — Mobile UI Plan

> **Scope:** the 10 Academic screens in `apps/web/src/pages/academic/`, redesigned for a
> phone (390 × 844). Five UI concepts per screen, in `docs/mobile-ui/*.html`.
> **Status:** design proposals for review — no application code changed yet.
> **Data:** every mockup uses the real seeded dataset (1000 students, 74 staff,
> Grade 1–10 × sections A–D, 2026-27 active year). Names, admission numbers and
> percentages are copied from the DB so the screens read like production.
> **Process update:** this plan covers the original 10-screen, 5-variant exploration
> (Track A). Every screen since — across Academic, Staff, Expense, Fee and Inventory,
> 18 in total — now follows the lighter Track B process: 2 mockups (simple + smart) then
> one approved spec, no 5-variant phase. See [`index.html`](index.html) for the module
> tracker across all 18, and `agent-home/mockup-ui-rules.md` for the process itself.

---

## 1. Who actually opens this on a phone

| Persona | Share of academic traffic | Where they are | What they need in < 20 s |
|---|---|---|---|
| **Class teacher** (40 of them) | highest | standing in front of 25 kids, 8:05 am | mark attendance for *this* class, *now* |
| **Subject teacher** (64 of them) | high | staff room between periods, or at home at 10 pm | enter marks for one subject; see next period |
| **Exam coordinator / principal** | medium | corridor, meetings, parent calls | who is failing, who is below 75%, is Term 1 locked |
| **Front-desk / admin officer** | medium | counter with a parent standing there | find one student by phone/admission no, read fee + attendance aloud |
| **Timetable admin** | low but painful | desk, but increasingly on a tablet/phone | fix one broken slot without breaking three others |

**The insight that drives every design below:** on desktop these screens are *reporting*
tools. On a phone they are *doing* tools. A teacher on a phone has one job at a time, one
hand free, 90 seconds, and often bad Wi-Fi in a concrete building. Anything that asks them
to *configure* before they can *do* is a tax they pay 200 times a year.

---

## 2. The pain audit (measured against the current code)

Each row is a real cost in the existing implementation, not a hypothetical.

| # | Screen | What the code does today | Mobile cost |
|---|---|---|---|
| P1 | `AttendancePage.jsx` | 3 native selects (date / section / subject) must be set before any student appears; the section select is a `<select>` with **40 options in optgroups** | ~6 taps + 2 long native-picker scrolls **before work starts**; the section list is a 40-row wheel |
| P2 | `AttendancePage.jsx` | status button **cycles** `present → absent → late → excused` | marking one student "excused" = **4 taps**; a mis-tap needs 3 more to get back around |
| P3 | `AttendancePage.jsx` | one `Save Attendance` button at the bottom; no autosave, no offline queue | a dropped connection at period 1 loses 25 entries silently |
| P4 | `GradesPage.jsx` | **4** selects (section/term/subject/assessment) then 25 `<input type=number>` in a table | OS numeric keyboard covers ~45% of the screen; every field needs tap → type → dismiss |
| P5 | `GradesPage.jsx` | lock state shown as a text banner above a long table | after scrolling 10 rows the "locked" context is off-screen; user types into disabled fields |
| P6 | `TimetablePage.jsx` | `<table>` of **8 periods × 5 days = 40 cells** inside `overflow-x-auto` | at 390 px the grid shows ~1.6 days; editing = horizontal scroll hunting, then a 5-field modal |
| P7 | `TimetablePage.jsx` | conflicts are only discovered on submit (server returns 409 from the 3 unique indexes) | user fills 5 fields, then loses them to an error they could have been warned about |
| P8 | `StudentsPage.jsx` | 4-column table + `Previous`/`Next` pager, 20 rows/page | 1000 students = **50 pages**; the table's 4th column (`Status`) clips on a phone |
| P9 | `StudentsPage.jsx`, `AttendanceReportPage.jsx`, `GradeReportPage.jsx`, `ReportCardPage.jsx` | the section picker is repeated as a raw `<select>` with 40 optgrouped options in 5 places | same 40-item wheel, five times, no memory of the last choice |
| P10 | `GradesPage.jsx`, `GradeReportPage.jsx`, `ReportCardPage.jsx` | `GET /academic/terms` is called **without** `?yearId` | with 3 academic years seeded, the Term dropdown now lists **"Term 1, Term 2, Term 1, Term 2, Term 1, Term 2"** — six indistinguishable options. Real bug, newly visible at scale. |
| P11 | `StudentDetailPage.jsx` | 3 summary cards in `sm:grid-cols-2`, edit modal contains a nested repeatable parent-contact form | on a phone: a ~2400 px scroll; the number a parent is calling about (fee balance) is at the bottom |
| P12 | `ReportCardPage.jsx` | polls job status every 3 s for up to 2 min, in-page only | phone screen locks → poll dies → user has no idea if 25 PDFs were built |
| P13 | `AttendanceReportPage.jsx` | 5-column table, `Defaulter` badge in the last column, CSV export via `<a download>` | the one column that matters (%) and the badge are the two most likely to clip; CSV on a phone is a dead end |
| P14 | `AcademicYearsPage.jsx` | lists years only; **terms have no UI at all** (create/edit is API-only) | the object every other screen filters by cannot be managed on any device |
| P15 | all 10 | `AppShell.jsx` has a fixed 256 px sidebar with **~20 nav links** and no mobile drawer/bottom bar | on a 390 px screen the sidebar eats 66% of the width; content renders in ~134 px |

Aggregate: **a class teacher spends ~11 taps of setup to make 1 tap of progress.** That
ratio is the thing to fix, and it is what every variant below is scored against.

---

## 3. Design rules applied to every mockup

1. **Start plain, earn every extra.** The first variant of any screen is the simplest thing
   that works: a list, standard controls, one obvious action — plus the ordinary affordances
   people already expect and recognise (search, filter, sort, a counter, empty and loading
   states). Nothing to teach, nothing assumed. Cleverness — gestures, smart defaults,
   auto-suggestions, OCR, drag — is a **layer on top of that plain version**: opt-in,
   removable, and only if it buys a gain you can measure in taps or seconds. If a teacher
   never discovers the clever path, they must still be able to finish the job. Attendance
   concept 7 is the reference implementation of this rule: a class list with Present /
   Absent buttons on every row ships first; period-awareness and default-present ride on
   the *same list* afterwards. Corollary: filter, sort and search are table stakes, not
   design variants — never count them as an idea.
2. **Context before configuration.** Derive section/subject/date from the timetable and the
   clock. The picker is the fallback, never the gate. (Fixes P1, P9.)
3. **One thumb, bottom half.** Primary action sits in a sticky bar 16–88 px from the bottom
   edge. Filters live in bottom sheets, never in a top-anchored row.
4. **Direct states, not cycles.** Every status is reachable in exactly one tap from a pill
   group. Cycling is banned. (Fixes P2.)
5. **Default to the common case — as the first accelerator, not the first build.** All-present,
   current period, active year, last-used section: a normal day should be *confirmable*, not
   *enterable*. Per rule 1 this arrives **after** the plain version, layered on the same list,
   with a way back to explicit marking. (Fixes P2, P3.)
6. **44 px minimum targets, 8 px grid, 16 px side gutters.** Score/status controls get 48 px.
7. **Optimistic + queued writes.** Show saved instantly, sync in the background, surface a
   single "3 changes pending" chip. Never a bare bottom Save. (Fixes P3, P12.)
8. **Warn before you waste.** Conflicts (teacher busy, room taken, grades locked) surface
   *while choosing*, not on submit. (Fixes P5, P7.)
9. **Progress, not spinners.** Counts ("18 of 25 marked"), rings, and per-row states.
10. **Numbers first, tables last.** A phone shows 2 columns well. Anything wider becomes a
    card, a bar, or a drill-down. (Fixes P8, P11, P13.)
11. **Share is a feature.** Principals live in WhatsApp; every report ends in a share-ready
    card instead of a CSV download. (Fixes P13.)
12. **One product, two widths.** Desktop is not the mobile screen stretched — it spends its
    extra space on things a phone genuinely cannot do (a 40-section board, three panes,
    keyboard entry). But it is the *same* component tree writing the *same* records through
    the *same* API, so nothing has to be reconciled between them. Anything only one of them
    can write (e.g. marking on behalf of a teacher on leave) is labelled on the record.

---

## 4. The five variants per screen

Each variant is a *different interaction model*, not a re-skin. The last column is what I
would ship — and the reason is always which persona's 20 seconds it protects.

### 4.1 Students — `01-students.html`
Job: "find one child, or work through a cohort."

| V | Concept | Optimises for | Trade-off |
|---|---|---|---|
| 1 | **A–Z index roster** — sticky search, letter rail, infinite scroll, no pager | knowing the name | weak for cohort work |
| 2 | **Class-first drill-down** — grade cards → section chips → roster | the teacher's mental model; kills the 40-item select | 2 extra taps when you know the name |
| 3 | **Search-first command palette** — admission no / phone / parent name, with recents | front desk with a parent waiting | needs good server-side search |
| 4 | **Saved segments + filter sheet** — "Defaulters", "New admissions", "Withdrawn" | admin bulk work, reporting | segment definitions must be maintained |
| 5 | **Swipe-action rows + multi-select** — call/WhatsApp/withdraw per row | acting on students, not just viewing | discoverability of swipe |

**Ship V2 + V3 together** (drill-down as the browse path, palette as the jump path). They
kill P8 and P9 outright.

### 4.2 Student detail — `02-student-detail.html`
Job: "answer a parent's question without scrolling."

| V | Concept | Optimises for | Trade-off |
|---|---|---|---|
| 1 | **Hero + KPI trio + sticky tabs** | orientation, familiar pattern | tabs hide data |
| 2 | **Timeline feed** of events | "what happened recently" | poor for totals |
| 3 | **Action-first stack** (call/collect/leave) + accordions | front-desk speed | data one tap deeper |
| 4 | **Parent-conversation card** — big traffic-light numbers, share as image | the actual phone call | not an editing surface |
| 5 | **KPI dashboard with sparklines** | trend spotting by principals | most build effort |

**Ship V1 shell + V4 as a "Share summary" action.** Fixes P11.

### 4.3 Attendance (mark) — `03-attendance.html`  ← highest ROI screen
Job: "record today's roll in under 60 seconds, offline-tolerant."

| V | Concept | Taps for a normal day (25 kids, 2 absent) | Notes |
|---|---|---|---|
| 1 | **Default-present, tap exceptions** — count header, 1-tap pill per exception, sticky submit + undo | **3** | direct fix for P2/P3 |
| 2 | **Swipe deck roll-call** — one card per student, 4 directions | 25 swipes | best for oral roll call, worst for corrections |
| 3 | **Avatar grid tiles** — whole class on one screen, tap = absent, long-press = late/excused | 3 | highest information density; long-press is hidden |
| 4 | **Absent-only entry** — "All 25 present?" → type the absentees | 2–4 | fastest possible; assumes present-by-default is safe |
| 5 | **Period-aware flow** — opens on "your next class", section/subject/date pre-filled from the timetable | 3, with **zero** setup taps | removes P1 completely; needs the timetable populated (it is: 1600 slots) |
| 6 | **Desktop console** — 40-section board, three panes, hotkeys (`P`/`A`/`L`/`E`, `↑↓`, `⌘S`), chase list, mark-on-behalf | 4 keystrokes per section | a different job, not a bigger screen: it serves the office, not the teacher at 08:05 |
| 7 | **Simple list** — class list, Present / Absent buttons on every row, guarded save; Late/Excused behind `⋯` | **22** (one per child) | slowest per day, but nothing to learn, nothing assumed, every child explicitly marked, and the smallest diff from today's code |

**Launch with V7, then layer V5 + V1 on top of it.** V7 is the plain list every teacher
recognises — two buttons a row, no defaults, a guarded save — and it is days of work, not
weeks. V5's period card (0 setup taps) and V1's default-present then ride on *the same list*
as opt-in speed-ups: a teacher who never discovers either still finishes the roll. V3's tile
grid stays a density toggle. **V6 ships in parallel** — the admin officer chasing 40 sections
and covering for staff on leave is a keyboard job, and it writes through the same API with an
`on behalf of` label on the record.

Sequencing matters more than cleverness here: shipping the smart default *first* means every
teacher's first experience depends on a guess about their class. Shipping the plain list first
means the smart paths are always an accelerator, never a prerequisite.

Full storyboards for all six — every tap, the offline case, the mistake case, and what
happens downstream — are in [`03-attendance-flow.html`](03-attendance-flow.html).

**Approved for build:** [`03-attendance-approved.html`](03-attendance-approved.html) — concept 7's list plus filter/sort (table stakes) plus two smart accelerators (at-risk filter, attendance-% sort, and a "mark rest present" bulk action that never overrides a decision already made). That page, not this one, is the implementation spec, and it's a full engineering handoff — real API contracts (§4, including a finding that this redesign needs one fewer network call than today's code), state shape and pseudocode (§5), a file/component plan (§6), error/empty/accessibility states (§7), a testing plan (§8), a Definition of Done (§9) and a sign-off block (§10) — not just a picture.

### 4.4 Attendance report — `04-attendance-report.html`
Job: "who needs a phone call today."

| V | Concept | Optimises for |
|---|---|---|
| 1 | **Traffic-light roster**, worst first, % bars, defaulter hero count | triage |
| 2 | **Per-student month heatmap** | pattern spotting (always-Monday absences) |
| 3 | **Cohort tabs** (<75% / 75–90% / >90%) with counts | scanning a class's shape |
| 4 | **Follow-up queue** — call/SMS/log-note per defaulter, with last-contacted | actually closing the loop |
| 5 | **Share-ready summary card** | principal's WhatsApp group |

**Ship V1 + V4.** Fixes P13.

### 4.5 Grades (enter) — `05-grades.html`
Job: "enter 25 marks accurately, without the OS keyboard fighting me."

| V | Concept | Optimises for | Trade-off |
|---|---|---|---|
| 1 | **Keypad focus mode** — one student, huge custom keypad, auto-advance, live letter chip | accuracy + speed with one thumb | loses class context |
| 2 | **Inline list + docked keypad** — list stays visible, custom keypad, prev/next | context + speed | denser targets |
| 3 | **Grade-band tap / slider** — tap A–F or drag for exact | rubric subjects (PE, Art) | imprecise for boards |
| 4 | **Mark-sheet capture** — photo → OCR review list with confidence flags, or CSV | bulk entry from paper | needs OCR service |
| 5 | **Baseline + outliers** — set a class baseline, adjust deltas, live distribution preview | fast, curve-aware entry | risk of lazy grading |

**Ship V2 (default) + V1 (focus toggle), lock state as a persistent sticky banner** — fixes
P4 and P5.

### 4.6 Grade report — `06-grade-report.html`
Job: "how did the class do, and who needs help."

| V | Concept | Optimises for |
|---|---|---|
| 1 | **Distribution first** — A–F bars + average donut, tap a band to filter | shape of the class |
| 2 | **Top / Needs-attention split** | the two lists people actually act on |
| 3 | **Student vs class comparison** | parent meetings |
| 4 | **Subject scorecard carousel** | coordinator comparing subjects |
| 5 | **Auto-narrative insight cards** | principals who want the sentence, not the chart |

**Ship V1 + V2 on one scroll; V5 as a header strip.**

### 4.7 Timetable (build) — `07-timetable.html`  ← worst current screen on mobile
Job: "fix or fill slots without creating a conflict."

| V | Concept | Optimises for | Trade-off |
|---|---|---|---|
| 1 | **Day-at-a-time column** — day chips + vertical period list | comprehension at 390 px | no week overview |
| 2 | **Time-rail agenda with drag** — real clock rail, inline conflict warnings | spatial editing | drag on mobile is fiddly |
| 3 | **Subject palette stamping** — pick a chip, tap slots, "repeat every Monday" | bulk building | needs an undo model |
| 4 | **Template & copy-first** — start from last year, review a diff, then publish | the 80% case (`/timetable/copy` already exists) | hides fine detail |
| 5 | **Teacher-load view** — flip the axis to per-teacher free/busy | preventing P7 before it happens | not the admin's default mental model |

**Ship V1 as the viewer, V4 as the builder, V5 as a conflict pre-check.**

### 4.8 My schedule — `08-my-schedule.html`
Job: "what am I teaching next, and let me act on it."

| V | Concept | Optimises for |
|---|---|---|
| 1 | **Now / Next hero + rest of day**, one-tap "Mark attendance" | the 30 seconds before a period |
| 2 | **Swipeable day agenda** with current-period highlight | planning the day |
| 3 | **Portrait week grid** (abbreviated codes) | the weekly mental map |
| 4 | **My classes list** (grouped by section) with quick actions | teachers who think in classes |
| 5 | **Glance/widget card** + free-period highlight | home-screen shortcut |

**Ship V1.** It is also the natural launcher for Attendance V5.

### 4.9 Report cards — `09-report-cards.html`
Job: "generate 25 PDFs and know when they're ready."

| V | Concept | Optimises for |
|---|---|---|
| 1 | **Job card with progress ring + push** ("we'll notify you") | backgrounded phones (fixes P12) |
| 2 | **Batch queue** — several sections at once, per-row retry | end-of-term throughput |
| 3 | **Preview-then-generate** — sample card first | catching bad data before 25 PDFs |
| 4 | **Distribute flow** — share links / WhatsApp / print queue after generating | the real end of the job |
| 5 | **Pre-flight checklist** — grades locked? attendance complete? fees flagged? | quality gate |

**Ship V5 → V1 → V4 as one flow.**

### 4.10 Academic years & terms — `10-academic-years.html`
Job: "set up the year, and switch context everywhere else."

| V | Concept | Optimises for |
|---|---|---|
| 1 | **Year cards + inline terms** | closes the P14 gap (terms finally have UI) |
| 2 | **Timeline strip** with draggable term boundaries | seeing the year at a glance |
| 3 | **3-step setup wizard** | first-run / new tenant |
| 4 | **Global year switcher sheet** | fixes P10 — every term picker becomes year-scoped |
| 5 | **Calendar-anchored editor** with holidays | date accuracy |

**Ship V1 + V4.** V4 is the cheapest fix for the six-identical-Terms bug.

---

## 5. Success metrics (what "smart, easy" means in numbers)

| Metric | Today (measured from the code path) | Target |
|---|---|---|
| Setup taps before a teacher can mark attendance | 11 | **0–1** |
| Taps to mark a 25-student class on a normal day | 26–100 | **≤ 4** |
| Taps to set one student "excused" | 4 | **1** |
| Time to enter 25 marks | ~3 min (OS keyboard churn) | **< 60 s** |
| Horizontal scrolling required | Timetable, Grades, Attendance, both reports | **none** |
| Data lost on a dropped connection | up to a full class | **0** (queued writes) |
| Taps to answer "what is this child's fee balance?" | 4 + a 2400 px scroll | **1** |
| Screens where the active-year context is ambiguous | 3 (P10) | **0** |

---

## 6. Build order (if the mockups are approved)

1. **Shell first** — mobile drawer + bottom tab bar in `AppShell.jsx` (P15). Nothing else
   works on a phone until the 256 px sidebar collapses.
2. **A shared `<SectionPicker>`** (recent + drill-down + search) replacing five copies of the
   40-option select (P1, P9), and a **year-scoped term picker** (P10 — one-line fix: pass
   `?yearId`).
3. **Attendance V5 + V1** — biggest measurable win.
4. **Grades V2 + V1** with a sticky lock banner.
5. **My Schedule V1** as the teacher home; wire "Mark attendance" through to (3).
6. **Reports** V1/V4 pairs; then Timetable V1/V4; then Report cards flow; then Students
   V2/V3; then Student detail; then Years/Terms.

## 7. Bugs and gaps found while auditing (worth fixing regardless of the redesign)

- **P10** — `GET /academic/terms` is called without `?yearId` in `GradesPage`,
  `GradeReportPage` and `ReportCardPage`; with more than one academic year the dropdown is
  ambiguous. One-line fix per call site.
- **P14** — no UI to create or edit `Term`s, although every grading screen filters by term.
- **P15** — `AppShell` has no mobile breakpoint at all; the sidebar is unconditionally 64/256 px.
- `AttendancePage` sends `status: 'absent'` for any student left unmarked on save — silent
  data entry by omission.
- `AttendancePage` and `GradesPage` fetch students with `limit=100`; correct for the seeded
  25/section, but it will silently truncate any section above 100.
- `GET /fee/defaulters` is unpaginated. At 1000 students it returns **414 rows / ~430 KB**
  in one response (measured against the seeded DB); a 10,000-student tenant would ship ~4 MB
  to a phone. Everything else measured fast: attendance report 20 ms, grade report 10 ms,
  timetable 30 ms.

## 8. How to review the mockups

```bash
# from the repo root
python3 -m http.server 8080 --directory docs/mobile-ui
# then open http://localhost:8080/
```

`index.html` is the gallery. Each screen file shows its five variants side by side in phone
frames, with the pain each one targets and my recommendation marked. The mockups are static
HTML + CSS (no build step, no framework) so they can be opened directly from the filesystem
too.
