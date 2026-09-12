import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog.jsx';
import LoginForm from './LoginForm.jsx';

/** Sign-in dialog shared by every page that opens it from a "Log in" CTA. */
export default function LoginDialog({ open, onOpenChange }) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('auth.signIn')}</DialogTitle>
          <DialogDescription>{t('auth.enterCredentials')}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every open is a fresh form — a failed
            attempt's error/values don't linger if the dialog is closed and
            reopened without submitting. */}
        {open && <LoginForm />}
      </DialogContent>
    </Dialog>
  );
}
