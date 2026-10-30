import LegalShell from '../../components/legal/LegalShell.jsx';
import { TERMS_SECTIONS } from '../../components/legal/legalContent.js';

export default function TermsPage() {
  return (
    <LegalShell
      titleKey="legal.terms.title"
      introKey="legal.terms.intro"
      sectionsKey="legal.terms.sections"
      sections={TERMS_SECTIONS}
    />
  );
}
