import { Button } from 'rooted';

export function Variants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Button>Save changes</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Cancel</Button>
      <Button variant="ghost">Skip</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="link">Learn more</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button disabled>Create login</Button>
      <Button variant="outline" disabled>
        Import CSV
      </Button>
    </div>
  );
}
