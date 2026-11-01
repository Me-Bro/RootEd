import { Badge } from 'rooted';

export function Variants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Badge>Active</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="outline">Term 1</Badge>
      <Badge variant="destructive">Withdrawn</Badge>
    </div>
  );
}

export function Status() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Badge variant="success">Present</Badge>
      <Badge variant="warning">Late</Badge>
      <Badge variant="danger">Absent</Badge>
    </div>
  );
}
