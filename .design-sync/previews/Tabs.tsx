import { Tabs, TabsContent, TabsList, TabsTrigger } from 'rooted';

export function Default() {
  return (
    <Tabs defaultValue="attendance" className="flex-col" style={{ width: 380 }}>
      <TabsList>
        <TabsTrigger value="attendance">Attendance</TabsTrigger>
        <TabsTrigger value="grades">Grades</TabsTrigger>
        <TabsTrigger value="fees">Fees</TabsTrigger>
      </TabsList>
      <TabsContent value="attendance">Present 29 of 32 students today.</TabsContent>
      <TabsContent value="grades">Term 1 marks are published.</TabsContent>
      <TabsContent value="fees">2 fees overdue.</TabsContent>
    </Tabs>
  );
}
