import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

const STEPS = [
  { id: 1, label: 'School Details' },
  { id: 2, label: 'Academic Year' },
  { id: 3, label: 'Class & Section' },
  { id: 4, label: 'Invite Staff' },
];

function ProgressBar({ currentStep, total }) {
  const pct = ((currentStep - 1) / (total - 1)) * 100;
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between mb-2">
        {STEPS.map((step) => (
          <span
            key={step.id}
            className={`text-xs font-medium ${
              step.id <= currentStep ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
            }`}
          >
            {step.label}
          </span>
        ))}
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-2 rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Step 1: School Details
function StepSchoolDetails({ onNext }) {
  const [form, setForm] = useState({ name: '', timezone: 'Asia/Kolkata', locale: 'en', currency: 'INR' });
  const mutation = useMutation({
    mutationFn: (data) => api.patch('/tenant/settings', data),
    onSuccess: () => onNext(),
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">School Details</h2>
      <Input
        label="School Name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        required
      />
      <Input
        label="Timezone"
        value={form.timezone}
        onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
        placeholder="Asia/Kolkata"
      />
      <Input
        label="Locale"
        value={form.locale}
        onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}
        placeholder="en"
      />
      <Input
        label="Currency"
        value={form.currency}
        onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
        placeholder="INR"
      />
      {mutation.isError && (
        <p className="text-sm text-red-500">{mutation.error?.response?.data?.error ?? 'Failed to save settings'}</p>
      )}
      <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.name}>
        {mutation.isPending ? 'Saving…' : 'Next'}
      </Button>
    </div>
  );
}

// Step 2: Academic Year
function StepAcademicYear({ onNext, onBack }) {
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const mutation = useMutation({
    mutationFn: (data) => api.post('/academic/years', data),
    onSuccess: () => onNext(),
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Academic Year</h2>
      <Input
        label="Year Name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="2024-25"
        required
      />
      <Input
        label="Start Date"
        type="date"
        value={form.startDate}
        onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
        required
      />
      <Input
        label="End Date"
        type="date"
        value={form.endDate}
        onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
        required
      />
      {mutation.isError && (
        <p className="text-sm text-red-500">{mutation.error?.response?.data?.error ?? 'Failed to create year'}</p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || !form.name || !form.startDate || !form.endDate}
        >
          {mutation.isPending ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}

// Step 3: Class + Section
function StepClassSection({ onNext, onBack }) {
  const [form, setForm] = useState({ className: '', gradeLevel: '', sectionName: '' });
  const [classId, setClassId] = useState(null);

  const classMutation = useMutation({
    mutationFn: (data) => api.post('/academic/classes', data),
    onSuccess: (res) => setClassId(res.data._id),
  });

  const sectionMutation = useMutation({
    mutationFn: (data) => api.post('/academic/sections', data),
    onSuccess: () => onNext(),
  });

  async function handleSubmit() {
    let cid = classId;
    if (!cid) {
      const res = await classMutation.mutateAsync({ name: form.className, gradeLevel: Number(form.gradeLevel) || 1 });
      cid = res.data._id;
    }
    if (form.sectionName) {
      await sectionMutation.mutateAsync({ classId: cid, name: form.sectionName });
    } else {
      onNext();
    }
  }

  const isBusy = classMutation.isPending || sectionMutation.isPending;
  const error = classMutation.error || sectionMutation.error;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">First Class & Section</h2>
      <Input
        label="Class Name"
        value={form.className}
        onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
        placeholder="Grade 1"
        required
      />
      <Input
        label="Grade Level"
        type="number"
        value={form.gradeLevel}
        onChange={(e) => setForm((f) => ({ ...f, gradeLevel: e.target.value }))}
        placeholder="1"
      />
      <Input
        label="Section Name"
        value={form.sectionName}
        onChange={(e) => setForm((f) => ({ ...f, sectionName: e.target.value }))}
        placeholder="A"
      />
      {error && (
        <p className="text-sm text-red-500">{error?.response?.data?.error ?? 'Failed to create class/section'}</p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={handleSubmit} disabled={isBusy || !form.className}>
          {isBusy ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}

// Step 4: Invite Staff
function StepInviteStaff({ onBack, onComplete }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    designation: '',
    department: '',
  });

  const mutation = useMutation({
    mutationFn: (data) => api.post('/staff', data),
    onSuccess: () => onComplete(),
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Invite First Staff Member</h2>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First Name"
          value={form.firstName}
          onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
        />
        <Input
          label="Last Name"
          value={form.lastName}
          onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
        />
      </div>
      <Input
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
      />
      <Input
        label="Designation"
        value={form.designation}
        onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
        placeholder="Teacher"
      />
      <Input
        label="Department"
        value={form.department}
        onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
        placeholder="Science"
      />
      {mutation.isError && (
        <p className="text-sm text-red-500">{mutation.error?.response?.data?.error ?? 'Failed to invite staff'}</p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
          {mutation.isPending ? 'Inviting…' : 'Finish Setup'}
        </Button>
        <Button variant="ghost" onClick={onComplete}>Skip</Button>
      </div>
    </div>
  );
}

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length));
  const back = () => setStep((s) => Math.max(s - 1, 1));
  const complete = () => navigate('/dashboard');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Welcome to RootEd</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Let's set up your school in 4 quick steps.
          </p>
        </div>

        <ProgressBar currentStep={step} total={STEPS.length} />

        {step === 1 && <StepSchoolDetails onNext={next} />}
        {step === 2 && <StepAcademicYear onNext={next} onBack={back} />}
        {step === 3 && <StepClassSection onNext={next} onBack={back} />}
        {step === 4 && <StepInviteStaff onBack={back} onComplete={complete} />}
      </div>
    </div>
  );
}
