import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from 'rooted';

export function SideSheet() {
  return (
    <Sheet defaultOpen>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Help</SheetTitle>
          <SheetDescription>Steps for common tasks.</SheetDescription>
        </SheetHeader>
        <div style={{ padding: '0 16px' }}>
          <p style={{ fontWeight: 500 }}>Take attendance</p>
          <ol style={{ paddingLeft: 18, marginTop: 6, listStyle: 'decimal' }}>
            <li>Open Attendance.</li>
            <li>Choose the class and the date.</li>
            <li>Mark each student Present or Absent.</li>
          </ol>
        </div>
        <SheetFooter>
          <Button variant="outline">Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
