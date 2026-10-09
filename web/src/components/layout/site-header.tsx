import Link from "next/link";

import { AiSettingsButton } from "@/components/ai/ai-settings-button";
import { MobileNav, NavLinks } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SITE } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-baseline gap-2"
          aria-label={`${SITE.name}, home`}
        >
          <span
            aria-hidden
            className="grid size-7 place-items-center self-center rounded-sm border border-rule font-serif text-[0.95rem] leading-none font-semibold italic"
          >
            C
          </span>
          <span className="font-serif text-[1.2rem] font-semibold tracking-tight">
            Campaign Text <span className="italic">Lab</span>
          </span>
        </Link>
        <nav aria-label="Main" className="ml-auto hidden lg:block">
          <NavLinks />
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-1">
          <AiSettingsButton />
          <ThemeToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
