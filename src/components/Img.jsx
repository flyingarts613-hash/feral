import { useState } from 'react'
import { asset, imageProps } from '../lib/image'

// Responsive, lazy by default, fades in when decoded.
export default function Img({ src, alt = '', sizes = '100vw', priority = false, className = '', ...rest }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={asset(src)}
      alt={alt}
      sizes={sizes}
      {...imageProps(src)}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      ref={(el) => {
        if (el?.complete && el.naturalWidth) setLoaded(true)
      }}
      className={`transition-opacity duration-[1.2s] ease-out ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      {...rest}
    />
  )
}
