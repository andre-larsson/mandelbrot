// Canvas helpers shared by the explainer figures.

export const PLOT = {
  far: [11, 19, 34],
  near: [156, 199, 255],
  set: [5, 8, 15],
  line: [233, 242, 255],
  accent: [255, 164, 92],
  overlay: [86, 214, 255],
  inCenter: [255, 227, 200],
  inEdge: [180, 68, 28],
  inLine: [7, 16, 31],
  surface: [8, 14, 26],
  grid: [38, 54, 84],
  muted: [137, 163, 201],
  ink: [233, 242, 255],
}

export const LABEL_FONT = '"Space Grotesk", "Segoe UI", sans-serif'

// Render at most 1.5x device pixels: these plots are compute-bound.
export function renderScale() {
  return Math.min(window.devicePixelRatio || 1, 1.5)
}

export function rgba(color, alpha) {
  return `rgba(${color[0] | 0}, ${color[1] | 0}, ${color[2] | 0}, ${alpha})`
}

export function paint(data, i, from, to, t) {
  data[i] = from[0] + (to[0] - from[0]) * t
  data[i + 1] = from[1] + (to[1] - from[1]) * t
  data[i + 2] = from[2] + (to[2] - from[2]) * t
  data[i + 3] = 255
}

export function blendTo(data, i, color, t) {
  data[i] += (color[0] - data[i]) * t
  data[i + 1] += (color[1] - data[i + 1]) * t
  data[i + 2] += (color[2] - data[i + 2]) * t
}

export function hslInto(hue, sat, light, out) {
  const h = (((hue % 360) + 360) % 360) / 360
  const a = sat * Math.min(light, 1 - light)
  const channel = (n) => {
    const k = (n + h * 12) % 12
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  out[0] = channel(0) * 255
  out[1] = channel(8) * 255
  out[2] = channel(4) * 255
}

// Maps a smooth escape time to 0..1 (0 far away, 1 next to the set).
export function smoothShade(nu) {
  return 1 - Math.exp(-Math.max(0, nu - 0.5) / 9)
}

// A view maps pixels to the complex plane. y points up; rotation turns the picture.
export function makeView(cx, cy, halfHeight, width, height, rotation = 0) {
  return {
    cx,
    cy,
    s: (2 * halfHeight) / height,
    width,
    height,
    cos: Math.cos(rotation),
    sin: Math.sin(rotation),
  }
}

export function toComplex(view, px, py) {
  const u = (px - view.width / 2) * view.s
  const w = (view.height / 2 - py) * view.s
  return [view.cx + u * view.cos - w * view.sin, view.cy + u * view.sin + w * view.cos]
}

export function toPixel(view, x, y) {
  const dx = x - view.cx
  const dy = y - view.cy
  const u = dx * view.cos + dy * view.sin
  const w = -dx * view.sin + dy * view.cos
  return [view.width / 2 + u / view.s, view.height / 2 - w / view.s]
}

export function eventToPixel(canvas, event) {
  const rect = canvas.getBoundingClientRect()
  return [
    ((event.clientX - rect.left) * canvas.width) / rect.width,
    ((event.clientY - rect.top) * canvas.height) / rect.height,
  ]
}

export function createSurface(width, height) {
  const surface = document.createElement('canvas')
  surface.width = width
  surface.height = height
  return surface
}

export function sizeCanvas(canvas, width, height) {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

// Runs rowFn(0..rows-1) in ~14 ms slices so the page stays responsive.
export function createRowRunner() {
  let token = 0
  return {
    start(rows, rowFn, done) {
      token += 1
      const mine = token
      let row = 0
      const step = () => {
        if (mine !== token) return
        const started = performance.now()
        while (row < rows) {
          rowFn(row)
          row += 1
          if (performance.now() - started > 14) break
        }
        if (row < rows) setTimeout(step, 0)
        else if (done) done()
      }
      step()
    },
    cancel() {
      token += 1
    },
  }
}
