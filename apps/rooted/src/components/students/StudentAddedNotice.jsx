import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.jsx';
import { addedMessage } from '../../utils/studentAdded.js';

/** Shown at the top of a student's page right after they were added: what happened with their login and fee. */
export default function StudentAddedNotice({ notice, onDismiss }) {
  const { t } = useTranslation();
  const { key, params, feeKey } = addedMessage(notice);
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
    >
      <p>
        {t(key, params)}
        {feeKey && ` ${t(feeKey)}`}
      </p>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        {t('common.close')}
      </Button>
    </div>
  );
}
