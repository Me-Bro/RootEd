import { ArrowUpDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../ui/dropdown-menu.jsx';

const OPTIONS = [
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'admissionNo', label: 'Admission no.' },
  { key: 'attendancePct', label: 'Attendance % (low→high)' },
];

export default function SortMenu({ value, onChange }) {
  const current = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
        <ArrowUpDown size={12} />
        {current.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.key} value={o.key}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
