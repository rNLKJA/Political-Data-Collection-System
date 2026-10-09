import Link from "next/link";

import { NAV } from "@/lib/site";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <p className="kicker">Error 404 · not in the catalogue</p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">
        This page was never filed.
      </h1>
      <p className="mt-4 text-muted-foreground">
        The address may be mistyped, or the page may have moved. These shelves are open:
      </p>
      <ul className="mt-8 divide-y divide-border border-y border-border">
        <li>
          <Link href="/" className="block py-3 font-serif text-lg hover:underline">
            Home
          </Link>
        </li>
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className="block py-3 hover:underline">
              <span className="font-serif text-lg">{n.label}</span>
              <span className="block text-sm text-muted-foreground">{n.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
