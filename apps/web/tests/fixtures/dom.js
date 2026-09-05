/**
 * Row content exists twice in the DOM.
 *
 * The responsive rewrite renders a mobile card list (`RecordList`, `md:hidden`)
 * alongside the desktop table (`DataTable`) and lets CSS decide which is shown.
 * Users and screen readers only ever get one — the other is `display: none` —
 * but `getByText` matches both and trips Playwright's strict mode:
 *
 *   strict mode violation: getByText('Bob Jones') resolved to 2 elements
 *     1) <p class="...md:hidden">Bob Jones</p>
 *     2) <td data-slot="table-cell">Bob Jones</td>
 *
 * `.first()` is not a fix: it can land on the hidden copy, and the assertion
 * then fails for the opposite reason. Scope to whichever variant the current
 * viewport actually renders instead.
 */
export const visibleText = (scope, text, options) =>
  scope.getByText(text, options).filter({ visible: true });
