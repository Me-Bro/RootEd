import { Input, Label } from 'rooted';

export function WithField() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
      <Label htmlFor="roll">Roll number</Label>
      <Input id="roll" defaultValue="14" />
    </div>
  );
}
