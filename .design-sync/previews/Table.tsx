import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'rooted';

export function Roster() {
  return (
    <div style={{ width: 460 }}>
      <Table>
        <TableCaption>Grade 5-A roster</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Roll</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>1</TableCell>
            <TableCell>Heena Malhotra</TableCell>
            <TableCell>Late</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>2</TableCell>
            <TableCell>Chetan Shetty</TableCell>
            <TableCell>Absent</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>3</TableCell>
            <TableCell>Anita Sharma</TableCell>
            <TableCell>Present</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
