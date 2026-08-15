import { Input } from '../components/ui/Input.jsx';

export default { title: 'UI/Input', component: Input };

export const Default = { args: { label: 'Email', placeholder: 'you@example.com' } };
export const WithError = { args: { label: 'Email', error: 'Invalid email address', placeholder: 'you@example.com' } };
