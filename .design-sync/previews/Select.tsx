import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'rooted';

export function Term() {
  return (
    <Select
      defaultValue="t1"
      items={[
        { value: 't1', label: 'Term 1' },
        { value: 't2', label: 'Term 2' },
      ]}
    >
      <SelectTrigger style={{ width: 200 }}>
        <SelectValue placeholder="Term" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="t1">Term 1</SelectItem>
        <SelectItem value="t2">Term 2</SelectItem>
      </SelectContent>
    </Select>
  );
}
