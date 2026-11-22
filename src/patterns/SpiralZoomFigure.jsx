import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { cinv, cmul, repellingMultiplier, smoothEscape } from './dynamics.js'
import { formatNumber, formatTurn, formatZoom } from './format.js'
import { Chips, Complex, Polar, Readout, Sci } from './MathText.jsx'
import {
  PLOT,
  blendTo,
  createRowRunner,
  createSurface,
  eventToPixel,
  makeView,
  paint,
  renderScale,
  rgba,
  sizeCanvas,
  toComplex,
  toPixel,
} from './plot.js'
import { useElementWidth } from './useElementWidth.js'

// Misiurewicz points: the orbit of 0 lands on a repelling cycle after `preperiod` steps.
// `arms` is how many powers of rho make one smooth turn of the spiral.
const RAW_SPOTS = [
  {
    key: 'seahorse',
    label: 'Seahorse tail',
    c: [-0.7756837680090538, 0.1364673682946901],
    preperiod: 24,
    period: 1,
    arms: 2,
    halfHeight: 0.02,
    startZoom: 1.3,
    iterBase: 1500,
    iterPerDecade: 250,
  },
  {
    key: 'elephant',
    label: 'Elephant trunk',
    c: [0.28488453727317437, 0.011121821889581928],
    preperiod: 17,
    period: 1,
    arms: 1,
    halfHeight: 0.02,
    startZoom: 2,
    iterBase: 1000,
    iterPerDecade: 200,
  },
  {
    key: 'i',
    label: 'c = i',
    c: [0, 1],
    preperiod: 2,
    period: 2,
    arms: 1,
    halfHeight: 0.5,
    startZoom: 0.6,
    iterBase: 400,
    iterPerDecade: 120,
  },
]
const SPOTS = Object.fromEntries(
  RAW_SPOTS.map((spot) => {
    const rho = repellingMultiplier(spot.c, spot.preperiod, spot.period)
    const sigma = spot.arms === 2 ? cmul(rho, rho) : rho
    return [spot.key, { ...spot, rho, sigma }]
  }),
)
const MAX_ZOOM = 9
const ZOOM_SPEED = 0.4 // decades per second while playing
const COPY_GRID = 1000

// The view for a zoom level (log10). With cancelTurn, the view turns with the zoom by
// arg(sigma) per factor |sigma|, which makes the picture (nearly) periodic in the zoom.
function spiralFrame(spot, zoom, cancelTurn) {
  const halfHeight = spot.halfHeight * Math.pow(10, -zoom)
  let rotation = 0
  if (cancelTurn) {
    const logScale = Math.log(Math.hypot(spot.sigma[0], spot.sigma[1]))
    const turn = Math.atan2(spot.sigma[1], spot.sigma[0])
    rotation = (-turn * zoom * Math.LN10) / logScale
  }
  return { cx: spot.c[0], cy: spot.c[1], halfHeight, rotation }
}

function frameView(frame, size) {
  return makeView(frame.cx, frame.cy, frame.halfHeight, size, size, frame.rotation)
}

function defaultMark(spot, zoom, cancelTurn) {
  const frame = spiralFrame(spot, zoom, cancelTurn)
  const r = 0.6 * frame.halfHeight
  const t = frame.rotation + 2.3
  return [spot.c[0] + r * Math.cos(t), spot.c[1] + r * Math.sin(t)]
}

// Copies of the marked spot at c0 + (mark - c0) / rho^n that fall inside the view.
function copiesInView(spot, mark, frame) {
  const view = frameView(frame, COPY_GRID)
  const rhoInverse = cinv(spot.rho)
  const start = [mark[0] - spot.c[0], mark[1] - spot.c[1]]
  const copies = []
  const keep = (offset, n) => {
    const point = [spot.c[0] + offset[0], spot.c[1] + offset[1]]
    const [px, py] = toPixel(view, point[0], point[1])
    if (px > -10 && px < COPY_GRID + 10 && py > -10 && py < COPY_GRID + 10) copies.push({ point, n })
  }
  let offset = start
  for (let n = -1; n >= -4; n -= 1) {
    offset = cmul(offset, spot.rho)
    keep(offset, n)
  }
  keep(start, 0)
  offset = start
  for (let n = 1; n < 5000; n += 1) {
    offset = cmul(offset, rhoInverse)
    if (Math.hypot(offset[0], offset[1]) < frame.halfHeight / 400) break
    keep(offset, n)
  }
  return copies
}

function colorSpiral(values, size) {
  const surface = createSurface(size, size)
  const ctx = surface.getContext('2d')
  const image = ctx.createImageData(size, size)
  const d = image.data
  let lo = Infinity
  let hi = -Infinity
  for (let p = 0; p < values.length; p += 1) {
    if (values[p] > 0) {
      const l = Math.log(values[p])
      if (l < lo) lo = l
      if (l > hi) hi = l
    }
  }
  if (!(hi > lo)) {
    lo = 0
    hi = 1
  }
  for (let p = 0, i = 0; p < values.length; p += 1, i += 4) {
    const v = values[p]
    if (v < 0) {
      paint(d, i, PLOT.set, PLOT.set, 0)
      continue
    }
    const t = Math.pow((Math.log(Math.max(v, 1e-3)) - lo) / (hi - lo), 0.85)
    paint(d, i, PLOT.far, PLOT.near, Math.min(1, Math.max(0, t)))
    if (Math.floor(v) & 1) blendTo(d, i, PLOT.far, 0.07)
  }
  ctx.putImageData(image, 0, 0)
  return surface
}

function spiralJob(spot, frame, size, zoom) {
  const view = frameView(frame, size)
  const maxIter = Math.round(spot.iterBase + spot.iterPerDecade * zoom)
  const values = new Float32Array(size * size)
  return {
    rows: size,
    row: (py) => {
      const w = (size / 2 - py - 0.5) * view.s
      for (let px = 0; px < size; px += 1) {
        const u = (px + 0.5 - size / 2) * view.s
        values[py * size + px] = smoothEscape(
          view.cx + u * view.cos - w * view.sin,
          view.cy + u * view.sin + w * view.cos,
          maxIter,
        )
      }
    },
    finish: () => colorSpiral(values, size),
  }
}

function drawSpiral(canvas, base, spot, frame, mark, cssWidth) {
  if (!canvas || !cssWidth) return
  const k = renderScale()
  const size = Math.round(cssWidth * k)
  sizeCanvas(canvas, size, size)
  const ctx = canvas.getContext('2d')
  if (base) {
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(base, 0, 0, size, size)
  }
  const view = frameView(frame, size)
  const c0 = spot.c
  const logScale = Math.log(Math.hypot(spot.sigma[0], spot.sigma[1]))
  const turn = Math.atan2(spot.sigma[1], spot.sigma[0])

  // One logarithmic spiral c0 + offset * sigma^(-t) per arm.
  ctx.lineWidth = 1.3 * k
  ctx.strokeStyle = rgba(PLOT.accent, 0.7)
  let offset = [mark[0] - c0[0], mark[1] - c0[1]]
  const rhoInverse = cinv(spot.rho)
  for (let arm = 0; arm < spot.arms; arm += 1) {
    const end = Math.log(Math.hypot(offset[0], offset[1]) / (0.4 * view.s)) / logScale
    ctx.beginPath()
    let drawing = false
    for (let t = -2.5; t <= end; t += 0.02) {
      const scale = Math.exp(-t * logScale)
      const point = cmul(offset, [scale * Math.cos(-t * turn), scale * Math.sin(-t * turn)])
      const [px, py] = toPixel(view, c0[0] + point[0], c0[1] + point[1])
      if (Math.abs(px) > 8 * size || Math.abs(py) > 8 * size) {
        drawing = false
        continue
      }
      if (drawing) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
      drawing = true
    }
    ctx.stroke()
    offset = cmul(offset, rhoInverse)
  }

  copiesInView(spot, mark, frame).forEach(({ point, n }) => {
    const [px, py] = toPixel(view, point[0], point[1])
    const r = (n === 0 ? 6 : 3) * k
    ctx.lineWidth = 3 * k
    ctx.strokeStyle = rgba(PLOT.surface, 0.9)
    ctx.beginPath()
    ctx.arc(px, py, r, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.lineWidth = 2 * k
    ctx.fillStyle = rgba(PLOT.accent, 1)
    ctx.strokeStyle = rgba(PLOT.accent, 1)
    ctx.beginPath()
    ctx.arc(px, py, r, 0, 2 * Math.PI)
    if (n === 0) ctx.stroke()
    else ctx.fill()
  })

  const [ox, oy] = toPixel(view, c0[0], c0[1])
  const r = 7 * k
  const cross = () => {
    ctx.beginPath()
    ctx.moveTo(ox - r, oy)
    ctx.lineTo(ox + r, oy)
    ctx.moveTo(ox, oy - r)
    ctx.lineTo(ox, oy + r)
    ctx.stroke()
  }
  ctx.lineCap = 'round'
  ctx.lineWidth = 4 * k
  ctx.strokeStyle = rgba(PLOT.surface, 0.85)
  cross()
  ctx.lineWidth = 1.6 * k
  ctx.strokeStyle = rgba(PLOT.ink, 1)
  cross()
  ctx.lineCap = 'butt'
}

function spotRows(spot, frame, cancelTurn, copyCount) {
  const { rho, sigma } = spot
  const rhoSize = Math.hypot(rho[0], rho[1])
  const rhoTurn = (Math.atan2(rho[1], rho[0]) * 180) / Math.PI
  const sigmaLog = Math.log(Math.hypot(sigma[0], sigma[1]))
  const sigmaTurn = (Math.atan2(sigma[1], sigma[0]) * 180) / Math.PI
  const perDecade = (-sigmaTurn * Math.LN10) / sigmaLog
  const cycle = spot.period === 1 ? 'fixed point' : `${spot.period}-cycle`
  const rows = [
    [
      <>
        <var>c</var>
        <sub>0</sub>
      </>,
      <Complex x={spot.c[0]} y={spot.c[1]} digits={8} />,
    ],
    ['Orbit of 0', `lands on a repelling ${cycle} after ${spot.preperiod} steps`],
    [<var key="rho">ρ</var>, <Polar x={rho[0]} y={rho[1]} />],
    [`Zoom ×${rhoSize.toFixed(3)}`, `picture turns ${formatTurn(-rhoTurn)}`],
    ['Per 10× zoom', `arms turn ${formatTurn(perDecade)}`],
    ['View width', <Sci value={2 * frame.halfHeight} />],
  ]
  if (cancelTurn) {
    const degrees = (((frame.rotation * 180) / Math.PI) % 360 + 360) % 360
    rows.push(['View rotated', `${formatNumber(degrees, 1)}°`])
  }
  rows.push(['Copies on screen', String(copyCount)])
  return rows
}

export default function SpiralZoomFigure() {
  const canvasRef = useRef(null)
  const baseRef = useRef(null)
  const qualityRef = useRef(0.6)
  const [spotKey, setSpotKey] = useState('seahorse')
  const [zoom, setZoom] = useState(SPOTS.seahorse.startZoom)
  const [cancelTurn, setCancelTurn] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [mark, setMark] = useState(() => defaultMark(SPOTS.seahorse, SPOTS.seahorse.startZoom, false))
  const cssWidth = useElementWidth(canvasRef)
  const spot = SPOTS[spotKey]
  const frame = spiralFrame(spot, zoom, cancelTurn)
  const copyCount = copiesInView(spot, mark, frame).length

  const redraw = useEffectEvent(() => drawSpiral(canvasRef.current, baseRef.current, spot, frame, mark, cssWidth))

  // A quick low-resolution pass on every change, then a full pass once things settle.
  useEffect(() => {
    if (!cssWidth) return undefined
    const current = SPOTS[spotKey]
    const currentFrame = spiralFrame(current, zoom, cancelTurn)
    const started = performance.now()
    const quick = spiralJob(current, currentFrame, Math.max(48, Math.round(cssWidth * qualityRef.current)), zoom)
    for (let row = 0; row < quick.rows; row += 1) quick.row(row)
    baseRef.current = quick.finish()
    const elapsed = performance.now() - started
    if (elapsed > 40) qualityRef.current = Math.max(0.3, qualityRef.current * 0.85)
    else if (elapsed < 18) qualityRef.current = Math.min(renderScale(), qualityRef.current * 1.12)
    redraw()
    if (playing) return undefined

    const runner = createRowRunner()
    const timer = setTimeout(() => {
      const full = spiralJob(current, currentFrame, Math.round(cssWidth * renderScale()), zoom)
      runner.start(full.rows, full.row, () => {
        baseRef.current = full.finish()
        redraw()
      })
    }, 160)
    return () => {
      clearTimeout(timer)
      runner.cancel()
    }
  }, [spotKey, zoom, cancelTurn, playing, cssWidth])

  useEffect(() => {
    redraw()
  }, [mark])

  useEffect(() => {
    if (!playing) return undefined
    let last = 0
    let frameId = 0
    const tick = (time) => {
      const dt = last ? Math.min(0.1, (time - last) / 1000) : 0
      last = time
      setZoom((prev) => (prev + dt * ZOOM_SPEED > MAX_ZOOM ? 0 : prev + dt * ZOOM_SPEED))
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [playing])

  const selectSpot = (key) => {
    const next = SPOTS[key]
    setSpotKey(key)
    setZoom(next.startZoom)
    setMark(defaultMark(next, next.startZoom, cancelTurn))
  }

  const placeMark = (event) => {
    const canvas = canvasRef.current
    if (!canvas || !canvas.width) return
    const [px, py] = eventToPixel(canvas, event)
    setMark(toComplex(frameView(frame, canvas.width), px, py))
  }

  return (
    <div className="figure-grid">
      <figure>
        <canvas
          ref={canvasRef}
          className="plot plot-square plot-probe"
          role="img"
          aria-label="Zoom into a Misiurewicz point showing logarithmic spirals"
          onPointerDown={placeMark}
        />
        <figcaption>
          Centered on <var>c</var>
          <sub>0</sub> (small cross). Click to move the marked spot.
        </figcaption>
      </figure>
      <div className="figure-controls">
        <div className="control-group">
          <span className="control-label">Point</span>
          <Chips label="Misiurewicz point" options={RAW_SPOTS} value={spotKey} onSelect={selectSpot} />
        </div>
        <label className="control-group" htmlFor="spiral-zoom">
          <span className="control-row">
            <span className="control-label">Zoom</span>
            <output className="control-value" htmlFor="spiral-zoom">
              {formatZoom(zoom)}
            </output>
          </span>
          <input
            id="spiral-zoom"
            type="range"
            min="0"
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <div className="control-row">
          <button
            type="button"
            className={`chip ${playing ? 'active' : ''}`}
            aria-pressed={playing}
            onClick={() => setPlaying((prev) => !prev)}
          >
            {playing ? 'Pause' : 'Play zoom'}
          </button>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={cancelTurn} onChange={(event) => setCancelTurn(event.target.checked)} />
          Cancel the turn (rotate the view with the zoom)
        </label>
        <Readout label="Zoom details" rows={spotRows(spot, frame, cancelTurn, copyCount)} />
        <div className="legend">
          <span>
            <i className="swatch swatch-dot" />
            <span>copies of the marked spot</span>
          </span>
          <span>
            <i className="swatch swatch-accent" />
            <span>logarithmic spiral through them</span>
          </span>
        </div>
      </div>
    </div>
  )
}
