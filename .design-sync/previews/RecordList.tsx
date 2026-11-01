import { Badge, RecordList, RecordListItem } from 'rooted';

export function Phone() {
  return (
    <div style={{ width: 340 }}>
      <RecordList>
        <RecordListItem
          title="Anita Sharma"
          meta="Roll 3 · Grade 5-A"
          trailing={<Badge variant="success">Present</Badge>}
        />
        <RecordListItem
          title="Chetan Shetty"
          meta="Roll 2 · Grade 5-A"
          trailing={<Badge variant="danger">Absent</Badge>}
        />
        <RecordListItem
          title="Heena Malhotra"
          meta="Roll 1 · Grade 5-A"
          trailing={<Badge variant="warning">Late</Badge>}
        />
      </RecordList>
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 340 }}>
      <RecordList isEmpty />
    </div>
  );
}
