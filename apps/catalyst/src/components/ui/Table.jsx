import { cn } from '@/lib/utils';

export function Table({ className, ...props }) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export const TableHeader = (props) => <thead className="[&_tr]:border-b" {...props} />;
export const TableBody = (props) => <tbody className="[&_tr:last-child]:border-0" {...props} />;

export function TableRow({ className, ...props }) {
  return (
    <tr className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />
  );
}

export function TableHead({ className, ...props }) {
  return (
    <th
      scope="col"
      className={cn('h-10 px-3 text-left align-middle font-medium whitespace-nowrap', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
}
