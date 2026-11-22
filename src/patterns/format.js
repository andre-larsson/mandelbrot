export const MINUS = '−'

export function formatNumber(value, digits) {
  const text = Math.abs(value).toFixed(digits)
  return (value < 0 && Number.parseFloat(text) !== 0 ? MINUS : '') + text
}

export function formatInteger(value) {
  return value.toLocaleString('en-US')
}

// Positive angles turn counterclockwise (y points up in every plot).
export function formatTurn(degrees) {
  const direction = degrees >= 0 ? 'counterclockwise' : 'clockwise'
  return `${Math.abs(degrees).toFixed(1)}° ${direction}`
}

// Steps for the error to shrink to 1e-6 when each lap of `period` steps multiplies it by r.
export function formatSettle(period, r) {
  if (r < 1e-9) return 'a few (λ ≈ 0 at the center)'
  return `≈ ${formatInteger(Math.ceil((period * Math.log(1e-6)) / Math.log(r)))}`
}

export function formatZoom(log10Zoom) {
  const zoom = Math.pow(10, log10Zoom)
  if (zoom < 10) return `×${zoom.toFixed(2)}`
  if (zoom < 1000) return `×${zoom.toFixed(0)}`
  return `×${zoom.toExponential(1).replace('e+', 'e')}`
}
