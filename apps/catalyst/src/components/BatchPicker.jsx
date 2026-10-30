import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission } from '@/lib/access.js';
import { Select } from '@/components/ui/Input.jsx';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/Feedback.jsx';

/** The batch + programme-run chooser every staff page starts with. */
export function BatchPicker({ batch, showTerm = true }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48">
        <Select
          label={t('training.batch.section')}
          value={batch.sectionId}
          onChange={(e) => batch.setSectionId(e.target.value)}
        >
          {batch.sections.map((s) => (
            <option key={s._id} value={s._id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      {showTerm && (
        <div className="min-w-48">
          <Select
            label={t('training.batch.term')}
            value={batch.termId}
            onChange={(e) => batch.setTermId(e.target.value)}
          >
            {batch.terms.map((term) => (
              <option key={term._id} value={term._id}>
                {term.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

/**
 * Renders `children` only once a batch and a term exist, otherwise the right
 * loading / error / "nothing set up yet" state, so a page never fetches with an
 * empty id.
 */
export function BatchGate({ batch, children }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (batch.loading) return <Spinner />;
  if (batch.error) return <ErrorNote error={batch.error} />;
  if (!batch.ready) {
    // Only an administrator can add a programme run, so only they get the way there.
    const canSetUp = batch.terms.length === 0 && hasPermission(user, 'tenant:admin');
    return (
      <EmptyState
        title={t('training.batch.none')}
        description={canSetUp ? t('setup.needTerm') : t('training.batch.noneHint')}
        action={
          canSetUp && (
            <Link to="/setup" className="text-sm font-medium underline">
              {t('setup.goSetup')}
            </Link>
          )
        }
      />
    );
  }
  return children;
}
