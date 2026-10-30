import LegalShell from '../../components/legal/LegalShell.jsx';
import { PRIVACY_SECTIONS } from '../../components/legal/legalContent.js';

export default function PrivacyPolicyPage() {
  return (
    <LegalShell
      titleKey="legal.privacy.title"
      introKey="legal.privacy.intro"
      sectionsKey="legal.privacy.sections"
      sections={PRIVACY_SECTIONS}
    />
  );
}
