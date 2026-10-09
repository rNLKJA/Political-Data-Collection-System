"use client";

import { Eye, EyeOff, KeyRound, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import {
  ANTHROPIC_MODELS,
  DEFAULT_OPENAI_MODEL,
  PROVIDERS,
  type ProviderId,
} from "@/lib/ai/providers";
import { isPlausibleModelId, maskKey, type AiSettings } from "@/lib/ai/settings";
import { aiSettingsStore } from "@/lib/ai/settings-store";
import { cn } from "@/lib/utils";

/** A native modal <dialog>: focus is trapped and Escape closes it. */
export function AiSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // a click on the backdrop (the dialog element itself) closes it
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto h-fit max-h-[90dvh] w-[min(34rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-xl backdrop:bg-black/45"
    >
      {open ? <SettingsForm titleId={titleId} onDone={onClose} /> : null}
    </dialog>
  );
}

/** Mounted each time the dialog opens, so the draft starts from the saved settings. */
function SettingsForm({ titleId, onDone }: { titleId: string; onDone: () => void }) {
  const saved = useSyncExternalStore(
    aiSettingsStore.subscribe,
    aiSettingsStore.getSnapshot,
    aiSettingsStore.getServerSnapshot,
  );
  const [draft, setDraft] = useState<AiSettings>(saved);
  const [reveal, setReveal] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const id = useId();
  const provider = draft.provider;
  const p = PROVIDERS[provider];
  const key = draft.keys[provider];
  const storedAny = saved.keys.anthropic !== "" || saved.keys.openai !== "";
  const modelOk = provider === "anthropic" || isPlausibleModelId(draft.openaiModel.trim());
  const setKey = (value: string) =>
    setDraft((d) => ({ ...d, keys: { ...d.keys, [d.provider]: value } }));

  return (
    <form
      className="grid gap-5 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!modelOk) return;
        aiSettingsStore.save({ ...draft, openaiModel: draft.openaiModel.trim() });
        onDone();
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="flex items-center gap-2 font-serif text-xl font-medium">
            <KeyRound aria-hidden className="size-5 text-muted-foreground" /> AI settings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional. The AI features use your own API key; everything else on the site works
            without one.
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close AI settings"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <fieldset>
        <legend className="kicker mb-2">Provider</legend>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-card p-1">
          {(["anthropic", "openai"] as const).map((value: ProviderId) => (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded px-3 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
                provider === value
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name={`${id}-provider`}
                value={value}
                checked={provider === value}
                onChange={() => {
                  setDraft((d) => ({ ...d, provider: value }));
                  setReveal(false);
                }}
                className="sr-only"
              />
              {PROVIDERS[value].label}
              {value === "anthropic" ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">default</span>
              ) : null}
            </label>
          ))}
        </div>
      </fieldset>

      {provider === "anthropic" ? (
        <fieldset>
          <legend className="kicker mb-2">Model</legend>
          <div className="space-y-1.5">
            {ANTHROPIC_MODELS.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
                  draft.anthropicModel === m.id
                    ? "border-primary/50 bg-secondary/60"
                    : "border-border hover:border-foreground/25",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-model`}
                  value={m.id}
                  checked={draft.anthropicModel === m.id}
                  onChange={() => setDraft((d) => ({ ...d, anthropicModel: m.id }))}
                  className="mt-1 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{m.label}</span>
                    {m.pricing ? (
                      <span className="tabular font-mono text-xs text-muted-foreground">
                        ${m.pricing.input} / ${m.pricing.output} per M tokens
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    <code className="font-mono">{m.id}</code> · {m.note}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-openai-model`} className="kicker">
            Model id
          </label>
          <input
            id={`${id}-openai-model`}
            value={draft.openaiModel}
            onChange={(e) => setDraft((d) => ({ ...d, openaiModel: e.target.value }))}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!modelOk}
            aria-describedby={`${id}-openai-help`}
            className={cn(controlClass, "font-mono aria-invalid:border-destructive")}
          />
          <p id={`${id}-openai-help`} className="text-xs text-muted-foreground">
            Any Chat Completions model that supports JSON-schema output. Default{" "}
            <code className="font-mono">{DEFAULT_OPENAI_MODEL}</code>.
            {!modelOk ? " That does not look like a model id." : null}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${id}-key`} className="kicker">
          Your {p.label} API key
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-key`}
            type={reveal ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={p.keyHint}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-1p-ignore
            data-lpignore="true"
            aria-describedby={`${id}-key-help`}
            className={cn(controlClass, "font-mono")}
          />
          <Button
            size="icon"
            className="size-10"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide key" : "Show key"}
            aria-pressed={reveal}
          >
            {reveal ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        </div>
        <p id={`${id}-key-help`} className="text-xs text-muted-foreground">
          {saved.keys[provider]
            ? `Saved key: ${maskKey(saved.keys[provider])}. `
            : "No key saved for this provider. "}
          Create one at{" "}
          <a href={p.keysUrl} target="_blank" rel="noreferrer" className="inline-link">
            {new URL(p.keysUrl).host}
          </a>
          ; a key with a low spending limit is a good idea.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={draft.remember}
          onChange={(e) => setDraft((d) => ({ ...d, remember: e.target.checked }))}
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium">Remember on this device</span>
          <span className="block text-xs text-muted-foreground">
            Off: the key is kept for this tab only (sessionStorage) and is gone when you close it.
            On: it stays in this browser&rsquo;s localStorage until you forget it.
          </span>
        </span>
      </label>

      <div className="flex gap-2.5 rounded-md border border-border bg-secondary/50 p-3 text-xs leading-relaxed">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Your key never reaches this site.</span>{" "}
          Requests go straight from your browser to{" "}
          <span className="font-mono text-foreground">{p.host}</span>. The key is not sent to this
          site&rsquo;s server, not logged and not written to the{" "}
          <Link href="/ai-log" onClick={onDone} className="inline-link">
            AI audit log
          </Link>
          . Read{" "}
          <Link href="/methods#ai-use" onClick={onDone} className="inline-link">
            how AI is used here
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {storedAny ? (
          <Button
            variant="destructive"
            onClick={() => {
              if (!confirmForget) {
                setConfirmForget(true);
                return;
              }
              aiSettingsStore.forget();
              setDraft((d) => ({ ...d, keys: { anthropic: "", openai: "" } }));
              setConfirmForget(false);
            }}
            onBlur={() => setConfirmForget(false)}
          >
            {confirmForget ? "Select again to forget all keys" : "Forget key"}
          </Button>
        ) : (
          <span aria-hidden />
        )}
        <div className="flex gap-2">
          <Button onClick={onDone} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!modelOk}
            className="flex-1 sm:flex-none"
          >
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
