import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { apiError } from '../../utils/studyCenter.js';

const nameOf = (s) => `${s.firstName} ${s.lastName}`.trim();

/**
 * Find a learner by name or phone and pick them. With `allowWalkIn`, a visitor who is
 * not found can be registered on the spot (name and phone); a phone already on file
 * returns that visitor instead of a second record.
 */
export default function LearnerPicker({ value, onChange, allowWalkIn = false }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [adding, setAdding] = useState(false);
  const [walkIn, setWalkIn] = useState({ firstName: '', lastName: '', phone: '' });
  const [error, setError] = useState('');

  const results = useQuery({
    queryKey: ['learner-search', submitted],
    queryFn: () =>
      api
        .get('/academic/students', { params: { search: submitted, kind: 'all', limit: 8 } })
        .then((r) => r.data.students),
    enabled: submitted.length > 0,
  });

  async function register() {
    setError('');
    try {
      const { data } = await api.post('/academic/walk-ins', walkIn);
      onChange(data);
      setAdding(false);
    } catch (err) {
      // A phone already on file is the same visitor: use their record.
      const existing = err.response?.status === 409 && err.response.data?.existing;
      if (existing) {
        onChange(existing);
        setAdding(false);
      } else {
        setError(apiError(err, t('studyCenter.sell.walkInFailed')));
      }
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{nameOf(value)}</p>
          <p className="text-xs text-muted-foreground">
            {[value.admissionNo, value.phone].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onChange(null)}>
          {t('studyCenter.sell.change')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(text.trim());
        }}
      >
        <div className="flex-1">
          <Input
            id="learner-search"
            label={t('studyCenter.sell.findLearner')}
            placeholder={t('studyCenter.sell.findPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={!text.trim()}>
          {t('studyCenter.sell.search')}
        </Button>
      </form>

      {submitted && results.data && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {results.data.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">{t('studyCenter.sell.noMatch')}</li>
          )}
          {results.data.map((s) => (
            <li key={s._id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted"
                onClick={() => onChange(s)}
              >
                <span>{nameOf(s)}</span>
                <span className="text-xs text-muted-foreground">
                  {[s.kind === 'walk_in' ? t('studyCenter.sell.walkIn') : null, s.phone]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {allowWalkIn && !adding && (
        <div>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            {t('studyCenter.sell.registerWalkIn')}
          </Button>
        </div>
      )}

      {allowWalkIn && adding && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="walkin-first"
              label={t('studyCenter.sell.firstName')}
              value={walkIn.firstName}
              onChange={(e) => setWalkIn((w) => ({ ...w, firstName: e.target.value }))}
            />
            <Input
              id="walkin-last"
              label={t('studyCenter.sell.lastName')}
              value={walkIn.lastName}
              onChange={(e) => setWalkIn((w) => ({ ...w, lastName: e.target.value }))}
            />
          </div>
          <Input
            id="walkin-phone"
            type="tel"
            label={t('studyCenter.sell.phone')}
            value={walkIn.phone}
            onChange={(e) => setWalkIn((w) => ({ ...w, phone: e.target.value }))}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={!walkIn.firstName.trim() || !walkIn.lastName.trim() || !walkIn.phone.trim()}
              onClick={register}
            >
              {t('studyCenter.sell.saveWalkIn')}
            </Button>
            <Button variant="outline" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
