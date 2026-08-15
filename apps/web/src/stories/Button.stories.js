import { Button } from '../components/ui/Button.jsx';

export default { title: 'UI/Button', component: Button };

export const Default = { args: { children: 'Click me', variant: 'default' } };
export const Destructive = { args: { children: 'Delete', variant: 'destructive' } };
export const Outline = { args: { children: 'Cancel', variant: 'outline' } };
export const Ghost = { args: { children: 'Settings', variant: 'ghost' } };
