import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  ESCAPES,
  SETTLES,
  createCycleResult,
  createEscapeResult,
  cyclePoints,
  escapeBands,
  findCycle,
  fixedPointMultiplier,
  lambdaToC,
  orbitOf,
} from './dynamics.js'
import { formatSettle, formatTurn } from './format.js'
import { Abs, Chips, Complex, Polar, Readout } from './MathText.jsx'
import {
  LABEL_FONT,
  PLOT,
  createRowRunner,
  createSurface,
  eventToPixel,
  makeView,
  paint,
  renderScale,
  rgba,
  sizeCanvas,
  smoothShade,
  toComplex,
  toPixel,
} from './plot.js'
import { useElementWidth } from './useElementWidth.js'

const PRESETS = [
  { key: 'spiral', label: 'Spiral in', c: lambdaToC(0.95, 0.38) },
  { key: 'five', label: 'Five arms', c: lambdaToC(0.975, 0.405) },
  { key: 'bulb2', label: 'Period-2 bulb', c: [-1.12, 0.17] },
  { key: 'rabbit', label: 'Period-3 bulb', c: [-0.13, 0.76] },
  { key: 'seahorse', label: 'Seahorse valley', c: [-0.75, 0.06] },
]
const PLANE = { cx: -0.65, cy: 0, halfHeight: 1.2, aspect: 4 / 3, maxIter: 500 }
const ORBIT_HALF_HEIGHT = 2.1
const ORBIT_STEPS = 500
const CLASSIFY_ITER = 4000
// Only mention the nearby fixed point when its |lambda| is close to 1.
const NEAR_FIXED_POINT = 1.3

function drawPlane(canvas, base, c) {
  if (!canvas || !base) return
  const { surface, view } = base
  sizeCanvas(canvas, surface.width, surface.height)
  const ctx = canvas.getContext('2d')
  const k = renderScale()
  ctx.drawImage(surface, 0, 0)
  const [px, py] = toPixel(view, c[0], c[1])
  ctx.lineWidth = 4.5 * k
  ctx.strokeStyle = rgba(PLOT.surface, 0.9)
  ctx.beginPath()
  ctx.arc(px, py, 8 * k, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.lineWidth = 2 * k
  ctx.strokeStyle = rgba(PLOT.accent, 1)
  ctx.beginPath()
  ctx.arc(px, py, 8 * k, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.fillStyle = rgba(PLOT.accent, 1)
  ctx.beginPath()
  ctx.arc(px, py, 2.2 * k, 0, 2 * Math.PI)
  ctx.fill()
}

function drawOrbit(canvas, c, cssWidth) {
  if (!canvas || !cssWidth) return
  const k = renderScale()
  const size = Math.round(cssWidth * k)
  sizeCanvas(canvas, size, size)
  const ctx = canvas.getContext('2d')
  const view = makeView(0, 0, ORBIT_HALF_HEIGHT, size, size)
  const [cr, ci] = c

  ctx.fillStyle = rgba(PLOT.surface, 1)
  ctx.fillRect(0, 0, size, size)
  const [ox, oy] = toPixel(view, 0, 0)
  ctx.strokeStyle = rgba(PLOT.grid, 1)
  ctx.lineWidth = k
  ctx.beginPath()
  ctx.moveTo(0, oy)
  ctx.lineTo(size, oy)
  ctx.moveTo(ox, 0)
  ctx.lineTo(ox, size)
  ctx.stroke()

  const radius = 2 / view.s
  ctx.setLineDash([5 * k, 4 * k])
  ctx.strokeStyle = rgba(PLOT.muted, 0.75)
  ctx.beginPath()
  ctx.arc(ox, oy, radius, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.font = `${11 * k}px ${LABEL_FONT}`
  ctx.fillStyle = rgba(PLOT.muted, 1)
  ctx.fillText('|z| = 2', ox + radius * 0.72 + 4 * k, oy - radius * 0.72 - 4 * k)

  const points = orbitOf(cr, ci, ORBIT_STEPS, 3)
  const n = points.length
  ctx.strokeStyle = rgba(PLOT.muted, 0.4)
  ctx.lineWidth = k
  ctx.beginPath()
  points.forEach(([x, y], index) => {
    const [px, py] = toPixel(view, x, y)
    if (index) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  })
  ctx.stroke()
  points.forEach(([x, y], index) => {
    const [px, py] = toPixel(view, x, y)
    const fade = 1 - index / n
    ctx.fillStyle = rgba(PLOT.accent, 0.35 + 0.6 * Math.pow(fade, 1.5))
    ctx.beginPath()
    ctx.arc(px, py, (1.5 + 2.2 * fade * fade) * k, 0, 2 * Math.PI)
    ctx.fill()
  })
  ctx.fillStyle = rgba(PLOT.ink, 1)
  ctx.fillText('0', ox + 5 * k, oy + 14 * k)

  const cycle = findCycle(cr, ci, CLASSIFY_ITER, createCycleResult())
  ctx.strokeStyle = rgba(PLOT.ink, 0.95)
  ctx.lineWidth = 1.6 * k
  if (cycle.kind === SETTLES) {
    cyclePoints(cr, ci, cycle.wr, cycle.wi, cycle.period).forEach(([x, y]) => {
      const [px, py] = toPixel(view, x, y)
      ctx.beginPath()
      ctx.arc(px, py, 7 * k, 0, 2 * Math.PI)
      ctx.stroke()
    })
  } else if (cycle.kind === ESCAPES) {
    const [lr, li] = fixedPointMultiplier(cr, ci)
    if (Math.hypot(lr, li) < NEAR_FIXED_POINT) {
      const [px, py] = toPixel(view, lr / 2, li / 2)
      const r = 6 * k
      ctx.beginPath()
      ctx.moveTo(px, py - r)
      ctx.lineTo(px + r, py)
      ctx.lineTo(px, py + r)
      ctx.lineTo(px - r, py)
      ctx.closePath()
      ctx.stroke()
      ctx.fillText('z*', px + 9 * k, py - 6 * k)
    }
  }
}

function orbitRows(c) {
  const [cr, ci] = c
  const cycle = findCycle(cr, ci, CLASSIFY_ITER, createCycleResult())
  const rows = [[<var key="c">c</var>, <Complex x={cr} y={ci} />]]

  if (cycle.kind === SETTLES) {
    const r = Math.hypot(cycle.lr, cycle.li)
    const degrees = (Math.atan2(cycle.li, cycle.lr) * 180) / Math.PI
    const turns = (Math.abs(degrees) / 360).toFixed(3)
    rows.push(['Fate', cycle.period === 1 ? 'settles on a fixed point' : `settles on a cycle of period ${cycle.period}`])
    rows.push([<>Multiplier <var>λ</var></>, <Polar x={cycle.lr} y={cycle.li} />])
    rows.push([
      cycle.period === 1 ? 'Each step' : `Each lap (${cycle.period} steps)`,
      `turns ${formatTurn(degrees)} (${turns} of a turn) and shrinks ×${r.toFixed(3)}`,
    ])
    rows.push([<>Steps to 10<sup>−6</sup></>, formatSettle(cycle.period, r)])
    return rows
  }

  if (cycle.kind === ESCAPES) {
    rows.push(['Fate', `escapes at step ${cycle.steps}`])
    const [lr, li] = fixedPointMultiplier(cr, ci)
    const r = Math.hypot(lr, li)
    if (r < NEAR_FIXED_POINT) {
      const degrees = (Math.atan2(li, lr) * 180) / Math.PI
      rows.push([<>Fixed point <var>z</var>*</>, <Complex x={lr / 2} y={li / 2} digits={3} />])
      rows.push([<>Its <var>λ</var></>, <Polar x={lr} y={li} />])
      rows.push([
        <>Near <var>z</var>*</>,
        `each step turns ${formatTurn(degrees)} and grows ×${r.toFixed(3)}, so the orbit spirals out`,
      ])
    }
    return rows
  }

  rows.push(['Fate', 'undecided after 4,000 steps; this point is very close to the boundary'])
  return rows
}

export default function OrbitFigure() {
  const planeRef = useRef(null)
  const orbitRef = useRef(null)
  const baseRef = useRef(null)
  const draggingRef = useRef(false)
  const [c, setC] = useState(PRESETS[0].c)
  const [preset, setPreset] = useState(PRESETS[0].key)
  const planeWidth = useElementWidth(planeRef)
  const orbitWidth = useElementWidth(orbitRef)

  const redrawPlane = useEffectEvent(() => drawPlane(planeRef.current, baseRef.current, c))

  useEffect(() => {
    if (!planeWidth) return undefined
    const width = Math.round(planeWidth * renderScale())
    const height = Math.round(width / PLANE.aspect)
    const view = makeView(PLANE.cx, PLANE.cy, PLANE.halfHeight, width, height)
    const surface = createSurface(width, height)
    const ctx = surface.getContext('2d')
    const image = ctx.createImageData(width, height)
    const escape = createEscapeResult()
    const runner = createRowRunner()
    runner.start(
      height,
      (py) => {
        const ci = view.cy + (height / 2 - py - 0.5) * view.s
        for (let px = 0; px < width; px += 1) {
          escapeBands(view.cx + (px + 0.5 - width / 2) * view.s, ci, PLANE.maxIter, escape)
          const i = (py * width + px) * 4
          if (escape.smooth < 0) paint(image.data, i, PLOT.set, PLOT.set, 0)
          else paint(image.data, i, PLOT.far, PLOT.near, smoothShade(escape.smooth))
        }
      },
      () => {
        ctx.putImageData(image, 0, 0)
        baseRef.current = { surface, view }
        redrawPlane()
      },
    )
    return () => runner.cancel()
  }, [planeWidth])

  useEffect(() => {
    drawPlane(planeRef.current, baseRef.current, c)
  }, [c])

  useEffect(() => {
    drawOrbit(orbitRef.current, c, orbitWidth)
  }, [c, orbitWidth])

  const pick = (event) => {
    const base = baseRef.current
    const canvas = planeRef.current
    if (!base || !canvas) return
    const [px, py] = eventToPixel(canvas, event)
    setC(toComplex(base.view, px, py))
    setPreset(null)
  }

  const handleKeyDown = (event) => {
    const step = event.shiftKey ? 0.001 : 0.01
    const moves = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setC((prev) => [prev[0] + move[0], prev[1] + move[1]])
    setPreset(null)
  }

  const selectPreset = (key) => {
    setC(PRESETS.find((item) => item.key === key).c)
    setPreset(key)
  }

  return (
    <>
      <div className="orbit-plates">
        <figure>
          <canvas
            ref={planeRef}
            className="plot plot-4x3 plot-draggable"
            tabIndex={0}
            role="img"
            aria-label="Mandelbrot set in the parameter plane with a draggable marker for c"
            onPointerDown={(event) => {
              draggingRef.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
              pick(event)
            }}
            onPointerMove={(event) => {
              if (draggingRef.current) pick(event)
            }}
            onPointerUp={() => {
              draggingRef.current = false
            }}
            onPointerCancel={() => {
              draggingRef.current = false
            }}
            onKeyDown={handleKeyDown}
          />
          <figcaption>
            Parameter plane. Drag, tap, or use the arrow keys to move <var>c</var>.
          </figcaption>
        </figure>
        <figure>
          <canvas
            ref={orbitRef}
            className="plot plot-square"
            role="img"
            aria-label="Orbit of 0 in the dynamic plane for the chosen c"
          />
          <figcaption>Dynamic plane. Dots trace the orbit of 0. Rings mark the cycle it settles on.</figcaption>
        </figure>
      </div>
      <div className="orbit-panel">
        <div className="figure-controls">
          <div className="control-group">
            <span className="control-label">Try one</span>
            <Chips label="Example parameters" options={PRESETS} value={preset} onSelect={selectPreset} />
          </div>
          <div className="prose">
            <p>
              Near an attracting cycle, one lap multiplies the distance to the cycle by its multiplier{' '}
              <var>λ</var>. So each lap turns by arg <var>λ</var> and shrinks by <Abs><var>λ</var></Abs>. Repeat a
              fixed turn and a fixed shrink and the points fall on a logarithmic spiral. When the turn is
              close to <var>p</var>/<var>q</var> of a full turn, the points line up in <var>q</var> arms.
            </p>
            <p>
              Just outside the set, in seahorse valley, the nearby fixed point has <Abs><var>λ</var></Abs> slightly
              above 1. The orbit spirals outward around it before it escapes.
            </p>
          </div>
        </div>
        <Readout label="Orbit details" rows={orbitRows(c)} />
      </div>
    </>
  )
}
