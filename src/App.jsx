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

  const updateCenterFromPointer = (event, zoomFactor) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const scale = 4 / (view.zoom * Math.min(rect.width, rect.height))
    const cx = (x - rect.width / 2) * scale + view.centerX
    const cy = (y - rect.height / 2) * scale + view.centerY

    setView((prev) => ({
      ...prev,
      centerX: cx,
      centerY: cy,
      zoom: prev.zoom * zoomFactor,
    }))
  }

  const handlePointerDown = (event) => {
    if (event.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.setPointerCapture(event.pointerId)
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
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) > 3) {
      drag.moved = true
    }
    if (!drag.moved) return

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scale = 4 / (drag.startZoom * Math.min(rect.width, rect.height))

    setView((prev) => ({
      ...prev,
      centerX: drag.startCenterX - dx * scale,
      centerY: drag.startCenterY - dy * scale,
    }))
  }

  const finishPointer = (event) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return

    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
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
    setIsDragging(false)

    if (!didDrag) {
      const zoomFactor = event.shiftKey ? 1 / 1.8 : 1.8
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
            Click to zoom in, Shift-click or right-click to zoom out, and drag
            to pan. Use the controls to adjust iterations or reset back to the
            classic view.
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
            <strong>Drag to move. Shift/right-click to zoom out.</strong>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
