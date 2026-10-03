"use client";

import type { DailyCall } from "@daily-co/daily-js";
import { useDaily, useInputSettings } from "@daily-co/daily-react";
import { CheckIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Background effects for the call: none, three blur strengths, Bookly's bundled scenes, or a
 * picture the person uploads (jpg/png, kept in memory only). The choice is remembered per
 * browser (not the uploaded file) and restored on the next call; noise cancellation is on
 * unless switched off, and that choice is remembered the same way.
 */
export type Effect =
  | { type: "none" }
  | { type: "blur"; strength: number }
  | { type: "image"; id: string }
  | { type: "custom" };

export const BLUR_LEVELS = [
  { label: "Light", strength: 0.35 },
  { label: "Medium", strength: 0.65 },
  { label: "Strong", strength: 1 },
] as const;

export const BACKGROUNDS = [
  { id: "dusk", label: "Dusk" },
  { id: "forest", label: "Forest" },
  { id: "sand", label: "Sand" },
  { id: "slate", label: "Slate" },
] as const;

const EFFECT_KEY = "bookly:meet:effect";
const NOISE_KEY = "bookly:meet:noise";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage */
  }
};

export function loadEffect(): Effect {
  const raw = read(EFFECT_KEY);
  if (!raw) return { type: "none" };
  try {
    const e = JSON.parse(raw) as Effect;
    if (e.type === "blur" && typeof e.strength === "number") return e;
    if (e.type === "image" && BACKGROUNDS.some((b) => b.id === e.id)) return e;
  } catch {
    /* ignore */
  }
  return { type: "none" };
}

/** Custom pictures are not persisted (an ArrayBuffer has no place in localStorage). */
function saveEffect(effect: Effect) {
  write(EFFECT_KEY, effect.type === "custom" ? null : JSON.stringify(effect));
}

export function noiseCancellationWanted() {
  return read(NOISE_KEY) !== "off";
}
export function rememberNoiseCancellation(on: boolean) {
  write(NOISE_KEY, on ? null : "off");
}

async function imageBuffer(id: string) {
  const res = await fetch(`/backgrounds/${id}.jpg`);
  if (!res.ok) throw new Error(`background ${id}: ${res.status}`);
  return res.arrayBuffer();
}

/** Applies an effect to the local camera track; `custom` needs the picture's bytes. */
export async function applyEffect(call: DailyCall, effect: Effect, custom?: ArrayBuffer) {
  if (effect.type === "none")
    await call.updateInputSettings({ video: { processor: { type: "none" } } });
  else if (effect.type === "blur")
    await call.updateInputSettings({
      video: { processor: { type: "background-blur", config: { strength: effect.strength } } },
    });
  else {
    const source = effect.type === "image" ? await imageBuffer(effect.id) : custom;
    if (!source) return;
    await call.updateInputSettings({
      video: { processor: { type: "background-image", config: { source } } },
    });
  }
}

/** Restores the effect chosen last time, if any (called once the call is joined). */
export async function applySavedEffect(call: DailyCall) {
  const effect = loadEffect();
  if (effect.type === "none") return;
  try {
    await applyEffect(call, effect);
  } catch (e) {
    console.warn("[meet] background effect", e);
  }
}

function currentEffect(settings: ReturnType<typeof useInputSettings>["inputSettings"]): Effect {
  const p = settings?.video?.processor;
  if (!p || p.type === "none") return { type: "none" };
  if (p.type === "background-blur") return { type: "blur", strength: p.config?.strength ?? 1 };
  if (p.type === "background-image")
    return loadEffect().type === "image" ? loadEffect() : { type: "custom" };
  return { type: "none" };
}

function sameEffect(a: Effect, b: Effect) {
  return (
    a.type === b.type &&
    (a.type !== "blur" || Math.abs(a.strength - (b as { strength: number }).strength) < 0.01) &&
    (a.type !== "image" || a.id === (b as { id: string }).id)
  );
}

function Swatch({
  effect,
  label,
  selected,
  disabled,
  onPick,
  children,
}: {
  effect: Effect;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPick: (effect: Effect) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(effect)}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border text-xs transition-colors",
        selected ? "border-brand ring-2 ring-brand" : "border-border hover:border-foreground/40",
      )}
    >
      {children}
      {selected && (
        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-brand text-white">
          <CheckIcon className="size-3" />
        </span>
      )}
    </button>
  );
}

/** The picker: swatches for blur levels and scenes, plus an upload. */
export function EffectsPopover() {
  const call = useDaily();
  const { inputSettings } = useInputSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const current = currentEffect(inputSettings);

  const pick = async (effect: Effect, custom?: ArrayBuffer) => {
    if (!call) return;
    setBusy(true);
    setError(null);
    try {
      await applyEffect(call, effect, custom);
      saveEffect(effect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the effect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Blur</p>
        <div className="grid grid-cols-4 gap-2">
          <Swatch
            effect={{ type: "none" }}
            label="No effect"
            selected={sameEffect(current, { type: "none" })}
            disabled={busy}
            onPick={(e) => void pick(e)}
          >
            <span className="text-muted-foreground">None</span>
          </Swatch>
          {BLUR_LEVELS.map((b) => (
            <Swatch
              key={b.label}
              effect={{ type: "blur", strength: b.strength }}
              label={`${b.label} blur`}
              selected={sameEffect(current, { type: "blur", strength: b.strength })}
              disabled={busy}
              onPick={(e) => void pick(e)}
            >
              <span
                className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#9aa5b8,#1a1d24)]"
                style={{ filter: `blur(${2 + b.strength * 4}px)` }}
                aria-hidden
              />
              <span className="relative rounded bg-black/50 px-1 text-white">{b.label}</span>
            </Swatch>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Backgrounds</p>
        <div className="grid grid-cols-4 gap-2">
          {BACKGROUNDS.map((b) => (
            <Swatch
              key={b.id}
              effect={{ type: "image", id: b.id }}
              label={`${b.label} background`}
              selected={sameEffect(current, { type: "image", id: b.id })}
              disabled={busy}
              onPick={(e) => void pick(e)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/backgrounds/${b.id}.jpg`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="relative rounded bg-black/50 px-1 text-white">{b.label}</span>
            </Swatch>
          ))}
        </div>
      </div>
      <div>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 8 * 1024 * 1024) {
              setError("Pictures up to 8 MB.");
              return;
            }
            await pick({ type: "custom" }, await f.arrayBuffer());
          }}
        />
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={busy}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors hover:border-foreground/40",
            current.type === "custom" && "border-brand ring-2 ring-brand",
          )}
        >
          <UploadIcon className="size-3.5" />
          {current.type === "custom" ? "Your picture (choose another)" : "Use your own picture"}
        </button>
        <p className="mt-1 text-[11px] text-muted-foreground">
          JPG or PNG. Stays in this browser for this call only.
        </p>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
