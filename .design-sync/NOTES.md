# Design-sync notes (apps/rooted)

## How this repo syncs
- `apps/rooted` is an app, not a package, so the sync builds a library from `src/components/ui` first: `ui-lib/index.js` (explicit export list), `vite.lib.config.js` (`pnpm --filter rooted build:ui-lib` -> `dist-ui/`), `ui-lib/tsconfig.json` + `emit-types.mjs` (declarations -> `dist-ui/index.d.ts`; `package.json` `types` points there). `cfg.buildCmd` runs all three; the tsc comes from the staged `.ds-sync/node_modules` (`npm i typescript` there), not the repo.
- Shape is `package`, pinned in config. A Storybook exists but is unusable: no `storybook` CLI installed, addon-essentials is v8 vs react-vite v10, and only Button/Badge/Input have stories.
- Converter command: `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules apps/rooted/node_modules --entry apps/rooted/dist-ui/index.es.js --out ./ds-bundle` (driver: `resync.mjs`, same flags).
- Components need `RootEdProvider` (`ui-lib/provider.jsx`: own i18next instance with `en.json` + `MemoryRouter`). It is `cfg.provider` and excluded from the component list via `componentSrcMap`.
- Left out of the library on purpose: `ThemeConfigurator`, `LanguageSwitcher`, `sonner` (app chrome, need next-themes / app state).

## Findings
- [GENERAL] `.d.ts` come from `tsc --allowJs` on plain JSX, so prop types are loose (`variant?: string`, `[x: string]: any`). The design agent sees real variant names through the conventions header and the previews, not the types. Fix later: add JSDoc typedefs or `cfg.dtsPropsFor.<Name>` for Button, Badge, Card.
- [GENERAL] Sub-parts (`DialogContent`, `TableCell`, ...) are exported top-level, and the converter lists each as a component. The 10 that rendered blank on their own (`AlertDialogFooter/Header/Media`, `CardFooter`, `SelectGroup`, `SheetFooter/Header`, `TableCaption/Cell/Head`) are excluded with `componentSrcMap: null`; they stay in the bundle and appear inside their parents' previews. ~64 other sub-parts ship as floor cards.
- Fixed in the app: `Tabs` and `Separator` used `data-horizontal:`/`data-vertical:` variants, but Base UI sets `data-orientation`, so the Tabs root stayed a row (panels beside the list) and the Separator had no height. Both now use `data-[orientation=...]:`. The first sync's previews worked around it (`className="flex-col"`, an invisible Separator); the workaround is gone from the Tabs preview and the conventions, and the Separator preview needs re-grading after the next sync.
- `RecordList` is `md:hidden`: its override is `cardMode: single`, `viewport: 390x520`.
- Overlay previews (Dialog, AlertDialog, Sheet, DropdownMenu) use `defaultOpen` with `cardMode: single`.
- Known render warns (benign): `[RENDER_THIN]` on Dialog, AlertDialog, Sheet (portal content, height 0 in the document flow; sheets show them correctly); `[RENDER_BLANK]` on RecordList's validate screenshot (its authored sheet is fine).

## Re-sync risks
- Previews import only from `rooted` and use inline sample data (Grade 5-A, Heena Malhotra...), nothing tied to the API. A component rename or prop change in `src/components/ui` breaks its preview silently until recapture.
- `ui-lib/index.js` is an explicit list: a new component in `src/components/ui` does not ship until it is added there.
- The CSS is Tailwind-compiled from sources the app scans; utilities the app never uses are absent, so the conventions header tells the agent to use inline style outside a short verified list. Re-verify that list against `_ds_bundle.css` after dependency upgrades.
- Hindi: only `en` strings ship in the provider. Verified partially: 22 of ~98 components have authored previews (all graded good); the rest are floor cards.
- Docker/API are not needed for any of this; `node .ds-sync` needs `npm i esbuild ts-morph @types/react playwright typescript` and cached Chromium matching playwright 1.64 (build 1248).
