// Renders the SVGs in brand/ (written by build.py) into every raster the product uses: the PNG
// exports, the app and notification icons, the favicon, and the press kit on /press.
// Usage, from the repository root: node brand/source/render.mjs
import { createRequire } from "node:module";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// sharp is a dependency of the web app; reuse it rather than adding one here.
const sharp = createRequire(path.join(root, "apps/web/package.json"))("sharp");

const brand = path.join(root, "brand");
const web = path.join(root, "apps/web");
const press = path.join(web, "public/press");
const PAPER = "#FAF8F4";
const INK = "#1C1C1C";
const NIGHT = "#121110";

const svg = (name) => path.join(brand, `${name}.svg`);
const raster = (name) => sharp(svg(name), { density: 1200 });

async function png(name, width, out, background) {
  let img = raster(name).resize({ width });
  if (background) img = img.flatten({ background });
  await img.png({ compressionLevel: 9 }).toFile(out);
  return out;
}

/** A 1200×320 banner: the lockup centred with even padding (receipts, Stripe Connect). */
async function banner(name, out, background) {
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const bg = background ?? transparent;
  let img = raster(name).resize({ width: 1000, height: 220, fit: "contain", background: bg });
  if (background) img = img.flatten({ background });
  const buf = await img
    .extend({ top: 50, bottom: 50, left: 100, right: 100, background: bg })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(out, buf);
}

/** favicon.ico holding PNG images (supported by every current browser). */
async function ico(name, sizes, out) {
  const images = await Promise.all(
    sizes.map((s) => raster(name).resize({ width: s }).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(sizes[i] % 256, e);
    header.writeUInt8(sizes[i] % 256, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += img.length;
  });
  await writeFile(out, Buffer.concat([header, ...images]));
}

/** A stored (uncompressed) zip: PNGs and SVGs barely compress, and this needs no dependency. */
async function zip(entries, out) {
  // Fixed timestamp so the kit only changes when its files do.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (10 << 5) | 24;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += local.length + n.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(out, Buffer.concat([...locals, dir, end]));
}

const names = (await readdir(brand)).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4));
const width = (name) =>
  name.includes("logo-stacked") ? 1600 : name.includes("logo") ? 2400 : 1024;

// 1. PNG exports of every lockup, transparent unless the SVG draws its own background.
await mkdir(path.join(brand, "png"), { recursive: true });
for (const name of names) await png(name, width(name), path.join(brand, "png", `${name}.png`));

// 2. The fixed-size files other systems point at (Stripe Connect, receipts, README).
await png("bookly-icon", 512, path.join(brand, "bookly-icon-light.png"), "#FFFFFF");
await png("bookly-icon", 512, path.join(brand, "bookly-icon-dark.png"), NIGHT);
await banner("bookly-logo", path.join(brand, "bookly-logo-light.png"), "#FFFFFF");
await banner("bookly-logo-on-ink", path.join(brand, "bookly-logo-dark.png"), INK);
await banner("bookly-logo", path.join(brand, "bookly-logo-transparent.png"));

// 3. The app: favicon, touch icon, PWA and notification icons, email logo.
await copyFile(svg("bookly-icon"), path.join(web, "src/app/icon.svg"));
await ico("bookly-icon", [16, 32, 48], path.join(web, "src/app/favicon.ico"));
await png("bookly-icon-square", 180, path.join(web, "src/app/apple-icon.png"));
await png("bookly-icon", 512, path.join(web, "public/logo-mark.png"));
await png("bookly-icon", 192, path.join(web, "public/notification-icon.png"));
// Android draws the badge as a silhouette from its alpha channel: white mark, no tile.
await png("bookly-mark-reversed", 96, path.join(web, "public/notification-badge.png"));

// 4. The press kit: every SVG and PNG, served from /press and zipped for one download.
await mkdir(press, { recursive: true });
const kit = [];
for (const name of names) {
  const s = await readFile(svg(name));
  const p = await readFile(path.join(brand, "png", `${name}.png`));
  await writeFile(path.join(press, `${name}.svg`), s);
  await writeFile(path.join(press, `${name}.png`), p);
  kit.push([`bookly-press-kit/svg/${name}.svg`, s], [`bookly-press-kit/png/${name}.png`, p]);
}
kit.push([
  "bookly-press-kit/README.txt",
  await readFile(path.join(brand, "source/kit-readme.txt")),
]);
await zip(kit, path.join(press, "bookly-press-kit.zip"));

console.log(
  `rendered ${names.length} lockups, app icons and the press kit (${PAPER} is the page colour)`,
);
