import { cn } from "@/lib/utils";

export function PageIntro({
  kicker,
  title,
  children,
  className,
}: {
  kicker: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mx-auto max-w-6xl px-4 pt-12 pb-8 sm:px-6 sm:pt-16", className)}>
      <p className="kicker">{kicker}</p>
      <h1 className="mt-3 max-w-3xl text-[2.25rem] leading-[1.08] font-medium tracking-tight sm:text-5xl">
        {title}
      </h1>
      {children ? (
        <div className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
    </header>
  );
}

export function Section({
  id,
  kicker,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  kicker?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("mx-auto max-w-6xl px-4 sm:px-6", className)}>
      <div className="double-rule pt-5">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h2 id={headingId} className="mt-1.5 text-2xl font-medium tracking-tight sm:text-[1.75rem]">
          {title}
        </h2>
        {description ? (
          <div className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 shadow-[0_1px_0_rgb(0_0_0/0.03)] sm:p-5", className)}>
      {children}
    </div>
  );
}
