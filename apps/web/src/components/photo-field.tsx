"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent } from "react";
import { RotateCwIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type PhotoResult = { ok?: boolean; url?: string; error?: string };

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_SIDE = 128;
/** The crop circle on screen and the square that is uploaded. */
const STAGE = 256;
const OUT = 512;

type Crop = { zoom: number; turn: number; x: number; y: number };

/**
 * A person's photo (planning/v2/ux/solutions-and-navigation.md §5.3): the picture or initials,
 * **Upload photo** (or drop a file on the circle) and **Remove photo**. Choosing a file opens a
 * circular crop: drag to move, zoom 1–4×, rotate a quarter turn, arrows / + / − / R on the
 * keyboard, with 44 px and 128 px previews. The browser crops it to a 512 × 512 JPEG, so the
 * server only ever receives the square (orientation applied, no metadata). Without uploads the
 * field is an image address instead.
 */
export function PhotoField({
  name,
  initial,
  uploads,
  upload,
  remove,
  setUrl,
}: {
  /** For the initials and the dialog's accessible name. */
  name: string;
  initial: string | null;
  uploads: boolean;
  upload: (form: FormData) => Promise<PhotoResult>;
  remove: () => Promise<PhotoResult>;
  setUrl: (form: FormData) => Promise<PhotoResult>;
}) {
  const [current, setCurrent] = useState(initial ?? "");
  const [source, setSource] = useState<{ url: string; w: number; h: number; name: string } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const done = (r: PhotoResult, ok: string) => {
    if (r.error) toast.error(r.error);
    else {
      setCurrent(r.url ?? "");
      toast.success(ok);
    }
  };

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type))
      return void toast.error("Use a JPEG, PNG, WebP or HEIC picture.");
    if (file.size > MAX_BYTES)
      return void toast.error("This file is over 10 MB. Choose a smaller picture.");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (Math.min(img.naturalWidth, img.naturalHeight) < MIN_SIDE) {
        URL.revokeObjectURL(url);
        toast.error("This picture is too small. Use one at least 128 × 128 pixels.");
        return;
      }
      setSource({ url, w: img.naturalWidth, h: img.naturalHeight, name: file.name });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error(
        file.type.includes("hei")
          ? "This browser can't open HEIC pictures. Use a JPEG or PNG."
          : "That picture couldn't be opened. Try exporting it again as JPEG or PNG.",
      );
    };
    img.src = url;
  };

  const close = () => {
    if (source) URL.revokeObjectURL(source.url);
    setSource(null);
    if (picker.current) picker.current.value = "";
  };

  const avatar = (
    <Avatar size="xl" aria-hidden>
      {current && <AvatarImage src={current} alt="" />}
      <AvatarFallback>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );

  if (!uploads)
    return (
      <form
        className="flex flex-wrap items-center gap-4"
        action={(f) => start(async () => done(await setUrl(f), "Photo saved"))}
      >
        {avatar}
        <div className="flex min-w-0 flex-1 gap-2">
          <Input
            name="url"
            type="url"
            defaultValue={current}
            placeholder="https://…"
            aria-label="Image address"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            Save
          </Button>
        </div>
      </form>
    );

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
      >
        {avatar}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => picker.current?.click()}
          >
            <UploadIcon data-icon="inline-start" />
            Upload photo
          </Button>
          {current && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => start(async () => done(await remove(), "Photo removed"))}
            >
              <Trash2Icon data-icon="inline-start" />
              Remove photo
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">JPEG, PNG, WebP or HEIC, up to 10 MB.</p>
        <input
          ref={picker}
          type="file"
          accept={TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </div>
      <Dialog open={!!source} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
            <DialogDescription>
              Drag to move it in the circle. Arrows, + and − work too.
            </DialogDescription>
          </DialogHeader>
          {source && (
            <Cropper
              source={source}
              pending={pending}
              onCancel={close}
              onSave={(blob) =>
                start(async () => {
                  const form = new FormData();
                  form.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
                  const r = await upload(form);
                  done(r, "Photo updated");
                  if (!r.error) close();
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** How the picture sits in a square of side `size`, for the stage, the previews and the export. */
function placement(src: { w: number; h: number }, c: Crop, size: number) {
  const sideways = c.turn % 2 === 1;
  const w = sideways ? src.h : src.w;
  const h = sideways ? src.w : src.h;
  // At zoom 1 the picture covers the square exactly along its shorter side.
  const scale = (size / Math.min(w, h)) * c.zoom;
  return { scale, k: size / STAGE, shown: { w: w * scale, h: h * scale } };
}

/** Keeps the picture covering the circle: the offset never shows an empty edge. */
function clamp(src: { w: number; h: number }, c: Crop): Crop {
  const { shown } = placement(src, c, STAGE);
  const mx = Math.max(0, (shown.w - STAGE) / 2);
  const my = Math.max(0, (shown.h - STAGE) / 2);
  return { ...c, x: Math.min(mx, Math.max(-mx, c.x)), y: Math.min(my, Math.max(-my, c.y)) };
}

function Cropper({
  source,
  pending,
  onCancel,
  onSave,
}: {
  source: { url: string; w: number; h: number };
  pending: boolean;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState<Crop>({ zoom: 1, turn: 0, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const img = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const i = new Image();
    i.src = source.url;
    img.current = i;
  }, [source.url]);
  const set = (next: Partial<Crop>) => setCrop((c) => clamp(source, { ...c, ...next }));

  const view = (size: number) => {
    const { scale, k } = placement(source, crop, size);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.url}
        alt=""
        draggable={false}
        className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
        style={{
          width: source.w,
          height: source.h,
          transform: `translate(-50%, -50%) translate(${crop.x * k}px, ${crop.y * k}px) rotate(${crop.turn * 90}deg) scale(${scale})`,
        }}
      />
    );
  };

  const save = () => {
    const i = img.current;
    if (!i) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d")!;
    const { scale, k } = placement(source, crop, OUT);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.translate(OUT / 2 + crop.x * k, OUT / 2 + crop.y * k);
    ctx.rotate((crop.turn * Math.PI) / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(i, -source.w / 2, -source.h / 2);
    canvas.toBlob((b) => b && onSave(b), "image/jpeg", 0.9);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-center gap-5">
        <div
          role="application"
          aria-label={`Photo crop, zoom ${crop.zoom.toFixed(1)} times`}
          tabIndex={0}
          className="relative size-64 cursor-grab touch-none overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) set({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py });
          }}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 16 : 4;
            const keys: Record<string, () => void> = {
              ArrowLeft: () => set({ x: crop.x - step }),
              ArrowRight: () => set({ x: crop.x + step }),
              ArrowUp: () => set({ y: crop.y - step }),
              ArrowDown: () => set({ y: crop.y + step }),
              "+": () => set({ zoom: Math.min(4, crop.zoom + 0.1) }),
              "=": () => set({ zoom: Math.min(4, crop.zoom + 0.1) }),
              "-": () => set({ zoom: Math.max(1, crop.zoom - 0.1) }),
              r: () => set({ turn: (crop.turn + 1) % 4 }),
              R: () => set({ turn: (crop.turn + 1) % 4 }),
            };
            const run = keys[e.key];
            if (run) {
              e.preventDefault();
              run();
            }
          }}
        >
          {view(STAGE)}
          {/* The circle: everything outside it is dimmed. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_200px_rgb(0_0_0/0.45)] ring-2 ring-white"
          />
        </div>
        <div className="flex items-end gap-3" aria-hidden>
          {[128, 44].map((s) => (
            <span
              key={s}
              className="relative shrink-0 overflow-hidden rounded-full border bg-muted"
              style={{ width: s, height: s }}
            >
              {view(s)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="photo-zoom" className="text-sm font-medium">
          Zoom
        </label>
        <input
          id="photo-zoom"
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={crop.zoom}
          onChange={(e) => set({ zoom: Number(e.target.value) })}
          className="min-w-0 flex-1 accent-primary"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Rotate a quarter turn"
          onClick={() => set({ turn: (crop.turn + 1) % 4 })}
        >
          <RotateCwIcon />
        </Button>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}
