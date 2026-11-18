import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/intl.js';

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

// Study centers: the one fee structure a learner holds. Plans are sold at the desk
// and carry coversFrom, so they are not listed here.
export default function StudentFeeStructurePanel({ studentId, canWrite }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState('');
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');

  const { data: assignments = [] } = useQuery({
    queryKey: ['student-fee-assignments', studentId],
    queryFn: () => api.get(`/fee/assignments?studentId=${studentId}`).then((r) => r.data),
  });
  const { data: structures = [] } = useQuery({
    queryKey: ['fee-structures'],
    enabled: canWrite,
    queryFn: () => api.get('/fee/structures').then((r) => r.data),
  });

  const current = assignments.find((a) => !a.coversFrom);
  const assignable = structures.filter((s) => s.isActive !== false && !s.plan?.kind);

  const mutation = useMutation({
    mutationFn: (feeStructureId) =>
      api.put(`/fee/students/${studentId}/structure`, { feeStructureId }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-fee-assignments', studentId] });
      setChoice('');
      setChanging(false);
      setError('');
    },
    onError: (err) =>
      setError(err.response?.data?.error || t('academic.studentDetail.feeStructureFailed')),
  });

  const editing = canWrite && (!current || changing);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {current && (
        <p>
          <span className="font-medium">{current.feeStructureId?.name}</span>
          <span className="text-muted-foreground"> · {formatCurrency(current.totalAmount)}</span>
        </p>
      )}
      {!current && !canWrite && (
        <p className="text-muted-foreground">{t('academic.studentDetail.feeStructureEmpty')}</p>
      )}
      {editing &&
        (assignable.length === 0 ? (
          <p className="text-muted-foreground">
            {t('academic.studentDetail.feeStructureNoneAvailable')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <select
              aria-label={t('academic.students.feeStructure')}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className={selectCls}
            >
              <option value="">{t('academic.studentDetail.feeStructureChoose')}</option>
              {assignable.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!choice || mutation.isPending}
                onClick={() => mutation.mutate(choice)}
              >
                {t('academic.studentDetail.feeStructureAssign')}
              </Button>
              {changing && (
                <Button size="sm" variant="outline" onClick={() => setChanging(false)}>
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </div>
        ))}
      {canWrite && current && !changing && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setChanging(true)}>
          {t('academic.studentDetail.feeStructureChange')}
        </Button>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
