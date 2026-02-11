import { useEffect, useRef, useState } from 'react'
import './App.css'

const DEFAULT_VIEW = {
  centerX: -0.5,
  centerY: 0,
  zoom: 1,
  maxIter: 600,
}

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
  const renderIdRef = useRef(0)

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!size.width || !size.height) return

    const dpr = size.dpr
    const pixelWidth = Math.floor(size.width * dpr)
    const pixelHeight = Math.floor(size.height * dpr)

    canvas.width = pixelWidth
    canvas.height = pixelHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    renderIdRef.current += 1
    const renderId = renderIdRef.current

    const imageData = ctx.createImageData(pixelWidth, pixelHeight)
    const data = imageData.data

    const scale = 4 / (view.zoom * Math.min(pixelWidth, pixelHeight))
    const halfW = pixelWidth / 2
    const halfH = pixelHeight / 2
    const maxIter = view.maxIter

    let y = 0

    const drawChunk = () => {
      if (renderId !== renderIdRef.current) return
      const rowsPerFrame = 24
      const yEnd = Math.min(pixelHeight, y + rowsPerFrame)

      for (; y < yEnd; y += 1) {
        const cy = (y - halfH) * scale + view.centerY
        for (let x = 0; x < pixelWidth; x += 1) {
          const cx = (x - halfW) * scale + view.centerX
          let zx = 0
          let zy = 0
          let iter = 0

          while (zx * zx + zy * zy <= 4 && iter < maxIter) {
            const xtemp = zx * zx - zy * zy + cx
            zy = 2 * zx * zy + cy
            zx = xtemp
            iter += 1
          }

          const offset = (y * pixelWidth + x) * 4
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

      ctx.putImageData(imageData, 0, 0)

      if (y < pixelHeight) {
        requestAnimationFrame(drawChunk)
      }
    }

    drawChunk()
  }, [size, view])

  const screenToComplex = (rect, x, y, viewLike) => {
    const scale = 4 / (viewLike.zoom * Math.min(rect.width, rect.height))
    return {
      x: (x - rect.width / 2) * scale + viewLike.centerX,
      y: (y - rect.height / 2) * scale + viewLike.centerY,
    }
  }

  const updateCenterFromScreen = (rect, x, y, zoomFactor) => {
    const anchor = screenToComplex(rect, x, y, view)

    setView((prev) => {
      const nextZoom = prev.zoom * zoomFactor
      const nextScale = 4 / (nextZoom * Math.min(rect.width, rect.height))
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
      const [p1, p2] = Array.from(g.pointers.values())
      beginPinch(rect, p1, p2)
      return
    }

    // start pan with single pointer
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

      // Detect whether this was a real pinch (not a quick 2-finger tap)
      const distDelta = Math.abs(dist - (g.startDist || 0))
      const midDelta = Math.hypot(mid.x - g.startMid.x, mid.y - g.startMid.y)
      if (distDelta > 8 || midDelta > 8) g.pinchMoved = true

      const ratio = dist / (g.startDist || 1)
      const nextZoom = Math.max(0.05, g.startView.zoom * ratio)
      const nextScale = 4 / (nextZoom * Math.min(rect.width, rect.height))

      // Keep the complex coordinate under the pinch midpoint stable.
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

    const scale = 4 / (drag.startZoom * Math.min(rect.width, rect.height))

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
      // Mouse: shift-click zooms out; Touch: tap zooms in (use buttons or two-finger tap for zoom out).
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

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Mandelbrot Explorer</p>
          <p className="lede">
            Tap to zoom in, drag to pan, and pinch to zoom on mobile. Two-finger tap zooms out.
            On desktop: click to zoom, Shift/right-click to zoom out.
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
            <strong>Pinch to zoom. Two-finger tap to zoom out. Drag to move.</strong>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
