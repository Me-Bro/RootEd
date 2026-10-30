/**
 * "Who's out today" strip (§4 component contract: { members }) — the one
 * cross-department question the spec calls out as worth surfacing without
 * filtering. `members` is expected to already be filtered to
 * `employmentStatus === 'on_leave'` by the caller.
 *
 * §5 edge case: hides entirely when nobody is on leave, rather than
 * rendering a "0 on leave" strip.
 *
 * Each chip shows name + employee ID (not just name, as in the mockup) so an
 * admin can tell apart same-named staff at a glance — a small deliberate
 * deviation from the low-fidelity mock.
 */
import { useTranslation } from 'react-i18next';

export default function OnLeaveStrip({ members }) {
  const { t } = useTranslation();
  if (!members || members.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
      <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">
        {t('staff.directory.onLeaveToday', { count: members.length })}
      </p>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <span
            key={m._id}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:ring-yellow-800"
          >
            {m.firstName} {m.lastName}
            <span className="ml-1 font-mono text-yellow-700/80 dark:text-yellow-400/80">
              · {m.employeeId || '—'}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
