import { Abs } from './MathText.jsx'
import EscapeBandsFigure from './EscapeBandsFigure.jsx'
import MultiplierFigure from './MultiplierFigure.jsx'
import OrbitFigure from './OrbitFigure.jsx'
import SpiralZoomFigure from './SpiralZoomFigure.jsx'

const z = <var>z</var>
const c = <var>c</var>
const lambda = <var>λ</var>
const rho = <var>ρ</var>
const zn = (
  <>
    <var>z</var>
    <sub>
      <var>n</var>
    </sub>
  </>
)
const c0 = (
  <>
    <var>c</var>
    <sub>0</sub>
  </>
)

export default function PatternsPage() {
  return (
    <div className="patterns">
      <main className="patterns-inner">
        <header className="patterns-intro">
          <a className="back-link" href="./">
            ← Back to the explorer
          </a>
          <p className="eyebrow">Escape-time plots, explained</p>
          <h1>Why the Mandelbrot set is full of circles and spirals</h1>
          <p className="lede">
            An escape-time plot colors each point {c} by how many steps the orbit of 0 under {z} ↦ {z}² + {c}{' '}
            takes to leave the disk <Abs>{z}</Abs> ≤ 2. The pictures fill up with rings and spirals, and both come from
            the same three facts.
          </p>
          <div className="facts">
            <div>
              <p className="fact">
                <Abs>{z}²</Abs> = <Abs>{z}</Abs>²
              </p>
              <p>Squaring squares the length.</p>
            </div>
            <div>
              <p className="fact">
                arg {z}² = 2 arg {z}
              </p>
              <p>Squaring doubles the angle.</p>
            </div>
            <div>
              <p className="fact">
                <var>f</var>({z}* + <var>ε</var>) ≈ {z}* + {lambda}
                <var>ε</var>
              </p>
              <p>
                Up close, an analytic map only turns by arg {lambda} and scales by <Abs>{lambda}</Abs>.
              </p>
            </div>
          </div>
          <p className="lede">
            A circle looks the same after a turn. A logarithmic spiral looks the same after a turn plus a zoom. A
            map built from turning and scaling keeps producing those two shapes. The four figures below show
            where each one comes from.
          </p>
        </header>

        <section className="pattern-section" aria-labelledby="orbit-title">
          <p className="eyebrow">Figure 1 · Orbit explorer</p>
          <h2 id="orbit-title">One orbit, step by step</h2>
          <div className="prose">
            <p>
              Pick a parameter {c} on the left. The right panel plots the orbit 0, {z}
              <sub>1</sub>, {z}
              <sub>2</sub>, … for that {c}. Inside the set the orbit settles onto a cycle. Outside, it
              eventually leaves the circle <Abs>{z}</Abs> = 2.
            </p>
          </div>
          <OrbitFigure />
        </section>

        <section className="pattern-section" aria-labelledby="bands-title">
          <p className="eyebrow">Figure 2 · Escape bands</p>
          <h2 id="bands-title">Rings outside: one polynomial per band</h2>
          <div className="prose">
            <p>
              Follow the orbit as a function of {c}. After one step {z}
              <sub>1</sub> = {c}. After two, {z}
              <sub>2</sub> = {c}² + {c}. After three, {z}
              <sub>3</sub> = {c}⁴ + 2{c}³ + {c}² + {c}. Each step squares the previous polynomial, so {zn}({c})
              has degree 2
              <sup>
                <var>n</var>−1
              </sup>
              .
            </p>
            <p>
              A point is still in the disk after <var>n</var> steps exactly when <Abs>{zn}({c})</Abs> ≤ 2. So the edge of
              each band is the curve <Abs>{zn}({c})</Abs> = 2. For <var>n</var> = 1 that is the circle <Abs>{c}</Abs> = 2. Each
              later curve has twice the degree and wraps more tightly around the set.
            </p>
          </div>
          <EscapeBandsFigure />
          <div className="prose prose-after">
            <p>
              Smooth shading replaces the whole-number step count with a continuous value. Its level lines are
              the equipotentials of the set. Treat the set as a charged metal plate and these are the lines of
              equal voltage. From far away the plate acts like a point charge, so the lines are circles. Closer
              in, they bend to follow its outline.
            </p>
            <p>
              The step bands sit close to these same lines, and the match improves as <var>n</var> grows. Douady
              and Hubbard showed that a conformal map sends the outside of the set to the outside of a disk. The
              equipotentials are the concentric circles around that disk, carried back through the map.
            </p>
          </div>
        </section>

        <section className="pattern-section" aria-labelledby="inside-title">
          <p className="eyebrow">Figure 3 · Interior multiplier</p>
          <h2 id="inside-title">Rings inside: how fast the orbit settles</h2>
          <div className="prose">
            <p>
              Inside the set the orbit never escapes. It settles onto an attracting cycle of some period{' '}
              <var>p</var>. Near the cycle, each lap multiplies the remaining error by the cycle&apos;s multiplier{' '}
              {lambda}. Getting within 10<sup>−6</sup> takes about <var>p</var> · ln 10<sup>−6</sup> / ln<Abs>{lambda}</Abs> steps, so equal settling time means equal <Abs>{lambda}</Abs>.
            </p>
            <p>
              This figure finds the cycle for every interior pixel by iterating. Newton&apos;s method then refines
              the cycle, and the page computes {lambda} from it. The lines mark <Abs>{lambda}</Abs> = 0.1, 0.2, …, 0.9.
            </p>
          </div>
          <MultiplierFigure />
          <div className="prose prose-after">
            <p>
              In the period-2 bulb the multiplier is exactly {lambda} = 4({c} + 1). A fixed <Abs>{lambda}</Abs> is the
              circle <Abs>{c} + 1</Abs> = <Abs>{lambda}</Abs>/4 around {c} = −1. In the main cardioid, {c} = {lambda}/2 −{' '}
              {lambda}²/4, so the lines are smaller cardioid-like curves. Turn on the overlay and the formulas
              land on the computed lines.
            </p>
            <p>
              Color by angle to see arg {lambda}. Each bulb on the main cardioid is attached where arg {lambda} is{' '}
              <var>p</var>/<var>q</var> of a turn, and that bulb has period <var>q</var>.
            </p>
          </div>
        </section>

        <section className="pattern-section" aria-labelledby="spiral-title">
          <p className="eyebrow">Figure 4 · Misiurewicz zoom</p>
          <h2 id="spiral-title">Spirals at the edge: zooming in also turns the picture</h2>
          <div className="prose">
            <p>
              Some boundary points are Misiurewicz points. At such a point {c0}, the orbit of 0 lands exactly on
              a repelling cycle after a few steps. Tan Lei proved that the set near {c0} is asymptotically
              self-similar. Zoom in by <Abs>{rho}</Abs>, turn by arg {rho}, and the picture repeats. Here {rho} is the
              multiplier of that repelling cycle, and it is a complex number.
            </p>
            <p>
              A shape that repeats under a zoom plus a turn is made of logarithmic spirals. Click the picture to
              mark a spot. The dots are its copies at {c0} + ({c} − {c0})/{rho}
              <sup>
                <var>n</var>
              </sup>
              , and the curve is the spiral that joins them.
            </p>
          </div>
          <SpiralZoomFigure />
          <div className="prose prose-after">
            <p>
              At the seahorse tail, {rho} ≈ 1.039 · <var>e</var>
              <sup>
                <var>i</var>·172.6°
              </sup>
              . Each step is almost a half turn, so the copies alternate between two arms. Two steps zoom only
              1.08× and turn 14.9°, which winds the arms tightly. At {c} = <var>i</var>, {rho} = 4 + 4
              <var>i</var>: a 5.66× zoom turns only 45°. That spiral is so loose that it reads as twisted
              branches.
            </p>
            <p>
              Check “Cancel the turn” and press Play. With the rotation removed, the zoom shows nearly the same
              picture over and over.
            </p>
          </div>
        </section>

        <section className="pattern-section" aria-labelledby="short-title">
          <h2 id="short-title">The short version</h2>
          <div className="short">
            <div>
              <h3>Rings outside</h3>
              <p>
                Band edges are the curves <Abs>{zn}({c})</Abs> = 2. They approximate the equipotentials, which are circles
                carried back through a conformal map.
              </p>
            </div>
            <div>
              <h3>Rings inside</h3>
              <p>
                Settling time depends only on <Abs>{lambda}</Abs>. Curves of constant <Abs>{lambda}</Abs> are circles carried back
                through the multiplier map.
              </p>
            </div>
            <div>
              <h3>Spirals</h3>
              <p>
                Near Misiurewicz points the set repeats under a complex zoom factor {rho}. Zooming in by <Abs>{rho}</Abs>{' '}
                turns the picture by arg {rho}, and repeating that traces logarithmic spirals.
              </p>
            </div>
          </div>
        </section>

        <footer className="patterns-footer">
          <p>
            Everything is computed in your browser in double precision, so the deepest zoom is a view about 10
            <sup>−10</sup> wide. Background: A. Douady and J. H. Hubbard on the conformal map of the complement of
            the set; Tan Lei, “Similarity between the Mandelbrot set and Julia sets” (1990).
          </p>
        </footer>
      </main>
    </div>
  )
}
