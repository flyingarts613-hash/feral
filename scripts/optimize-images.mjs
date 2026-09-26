// Creates responsive WebP variants for every image in public/images and writes
// a manifest the <Img> component uses to build srcset + width/height.
//
//   npm run images      (also runs automatically before `npm run build`)
//
// Drop a new photo anywhere in public/images, reference it from src/data,
// and run this. Images without variants still work — they just aren't resized.

import sharp from 'sharp'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

const ROOT = new URL('../', import.meta.url).pathname
const PUBLIC = join(ROOT, 'public')
const DIR = join(PUBLIC, 'images')
const MANIFEST = join(ROOT, 'src/data/image-manifest.json')
const WIDTHS = [480, 960, 1600, 2400]
const SOURCE = /\.(jpe?g|png|webp|avif)$/i
const VARIANT = /-\d+\.webp$/

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(p)))
    else if (SOURCE.test(entry.name) && !VARIANT.test(entry.name)) out.push(p)
  }
  return out
}

const mtime = (p) => stat(p).then((s) => s.mtimeMs, () => 0)

const manifest = {}
for (const file of await walk(DIR)) {
  const meta = await sharp(file).metadata()
  const base = file.slice(0, -extname(file).length)
  const widths = WIDTHS.filter((w) => w < meta.width)
  if (!widths.length || meta.width <= 2400) widths.push(Math.min(meta.width, 2400))
  const unique = [...new Set(widths)]
  const srcTime = await mtime(file)

  for (const w of unique) {
    const out = `${base}-${w}.webp`
    if ((await mtime(out)) > srcTime) continue
    await sharp(file).resize({ width: w }).webp({ quality: 74, effort: 5 }).toFile(out)
    console.log('✓', relative(PUBLIC, out))
  }

  manifest['/' + relative(PUBLIC, file)] = {
    width: meta.width,
    height: meta.height,
    widths: unique,
  }
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`manifest: ${Object.keys(manifest).length} images`)
