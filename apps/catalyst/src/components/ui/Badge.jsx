import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-muted text-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
};

/** A status chip. Always carries text, never colour alone. */
export function Badge({ variant = 'default', className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
