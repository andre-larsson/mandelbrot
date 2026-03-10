import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const DEFAULT_VIEW = {
  centerX: -0.5,
  centerY: 0,
  zoom: 1,
  maxIter: 600,
}

const DEFAULT_JULIA_C = {
  re: -0.8,
  im: 0.156,
}

const FRACTALS = {
  mandelbrot: {
    label: 'Mandelbrot',
    defaultView: { centerX: -0.5, centerY: 0, zoom: 1 },
  },
  julia: {
    label: 'Julia',
    defaultView: { centerX: 0, centerY: 0, zoom: 1.2 },
  },
  burningShip: {
    label: 'Burning Ship',
    defaultView: { centerX: -0.45, centerY: -0.5, zoom: 1.8 },
  },
  tricorn: {
    label: 'Tricorn',
    defaultView: { centerX: 0, centerY: 0, zoom: 1.2 },
  },
}

const COLOR_SCHEMES = {
  aurora: { label: 'Aurora' },
  fire: { label: 'Fire' },
  ocean: { label: 'Ocean' },
  grayscale: { label: 'Grayscale' },
  neon: { label: 'Neon' },
}

const PAN_CACHE_FACTOR = 2 // cache canvas is 2x viewport in each dimension
const ZOOM_QUANT_STEP = 1.015 // ~1.5% zoom buckets
const ZOOM_STEP_BUCKETS = 32
const ZOOM_STEP_FACTOR = Math.pow(ZOOM_QUANT_STEP, ZOOM_STEP_BUCKETS)

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

function colorForT(t, scheme) {
  if (scheme === 'fire') {
    const hue = 10 + 55 * t
    const sat = 0.95
    const light = 0.15 + 0.7 * Math.pow(t, 0.75)
    return hslToRgb(hue % 360, sat, light)
  }

  if (scheme === 'ocean') {
    const hue = 180 + 80 * t
    const sat = 0.85
    const light = 0.2 + 0.55 * t
    return hslToRgb(hue % 360, sat, light)
  }

  if (scheme === 'grayscale') {
    const gray = Math.max(0, Math.min(255, Math.round(255 * Math.pow(t, 0.8))))
    return [gray, gray, gray]
  }

  if (scheme === 'neon') {
    const hue = (300 + 420 * t) % 360
    const sat = 1
    const light = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(16 * t))
    return hslToRgb(hue, sat, light)
  }

  // aurora (default)
  const hue = 210 + 140 * t
  const sat = 0.75
  const light = 0.3 + 0.5 * t
  return hslToRgb(hue % 360, sat, light)
}

function quantizeZoom(zoom) {
  const safe = Math.max(0.000001, zoom)
  const k = Math.round(Math.log(safe) / Math.log(ZOOM_QUANT_STEP))
  return Math.pow(ZOOM_QUANT_STEP, k)
}

function iterateEscape(cx, cy, maxIter, fractalType, juliaC) {
  let zx = 0
  let zy = 0
  let cRe = cx
  let cIm = cy

  if (fractalType === 'julia') {
    zx = cx
    zy = cy
    cRe = juliaC.re
    cIm = juliaC.im
  }

  let iter = 0

  while (zx * zx + zy * zy <= 4 && iter < maxIter) {
    let nextX = zx * zx - zy * zy + cRe
    let nextY = 2 * zx * zy + cIm

    if (fractalType === 'burningShip') {
      const ax = Math.abs(zx)
      const ay = Math.abs(zy)
      nextX = ax * ax - ay * ay + cRe
      nextY = 2 * ax * ay + cIm
    } else if (fractalType === 'tricorn') {
      nextY = -2 * zx * zy + cIm
    }

    zx = nextX
    zy = nextY
    iter += 1
  }

  return { iter, zx, zy }
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
    fractalType: null,
    colorScheme: null,
    juliaC: null,
    smoothBuffer: null,
    geometryDirty: false,
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

  const [fractalType, setFractalType] = useState('mandelbrot')
  const [colorScheme, setColorScheme] = useState('aurora')
  const [internalScale, setInternalScale] = useState(1)
  const [adaptiveQuality, setAdaptiveQuality] = useState(true)
  const [juliaC, setJuliaC] = useState(DEFAULT_JULIA_C)
  const [view, setView] = useState(DEFAULT_VIEW)
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const [interactionMode, setInteractionMode] = useState('idle')

  const interactionTimerRef = useRef(null)

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

  useEffect(() => {
    return () => {
      if (interactionTimerRef.current) {
        clearTimeout(interactionTimerRef.current)
      }
    }
  }, [])

  const noteInteraction = (mode = 'pan') => {
    setInteractionMode(mode)
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current)
    interactionTimerRef.current = setTimeout(() => setInteractionMode('idle'), 1200)
  }

  const renderScale = useMemo(() => {
    if (!adaptiveQuality) return internalScale
    if (interactionMode !== 'zoom') return internalScale
    return Math.max(0.25, internalScale * 0.5)
  }, [adaptiveQuality, internalScale, interactionMode])

  const renderMaxIter = useMemo(() => {
    if (!adaptiveQuality || interactionMode !== 'zoom') return view.maxIter
    return Math.max(100, Math.floor(view.maxIter * 0.55))
  }, [adaptiveQuality, interactionMode, view.maxIter])

  const scaleFor = (zoom, pixelW, pixelH) => {
    return 4 / (zoom * Math.min(pixelW, pixelH))
  }

  const ensureCache = (
    pixelW,
    pixelH,
    dpr,
    nextView,
    nextFractalType,
    nextColorScheme,
    nextJuliaC,
    allowDirtyReset,
  ) => {
    const cache = cacheRef.current

    const cacheW = Math.floor(pixelW * PAN_CACHE_FACTOR)
    const cacheH = Math.floor(pixelH * PAN_CACHE_FACTOR)

    const needsNewCanvas =
      !cache.canvas || cache.width !== cacheW || cache.height !== cacheH || cache.dpr !== dpr

    const needsGeometryReset =
      needsNewCanvas ||
      cache.zoom !== nextView.zoom ||
      cache.maxIter !== nextView.maxIter ||
      cache.fractalType !== nextFractalType ||
      !cache.juliaC ||
      cache.juliaC.re !== nextJuliaC.re ||
      cache.juliaC.im !== nextJuliaC.im ||
      (cache.geometryDirty && allowDirtyReset)

    if (needsGeometryReset) {
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
        fractalType: nextFractalType,
        colorScheme: nextColorScheme,
        juliaC: { ...nextJuliaC },
        smoothBuffer: new Float32Array(cacheW * cacheH),
        geometryDirty: false,
        centerX: nextView.centerX,
        centerY: nextView.centerY,
      }

      return { reset: true, recolorOnly: false }
    }

    const recolorOnly = cache.colorScheme !== nextColorScheme
    if (recolorOnly) {
      cache.colorScheme = nextColorScheme
    }

    return { reset: false, recolorOnly }
  }

  const paintRectFromSmooth = (targetCtx, rect, nextColorScheme, maxIter) => {
    const cache = cacheRef.current
    if (!cache.smoothBuffer) return

    const img = targetCtx.createImageData(rect.w, rect.h)
    const data = img.data

    for (let j = 0; j < rect.h; j += 1) {
      const py = rect.y + j
      for (let i = 0; i < rect.w; i += 1) {
        const px = rect.x + i
        const sourceIndex = py * cache.width + px
        const offset = (j * rect.w + i) * 4
        const smooth = cache.smoothBuffer[sourceIndex]

        if (smooth < 0) {
          data[offset] = 5
          data[offset + 1] = 10
          data[offset + 2] = 16
          data[offset + 3] = 255
        } else {
          const t = smooth / maxIter
          const [r, g, b] = colorForT(t, nextColorScheme)
          data[offset] = r
          data[offset + 1] = g
          data[offset + 2] = b
          data[offset + 3] = 255
        }
      }
    }

    targetCtx.putImageData(img, rect.x, rect.y)
  }

  const repaintEntireCache = (nextColorScheme, maxIter) => {
    const cache = cacheRef.current
    if (!cache.ctx) return
    paintRectFromSmooth(cache.ctx, { x: 0, y: 0, w: cache.width, h: cache.height }, nextColorScheme, maxIter)
  }

  const computeRect = (
    targetCtx,
    rect,
    pixelW,
    pixelH,
    nextView,
    nextFractalType,
    nextColorScheme,
    nextJuliaC,
  ) => {
    // rect is in cache-canvas pixel coordinates.
    const cache = cacheRef.current
    const { width: cacheW, height: cacheH } = cache

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

        const { iter, zx, zy } = iterateEscape(
          cx,
          cy,
          maxIter,
          nextFractalType,
          nextJuliaC,
        )

        const bufferIndex = py * cache.width + px
        if (iter >= maxIter) {
          cache.smoothBuffer[bufferIndex] = -1
        } else {
          const logZn = Math.log(zx * zx + zy * zy) / 2
          const nu = Math.log(logZn / Math.LN2) / Math.LN2
          const smooth = iter + 1 - nu
          cache.smoothBuffer[bufferIndex] = smooth
        }
      }
    }

    paintRectFromSmooth(targetCtx, rect, nextColorScheme, maxIter)
  }

  const fillCache = (
    pixelW,
    pixelH,
    nextView,
    nextFractalType,
    nextColorScheme,
    nextJuliaC,
    { priorityRects = null, onDone = null } = {},
  ) => {
    const cache = cacheRef.current
    if (!cache.canvas || !cache.ctx) return
    if (!cache.smoothBuffer || cache.smoothBuffer.length !== cache.width * cache.height) {
      cache.smoothBuffer = new Float32Array(cache.width * cache.height)
      cache.smoothBuffer.fill(-1)
    }

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
      if (!rect) {
        if (typeof onDone === 'function') onDone()
        return
      }

      const h = Math.min(CHUNK_ROWS, rect.h)
      const slice = { x: rect.x, y: rect.y, w: rect.w, h }

      computeRect(
        ctx,
        slice,
        pixelW,
        pixelH,
        nextView,
        nextFractalType,
        nextColorScheme,
        nextJuliaC,
      )

      rect.y += h
      rect.h -= h

      requestAnimationFrame(processNext)
    }

    processNext()
  }

  const updateCacheForPan = (
    pixelW,
    pixelH,
    nextView,
    nextFractalType,
    nextColorScheme,
    nextJuliaC,
    { onDone = null } = {},
  ) => {
    const cache = cacheRef.current
    if (!cache.canvas || !cache.ctx) return { usedCache: false }
    if (
      cache.zoom !== nextView.zoom ||
      cache.maxIter !== nextView.maxIter ||
      cache.fractalType !== nextFractalType ||
      !cache.juliaC ||
      cache.juliaC.re !== nextJuliaC.re ||
      cache.juliaC.im !== nextJuliaC.im
    ) {
      return { usedCache: false }
    }

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
      fillCache(pixelW, pixelH, nextView, nextFractalType, nextColorScheme, nextJuliaC, {
        onDone,
      })
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

    if (cache.smoothBuffer && !dragRef.current.active) {
      const w = cache.width
      const h = cache.height
      const shifted = new Float32Array(w * h)
      shifted.fill(-1)

      const xStart = Math.max(0, dx)
      const xEnd = Math.min(w, w + dx)
      const copyLen = xEnd - xStart

      if (copyLen > 0) {
        for (let y = 0; y < h; y += 1) {
          const sy = y - dy
          if (sy < 0 || sy >= h) continue

          const dstRow = y * w
          const srcRow = sy * w
          const dstStart = dstRow + xStart
          const srcStart = srcRow + (xStart - dx)

          shifted.set(cache.smoothBuffer.subarray(srcStart, srcStart + copyLen), dstStart)
        }
      }

      cache.smoothBuffer = shifted
    }

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
      if (dragRef.current.active) {
        cache.geometryDirty = true
        if (typeof onDone === 'function') onDone()
      } else {
        fillCache(pixelW, pixelH, nextView, nextFractalType, nextColorScheme, nextJuliaC, {
          priorityRects: clamped,
          onDone,
        })
      }
    } else if (typeof onDone === 'function') {
      onDone()
    }

    return { usedCache: true }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!size.width || !size.height) return

    const drawViewportFromCache = (renderW, renderH, fullW, fullH) => {
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return
      ctx.imageSmoothingEnabled = renderScale >= 0.99 ? false : true

      const cache = cacheRef.current
      if (!cache.canvas) return

      const srcX = Math.floor((cache.width - renderW) / 2)
      const srcY = Math.floor((cache.height - renderH) / 2)
      ctx.clearRect(0, 0, fullW, fullH)
      ctx.drawImage(cache.canvas, srcX, srcY, renderW, renderH, 0, 0, fullW, fullH)
    }

    const dpr = size.dpr
    const fullPixelW = Math.floor(size.width * dpr)
    const fullPixelH = Math.floor(size.height * dpr)
    const renderW = Math.max(1, Math.floor(fullPixelW * renderScale))
    const renderH = Math.max(1, Math.floor(fullPixelH * renderScale))

    if (canvas.width !== fullPixelW) canvas.width = fullPixelW
    if (canvas.height !== fullPixelH) canvas.height = fullPixelH

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctx.imageSmoothingEnabled = renderScale >= 0.99 ? false : true

    const renderView = { ...view, maxIter: renderMaxIter }

    // Ensure pan-cache exists and is compatible.
    const { reset, recolorOnly } = ensureCache(
      renderW,
      renderH,
      dpr * renderScale,
      renderView,
      fractalType,
      colorScheme,
      juliaC,
      !dragRef.current.active,
    )

    if (reset) {
      // Fresh cache: compute entire cache (in chunks)
      fillCache(renderW, renderH, renderView, fractalType, colorScheme, juliaC, {
        onDone: () => drawViewportFromCache(renderW, renderH, fullPixelW, fullPixelH),
      })
    } else if (recolorOnly) {
      // Palette change only: repaint from cached smooth data, no fractal recompute.
      repaintEntireCache(colorScheme, renderView.maxIter)
      drawViewportFromCache(renderW, renderH, fullPixelW, fullPixelH)
    } else {
      // Same zoom/iter: try to update cache by shifting + computing only new strips
      updateCacheForPan(renderW, renderH, renderView, fractalType, colorScheme, juliaC, {
        onDone: () => drawViewportFromCache(renderW, renderH, fullPixelW, fullPixelH),
      })
    }

  }, [size, view, fractalType, colorScheme, juliaC, renderScale, renderMaxIter])

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
      const nextZoom = quantizeZoom(prev.zoom * zoomFactor)
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
    noteInteraction('pan')
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
    noteInteraction('pan')
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
      noteInteraction('zoom')
      const [p1, p2] = Array.from(g.pointers.values())
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy) || 1

      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

      const distDelta = Math.abs(dist - (g.startDist || 0))
      const midDelta = Math.hypot(mid.x - g.startMid.x, mid.y - g.startMid.y)
      if (distDelta > 8 || midDelta > 8) g.pinchMoved = true

      const ratio = dist / (g.startDist || 1)
      const nextZoom = quantizeZoom(Math.max(0.05, g.startView.zoom * ratio))

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
    noteInteraction('pan')
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
      noteInteraction('zoom')
      const p1 = pointersBefore[0]
      const p2 = pointersBefore[1]
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      updateCenterFromScreen(rect, mid.x, mid.y, 1 / ZOOM_STEP_FACTOR)
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
      noteInteraction('zoom')
      const zoomFactor =
        event.pointerType === 'mouse' && event.shiftKey ? 1 / ZOOM_STEP_FACTOR : ZOOM_STEP_FACTOR
      updateCenterFromPointer(event, zoomFactor)
    }
  }

  const handleCanvasContextMenu = (event) => {
    noteInteraction('zoom')
    event.preventDefault()
    updateCenterFromPointer(event, 1 / ZOOM_STEP_FACTOR)
  }

  const handleWheel = (event) => {
    noteInteraction('zoom')
    // Zoom towards cursor position (desktop mouse wheel / trackpad).
    // Prevent page scroll while interacting with the canvas.
    event.preventDefault()

    // Normalize delta across browsers/devices.
    const deltaModeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
    const delta = event.deltaY * deltaModeScale

    // Exponential zoom feels natural and works well for trackpads.
    const ZOOM_SENSITIVITY = 0.0015
    let zoomFactor = Math.exp(-delta * ZOOM_SENSITIVITY)

    // Clamp per-event zoom to avoid wild jumps.
    zoomFactor = Math.min(5, Math.max(0.2, zoomFactor))

    updateCenterFromPointer(event, zoomFactor)
  }

  const zoomIn = () => {
    noteInteraction('zoom')
    setView((prev) => ({ ...prev, zoom: quantizeZoom(prev.zoom * ZOOM_STEP_FACTOR) }))
  }
  const zoomOut = () => {
    noteInteraction('zoom')
    setView((prev) => ({ ...prev, zoom: quantizeZoom(prev.zoom / ZOOM_STEP_FACTOR) }))
  }
  const reset = () => {
    const base = FRACTALS[fractalType]?.defaultView || FRACTALS.mandelbrot.defaultView
    setView((prev) => ({
      ...prev,
      ...base,
      zoom: quantizeZoom(base.zoom),
      maxIter: DEFAULT_VIEW.maxIter,
    }))
  }

  const tipText = useMemo(() => {
    return 'Pinch to zoom. Two-finger tap to zoom out. Drag to move.'
  }, [])

  const previewActive =
    adaptiveQuality &&
    interactionMode === 'zoom' &&
    (renderScale < internalScale || renderMaxIter < view.maxIter)

  const handleFractalChange = (nextType) => {
    setFractalType(nextType)
    const base = FRACTALS[nextType]?.defaultView || FRACTALS.mandelbrot.defaultView
    setView((prev) => ({ ...prev, ...base, zoom: quantizeZoom(base.zoom) }))
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Escape-Time Explorer</p>
          <p className="lede">
            Tap to zoom in, drag to pan, and pinch to zoom on mobile. Two-finger tap zooms out. On
            desktop: click to zoom, Shift/right-click to zoom out.
          </p>
        </div>
        <div className="controls">
          <label className="picker">
            <span>Fractal</span>
            <select
              value={fractalType}
              onChange={(event) => handleFractalChange(event.target.value)}
              aria-label="Fractal type"
            >
              {Object.entries(FRACTALS).map(([key, spec]) => (
                <option key={key} value={key}>
                  {spec.label}
                </option>
              ))}
            </select>
          </label>

          <label className="picker">
            <span>Colors</span>
            <select
              value={colorScheme}
              onChange={(event) => setColorScheme(event.target.value)}
              aria-label="Color scheme"
            >
              {Object.entries(COLOR_SCHEMES).map(([key, spec]) => (
                <option key={key} value={key}>
                  {spec.label}
                </option>
              ))}
            </select>
          </label>

          <label className="picker">
            <span>Internal resolution</span>
            <select
              value={String(internalScale)}
              onChange={(event) => setInternalScale(Number(event.target.value))}
              aria-label="Internal resolution"
            >
              <option value="1">100%</option>
              <option value="0.75">75%</option>
              <option value="0.5">50%</option>
              <option value="0.25">25%</option>
            </select>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={adaptiveQuality}
              onChange={(event) => setAdaptiveQuality(event.target.checked)}
            />
            <span>Adaptive quality while moving</span>
          </label>

          {fractalType === 'julia' && (
            <div className="julia-controls">
              <label className="picker small">
                <span>Julia c (real)</span>
                <input
                  type="number"
                  step="0.01"
                  value={juliaC.re}
                  onChange={(event) =>
                    setJuliaC((prev) => ({ ...prev, re: Number(event.target.value) || 0 }))
                  }
                />
              </label>
              <label className="picker small">
                <span>Julia c (imag)</span>
                <input
                  type="number"
                  step="0.01"
                  value={juliaC.im}
                  onChange={(event) =>
                    setJuliaC((prev) => ({ ...prev, im: Number(event.target.value) || 0 }))
                  }
                />
              </label>
            </div>
          )}

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
            onWheel={handleWheel}
            role="img"
            aria-label={`${FRACTALS[fractalType]?.label || 'Fractal'} set`}
          />
        </div>
        <div className="meta">
          <div>
            <span>Fractal</span>
            <strong>{FRACTALS[fractalType]?.label || 'Mandelbrot'}</strong>
          </div>
          <div>
            <span>Colors</span>
            <strong>{COLOR_SCHEMES[colorScheme]?.label || 'Aurora'}</strong>
          </div>
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
            <span>Render</span>
            <strong>{Math.round(renderScale * 100)}%</strong>
          </div>
          <div>
            <span>Quality</span>
            <strong>{previewActive ? 'Preview' : 'Full'}</strong>
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
