import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from 'rooted';

export function SectionPicker() {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Choose section
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>My classes</DropdownMenuLabel>
          <DropdownMenuItem>Grade 5-A</DropdownMenuItem>
          <DropdownMenuItem>Grade 5-B</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Other classes</DropdownMenuLabel>
          <DropdownMenuItem>Grade 6-A</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
