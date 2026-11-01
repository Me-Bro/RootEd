import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from 'rooted';

export function NewSubject() {
  return (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add subject</DialogTitle>
          <DialogDescription>Choose a class, or leave it for all classes.</DialogDescription>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Name" defaultValue="Mathematics" />
          <Input label="Code" defaultValue="MATH5" />
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
