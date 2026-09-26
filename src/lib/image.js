import manifest from '../data/image-manifest.json'

const variant = (src, w) => src.replace(/\.[a-z0-9]+$/i, `-${w}.webp`)

// { srcSet, width, height } for an image in public/images, if optimised.
export function imageProps(src) {
  const m = manifest[src]
  if (!m) return {}
  return {
    srcSet: m.widths.map((w) => `${variant(src, w)} ${w}w`).join(', '),
    width: m.width,
    height: m.height,
  }
}
