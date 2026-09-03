# Logo / Icon — Exploration Notes

## The problem with what's shipped today

`apps/web/public/favicon.svg` is a full illustration, not an icon: one outer silhouette
plus 15 layered, blurred, `color(display-p3 ...)` gradient ellipses under an alpha mask,
built for a large canvas. Two real problems follow from that:

1. **It won't hold up small.** Every favicon, app-icon and nav-bar use of this mark renders
   it at 16–36px. The blur/ellipse detail that gives it depth at 200px is invisible — or
   muddy — at 16px; only the outer silhouette actually survives.
2. **It doesn't reference the product name.** The silhouette is a generic slanted
   zigzag/arrow shape — it could be the logo for any startup. Nothing in it says "Root,"
   "Ed," growth, or education.

Neither is a crisis (the app works fine today), but "professional and future-looking" is
exactly the ask this addresses.

## The 5 concepts

Same critique format as the landing-page and dashboard explorations — what each optimizes
for, what it knowingly trades away. Full detail and every test frame (favicon size, app
icon, nav lockup, true single-color knockout) is in `index.html`; this is the short version:

| # | Concept | Optimises | Trades away |
|---|---|---|---|
| 1 | **Root Network** | The name pays off twice — literal roots, and a branching data/org-chart network, which is what the product actually is. Survives 16px (4 strokes, 4 dots). | Full brand-asset swap, not an evolution — most different from what's shipped today. |
| 2 | **Sprout / Leaf** | Warmest, most approachable — growth + education in one shape (vein doubles as an open-book spine). | Least technical-looking of the five — undersells "data platform." |
| 3 | **Monogram Root-R** | An ownable brand letterform — a bold "R" whose leg splits into root tendrils. | Reads as a company initial before it reads as "root" — the detail that makes it "root" is the first thing lost small. |
| 4 | **Hex Node** | Leans into the product's real differentiators (tenant isolation, encryption, audit log) — hexagon = contained/secure system, most "deep tech" of the five. | Root/education connection is the most abstract — needs the largest size to notice. |
| 5 | **Evolved current mark** | Zero brand-equity risk — the exact silhouette already live everywhere, just flattened to one clean gradient fill, filters removed. Fixes the render-cost and small-size problems without changing the mark. | Still no connection to "Root" or "Ed" — a technical-debt fix, not a concept fix. |

## Recommendation

**Concept 1, Root Network**, for the reason above — it's the only concept where the name,
the visual, and the product's actual data model (school → classes → students; tenant →
roles → users) all point the same direction, and it's built from 4 straight/curved strokes
plus 4 dots, which is about as far as a mark can be simplified while still reading as
something. If a full asset swap isn't the goal right now, **Concept 5** is the correct
fallback — it's not a new brand, it's fixing a real technical problem (filter/blur cost,
illegibility at 16px) in the mark that's already shipped.

Vibhanshu and David are the only two people who can make this call — pick one, and swapping
`apps/web/public/favicon.svg` plus the `<img>` references in `LoginPage.jsx` and the landing
page mockups is a small, mechanical follow-up once a direction is chosen.

## How to review

```bash
# from the repo root
python3 -m http.server 8080 --directory docs
# then open http://localhost:8080/logo-mockup/
```

Standalone SVG source for all 5 marks lives in `marks/` — each is a real, valid,
production-sized icon (not a screenshot or placeholder), ready to drop straight into
`apps/web/public/favicon.svg` if one is approved.
