import { Badge, DataTable, TableCell, TableRow } from 'rooted';

const rows = [
  ['Anita Sharma', 'Mathematics', 'Present'],
  ['Chetan Shetty', 'Mathematics', 'Absent'],
  ['Heena Malhotra', 'Mathematics', 'Late'],
];

export function Filled() {
  return (
    <div style={{ width: 520 }}>
      <DataTable headers={['Student', 'Subject', 'Today']}>
        {rows.map(([name, subject, today]) => (
          <TableRow key={name}>
            <TableCell className="px-4 py-3">{name}</TableCell>
            <TableCell className="px-4 py-3">{subject}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge
                variant={today === 'Present' ? 'success' : today === 'Late' ? 'warning' : 'danger'}
              >
                {today}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}

export function Loading() {
  return (
    <div style={{ width: 520 }}>
      <DataTable headers={['Student', 'Subject', 'Today']} isLoading />
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 520 }}>
      <DataTable headers={['Student', 'Subject', 'Today']} isEmpty />
    </div>
  );
}
