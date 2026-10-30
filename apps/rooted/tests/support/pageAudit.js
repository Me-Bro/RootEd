/**
 * Shared helpers for the full-app page sweep (tests/sweep/all-pages.spec.js).
 * Kept separate from that spec so any other spec can opt into the same
 * overflow/console-error checks without duplicating the logic.
 */

// Endpoints that 404/4xx by design for at least one seeded identity — the
// browser still logs these as a "Failed to load resource" console error, but
// they're not bugs. Chromium's console message for a failed resource load
// carries no URL (msg.text() is just the generic string), so filtering by
// message text can't distinguish an expected probe 404 from a real one —
// tracking the response itself (which does have a URL) is the only reliable
// way to allowlist these.
const EXPECTED_FAILED_REQUESTS = [
  // GET /staff/members/me 404s for any user with no linked StaffMember row
  // (e.g. tenant_admin, accountant) — see apps/api/src/routes/staff.js's
  // comment on that route. The page uses the 404 to disable "Apply for Leave".
  { url: /\/__api\/staff\/members\/me$/, status: 404 },
];

/**
 * Attaches console/page-error/failed-response listeners before navigation.
 * Call this first, then navigate, then call assertNoErrors() after the page
 * has settled. Returns the same array assertNoErrors() reads, in case a
 * caller wants to inspect entries itself.
 *
 * Failed HTTP responses (>=400) are tracked via page.on('response') rather
 * than the console's own "Failed to load resource" message, so each entry
 * carries the URL needed to allowlist known-expected 404s (see
 * EXPECTED_FAILED_REQUESTS) and to make real failures actionable in test
 * output. The matching console-level messages for those same failed loads
 * are dropped to avoid double-reporting the same failure two different ways.
 */
export function trackConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    const expected = EXPECTED_FAILED_REQUESTS.some((e) => e.status === status && e.url.test(url));
    if (!expected) errors.push(`${status} ${url}`);
  });
  return errors;
}

/**
 * Fails with a readable message if any console/page/network error was
 * captured. `ignore` is a list of substrings for additional known-benign
 * messages (e.g. a third-party script warning) to filter out before
 * asserting.
 */
export function assertNoErrors(errors, ignore = []) {
  const real = errors.filter((e) => !ignore.some((i) => e.includes(i)));
  if (real.length > 0) {
    throw new Error(`Console/page/network errors captured:\n${real.join('\n')}`);
  }
}

/**
 * Fails if the page has horizontal overflow at its current viewport —
 * i.e. document.documentElement.scrollWidth exceeds the viewport width by
 * more than a small tolerance (scrollbar rounding). On failure, walks the
 * DOM to report the widest offending elements so the fix location is obvious
 * from the test output alone.
 */
export async function assertNoHorizontalOverflow(page) {
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflowing = scrollWidth - viewportWidth > 2;
    if (!overflowing) return { overflowing: false };

    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.scrollWidth > viewportWidth + 2) {
        const rect = el.getBoundingClientRect();
        const id = el.id ? `#${el.id}` : '';
        const cls =
          typeof el.className === 'string' && el.className
            ? `.${el.className.trim().split(/\s+/).join('.')}`
            : '';
        offenders.push({
          selector: `${el.tagName.toLowerCase()}${id}${cls}`,
          width: Math.round(rect.width),
          scrollWidth: el.scrollWidth,
          left: Math.round(rect.left),
        });
      }
    }
    offenders.sort((a, b) => b.scrollWidth - a.scrollWidth);
    return { overflowing: true, viewportWidth, scrollWidth, offenders: offenders.slice(0, 5) };
  });

  if (result.overflowing) {
    const detail = result.offenders
      .map((o) => `  ${o.selector} — scrollWidth=${o.scrollWidth} left=${o.left}`)
      .join('\n');
    throw new Error(
      `Horizontal overflow: document is ${result.scrollWidth}px wide, viewport is ${result.viewportWidth}px.\nWidest offenders:\n${detail}`
    );
  }
}
