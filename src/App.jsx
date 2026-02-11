import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const DEFAULT_VIEW = {
  centerX: -0.5,
  centerY: 0,
  zoom: 1,
  maxIter: 600,
}

const PAN_CACHE_FACTOR = 2 // cache canvas is 2x viewport in each dimension

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0]
  else if (hp >= 1 && hp < 2) [r1, g1, b1] = [x, c, 0]
  else if (hp >= 2 && hp < 3) [r1, g1, b1] = [0, c, x]
  else if (hp >= 3 && hp < 4) [r1, g1, b1] = [0, x, c]
  else if (hp >= 4 && hp < 5) [r1, g1, b1] = [x, 0, c]
  else if (hp >= 5 && hp <= 6) [r1, g1, b1] = [c, 0, x]

  const m = l - c / 2
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ]
}

function App() {
  const canvasRef = useRef(null)

  // Rendering + pan-cache state
  const renderIdRef = useRef(0)
  const cacheRef = useRef({
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,
    zoom: null,
    maxIter: null,
    // complex coordinate at the cache canvas center
    centerX: 0,
    centerY: 0,
  })

  // Single-finger pan state
  const dragRef = useRef({
    active: false,
    pointerId: null,
    moved: false,
    startX: 0,
    startY: 0,
    startCenterX: 0,
    startCenterY: 0,
    startZoom: DEFAULT_VIEW.zoom,
  })

  // Multi-touch pinch state
  const gestureRef = useRef({
    pointers: new Map(),
    mode: 'none',
    startDist: 0,
    startMid: { x: 0, y: 0 },
    anchorComplex: { x: 0, y: 0 },
    startView: DEFAULT_VIEW,
    pinchMoved: false,
    pinchStartedAt: 0,
  })

  const [view, setView] = useState(DEFAULT_VIEW)
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 })
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      const next = {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
        dpr: window.devicePixelRatio || 1,
      }
      setSize(next)
    })

    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  const scaleFor = (zoom, pixelW, pixelH) => {
    return 4 / (zoom * Math.min(pixelW, pixelH))
  }

  const ensureCache = (pixelW, pixelH, dpr, nextView) => {
    const cache = cacheRef.current

    const cacheW = Math.floor(pixelW * PAN_CACHE_FACTOR)
    const cacheH = Math.floor(pixelH * PAN_CACHE_FACTOR)

    const needsNewCanvas =
      !cache.canvas || cache.width !== cacheW || cache.height !== cacheH || cache.dpr !== dpr

    const needsReset =
      needsNewCanvas || cache.zoom !== nextView.zoom || cache.maxIter !== nextView.maxIter

    if (needsReset) {
      const off = document.createElement('canvas')
      off.width = cacheW
      off.height = cacheH
      const ctx = off.getContext('2d', { alpha: false })

      cacheRef.current = {
        canvas: off,
        ctx,
        width: cacheW,
        height: cacheH,
        dpr,
        zoom: nextView.zoom,
        maxIter: nextView.maxIter,
        centerX: nextView.centerX,
        centerY: nextView.centerY,
      }

      return { reset: true }
    }

    return { reset: false }
  }

  const computeRect = (targetCtx, rect, pixelW, pixelH, nextView) => {
    // rect is in cache-canvas pixel coordinates.
    const cache = cacheRef.current
    const { width: cacheW, height: cacheH } = cache

    const img = targetCtx.createImageData(rect.w, rect.h)
    const data = img.data

    const scale = scaleFor(nextView.zoom, pixelW, pixelH)
    const maxIter = nextView.maxIter

    // Map cache pixel -> complex using cache center.
    const halfCacheW = cacheW / 2
    const halfCacheH = cacheH / 2

    for (let j = 0; j < rect.h; j += 1) {
      const py = rect.y + j
      const cy = (py - halfCacheH) * scale + cache.centerY
      for (let i = 0; i < rect.w; i += 1) {
        const px = rect.x + i
        const cx = (px - halfCacheW) * scale + cache.centerX

        let zx = 0
        let zy = 0
        let iter = 0

        while (zx * zx + zy * zy <= 4 && iter < maxIter) {
          const xtemp = zx * zx - zy * zy + cx
          zy = 2 * zx * zy + cy
          zx = xtemp
          iter += 1
        }

        const offset = (j * rect.w + i) * 4
        if (iter >= maxIter) {
          data[offset] = 5
          data[offset + 1] = 10
          data[offset + 2] = 16
          data[offset + 3] = 255
        } else {
          const logZn = Math.log(zx * zx + zy * zy) / 2
          const nu = Math.log(logZn / Math.LN2) / Math.LN2
          const smooth = iter + 1 - nu
          const t = smooth / maxIter
          const hue = 210 + 140 * t
          const sat = 0.75
          const light = 0.3 + 0.5 * t
          const [r, g, b] = hslToRgb(hue % 360, sat, light)
          data[offset] = r
          data[offset + 1] = g
          data[offset + 2] = b
          data[offset + 3] = 255
        }
      }
    }

    targetCtx.putImageData(img, rect.x, rect.y)
  }

  const fillCache = (
    pixelW,
    pixelH,
    nextView,
    { priorityRects = null, onProgress = null } = {},
  ) => {
    const cache = cacheRef.current
    if (!cache.canvas || !cache.ctx) return

    const ctx = cache.ctx
    ctx.imageSmoothingEnabled = false

    renderIdRef.current += 1
    const renderId = renderIdRef.current

    // Queue rectangles to compute (cache pixels)
    const allRects = priorityRects || [
      { x: 0, y: 0, w: cache.width, h: cache.height },
    ]

    // Process in small slices to keep UI responsive
    const CHUNK_ROWS = 32

    const processNext = () => {
      if (renderId !== renderIdRef.current) return

      // Find a rect that still has rows left.
      const rect = allRects.find((r) => r.h > 0)
      if (!rect) return

      const h = Math.min(CHUNK_ROWS, rect.h)
      const slice = { x: rect.x, y: rect.y, w: rect.w, h }

      computeRect(ctx, slice, pixelW, pixelH, nextView)

      // Let the visible canvas update progressively while we render in chunks.
      if (typeof onProgress === 'function') onProgress()

      rect.y += h
      rect.h -= h

      requestAnimationFrame(processNext)
    }

    processNext()
  }

  const updateCacheForPan = (pixelW, pixelH, nextView, { onProgress = null } = {}) => {
    const cache = cacheRef.current
    if (!cache.canvas || !cache.ctx) return { usedCache: false }
    if (cache.zoom !== nextView.zoom || cache.maxIter !== nextView.maxIter) return { usedCache: false }

    const scale = scaleFor(nextView.zoom, pixelW, pixelH)

    // Translate cache content by the pixel shift corresponding to center movement.
    const dxFloat = (cache.centerX - nextView.centerX) / scale
    const dyFloat = (cache.centerY - nextView.centerY) / scale

    const dx = Math.round(dxFloat)
    const dy = Math.round(dyFloat)

    // If movement is too large, just reset (faster than shifting huge gaps)
    if (Math.abs(dx) > cache.width * 0.45 || Math.abs(dy) > cache.height * 0.45) {
      cache.centerX = nextView.centerX
      cache.centerY = nextView.centerY
      fillCache(pixelW, pixelH, nextView, { onProgress })
      return { usedCache: true }
    }

    if (dx === 0 && dy === 0) {
      // No meaningful pan in pixel space.
      return { usedCache: true }
    }

    const ctx = cache.ctx
    ctx.imageSmoothingEnabled = false

    // Shift existing cache content
    ctx.save()
    ctx.globalCompositeOperation = 'copy'
    ctx.drawImage(cache.canvas, dx, dy)
    ctx.restore()

    // Clear newly exposed regions and compute them.
    // Exposed vertical strips
    const rects = []

    if (dx > 0) {
      // moved content right; need new pixels on left
      rects.push({ x: 0, y: 0, w: dx, h: cache.height })
    } else if (dx < 0) {
      // moved content left; need new pixels on right
      rects.push({ x: cache.width + dx, y: 0, w: -dx, h: cache.height })
    }

    if (dy > 0) {
      // moved content down; need new pixels at top
      rects.push({ x: 0, y: 0, w: cache.width, h: dy })
    } else if (dy < 0) {
      // moved content up; need new pixels at bottom
      rects.push({ x: 0, y: cache.height + dy, w: cache.width, h: -dy })
    }

    // Update cache center to the new view center.
    cache.centerX = nextView.centerX
    cache.centerY = nextView.centerY

    // Clamp + compute exposed rects
    const clamped = rects
      .map((r) => ({
        x: Math.max(0, Math.floor(r.x)),
        y: Math.max(0, Math.floor(r.y)),
        w: Math.max(0, Math.floor(r.w)),
        h: Math.max(0, Math.floor(r.h)),
      }))
      .filter((r) => r.w > 0 && r.h > 0)

    if (clamped.length) {
      fillCache(pixelW, pixelH, nextView, {
        priorityRects: clamped,
        onProgress,
      })
    }

    return { usedCache: true }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!size.width || !size.height) return

    const drawViewportFromCache = (pixelW, pixelH) => {
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return
      ctx.imageSmoothingEnabled = false

      const cache = cacheRef.current
      if (!cache.canvas) return

      const srcX = Math.floor((cache.width - pixelW) / 2)
      const srcY = Math.floor((cache.height - pixelH) / 2)
      ctx.clearRect(0, 0, pixelW, pixelH)
      ctx.drawImage(cache.canvas, srcX, srcY, pixelW, pixelH, 0, 0, pixelW, pixelH)
    }

    const dpr = size.dpr
    const pixelW = Math.floor(size.width * dpr)
    const pixelH = Math.floor(size.height * dpr)

    canvas.width = pixelW
    canvas.height = pixelH

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    // Ensure pan-cache exists and is compatible.
    const { reset } = ensureCache(pixelW, pixelH, dpr, view)

    if (reset) {
      // Fresh cache: compute entire cache (in chunks)
      fillCache(pixelW, pixelH, view, {
        onProgress: () => drawViewportFromCache(pixelW, pixelH),
      })
    } else {
      // Same zoom/iter: try to update cache by shifting + computing only new strips
      updateCacheForPan(pixelW, pixelH, view, {
        onProgress: () => drawViewportFromCache(pixelW, pixelH),
      })
    }

    // Draw viewport from cache
    const cache = cacheRef.current
    if (cache.canvas) {
      const srcX = Math.floor((cache.width - pixelW) / 2)
      const srcY = Math.floor((cache.height - pixelH) / 2)
      ctx.clearRect(0, 0, pixelW, pixelH)
      ctx.drawImage(cache.canvas, srcX, srcY, pixelW, pixelH, 0, 0, pixelW, pixelH)
    }
  }, [size, view])

  const screenToComplex = (rect, x, y, viewLike) => {
    const pixelW = rect.width * (window.devicePixelRatio || 1)
    const pixelH = rect.height * (window.devicePixelRatio || 1)
    const scale = scaleFor(viewLike.zoom, pixelW, pixelH)
    return {
      x: (x - rect.width / 2) * scale + viewLike.centerX,
      y: (y - rect.height / 2) * scale + viewLike.centerY,
    }
  }

  const updateCenterFromScreen = (rect, x, y, zoomFactor) => {
    // rect is CSS pixels
    const dpr = window.devicePixelRatio || 1
    const pixelW = rect.width * dpr
    const pixelH = rect.height * dpr

    const scale = scaleFor(view.zoom, pixelW, pixelH)
    const anchor = {
      x: (x - rect.width / 2) * scale + view.centerX,
      y: (y - rect.height / 2) * scale + view.centerY,
    }

    setView((prev) => {
      const nextZoom = prev.zoom * zoomFactor
      const nextScale = scaleFor(nextZoom, pixelW, pixelH)
      return {
        ...prev,
        zoom: nextZoom,
        centerX: anchor.x - (x - rect.width / 2) * nextScale,
        centerY: anchor.y - (y - rect.height / 2) * nextScale,
      }
    })
  }

  const updateCenterFromPointer = (event, zoomFactor) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    updateCenterFromScreen(rect, x, y, zoomFactor)
  }

  const beginPinch = (rect, p1, p2) => {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dist = Math.hypot(dx, dy) || 1
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

    gestureRef.current.mode = 'pinch'
    gestureRef.current.startDist = dist
    gestureRef.current.startMid = mid
    gestureRef.current.startView = view
    gestureRef.current.anchorComplex = screenToComplex(rect, mid.x, mid.y, view)
    gestureRef.current.pinchMoved = false
    gestureRef.current.pinchStartedAt = performance.now()

    dragRef.current.active = false
    setIsDragging(true)
  }

  const handlePointerDown = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (event.pointerType === 'mouse' && event.button !== 0) return

    canvas.setPointerCapture(event.pointerId)

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const g = gestureRef.current
    g.pointers.set(event.pointerId, { x, y })

    if (g.pointers.size === 2) {
      const [pp1, pp2] = Array.from(g.pointers.values())
      beginPinch(rect, pp1, pp2)
      return
    }

    g.mode = 'pan'
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      startCenterX: view.centerX,
      startCenterY: view.centerY,
      startZoom: view.zoom,
    }
    setIsDragging(true)
  }

  const handlePointerMove = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const g = gestureRef.current
    if (g.pointers.has(event.pointerId)) {
      g.pointers.set(event.pointerId, { x, y })
    }

    if (g.mode === 'pinch' && g.pointers.size >= 2) {
      const [p1, p2] = Array.from(g.pointers.values())
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy) || 1

      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

      const distDelta = Math.abs(dist - (g.startDist || 0))
      const midDelta = Math.hypot(mid.x - g.startMid.x, mid.y - g.startMid.y)
      if (distDelta > 8 || midDelta > 8) g.pinchMoved = true

      const ratio = dist / (g.startDist || 1)
      const nextZoom = Math.max(0.05, g.startView.zoom * ratio)

      // Reset cache on zoom changes automatically (handled by ensureCache).
      const dpr = window.devicePixelRatio || 1
      const pixelW = rect.width * dpr
      const pixelH = rect.height * dpr
      const nextScale = scaleFor(nextZoom, pixelW, pixelH)

      const anchor = g.anchorComplex
      const nextCenterX = anchor.x - (mid.x - rect.width / 2) * nextScale
      const nextCenterY = anchor.y - (mid.y - rect.height / 2) * nextScale

      setView((prev) => ({
        ...prev,
        zoom: nextZoom,
        centerX: nextCenterX,
        centerY: nextCenterY,
      }))
      return
    }

    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) > 3) {
      drag.moved = true
    }
    if (!drag.moved) return

    const dpr = window.devicePixelRatio || 1
    const pixelW = rect.width * dpr
    const pixelH = rect.height * dpr
    const scale = scaleFor(drag.startZoom, pixelW, pixelH)

    setView((prev) => ({
      ...prev,
      centerX: drag.startCenterX - dx * scale,
      centerY: drag.startCenterY - dy * scale,
    }))
  }

  const finishPointer = (event) => {
    const canvas = canvasRef.current
    const g = gestureRef.current

    // Update this pointer position one last time (important for tap gestures).
    const rect = canvas?.getBoundingClientRect()
    if (rect && g.pointers.has(event.pointerId)) {
      g.pointers.set(event.pointerId, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }

    // Snapshot before removing the pointer so we can detect 2-finger tap.
    const pointersBefore = Array.from(g.pointers.values())
    const wasPinch = g.mode === 'pinch'
    const wasTwoFingers = g.pointers.size === 2
    const pinchMoved = g.pinchMoved
    const pinchDurationMs = performance.now() - (g.pinchStartedAt || 0)

    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    g.pointers.delete(event.pointerId)

    // Two-finger tap to zoom out.
    if (wasPinch && wasTwoFingers && !pinchMoved && pinchDurationMs < 280 && rect) {
      const p1 = pointersBefore[0]
      const p2 = pointersBefore[1]
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      updateCenterFromScreen(rect, mid.x, mid.y, 1 / 1.8)
    }

    // If we were pinching and one finger lifted, end pinch.
    if (wasPinch) {
      if (g.pointers.size >= 2) return
      g.mode = g.pointers.size === 1 ? 'pan' : 'none'
      dragRef.current.active = false
      setIsDragging(false)
      return
    }

    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) {
      if (g.pointers.size === 0) setIsDragging(false)
      return
    }

    const didDrag = drag.moved
    dragRef.current = {
      active: false,
      pointerId: null,
      moved: false,
      startX: 0,
      startY: 0,
      startCenterX: 0,
      startCenterY: 0,
      startZoom: view.zoom,
    }

    g.mode = g.pointers.size > 0 ? 'pan' : 'none'
    setIsDragging(g.pointers.size > 0)

    if (!didDrag) {
      const zoomFactor = event.pointerType === 'mouse' && event.shiftKey ? 1 / 1.8 : 1.8
      updateCenterFromPointer(event, zoomFactor)
    }
  }

  const handleCanvasContextMenu = (event) => {
    event.preventDefault()
    updateCenterFromPointer(event, 1 / 1.8)
  }

  const zoomIn = () => setView((prev) => ({ ...prev, zoom: prev.zoom * 1.6 }))
  const zoomOut = () => setView((prev) => ({ ...prev, zoom: prev.zoom / 1.6 }))
  const reset = () => setView(DEFAULT_VIEW)

  const tipText = useMemo(() => {
    return 'Pinch to zoom. Two-finger tap to zoom out. Drag to move.'
  }, [])

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Mandelbrot Explorer</p>
          <p className="lede">
            Tap to zoom in, drag to pan, and pinch to zoom on mobile. Two-finger tap zooms out. On
            desktop: click to zoom, Shift/right-click to zoom out.
          </p>
        </div>
        <div className="controls">
          <div className="controls-row">
            <button className="btn" onClick={zoomIn}>
              Zoom In
            </button>
            <button className="btn" onClick={zoomOut}>
              Zoom Out
            </button>
            <button className="btn ghost" onClick={reset}>
              Reset
            </button>
          </div>
          <label className="slider">
            <span>Iterations</span>
            <input
              type="range"
              min="100"
              max="2000"
              step="50"
              value={view.maxIter}
              onChange={(event) =>
                setView((prev) => ({
                  ...prev,
                  maxIter: Number(event.target.value),
                }))
              }
            />
            <span className="value">{view.maxIter}</span>
          </label>
        </div>
      </header>

      <section className="canvas-shell">
        <div className="canvas-frame">
          <canvas
            ref={canvasRef}
            className={isDragging ? 'dragging' : ''}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onContextMenu={handleCanvasContextMenu}
            role="img"
            aria-label="Mandelbrot set"
          />
        </div>
        <div className="meta">
          <div>
            <span>Center</span>
            <strong>
              {view.centerX.toFixed(2)}, {view.centerY.toFixed(2)}
            </strong>
          </div>
          <div>
            <span>Zoom</span>
            <strong>{view.zoom.toFixed(2)}x</strong>
          </div>
          <div>
            <span>Tip</span>
            <strong>{tipText}</strong>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
