import { Paperclip } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/intl.js';
import BudgetContextBar from './BudgetContextBar.jsx';

function submitterName(submittedBy) {
  if (!submittedBy) return null;
  const name = `${submittedBy.firstName ?? ''} ${submittedBy.lastName ?? ''}`.trim();
  return name || submittedBy.email || null;
}

/**
 * One decision card in the pending-expense approval queue —
 * docs/mobile-ui/14-expenses-approved.html §1 (mock 2, approved) and §4.
 *
 * `isApproving`/`isRejecting` are additions beyond the spec's literal
 * `{ entry, budget, onApprove, onReject }` 4-prop contract — without them
 * neither button can show a busy state while its mutation is in flight.
 * `onApprove`/`onReject` behave identically to today's mutations (DoD): the
 * caller decides what each does (approve mutates immediately, reject opens
 * the existing comment modal), this component only reports the entry id.
 */
export default function ApprovalQueueCard({
  entry,
  budget,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
}) {
  const submitter = submitterName(entry.submittedBy);
  const metaParts = [entry.category, entry.vendor, submitter && `submitted by ${submitter}`].filter(
    Boolean
  );
  const lastAttachment = entry.attachments?.[entry.attachments.length - 1];
  const busy = isApproving || isRejecting;

  return (
    <Card className="gap-3 px-4" role="group" aria-label={`Expense: ${entry.title}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-semibold leading-snug">{entry.title}</span>
        <span className="shrink-0 font-bold tabular-nums">{formatCurrency(entry.amount ?? 0)}</span>
      </div>

      {metaParts.length > 0 && (
        <p className="text-xs text-muted-foreground">{metaParts.join(' · ')}</p>
      )}

      {/* §5: attachment present — shown on the card, but there is no signed-url
          viewer route for expense attachments today (only upload exists), so
          "opens it exactly as today" resolves to "no open action" here too. */}
      {lastAttachment && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip size={13} className="shrink-0" />
          <span className="truncate">{lastAttachment.name}</span>
        </div>
      )}

      <BudgetContextBar budget={budget} projectedAmount={entry.amount ?? 0} />

      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={() => onApprove(entry._id)} disabled={busy}>
          {isApproving ? 'Approving…' : 'Approve'}
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          onClick={() => onReject(entry._id)}
          disabled={busy}
        >
          Reject
        </Button>
      </div>
    </Card>
  );
}
