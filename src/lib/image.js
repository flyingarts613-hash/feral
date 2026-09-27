import manifest from '../data/image-manifest.json'

// Public-folder path ('/images/x.jpg') → URL that respects Vite's `base`.
export const asset = (path) => (path ? import.meta.env.BASE_URL + path.replace(/^\//, '') : path)

const variant = (src, w) => asset(src.replace(/\.[a-z0-9]+$/i, `-${w}.webp`))

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
