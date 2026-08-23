import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SearchField({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <SearchIcon
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('academic.shared.searchPlaceholder')}
        className="h-9 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}
