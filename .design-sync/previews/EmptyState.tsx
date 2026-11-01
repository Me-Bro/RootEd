import { Button, EmptyState } from 'rooted';

export function NoSubjects() {
  return (
    <EmptyState
      title="No subjects yet"
      description="Add the first subject to start assigning teachers."
      action={<Button size="sm">Add subject</Button>}
    />
  );
}

export function Plain() {
  return <EmptyState />;
}
