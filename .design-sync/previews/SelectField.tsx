import { SelectField, SelectItem } from 'rooted';

export function Teacher() {
  return (
    <div style={{ width: 300 }}>
      <SelectField label="Teacher" value="alice" placeholder="Choose a teacher…">
        <SelectItem value="alice">Alice Kumar</SelectItem>
        <SelectItem value="bob">Bob Iyer</SelectItem>
        <SelectItem value="carol">Carol Das (no login yet)</SelectItem>
      </SelectField>
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 300 }}>
      <SelectField label="Section" placeholder="Choose a section…">
        <SelectItem value="a">Grade 5-A</SelectItem>
        <SelectItem value="b">Grade 5-B</SelectItem>
      </SelectField>
    </div>
  );
}
