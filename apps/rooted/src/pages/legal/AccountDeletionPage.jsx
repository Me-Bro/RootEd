import LegalShell from '../../components/legal/LegalShell.jsx';
import { DELETION_SECTIONS } from '../../components/legal/legalContent.js';

/**
 * The public "data deletion" URL submitted to Play Console. It has to work for
 * somebody who cannot sign in at all, which is why it documents the email route
 * alongside the in-app one.
 */
export default function AccountDeletionPage() {
  return (
    <LegalShell
      titleKey="legal.accountDeletion.title"
      introKey="legal.accountDeletion.intro"
      sectionsKey="legal.accountDeletion.sections"
      sections={DELETION_SECTIONS}
    />
  );
}
