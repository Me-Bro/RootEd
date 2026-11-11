import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { resolveWhatsapp, waLink } from '@rooted/shared/utils';
import api from '../../lib/api.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { groupFieldsFor } from './studentForm.js';
import { formatDate } from '../../utils/intl.js';

function WhatsappLink({ entity }) {
  const { t } = useTranslation();
  const url = waLink(resolveWhatsapp(entity));
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400"
    >
      <MessageCircle size={13} aria-hidden="true" />
      {t('academic.studentForm.whatsappLink')}
    </a>
  );
}

// The masked number, with a button that fetches the full one. The full number is
// held only in this component's state, never in the query cache, and every
// reveal is audited by the API.
function AadhaarRow({ student }) {
  const { t } = useTranslation();
  const [full, setFull] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function reveal() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.get(`/academic/students/${student._id}/aadhaar`);
      setFull(data.aadhaar.replace(/(\d{4})(?=\d)/g, '$1 '));
    } catch (err) {
      setError(err.response?.data?.error || t('academic.studentForm.aadhaarRevealFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{full ?? `XXXX XXXX ${student.aadhaarLast4}`}</span>
      {full ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setFull(null)}>
          {t('academic.studentForm.aadhaarHide')}
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={reveal} disabled={busy}>
          {t('academic.studentForm.aadhaarShow')}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

function Row({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * What the profile page knows about a student beyond name, section and status:
 * contact, admission, address, health, the org-type extras and guardians.
 * The Aadhaar number is only ever shown as its last four digits, and only to
 * someone who may edit the student.
 */
export default function StudentProfileDetails({ student, orgType, canWrite }) {
  const { t } = useTranslation();
  const f = (key, options) => t(`academic.studentForm.${key}`, options);

  const address = [
    student.address?.line1,
    student.address?.line2,
    student.address?.city,
    student.address?.state,
  ]
    .filter(Boolean)
    .join(', ');
  const fullAddress = [address, student.address?.pincode].filter(Boolean).join(' ');

  const extras = groupFieldsFor(orgType)
    .map((field) => {
      const value = student[field.key];
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
        return null;
      }
      let shown = Array.isArray(value) ? value.join(', ') : String(value);
      if (field.options) shown = f(`categories.${value}`);
      return { key: field.key, shown };
    })
    .filter(Boolean);

  const hasStudentRows =
    student.phone ||
    student.whatsappNumber ||
    student.whatsappSameAsPhone ||
    student.admissionDate ||
    fullAddress ||
    student.bloodGroup ||
    student.allergies ||
    student.medicalNotes ||
    extras.length > 0 ||
    (canWrite && student.aadhaarLast4);

  return (
    <>
      {hasStudentRows && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label={f('mobile')}>{student.phone}</Row>
          <Row label={f('whatsapp')}>
            <WhatsappLink entity={student} />
          </Row>
          <Row label={f('admissionDate')}>{formatDate(student.admissionDate) || null}</Row>
          <Row label={f('addressSection')}>{fullAddress}</Row>
          <Row label={f('bloodGroup')}>{student.bloodGroup}</Row>
          <Row label={f('allergies')}>{student.allergies}</Row>
          <Row label={f('medicalNotes')}>{student.medicalNotes}</Row>
          {extras.map((e) => (
            <Row key={e.key} label={f(`fields.${e.key}`)}>
              {e.shown}
            </Row>
          ))}
          {canWrite && student.aadhaarLast4 && (
            <Row label={f('aadhaar')}>
              <AadhaarRow student={student} />
            </Row>
          )}
        </dl>
      )}

      {student.parentContacts?.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">
            {t('academic.studentDetail.parentGuardianContacts')}
          </h2>
          {student.parentContacts.map((c, i) => (
            <div key={i} className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              <p className="flex flex-wrap items-center gap-2">
                <span>
                  {[c.name, c.phone].filter(Boolean).join(' — ')}
                  {c.relation ? ` (${c.relation})` : ''}
                </span>
                {c.isPrimary && <Badge variant="default">{f('primaryBadge')}</Badge>}
                {c.isEmergency && <Badge variant="danger">{f('emergencyBadge')}</Badge>}
              </p>
              {c.email && <p>{c.email}</p>}
              <WhatsappLink entity={c} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
