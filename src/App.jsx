import { useEffect, useRef, useState } from 'react'
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
    navigatorBounds: { minX: -2.3, maxX: 1.1, minY: -1.4, maxY: 1.4 },
  },
  julia: {
    label: 'Julia',
    defaultView: { centerX: 0, centerY: 0, zoom: 1.2 },
    navigatorBounds: { minX: -1.8, maxX: 1.8, minY: -1.5, maxY: 1.5 },
  },
  burningShip: {
    label: 'Burning Ship',
    defaultView: { centerX: -0.45, centerY: -0.5, zoom: 1.8 },
    navigatorBounds: { minX: -2.1, maxX: 1.2, minY: -2.2, maxY: 0.6 },
  },
  tricorn: {
    label: 'Tricorn',
    defaultView: { centerX: 0, centerY: 0, zoom: 1.2 },
    navigatorBounds: { minX: -2.2, maxX: 2.2, minY: -1.8, maxY: 1.8 },
  },
}

const COLOR_SCHEMES = {
  aurora: { label: 'Aurora' },
  fire: { label: 'Fire' },
  ocean: { label: 'Ocean' },
  grayscale: { label: 'Grayscale' },
  neon: { label: 'Neon' },
}

const ZOOM_QUANT_STEP = 1.015
const ZOOM_STEP_BUCKETS = 46
const ZOOM_STEP_FACTOR = Math.pow(ZOOM_QUANT_STEP, ZOOM_STEP_BUCKETS)
const MINIMAP_MAX_ITER = 180
const DEFAULT_MINIMAP_ZOOM = 1

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

function scaleFor(zoom, pixelW, pixelH) {
  return 4 / (zoom * Math.min(pixelW, pixelH))
}

function complexToPixel(cx, cy, renderView, pixelW, pixelH) {
  const scale = scaleFor(renderView.zoom, pixelW, pixelH)
  return {
    x: (cx - renderView.centerX) / scale + pixelW / 2,
    y: (cy - renderView.centerY) / scale + pixelH / 2,
  }
}

function pixelToComplex(px, py, renderView, pixelW, pixelH) {
  const scale = scaleFor(renderView.zoom, pixelW, pixelH)
  return {
    x: (px - pixelW / 2) * scale + renderView.centerX,
    y: (py - pixelH / 2) * scale + renderView.centerY,
  }
}

function renderFractalImageData(ctx, pixelW, pixelH, renderView, fractalType, colorScheme, juliaC) {
  const img = ctx.createImageData(pixelW, pixelH)
  const data = img.data
  const scale = scaleFor(renderView.zoom, pixelW, pixelH)
  const halfW = pixelW / 2
  const halfH = pixelH / 2

  for (let py = 0; py < pixelH; py += 1) {
    const cy = (py - halfH) * scale + renderView.centerY
    for (let px = 0; px < pixelW; px += 1) {
      const cx = (px - halfW) * scale + renderView.centerX
      const { iter, zx, zy } = iterateEscape(cx, cy, renderView.maxIter, fractalType, juliaC)
      const offset = (py * pixelW + px) * 4

      if (iter >= renderView.maxIter) {
        data[offset] = 5
        data[offset + 1] = 10
        data[offset + 2] = 16
        data[offset + 3] = 255
      } else {
        const logZn = Math.log(zx * zx + zy * zy) / 2
        const nu = Math.log(logZn / Math.LN2) / Math.LN2
        const smooth = iter + 1 - nu
        const [r, g, b] = colorForT(smooth / renderView.maxIter, colorScheme)
        data[offset] = r
        data[offset + 1] = g
        data[offset + 2] = b
        data[offset + 3] = 255
      }
    }
  }

  ctx.putImageData(img, 0, 0)
}

function getNavigatorBounds(fractalType) {
  return FRACTALS[fractalType]?.navigatorBounds || FRACTALS.mandelbrot.navigatorBounds
}

function getMinimapView(fractalType, zoomFactor, maxIter, pixelW, pixelH) {
  const bounds = getNavigatorBounds(fractalType)
  const boundsWidth = bounds.maxX - bounds.minX
  const boundsHeight = bounds.maxY - bounds.minY
  const scale = Math.max(boundsWidth / pixelW, boundsHeight / pixelH)
  const baseZoom = 4 / (scale * Math.min(pixelW, pixelH))

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    zoom: Math.max(0.22, baseZoom * zoomFactor),
    maxIter,
  }
}

function getViewBounds(renderView, pixelW, pixelH) {
  const scale = scaleFor(renderView.zoom, pixelW, pixelH)
  const halfW = (pixelW / 2) * scale
  const halfH = (pixelH / 2) * scale
  return {
    minX: renderView.centerX - halfW,
    maxX: renderView.centerX + halfW,
    minY: renderView.centerY - halfH,
    maxY: renderView.centerY + halfH,
  }
}

function roundCoord(value) {
  return value.toFixed(2)
}

function App() {
  const canvasRef = useRef(null)
  const minimapRef = useRef(null)

  const [fractalType, setFractalType] = useState('mandelbrot')
  const [colorScheme, setColorScheme] = useState('aurora')
  const [juliaC, setJuliaC] = useState(DEFAULT_JULIA_C)
  const [view, setView] = useState(DEFAULT_VIEW)
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 })
  const [minimapZoom, setMinimapZoom] = useState(DEFAULT_MINIMAP_ZOOM)
  const [minimapIter, setMinimapIter] = useState(MINIMAP_MAX_ITER)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
        dpr: window.devicePixelRatio || 1,
      })
    })

    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.width || !size.height) return

    const dpr = size.dpr
    const pixelW = Math.floor(size.width * dpr)
    const pixelH = Math.floor(size.height * dpr)
    if (canvas.width !== pixelW) canvas.width = pixelW
    if (canvas.height !== pixelH) canvas.height = pixelH
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    renderFractalImageData(ctx, pixelW, pixelH, view, fractalType, colorScheme, juliaC)
  }, [size, view, fractalType, colorScheme, juliaC])

  useEffect(() => {
    const canvas = minimapRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const pixelW = Math.max(1, Math.floor(rect.width * dpr))
    const pixelH = Math.max(1, Math.floor(rect.height * dpr))
    if (canvas.width !== pixelW) canvas.width = pixelW
    if (canvas.height !== pixelH) canvas.height = pixelH

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const minimapView = getMinimapView(fractalType, minimapZoom, minimapIter, pixelW, pixelH)

    renderFractalImageData(ctx, pixelW, pixelH, minimapView, fractalType, colorScheme, juliaC)

    const mainPixelW = Math.max(1, size.width * dpr)
    const mainPixelH = Math.max(1, size.height * dpr)
    const mainScale = scaleFor(view.zoom, mainPixelW, mainPixelH)
    const mainHalfW = (mainPixelW / 2) * mainScale
    const mainHalfH = (mainPixelH / 2) * mainScale

    const topLeft = complexToPixel(
      view.centerX - mainHalfW,
      view.centerY - mainHalfH,
      minimapView,
      pixelW,
      pixelH,
    )
    const bottomRight = complexToPixel(
      view.centerX + mainHalfW,
      view.centerY + mainHalfH,
      minimapView,
      pixelW,
      pixelH,
    )

    ctx.save()
    ctx.strokeStyle = '#f3f7ff'
    ctx.lineWidth = Math.max(2, dpr * 1.5)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
    ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
    ctx.restore()
  }, [fractalType, colorScheme, juliaC, view, size, minimapZoom, minimapIter])

  const updateCenterFromScreen = (rect, x, y, zoomFactor) => {
    const dpr = window.devicePixelRatio || 1
    const pixelW = rect.width * dpr
    const pixelH = rect.height * dpr
    const anchor = {
      x: (x - rect.width / 2) * scaleFor(view.zoom, pixelW, pixelH) + view.centerX,
      y: (y - rect.height / 2) * scaleFor(view.zoom, pixelW, pixelH) + view.centerY,
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
    updateCenterFromScreen(rect, event.clientX - rect.left, event.clientY - rect.top, zoomFactor)
  }

  const handleWheel = (event) => {
    event.preventDefault()
    const deltaModeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
    const delta = event.deltaY * deltaModeScale
    let zoomFactor = Math.exp(-delta * 0.0015)
    zoomFactor = Math.min(5, Math.max(0.2, zoomFactor))
    updateCenterFromPointer(event, zoomFactor)
  }

  const zoomIn = () => {
    setView((prev) => ({ ...prev, zoom: quantizeZoom(prev.zoom * ZOOM_STEP_FACTOR) }))
  }

  const zoomOut = () => {
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

  const handleFractalChange = (nextType) => {
    setFractalType(nextType)
    const base = FRACTALS[nextType]?.defaultView || FRACTALS.mandelbrot.defaultView
    setView((prev) => ({ ...prev, ...base, zoom: quantizeZoom(base.zoom) }))
  }

  const handleMinimapPointer = (event) => {
    const canvas = minimapRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const pixelW = Math.max(1, Math.floor(rect.width * dpr))
    const pixelH = Math.max(1, Math.floor(rect.height * dpr))
    const minimapView = getMinimapView(fractalType, minimapZoom, minimapIter, pixelW, pixelH)

    const target = pixelToComplex(
      (event.clientX - rect.left) * dpr,
      (event.clientY - rect.top) * dpr,
      minimapView,
      pixelW,
      pixelH,
    )

    setView((prev) => ({
      ...prev,
      centerX: target.x,
      centerY: target.y,
    }))
  }

  const tipText = 'Use the minimap to reposition. Use the mouse wheel over the main canvas to zoom.'
  const minimapBounds = getViewBounds(
    getMinimapView(fractalType, minimapZoom, minimapIter, 4, 3),
    4,
    3,
  )

  return (
    <div className="page">
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-block">
            <p className="eyebrow">Escape-Time Explorer</p>
            <p className="lede">
              The main canvas now renders directly without cache reuse. Use the minimap to move
              across the set and the mouse wheel over the main view to zoom in and out.
            </p>
          </div>

          <div className="sidebar-block controls">
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
                min="1"
                max="2000"
                step="1"
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

          <div className="sidebar-block minimap-panel">
            <div className="panel-head">
              <span>Navigator</span>
              <strong>{FRACTALS[fractalType]?.label || 'Mandelbrot'}</strong>
            </div>
            <div className="minimap-settings">
              <label className="slider compact">
                <span>Minimap zoom</span>
                <input
                  type="range"
                  min="0.35"
                  max="2"
                  step="0.05"
                  value={minimapZoom}
                  onChange={(event) => setMinimapZoom(Number(event.target.value))}
                />
                <span className="value">{minimapZoom.toFixed(2)}x</span>
              </label>
              <label className="slider compact">
                <span>Minimap detail</span>
                <input
                  type="range"
                  min="80"
                  max="500"
                  step="20"
                  value={minimapIter}
                  onChange={(event) => setMinimapIter(Number(event.target.value))}
                />
                <span className="value">{minimapIter}</span>
              </label>
            </div>
            <div className="minimap-info" aria-label="Minimap bounds">
              <div>
                <span>Min X</span>
                <strong>{roundCoord(minimapBounds.minX)}</strong>
              </div>
              <div>
                <span>Max X</span>
                <strong>{roundCoord(minimapBounds.maxX)}</strong>
              </div>
              <div>
                <span>Min Y</span>
                <strong>{roundCoord(minimapBounds.minY)}</strong>
              </div>
              <div>
                <span>Max Y</span>
                <strong>{roundCoord(minimapBounds.maxY)}</strong>
              </div>
            </div>
            <canvas
              ref={minimapRef}
              className="minimap"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                handleMinimapPointer(event)
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) handleMinimapPointer(event)
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
              }}
              role="img"
              aria-label={`${FRACTALS[fractalType]?.label || 'Fractal'} minimap`}
            />
            <p className="panel-note">{tipText}</p>
          </div>
        </aside>

        <section className="canvas-shell">
          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
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
              <span>Iterations</span>
              <strong>{view.maxIter}</strong>
            </div>
            <div>
              <span>Navigation</span>
              <strong>Minimap + wheel</strong>
            </div>
            <div>
              <span>Minimap</span>
              <strong>{minimapZoom.toFixed(2)}x / {minimapIter} iters</strong>
            </div>
            <div>
              <span>Tip</span>
              <strong>{tipText}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
