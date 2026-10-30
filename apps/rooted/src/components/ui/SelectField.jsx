import { Children } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export { SelectItem };

export function SelectField({
  label,
  ariaLabel,
  id,
  value,
  onValueChange,
  placeholder,
  className,
  children,
  disabled,
}) {
  const { t } = useTranslation();
  const fieldId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  // Base UI shows the raw value in the closed trigger unless the root knows value -> label.
  // ponytail: assumes each SelectItem has plain text children; pass a string label if not.
  const items = Children.toArray(children)
    .filter((c) => c?.props && 'value' in c.props)
    .map((c) => ({ value: c.props.value, label: Children.toArray(c.props.children).join('') }));

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <Select value={value} onValueChange={onValueChange} disabled={disabled} items={items}>
        <SelectTrigger id={fieldId} aria-label={ariaLabel ?? label} className="w-full h-9">
          <SelectValue placeholder={placeholder ?? t('common.selectPlaceholder')} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}
