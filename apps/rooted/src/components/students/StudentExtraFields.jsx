import { useTranslation } from 'react-i18next';
import { BLOOD_GROUPS } from '@rooted/shared/schemas';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { emptyContact, groupFieldsFor } from './studentForm.js';

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function CheckField({ id, label, checked, onChange, disabled }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      {label}
    </label>
  );
}

function SelectField({ id, label, value, onChange, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} value={value} onChange={onChange} className={selectCls}>
        {children}
      </select>
    </div>
  );
}

// A collapsed section: the rarely-needed fields stay out of the way, but stay
// mounted so their values are kept while closed.
function More({ title, children }) {
  return (
    <details className="rounded-lg border border-border sm:col-span-2">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{title}</summary>
      <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2">{children}</div>
    </details>
  );
}

/**
 * The student fields beyond name, section, date of birth and gender: contact and
 * WhatsApp, guardians, address, health, Aadhaar, and the extras this org type
 * collects. Shared by Add and Edit; `form` comes from formFromStudent. `student`
 * is the saved record when editing (only its Aadhaar last four is read).
 */
export default function StudentExtraFields({ form, setForm, orgType, student }) {
  const { t } = useTranslation();
  const f = (key, options) => t(`academic.studentForm.${key}`, options);

  const set = (key) => (e) => setForm((s) => ({ ...s, [key]: e.target.value }));
  const setFlag = (key) => (e) => setForm((s) => ({ ...s, [key]: e.target.checked }));
  const setAddress = (key) => (e) =>
    setForm((s) => ({ ...s, address: { ...s.address, [key]: e.target.value } }));

  const setContacts = (change) =>
    setForm((s) => ({ ...s, parentContacts: change(s.parentContacts) }));
  const setContact = (index, key, value) =>
    setContacts((list) => list.map((c, i) => (i === index ? { ...c, [key]: value } : c)));
  // Only one guardian is the primary contact: ticking one clears the others.
  const setPrimary = (index, checked) =>
    setContacts((list) => list.map((c, i) => ({ ...c, isPrimary: i === index ? checked : false })));

  const groupFields = groupFieldsFor(orgType);

  return (
    <>
      <fieldset
        aria-label={f('contactSection')}
        className="grid gap-3 sm:col-span-2 sm:grid-cols-2"
      >
        <Input
          id="student-mobile"
          type="tel"
          label={f('mobile')}
          value={form.phone}
          onChange={set('phone')}
        />
        <Input
          id="student-whatsapp"
          type="tel"
          label={f('whatsapp')}
          value={form.whatsappSameAsPhone ? '' : form.whatsappNumber}
          onChange={set('whatsappNumber')}
          disabled={form.whatsappSameAsPhone}
        />
        <CheckField
          id="student-whatsapp-same"
          label={f('sameAsPhone')}
          checked={form.whatsappSameAsPhone}
          onChange={setFlag('whatsappSameAsPhone')}
        />
      </fieldset>

      <Input
        id="student-admission-date"
        type="date"
        label={f('admissionDate')}
        value={form.admissionDate}
        onChange={set('admissionDate')}
      />

      <div className="flex flex-col gap-2 sm:col-span-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {t('academic.studentDetail.parentGuardianContacts')}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setContacts((list) => [...list, emptyContact()])}
          >
            {t('academic.studentDetail.addContact')}
          </Button>
        </div>
        {form.parentContacts.map((c, i) => {
          const id = (key) => `guardian-${i}-${key}`;
          return (
            <fieldset
              key={i}
              aria-label={f('guardianN', { n: i + 1 })}
              className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2"
            >
              <Input
                id={id('name')}
                label={t('common.name')}
                value={c.name}
                onChange={(e) => setContact(i, 'name', e.target.value)}
              />
              <Input
                id={id('phone')}
                type="tel"
                label={t('academic.studentDetail.phone')}
                value={c.phone}
                onChange={(e) => setContact(i, 'phone', e.target.value)}
              />
              <Input
                id={id('relation')}
                label={t('academic.studentDetail.relation')}
                value={c.relation}
                onChange={(e) => setContact(i, 'relation', e.target.value)}
              />
              <Input
                id={id('email')}
                type="email"
                label={f('email')}
                value={c.email}
                onChange={(e) => setContact(i, 'email', e.target.value)}
              />
              <Input
                id={id('whatsapp')}
                type="tel"
                label={f('whatsapp')}
                value={c.whatsappSameAsPhone ? '' : c.whatsappNumber}
                onChange={(e) => setContact(i, 'whatsappNumber', e.target.value)}
                disabled={c.whatsappSameAsPhone}
              />
              <CheckField
                id={id('whatsapp-same')}
                label={f('sameAsPhone')}
                checked={c.whatsappSameAsPhone}
                onChange={(e) => setContact(i, 'whatsappSameAsPhone', e.target.checked)}
              />
              <CheckField
                id={id('primary')}
                label={f('primary')}
                checked={c.isPrimary}
                onChange={(e) => setPrimary(i, e.target.checked)}
              />
              <CheckField
                id={id('emergency')}
                label={f('emergency')}
                checked={c.isEmergency}
                onChange={(e) => setContact(i, 'isEmergency', e.target.checked)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setContacts((list) => list.filter((_, j) => j !== i))}
                className="justify-self-end text-destructive sm:col-span-2"
              >
                {t('academic.studentDetail.remove')}
              </Button>
            </fieldset>
          );
        })}
      </div>

      <More title={f('addressSection')}>
        <Input
          id="student-address-1"
          label={f('addressLine1')}
          value={form.address.line1}
          onChange={setAddress('line1')}
        />
        <Input
          id="student-address-2"
          label={f('addressLine2')}
          value={form.address.line2}
          onChange={setAddress('line2')}
        />
        <Input
          id="student-city"
          label={f('city')}
          value={form.address.city}
          onChange={setAddress('city')}
        />
        <Input
          id="student-state"
          label={f('state')}
          value={form.address.state}
          onChange={setAddress('state')}
        />
        <Input
          id="student-pincode"
          label={f('pincode')}
          inputMode="numeric"
          maxLength={6}
          value={form.address.pincode}
          onChange={setAddress('pincode')}
        />
      </More>

      <More title={f('healthSection')}>
        <SelectField
          id="student-blood-group"
          label={f('bloodGroup')}
          value={form.bloodGroup}
          onChange={set('bloodGroup')}
        >
          <option value="">{t('academic.students.selectPlaceholder')}</option>
          {BLOOD_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </SelectField>
        <Input
          id="student-allergies"
          label={f('allergies')}
          value={form.allergies}
          onChange={set('allergies')}
        />
        <Input
          id="student-medical-notes"
          label={f('medicalNotes')}
          value={form.medicalNotes}
          onChange={set('medicalNotes')}
        />
      </More>

      <More title={f('otherSection')}>
        {groupFields.map((field) =>
          field.options ? (
            <SelectField
              key={field.key}
              id={`student-${field.key}`}
              label={f(`fields.${field.key}`)}
              value={form[field.key]}
              onChange={set(field.key)}
            >
              <option value="">{t('academic.students.selectPlaceholder')}</option>
              {field.options.map((o) => (
                <option key={o} value={o}>
                  {f(`categories.${o}`)}
                </option>
              ))}
            </SelectField>
          ) : (
            <Input
              key={field.key}
              id={`student-${field.key}`}
              type={field.type === 'number' ? 'number' : 'text'}
              label={f(`fields.${field.key}`)}
              value={form[field.key]}
              onChange={set(field.key)}
            />
          )
        )}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Input
            id="student-aadhaar"
            label={f('aadhaar')}
            inputMode="numeric"
            autoComplete="off"
            value={form.aadhaar}
            onChange={set('aadhaar')}
          />
          {student?.aadhaarLast4 && (
            <p className="text-xs text-muted-foreground">
              {f('aadhaarSaved', { masked: `XXXX XXXX ${student.aadhaarLast4}` })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{f('aadhaarConsent')}</p>
          {student?.aadhaarLast4 && (
            <CheckField
              id="student-aadhaar-remove"
              label={f('aadhaarRemove')}
              checked={form.removeAadhaar}
              onChange={setFlag('removeAadhaar')}
            />
          )}
        </div>
      </More>
    </>
  );
}
