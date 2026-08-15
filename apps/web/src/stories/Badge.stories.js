import { Badge } from '../components/ui/Badge.jsx';

export default { title: 'UI/Badge', component: Badge };

export const Success = { args: { children: 'Active', variant: 'success' } };
export const Warning = { args: { children: 'Suspended', variant: 'warning' } };
export const Danger = { args: { children: 'Archived', variant: 'danger' } };
