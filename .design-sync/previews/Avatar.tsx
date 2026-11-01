import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from 'rooted';

export function Sizes() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar size="sm">
        <AvatarFallback>CS</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>HM</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>AS</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function Group() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>C</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>H</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>A</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+12</AvatarGroupCount>
    </AvatarGroup>
  );
}
