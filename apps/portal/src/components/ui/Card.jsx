import { cn } from '@/lib/utils';

export function Card({ className, ...props }) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-card text-card-foreground', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />;
}

export function CardTitle({ className, as: Tag = 'h2', ...props }) {
  return <Tag className={cn('text-base leading-snug font-semibold', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-4 pt-2', className)} {...props} />;
}
