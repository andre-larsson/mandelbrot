import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { createEscapeResult, escapeBands } from './dynamics.js'
import { formatInteger } from './format.js'
import { Abs, Readout } from './MathText.jsx'
import { PLOT, blendTo, createRowRunner, makeView, paint, renderScale, sizeCanvas, smoothShade } from './plot.js'
import { useElementWidth } from './useElementWidth.js'

const VIEW = { cx: -0.2, cy: 0, halfHeight: 2.08, aspect: 4 / 3, maxIter: 800 }
const MAX_CURVE = 16

function paintBands(canvas, data, curve, smooth) {
  if (!canvas || !data) return
  const { width, height, counts, values } = data
  sizeCanvas(canvas, width, height)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  const d = image.data
  const reach = renderScale() >= 1.4 ? 2 : 1
  const insideCurve = (p) => counts[p] === 0 || counts[p] > curve

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const i = p * 4
      const count = counts[p]
      if (count === 0) {
        paint(d, i, PLOT.set, PLOT.set, 0)
      } else if (smooth) {
        const nu = values[p]
        paint(d, i, PLOT.far, PLOT.near, smoothShade(nu))
        // Equipotential lines every half unit of smooth escape time.
        const level = Math.floor(nu * 2)
        const right = x < width - 1 && counts[p + 1] !== 0 && Math.abs(Math.floor(values[p + 1] * 2) - level) === 1
        const below = y < height - 1 && counts[p + width] !== 0 && Math.abs(Math.floor(values[p + width] * 2) - level) === 1
        if (right || below) blendTo(d, i, PLOT.line, 0.42)
      } else {
        paint(d, i, PLOT.far, PLOT.near, 1 - Math.exp(-(count - 1) / 6))
        if (count & 1) blendTo(d, i, PLOT.far, 0.22)
      }

      if (insideCurve(p)) {
        let edge = false
        for (let r = 1; r <= reach && !edge; r += 1) {
          edge =
            (x >= r && !insideCurve(p - r)) ||
            (x < width - r && !insideCurve(p + r)) ||
            (y >= r && !insideCurve(p - r * width)) ||
            (y < height - r && !insideCurve(p + r * width))
        }
        if (edge) paint(d, i, PLOT.accent, PLOT.accent, 0)
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

function Polynomial({ n }) {
  const c = <var>c</var>
  const z = (
    <>
      <var>z</var>
      <sub>{n}</sub>
    </>
  )
  if (n === 1) return <>{z} = {c}</>
  if (n === 2) return <>{z} = {c}² + {c}</>
  if (n === 3) return <>{z} = {c}⁴ + 2{c}³ + {c}² + {c}</>
  if (n === 4) return <>{z} = {c}⁸ + 4{c}⁷ + 6{c}⁶ + 6{c}⁵ + 5{c}⁴ + 2{c}³ + {c}² + {c}</>
  return (
    <>
      {z} = <var>z</var>
      <sub>{n - 1}</sub>² + {c}
    </>
  )
}

function curveRows(n) {
  const shape =
    n === 1
      ? 'an exact circle of radius 2'
      : n === 2
        ? 'an oval: the lemniscate |c² + c| = 2'
        : n <= 5
          ? 'a lemniscate that starts to show the bulbs'
          : 'a lemniscate hugging the set closely'
  return [
    [
      'Curve',
      <>
        <Abs>
          <var>z</var>
          <sub>{n}</sub>(<var>c</var>)
        </Abs>{' '}
        = 2
      </>,
    ],
    [
      'Degree',
      <>
        2<sup>{n - 1}</sup> = {formatInteger(Math.pow(2, n - 1))}
      </>,
    ],
    ['Shape', shape],
    ['Inside it', `points still in the disk after ${n} step${n > 1 ? 's' : ''}`],
  ]
}

export default function EscapeBandsFigure() {
  const canvasRef = useRef(null)
  const dataRef = useRef(null)
  const [curve, setCurve] = useState(1)
  const [smooth, setSmooth] = useState(false)
  const cssWidth = useElementWidth(canvasRef)

  const repaint = useEffectEvent(() => paintBands(canvasRef.current, dataRef.current, curve, smooth))

  useEffect(() => {
    if (!cssWidth) return undefined
    const width = Math.round(cssWidth * renderScale())
    const height = Math.round(width / VIEW.aspect)
    const view = makeView(VIEW.cx, VIEW.cy, VIEW.halfHeight, width, height)
    const counts = new Int16Array(width * height)
    const values = new Float32Array(width * height)
    const escape = createEscapeResult()
    const runner = createRowRunner()
    runner.start(
      height,
      (py) => {
        const ci = view.cy + (height / 2 - py - 0.5) * view.s
        for (let px = 0; px < width; px += 1) {
          escapeBands(view.cx + (px + 0.5 - width / 2) * view.s, ci, VIEW.maxIter, escape)
          counts[py * width + px] = escape.count
          values[py * width + px] = escape.smooth
        }
      },
      () => {
        dataRef.current = { width, height, counts, values }
        repaint()
      },
    )
    return () => runner.cancel()
  }, [cssWidth])

  useEffect(() => {
    paintBands(canvasRef.current, dataRef.current, curve, smooth)
  }, [curve, smooth])

  return (
    <div className="figure-grid">
      <figure>
        <canvas
          ref={canvasRef}
          className="plot plot-4x3"
          role="img"
          aria-label="Escape-time bands around the Mandelbrot set with one band edge highlighted"
        />
        <figcaption>
          Each band is one more step before escape. The highlighted curve is{' '}
          <Abs>
            <var>z</var>
            <sub>n</sub>(<var>c</var>)
          </Abs>{' '}
          = 2.
        </figcaption>
      </figure>
      <div className="figure-controls">
        <label className="control-group" htmlFor="curve-n">
          <span className="control-row">
            <span className="control-label">Highlighted curve</span>
            <output className="control-value" htmlFor="curve-n">
              n = {curve}
            </output>
          </span>
          <input
            id="curve-n"
            type="range"
            min="1"
            max={MAX_CURVE}
            step="1"
            value={curve}
            onChange={(event) => setCurve(Number(event.target.value))}
          />
        </label>
        <p className="formula">
          <Polynomial n={curve} />
        </p>
        <Readout label="Curve details" rows={curveRows(curve)} />
        <label className="toggle">
          <input type="checkbox" checked={smooth} onChange={(event) => setSmooth(event.target.checked)} />
          Smooth shading with equipotential lines
        </label>
        <div className="legend">
          <span>
            <i className="swatch swatch-accent" />
            <span>
              the curve <Abs>z<sub>n</sub>(c)</Abs> = 2
            </span>
          </span>
          <span>
            <i className="swatch swatch-thin" />
            <span>equipotentials (smooth shading)</span>
          </span>
        </div>
      </div>
    </div>
  )
}
