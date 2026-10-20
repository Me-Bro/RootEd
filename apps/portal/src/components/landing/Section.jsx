import { cn } from '@/lib/utils';

/** A landing section: anchor id, heading, optional lead paragraph, then its content. */
export function Section({ id, title, lead, tone, className, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-4', tone === 'muted' && 'bg-muted/50')}
    >
      <div className={cn('mx-auto max-w-6xl px-4 py-14', className)}>
        <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {lead && <p className="mt-3 max-w-3xl text-base text-muted-foreground">{lead}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
