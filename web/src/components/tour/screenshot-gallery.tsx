"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface GalleryItem {
  file: string;
  title: string;
  caption: string;
  src: string;
  width: number;
  height: number;
  mobile: boolean;
}

/**
 * Screenshots as a grid of thumbnails; selecting one opens it full size in a
 * native modal <dialog> (focus is trapped, Escape closes it, arrow keys step
 * through the set).
 */
export function ScreenshotGallery({ items }: { items: GalleryItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const desktop = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.mobile);
  const phones = items.map((it, i) => ({ it, i })).filter(({ it }) => it.mobile);
  const current = open === null ? null : items[open];

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  const step = (delta: number) =>
    setOpen((k) => (k === null ? k : (k + delta + items.length) % items.length));

  const thumb = ({ it, i }: { it: GalleryItem; i: number }) => (
    <li key={it.file}>
      <button
        type="button"
        onClick={() => setOpen(i)}
        className="group block w-full rounded-lg text-left"
        aria-label={`${it.title}: open full size`}
      >
        <span
          className={cn(
            "block overflow-hidden rounded-md border border-border bg-muted transition-colors group-hover:border-primary/50",
            it.mobile ? "aspect-[390/844]" : "aspect-[1440/900]",
          )}
        >
          <Image
            src={it.src}
            alt=""
            width={it.width}
            height={it.height}
            sizes={
              it.mobile
                ? "(min-width: 1024px) 220px, (min-width: 640px) 30vw, 45vw"
                : "(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            }
            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.015]"
          />
        </span>
        <span className="mt-2 block text-sm font-medium">{it.title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {it.caption}
        </span>
      </button>
    </li>
  );

  return (
    <>
      <ul className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">{desktop.map(thumb)}</ul>
      {phones.length ? (
        <>
          <p className="kicker mt-10">On a phone (390 px)</p>
          <ul className="mt-3 grid max-w-3xl grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3">
            {phones.map(thumb)}
          </ul>
        </>
      ) : null}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        className="fixed inset-0 m-auto h-fit max-h-[94dvh] w-[min(80rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-xl backdrop:bg-black/60"
      >
        {current ? (
          <figure className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3 px-1 pb-3">
              <figcaption>
                <span id={titleId} className="font-serif text-lg font-medium">
                  {current.title}
                </span>
                <span className="block text-sm text-muted-foreground">{current.caption}</span>
              </figcaption>
              <div className="flex shrink-0 items-center gap-1">
                <span className="tabular mr-1 font-mono text-xs text-muted-foreground">
                  {(open ?? 0) + 1} / {items.length}
                </span>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous screenshot"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next screenshot"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  aria-label="Close"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </div>
            <Image
              key={current.src}
              src={current.src}
              alt={`${current.title}. ${current.caption}`}
              width={current.width}
              height={current.height}
              sizes="(min-width: 1280px) 1280px, 100vw"
              className={cn(
                "mx-auto h-auto max-h-[80dvh] w-auto rounded-md border border-border",
                current.mobile ? "max-w-[min(100%,26rem)]" : "max-w-full",
              )}
            />
          </figure>
        ) : null}
      </dialog>
    </>
  );
}
