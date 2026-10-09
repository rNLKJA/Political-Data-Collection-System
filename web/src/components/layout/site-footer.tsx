import Link from "next/link";

import { APP_CITATION, NAV, SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/80 bg-card/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-serif text-lg font-semibold">Campaign Text Lab</p>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Source texts: {APP_CITATION} Copyright © The American Presidency Project. This site
            shows derived statistics and short quotations only, each linked to its source page.
          </p>
          <p className="text-sm text-muted-foreground">
            A personal project by Sunchuangyu (Rin) Huang. Collected 2025, revived 2026.
          </p>
        </div>
        <div>
          <p className="kicker mb-3">Reading room</p>
          <ul className="space-y-1.5 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-muted-foreground hover:text-foreground">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="kicker mb-3">Elsewhere</p>
          <ul className="space-y-1.5 text-sm">
            <li>
              <a href={SITE.repo} className="text-muted-foreground hover:text-foreground">
                Source code on GitHub
              </a>
            </li>
            <li>
              <a href={SITE.app} className="text-muted-foreground hover:text-foreground">
                The American Presidency Project
              </a>
            </li>
            <li>
              <Link href="/#about" className="text-muted-foreground hover:text-foreground">
                About this project
              </Link>
            </li>
            <li>
              <Link href="/ai-log" className="text-muted-foreground hover:text-foreground">
                AI audit log (this browser)
              </Link>
            </li>
            <li>
              <Link
                href="/methods#decisions"
                className="text-muted-foreground hover:text-foreground"
              >
                Decision records
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
