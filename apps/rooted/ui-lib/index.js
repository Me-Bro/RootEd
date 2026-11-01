// Entry for the design-system build (vite.lib.config.js). Exports the shared UI primitives from
// src/components/ui so they ship as one library for Claude Design. The app itself never imports
// this file. ThemeConfigurator, LanguageSwitcher and sonner are left out: they are app chrome.
import './styles.css';

export * from '../src/components/ui/alert-dialog.jsx';
export * from '../src/components/ui/avatar.jsx';
export * from '../src/components/ui/Badge.jsx';
export * from '../src/components/ui/Button.jsx';
export * from '../src/components/ui/Card.jsx';
export { DataTable } from '../src/components/ui/DataTable.jsx';
export * from '../src/components/ui/dialog.jsx';
export * from '../src/components/ui/dropdown-menu.jsx';
export * from '../src/components/ui/EmptyState.jsx';
export * from '../src/components/ui/Input.jsx';
export * from '../src/components/ui/label.jsx';
export * from '../src/components/ui/LoginBadge.jsx';
export * from '../src/components/ui/PageHeader.jsx';
export * from '../src/components/ui/progress.jsx';
export * from '../src/components/ui/RecordList.jsx';
export * from '../src/components/ui/select.jsx';
export { SelectField } from '../src/components/ui/SelectField.jsx';
export * from '../src/components/ui/separator.jsx';
export * from '../src/components/ui/sheet.jsx';
export * from '../src/components/ui/skeleton.jsx';
export * from '../src/components/ui/table.jsx';
export * from '../src/components/ui/tabs.jsx';
export { RootEdProvider } from './provider.jsx';
