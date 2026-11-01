import { Input } from 'rooted';

export function Labelled() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 320 }}>
      <Input label="Email" type="email" placeholder="teacher@school.edu" />
      <Input label="Password" type="password" defaultValue="TestPass123!" />
    </div>
  );
}

export function WithError() {
  return (
    <div style={{ width: 320 }}>
      <Input
        label="Employee ID"
        defaultValue="EMP"
        error="Employee ID must be at least 4 characters"
      />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ width: 320 }}>
      <Input label="Section" defaultValue="Grade 5-A" disabled />
    </div>
  );
}
