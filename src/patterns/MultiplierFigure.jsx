import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  ESCAPES,
  SETTLES,
  UNDECIDED,
  createCycleResult,
  findCycle,
  inMainCardioid,
  inPeriod2Bulb,
} from './dynamics.js'
import { formatSettle } from './format.js'
import { Abs, Chips, Complex, Polar, Readout } from './MathText.jsx'
import {
  PLOT,
  blendTo,
  createRowRunner,
  createSurface,
  eventToPixel,
  hslInto,
  makeView,
  paint,
  renderScale,
  rgba,
  sizeCanvas,
  toComplex,
  toPixel,
} from './plot.js'
import { useElementWidth } from './useElementWidth.js'

const VIEW = { cx: -0.72, cy: 0, halfHeight: 1.2, aspect: 4 / 3, maxIter: 1000 }
const MODES = [
  { key: 'speed', label: 'Settling speed |λ|' },
  { key: 'angle', label: 'Turn per lap arg λ' },
]
const DEFAULT_PIN = [-1.1, 0.12]

function colorize(data, mode) {
  const { width, height, kind, magnitude, angle, steps } = data
  const surface = createSurface(width, height)
  const ctx = surface.getContext('2d')
  const image = ctx.createImageData(width, height)
  const d = image.data
  const rgb = [0, 0, 0]
  const band = (p) => Math.min(9, Math.floor(magnitude[p] * 10))
  const sameKindOtherBand = (q, b) => kind[q] === SETTLES && band(q) !== b

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const i = p * 4
      if (kind[p] === ESCAPES) {
        paint(d, i, PLOT.far, PLOT.near, 0.1 + 0.32 * (1 - Math.exp(-steps[p] / 10)))
        continue
      }
      if (kind[p] === UNDECIDED) {
        paint(d, i, PLOT.inEdge, PLOT.set, 0.5)
        continue
      }
      const m = magnitude[p]
      const b = band(p)
      if (mode === 'angle') {
        hslInto(angle[p], 0.62, 0.8 - 0.36 * m, rgb)
        paint(d, i, rgb, rgb, 0)
      } else {
        paint(d, i, PLOT.inCenter, PLOT.inEdge, Math.pow(m, 0.9))
        if (b & 1) blendTo(d, i, PLOT.inCenter, 0.1)
      }
      const line =
        (x > 0 && sameKindOtherBand(p - 1, b)) ||
        (x < width - 1 && sameKindOtherBand(p + 1, b)) ||
        (y > 0 && sameKindOtherBand(p - width, b)) ||
        (y < height - 1 && sameKindOtherBand(p + width, b))
      if (line) blendTo(d, i, PLOT.inLine, 0.6)
    }
  }
  ctx.putImageData(image, 0, 0)
  return surface
}

function drawMultiplier(canvas, base, view, overlay, probe) {
  if (!canvas || !base) return
  sizeCanvas(canvas, base.width, base.height)
  const ctx = canvas.getContext('2d')
  const k = renderScale()
  ctx.drawImage(base, 0, 0)

  if (overlay) {
    ctx.save()
    ctx.setLineDash([4 * k, 3 * k])
    ctx.lineWidth = 1.4 * k
    ctx.strokeStyle = rgba(PLOT.overlay, 1)
    for (let step = 1; step <= 10; step += 1) {
      const r = step / 10
      // Main cardioid: c = lambda / 2 - lambda^2 / 4 with |lambda| = r.
      ctx.beginPath()
      for (let s = 0; s <= 720; s += 1) {
        const t = (s / 720) * 2 * Math.PI
        const x = (r * Math.cos(t)) / 2 - (r * r * Math.cos(2 * t)) / 4
        const y = (r * Math.sin(t)) / 2 - (r * r * Math.sin(2 * t)) / 4
        const [px, py] = toPixel(view, x, y)
        if (s) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      }
      ctx.stroke()
      // Period-2 bulb: lambda = 4(c + 1), so |c + 1| = r / 4.
      const [cx, cy] = toPixel(view, -1, 0)
      ctx.beginPath()
      ctx.arc(cx, cy, r / 4 / view.s, 0, 2 * Math.PI)
      ctx.stroke()
    }
    ctx.restore()
  }

  const [px, py] = toPixel(view, probe[0], probe[1])
  ctx.lineWidth = 4 * k
  ctx.strokeStyle = rgba(PLOT.surface, 0.9)
  ctx.beginPath()
  ctx.arc(px, py, 6 * k, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.lineWidth = 1.8 * k
  ctx.strokeStyle = rgba(PLOT.ink, 1)
  ctx.beginPath()
  ctx.arc(px, py, 6 * k, 0, 2 * Math.PI)
  ctx.stroke()
}

function probeRows(probe) {
  const [cr, ci] = probe
  const cycle = findCycle(cr, ci, 3000, createCycleResult())
  const rows = [[<var key="c">c</var>, <Complex x={cr} y={ci} />]]
  if (cycle.kind === SETTLES) {
    const r = Math.hypot(cycle.lr, cycle.li)
    const degrees = (Math.atan2(cycle.li, cycle.lr) * 180) / Math.PI
    rows.push(['Cycle', cycle.period === 1 ? 'fixed point (period 1)' : `period ${cycle.period}`])
    rows.push([<var key="l">λ</var>, <Polar x={cycle.lr} y={cycle.li} />])
    rows.push(['Turn per lap', `${((((degrees % 360) + 360) % 360) / 360).toFixed(3)} of a turn`])
    rows.push([<>Steps to 10<sup>−6</sup></>, formatSettle(cycle.period, r)])
    if (inMainCardioid(cr, ci)) {
      rows.push([
        'Region',
        <>
          main cardioid, where <var>c</var> = <var>λ</var>/2 − <var>λ</var>²/4
        </>,
      ])
    } else if (inPeriod2Bulb(cr, ci)) {
      rows.push([
        'Region',
        <>
          period-2 bulb:{' '}
          <Abs>
            <var>c</var> + 1
          </Abs>{' '}
          = {Math.hypot(cr + 1, ci).toFixed(4)} = <Abs><var>λ</var></Abs>/4
        </>,
      ])
    } else {
      rows.push(['Region', 'a smaller bulb; its contours are distorted circles'])
    }
  } else if (cycle.kind === ESCAPES) {
    rows.push(['Outside', `escapes at step ${cycle.steps}`])
  } else {
    rows.push(['Status', 'does not settle within 3,000 steps; |λ| is close to 1 here, at the boundary'])
  }
  return rows
}

export default function MultiplierFigure() {
  const canvasRef = useRef(null)
  const dataRef = useRef(null)
  const baseRef = useRef(null)
  const [mode, setMode] = useState('speed')
  const [overlay, setOverlay] = useState(false)
  const [pinned, setPinned] = useState(DEFAULT_PIN)
  const [hover, setHover] = useState(null)
  const cssWidth = useElementWidth(canvasRef)
  const probe = hover || pinned

  const recolorAndDraw = useEffectEvent(() => {
    const data = dataRef.current
    if (!data) return
    baseRef.current = colorize(data, mode)
    drawMultiplier(canvasRef.current, baseRef.current, data.view, overlay, probe)
  })

  useEffect(() => {
    if (!cssWidth) return undefined
    const width = Math.round(cssWidth * renderScale())
    const height = Math.round(width / VIEW.aspect)
    const view = makeView(VIEW.cx, VIEW.cy, VIEW.halfHeight, width, height)
    const size = width * height
    const kind = new Uint8Array(size)
    const magnitude = new Float32Array(size)
    const angle = new Float32Array(size)
    const steps = new Uint16Array(size)
    const cycle = createCycleResult()
    const runner = createRowRunner()
    runner.start(
      height,
      (py) => {
        const ci = view.cy + (height / 2 - py - 0.5) * view.s
        for (let px = 0; px < width; px += 1) {
          const p = py * width + px
          findCycle(view.cx + (px + 0.5 - width / 2) * view.s, ci, VIEW.maxIter, cycle)
          kind[p] = cycle.kind
          if (cycle.kind === SETTLES) {
            magnitude[p] = Math.hypot(cycle.lr, cycle.li)
            angle[p] = (Math.atan2(cycle.li, cycle.lr) * 180) / Math.PI
          } else if (cycle.kind === ESCAPES) {
            steps[p] = cycle.steps
          }
        }
      },
      () => {
        dataRef.current = { width, height, kind, magnitude, angle, steps, view }
        recolorAndDraw()
      },
    )
    return () => runner.cancel()
  }, [cssWidth])

  useEffect(() => {
    recolorAndDraw()
  }, [mode])

  useEffect(() => {
    const data = dataRef.current
    if (data) drawMultiplier(canvasRef.current, baseRef.current, data.view, overlay, probe)
  }, [overlay, probe])

  const pointAt = (event) => {
    const data = dataRef.current
    const canvas = canvasRef.current
    if (!data || !canvas) return null
    const [px, py] = eventToPixel(canvas, event)
    return toComplex(data.view, px, py)
  }

  return (
    <div className="figure-grid">
      <figure>
        <canvas
          ref={canvasRef}
          className="plot plot-4x3 plot-probe"
          role="img"
          aria-label="Interior of the Mandelbrot set colored by the multiplier of the attracting cycle"
          onPointerMove={(event) => {
            if (event.pointerType !== 'mouse') return
            const point = pointAt(event)
            if (point) setHover(point)
          }}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(event) => {
            const point = pointAt(event)
            if (!point) return
            setPinned(point)
            setHover(null)
          }}
        />
        <figcaption>Hover or tap to read the cycle at a point. Darker means slower to settle.</figcaption>
      </figure>
      <div className="figure-controls">
        <div className="control-group">
          <span className="control-label">Color by</span>
          <Chips label="Color by" options={MODES} value={mode} onSelect={setMode} />
        </div>
        <label className="toggle">
          <input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} />
          Overlay the exact formulas for the cardioid and the period-2 bulb
        </label>
        <Readout label="Cycle at the probed point" rows={probeRows(probe)} />
        <div className="legend">
          <span>
            <i className="swatch swatch-dark" />
            <span>computed |λ| = 0.1 … 0.9</span>
          </span>
          <span>
            <i className="swatch swatch-overlay" />
            <span>exact formula curves</span>
          </span>
        </div>
      </div>
    </div>
  )
}
