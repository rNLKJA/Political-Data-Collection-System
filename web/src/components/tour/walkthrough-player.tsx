"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { clockTime } from "@/lib/showcase";
import { cn } from "@/lib/utils";

export interface PlayerStep {
  step: number;
  text: string;
  atS: number;
}

/**
 * One recorded walkthrough with its steps as a clickable transcript. Videos
 * start with preload="none" (only the poster loads) and switch to
 * preload="metadata" when the player comes near the viewport, so the page
 * never fetches three videos on load.
 */
export function WalkthroughPlayer({
  title,
  src,
  poster,
  captions,
  width,
  height,
  steps,
}: {
  title: string;
  src: string;
  poster: string;
  captions: string;
  width: number;
  height: number;
  steps: PlayerStep[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const [near, setNear] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const seek = (v: HTMLVideoElement, t: number) => {
    v.currentTime = t;
    void v.play().catch(() => {
      // autoplay refused: the frame is shown and the visitor can press play
    });
  };

  const playFrom = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (v.readyState >= 1) seek(v, t);
    else {
      // Not loaded yet: playing starts the load, and the seek waits for the metadata.
      pendingSeek.current = t;
      setNear(true);
      void v.play().catch(() => {
        // refused: the seek still happens once the metadata arrives
      });
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <div>
        <video
          ref={videoRef}
          controls
          muted
          playsInline
          preload={near ? "metadata" : "none"}
          poster={poster}
          width={width}
          height={height}
          aria-label={`Walkthrough video: ${title}`}
          onLoadedMetadata={(e) => {
            if (pendingSeek.current === null) return;
            const t = pendingSeek.current;
            pendingSeek.current = null;
            seek(e.currentTarget, t);
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            let k: number | null = null;
            for (let i = 0; i < steps.length; i++) if (steps[i].atS <= t + 0.05) k = i;
            setActive(k);
          }}
          className="aspect-[8/5] h-auto w-full rounded-md border border-border bg-muted"
        >
          <source src={src} type="video/mp4" />
          <track kind="captions" src={captions} srcLang="en" label="Step captions" />
          <p>
            Your browser cannot play this video.{" "}
            <a href={src} className="inline-link">
              Download the MP4
            </a>
            .
          </p>
        </video>
        <p className="mt-2 text-xs text-muted-foreground">
          Muted, no sound track; captions are shown in the video and listed beside it.{" "}
          <a href={src} className="inline-link">
            MP4<span className="sr-only"> of {title}</span>
          </a>{" "}
          ·{" "}
          <a href={captions} className="inline-link">
            WebVTT captions<span className="sr-only"> for {title}</span>
          </a>
        </p>
      </div>
      <div>
        <p className="kicker">Steps</p>
        <ol aria-label={`Steps in ${title}`} className="mt-2 space-y-1">
          {steps.map((s, i) => (
            <li key={s.step} aria-current={active === i ? "step" : undefined}>
              <button
                type="button"
                onClick={() => playFrom(s.atS)}
                className={cn(
                  "group grid w-full grid-cols-[auto_1fr] gap-x-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  active === i && "bg-secondary",
                )}
              >
                <span className="tabular mt-px inline-flex items-center gap-1 font-mono text-[0.72rem] text-muted-foreground">
                  <Play aria-hidden className="size-3 opacity-60 group-hover:opacity-100" />
                  {clockTime(s.atS)}
                </span>
                <span>
                  <span className="sr-only">Play from step {s.step}: </span>
                  {s.text}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
