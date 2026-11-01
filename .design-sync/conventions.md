# RootEd UI conventions

RootEd is a school-management web app. These components are its shared UI primitives (React, Tailwind 4, Base UI).

## Wrap everything in `RootEdProvider`

Put it once at the root of anything you build:

```jsx
<RootEdProvider>
  <PageHeader title="Subjects" description="The subjects your school teaches." action={<Button>Add subject</Button>} />
</RootEdProvider>
```

Components read their text from i18n (`EmptyState`, `DataTable`, `LoginBadge`, `RecordList`, `SelectField`, `Sheet`, `Dialog` close buttons) and `PageHeader backTo` renders a router link. Without the provider the text shows raw keys and the link throws. Sub-parts (`DialogContent`, `SelectItem`, `TableRow`, `CardFooter`...) are exported and work, but only inside their parent; look at the parent's preview to see how they compose.

## Styling idiom: Tailwind utilities over semantic CSS variables

Never hard-code colours. Read `styles.css` (it imports `_ds_bundle.css`) for the tokens. Semantic pairs, each a CSS variable and a Tailwind colour: `background`/`foreground`, `card`/`card-foreground`, `muted`/`muted-foreground`, `primary`/`primary-foreground`, `secondary`, `accent`, `destructive`, `border`, `input`, `ring`. Use them as `bg-background text-foreground`, `bg-card`, `bg-muted text-muted-foreground`, `bg-primary text-primary-foreground`, `text-destructive`, `border-border`. Radius is `rounded-lg`. Font is Geist (with Noto Sans Devanagari for Hindi). Base text is `text-sm`; page titles are `text-2xl font-semibold`.

Layout glue (verified present in the stylesheet): `flex`, `flex-col`, `grid`, `items-center`, `justify-between`, `gap-2`, `gap-3`, `gap-4`, `gap-6`, `p-4`, `p-6`. For anything else, use inline `style` rather than guessing a class: only utilities the app itself uses are compiled in.

## Component vocabulary

- `Button` variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; sizes `xs`, `sm`, default, `lg`, `icon`.
- `Badge` variants: `default`, `secondary`, `outline`, `destructive`, plus status colours `success`, `warning`, `danger` (Present / Late / Absent). `LoginBadge state` is `none | pending | active | suspended`.
- `Input` takes `label` and `error` itself; do not wrap it in a separate `Label`. `SelectField` is the labelled select; `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` is the bare one.
- Tables: `DataTable headers={[...]}` with `TableRow`/`TableCell` children on desktop, and `RecordList` + `RecordListItem` on phones (`RecordList` is hidden from the `md` breakpoint up, so show both and let it switch).
- Overlays (`Dialog`, `AlertDialog`, `Sheet`, `DropdownMenu`) take `defaultOpen` to render open.
- `Tabs` needs `className="flex-col"` so panels sit under the tab list.
