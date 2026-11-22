// Dynamics of z -> z^2 + c. Complex numbers are [re, im] pairs.

export const ESCAPES = 0
export const SETTLES = 1
export const UNDECIDED = 2

const SMOOTH_BAILOUT_SQ = 65536
const MAX_PERIOD = 48

export function csqrt(a, b) {
  const r = Math.hypot(a, b)
  const x = Math.sqrt(Math.max(0, (r + a) / 2))
  const y = Math.sqrt(Math.max(0, (r - a) / 2))
  return [x, b < 0 ? -y : y]
}

export function cmul(a, b) {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
}

export function cinv(a) {
  const m = a[0] * a[0] + a[1] * a[1]
  return [a[0] / m, -a[1] / m]
}

export function inMainCardioid(x, y) {
  const xq = x - 0.25
  const q = xq * xq + y * y
  return q * (q + xq) <= 0.25 * y * y
}

export function inPeriod2Bulb(x, y) {
  const a = x + 1
  return a * a + y * y <= 0.0625
}

// Multiplier 2z* of the fixed point z* = (1 - sqrt(1 - 4c)) / 2.
export function fixedPointMultiplier(cr, ci) {
  const [sr, si] = csqrt(1 - 4 * cr, -4 * ci)
  return [1 - sr, -si]
}

// The c whose fixed point has multiplier r * e^(2 pi i turns): c = lambda / 2 - lambda^2 / 4.
export function lambdaToC(r, turns) {
  const a = 2 * Math.PI * turns
  const lr = r * Math.cos(a)
  const li = r * Math.sin(a)
  return [lr / 2 - (lr * lr - li * li) / 4, li / 2 - (lr * li) / 2]
}

export function createEscapeResult() {
  return { count: 0, smooth: -1 }
}

// count: first n with |z_n| > 2, or 0 if the orbit stays bounded.
// smooth: continuous escape time (bailout 256), or -1 inside the set.
export function escapeBands(cr, ci, maxIter, out) {
  out.count = 0
  out.smooth = -1
  if (inMainCardioid(cr, ci) || inPeriod2Bulb(cr, ci)) return out

  let x = 0
  let y = 0
  let xx = 0
  let yy = 0
  for (let n = 1; n <= maxIter; n += 1) {
    y = 2 * x * y + ci
    x = xx - yy + cr
    xx = x * x
    yy = y * y
    const m = xx + yy
    if (out.count === 0 && m > 4) out.count = n
    if (m > SMOOTH_BAILOUT_SQ) {
      out.smooth = n + 1 - Math.log2(0.5 * Math.log(m))
      return out
    }
  }
  if (out.count) out.smooth = maxIter
  return out
}

// Smooth escape time with a periodicity check, for deep zooms. Returns -1 inside the set.
export function smoothEscape(cr, ci, maxIter) {
  let x = 0
  let y = 0
  let xx = 0
  let yy = 0
  let savedX = 0
  let savedY = 0
  let checkEvery = 8
  let count = 0
  for (let n = 1; n <= maxIter; n += 1) {
    y = 2 * x * y + ci
    x = xx - yy + cr
    xx = x * x
    yy = y * y
    const m = xx + yy
    if (m > SMOOTH_BAILOUT_SQ) return n + 1 - Math.log2(0.5 * Math.log(m))
    if (Math.abs(x - savedX) < 1e-15 && Math.abs(y - savedY) < 1e-15) return -1
    count += 1
    if (count === checkEvery) {
      count = 0
      checkEvery *= 2
      savedX = x
      savedY = y
    }
  }
  return -1
}

export function createCycleResult() {
  return { kind: UNDECIDED, steps: 0, period: 0, lr: 0, li: 0, wr: 0, wi: 0 }
}

// Classify the orbit of 0. For an attracting cycle, report its period, its multiplier
// (lr, li) and one point on it (wr, wi). The cycle is found by iterating, detecting a
// near-repeat, then refining with Newton's method on f^p(w) - w.
export function findCycle(cr, ci, maxIter, out) {
  out.steps = 0
  if (inMainCardioid(cr, ci)) {
    const [sr, si] = csqrt(1 - 4 * cr, -4 * ci)
    out.kind = SETTLES
    out.period = 1
    out.lr = 1 - sr
    out.li = -si
    out.wr = out.lr / 2
    out.wi = out.li / 2
    return out
  }
  if (inPeriod2Bulb(cr, ci)) {
    const [sr, si] = csqrt(-3 - 4 * cr, -4 * ci)
    out.kind = SETTLES
    out.period = 2
    out.lr = 4 * (cr + 1)
    out.li = 4 * ci
    out.wr = (-1 + sr) / 2
    out.wi = si / 2
    return out
  }

  let x = 0
  let y = 0
  let xx = 0
  let yy = 0
  for (let n = 1; n <= maxIter; n += 1) {
    y = 2 * x * y + ci
    x = xx - yy + cr
    xx = x * x
    yy = y * y
    if (xx + yy > 4) {
      out.kind = ESCAPES
      out.steps = n
      return out
    }
  }

  const x0 = x
  const y0 = y
  let period = 0
  for (let j = 1; j <= MAX_PERIOD; j += 1) {
    y = 2 * x * y + ci
    x = xx - yy + cr
    xx = x * x
    yy = y * y
    const dx = x - x0
    const dy = y - y0
    if (dx * dx + dy * dy < 1e-8) {
      period = j
      break
    }
  }
  out.kind = UNDECIDED
  if (!period) return out

  let wr = x0
  let wi = y0
  for (let it = 0; it < 30; it += 1) {
    let zr = wr
    let zi = wi
    let dr = 1
    let di = 0
    for (let j = 0; j < period; j += 1) {
      const ndr = 2 * (zr * dr - zi * di)
      const ndi = 2 * (zr * di + zi * dr)
      dr = ndr
      di = ndi
      const nzr = zr * zr - zi * zi + cr
      zi = 2 * zr * zi + ci
      zr = nzr
    }
    const gr = zr - wr
    const gi = zi - wi
    const hr = dr - 1
    const hi = di
    const den = hr * hr + hi * hi
    if (den < 1e-30) break
    const sr = (gr * hr + gi * hi) / den
    const si = (gi * hr - gr * hi) / den
    wr -= sr
    wi -= si
    if (!Number.isFinite(wr) || !Number.isFinite(wi)) return out
    if (sr * sr + si * si < 1e-28) break
  }

  // The detected period can be a multiple of the true one; keep the smallest.
  let zr = wr
  let zi = wi
  let lr = 1
  let li = 0
  let minimal = 0
  for (let j = 1; j <= period; j += 1) {
    const nlr = 2 * (zr * lr - zi * li)
    const nli = 2 * (zr * li + zi * lr)
    lr = nlr
    li = nli
    const nzr = zr * zr - zi * zi + cr
    zi = 2 * zr * zi + ci
    zr = nzr
    const ex = zr - wr
    const ey = zi - wi
    if (ex * ex + ey * ey < 1e-16) {
      minimal = j
      break
    }
  }
  if (!minimal || lr * lr + li * li >= 1.0000001) return out

  out.kind = SETTLES
  out.period = minimal
  out.lr = lr
  out.li = li
  out.wr = wr
  out.wi = wi
  return out
}

export function cyclePoints(cr, ci, wr, wi, period) {
  const points = []
  let x = wr
  let y = wi
  for (let j = 0; j < period; j += 1) {
    points.push([x, y])
    const nx = x * x - y * y + cr
    y = 2 * x * y + ci
    x = nx
  }
  return points
}

// The orbit 0, z_1, z_2, ... until maxSteps or until |z| passes stopRadius.
export function orbitOf(cr, ci, maxSteps, stopRadius) {
  const points = [[0, 0]]
  const stopSq = stopRadius * stopRadius
  let x = 0
  let y = 0
  for (let n = 1; n <= maxSteps; n += 1) {
    const nx = x * x - y * y + cr
    y = 2 * x * y + ci
    x = nx
    points.push([x, y])
    if (x * x + y * y > stopSq) break
  }
  return points
}

// Multiplier of the repelling cycle that the orbit of 0 lands on at a Misiurewicz point.
export function repellingMultiplier(c, preperiod, period) {
  const orbit = orbitOf(c[0], c[1], preperiod + period, Infinity)
  let rho = [1, 0]
  for (let j = preperiod; j < preperiod + period; j += 1) {
    rho = cmul(rho, [2 * orbit[j][0], 2 * orbit[j][1]])
  }
  return rho
}
