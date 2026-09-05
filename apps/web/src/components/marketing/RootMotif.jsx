// Decorative root-branch line motif — same visual language as concept 1 of
// the logo exploration (docs/logo-mockup/). Purely decorative brand texture,
// never load-bearing content. The four call sites in the approved mock each
// use a different subset/weight of the same six branch strokes, so each is
// exported as its own named variant rather than approximated by one shape.
const MAIN_PATHS = [
  'M60 580 Q100 500 150 470',
  'M60 580 Q130 520 220 430',
  'M60 580 Q170 540 300 390',
  'M60 580 Q220 560 380 350',
  'M60 580 Q280 580 460 320',
  'M60 580 Q340 600 540 290',
];
const MAIN_POINTS = [
  { cx: 150, cy: 470 },
  { cx: 220, cy: 430 },
  { cx: 300, cy: 390 },
  { cx: 380, cy: 350 },
  { cx: 460, cy: 320 },
  { cx: 540, cy: 290 },
];
const TWIG_PATHS = ['M220 430 Q260 400 300 350', 'M300 390 Q330 360 360 320'];
const TWIG_POINTS = [
  { cx: 300, cy: 350 },
  { cx: 360, cy: 320 },
];

function RootMotif({ width, height, style, paths, points, r, strokeWidth, gradientId }) {
  const stroke = gradientId ? `url(#${gradientId})` : 'currentColor';
  return (
    <svg
      className="motif"
      viewBox="0 0 600 600"
      width={width}
      height={height}
      style={style}
      aria-hidden="true"
    >
      {gradientId && (
        <defs>
          <linearGradient
            id={gradientId}
            x1="60"
            y1="580"
            x2="540"
            y2="220"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#7e14ff" />
            <stop offset="1" stopColor="#47bfff" />
          </linearGradient>
        </defs>
      )}
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
        {paths.map((d) => (
          <path d={d} key={d} />
        ))}
      </g>
      <g fill={gradientId ? '#47bfff' : 'currentColor'}>
        {points.map((p) => (
          <circle cx={p.cx} cy={p.cy} r={p.r ?? r} key={`${p.cx}-${p.cy}`} />
        ))}
      </g>
    </svg>
  );
}

export function HeroDesktopMotif(props) {
  return (
    <RootMotif
      {...props}
      paths={[...MAIN_PATHS, ...TWIG_PATHS]}
      points={[
        ...MAIN_POINTS.map((p) => ({ ...p, r: 4 })),
        ...TWIG_POINTS.map((p) => ({ ...p, r: 3 })),
      ]}
      strokeWidth={2.2}
    />
  );
}

export function StatementDesktopMotif(props) {
  return <RootMotif {...props} paths={MAIN_PATHS} points={MAIN_POINTS} r={4} strokeWidth={2.2} />;
}

export function HeroMobileMotif(props) {
  return (
    <RootMotif
      {...props}
      paths={MAIN_PATHS}
      points={MAIN_POINTS}
      r={5}
      strokeWidth={3}
      gradientId="lp-mobile-hero-motif"
    />
  );
}

export function StatementMobileMotif(props) {
  return (
    <RootMotif
      {...props}
      paths={MAIN_PATHS.slice(0, 4)}
      points={MAIN_POINTS.slice(0, 4)}
      r={4.5}
      strokeWidth={2.4}
    />
  );
}
