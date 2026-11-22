import { useEffect, useState } from 'react'

// CSS width of an element, updated on resize. 0 until the first measurement.
export function useElementWidth(ref) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width || 0)
      setWidth((prev) => (prev === next ? prev : next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}
