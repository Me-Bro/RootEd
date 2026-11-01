import { Button, PageHeader } from 'rooted';

export function WithAction() {
  return (
    <div style={{ width: 680 }}>
      <PageHeader
        title="Subjects"
        description="The subjects your school teaches."
        action={<Button>Add subject</Button>}
      />
    </div>
  );
}

export function WithBackLink() {
  return (
    <div style={{ width: 680 }}>
      <PageHeader
        title="Anita Sharma"
        description="Grade 5-A · Roll 3"
        backTo="/academic/students"
        backLabel="Back to students"
      />
    </div>
  );
}
