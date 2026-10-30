import { cn } from '@/lib/utils';

const base =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50';

const variants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/95',
  outline: 'border-border bg-card hover:bg-muted',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-muted',
  destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
};

const sizes = {
  default: 'h-9 px-3',
  sm: 'h-8 px-2.5 text-[0.8rem]',
  lg: 'h-10 px-4',
};

export function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
