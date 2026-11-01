import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Badge,
} from 'rooted';

export function ClassCard() {
  return (
    <Card style={{ width: 340 }}>
      <CardHeader>
        <CardTitle>Grade 5-A</CardTitle>
        <CardDescription>Mathematics · 32 students</CardDescription>
        <CardAction>
          <Badge variant="outline">Class teacher</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>Attendance is open for today's first period.</CardContent>
      <CardFooter style={{ gap: 8 }}>
        <Button size="sm">Attendance</Button>
        <Button size="sm" variant="outline">
          Grades
        </Button>
        <Button size="sm" variant="outline">
          Students
        </Button>
      </CardFooter>
    </Card>
  );
}

export function Simple() {
  return (
    <Card style={{ width: 340 }}>
      <CardHeader>
        <CardTitle>Set up your school</CardTitle>
        <CardDescription>3 of 7 steps done</CardDescription>
      </CardHeader>
    </Card>
  );
}
