/**
 * The site's favicon, logo and install icons, all drawn from one picture: the Neutral realm's mark.
 *
 * `realm-neutral.png` is `icon-realm_neutral_m_high` (256×256) from the `icon-realm` atlas of the
 * 1.5.7 client — the largest copy of the mark the game ships; the one card text embeds is 56×56.
 * Everything below is derived from it, so after replacing it, run this again and commit the output:
 *
 *   node tools/brand/make-icons.mjs
 *
 * The 512 icons are the only upscale (2×). A maskable icon is cropped by the launcher to anything
 * down to a circle 80% of its width, so the mark sits well inside that on the site's background;
 * iOS rounds the corners of the touch icon itself and gets the same treatment, a little larger.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'realm-neutral.png');
const pub = join(here, '../../apps/web/public');
const brand = join(pub, 'brand');

/** `--color-bg` in `apps/web/src/styles.css`, which is also the manifest's `background_color`. */
const BACKGROUND = '#13110e';

const plain = (size) => sharp(source).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();

async function onBackground(size, markSize) {
  const mark = await plain(markSize);
  const offset = Math.round((size - markSize) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toBuffer();
}

/** An ICO is a directory of images, and each image may simply be a PNG. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size % 256, entry);
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

await mkdir(brand, { recursive: true });

const outputs = {
  [join(brand, 'icon-192.png')]: await plain(192),
  [join(brand, 'icon-512.png')]: await plain(512),
  [join(brand, 'icon-maskable-512.png')]: await onBackground(512, 360),
  [join(brand, 'apple-touch-icon.png')]: await onBackground(180, 148),
  [join(pub, 'favicon.ico')]: ico(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await plain(size) }))),
  ),
};

for (const [path, data] of Object.entries(outputs)) {
  await writeFile(path, data);
  console.log(`${path.slice(pub.length + 1).replaceAll('\\', '/')}  ${data.length} bytes`);
}
