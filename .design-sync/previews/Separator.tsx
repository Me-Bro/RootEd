import { Separator } from 'rooted';

export function Horizontal() {
  return (
    <div style={{ width: 300 }}>
      <p style={{ fontWeight: 600 }}>Academic set-up</p>
      <Separator style={{ margin: '12px 0' }} />
      <p>Years, classes, subjects, timetable</p>
    </div>
  );
}
