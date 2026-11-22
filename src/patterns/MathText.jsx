import { MINUS, formatNumber } from './format.js'

// Keeps |x| on one line: browsers allow a line break right after "|".
export function Abs({ children }) {
  return <span className="nowrap">|{children}|</span>
}

export function Complex({ x, y, digits = 4 }) {
  return (
    <span className="nowrap">
      {formatNumber(x, digits)} {y < 0 ? MINUS : '+'} {Math.abs(y).toFixed(digits)}
      <var>i</var>
    </span>
  )
}

export function Polar({ x, y, digits = 3 }) {
  const r = Math.hypot(x, y)
  const degrees = (Math.atan2(y, x) * 180) / Math.PI
  return (
    <span className="nowrap">
      {r.toFixed(digits)} · <var>e</var>
      <sup>
        <var>i</var>·{formatNumber(degrees, 1)}°
      </sup>
    </span>
  )
}

export function Sci({ value }) {
  const exponent = Math.floor(Math.log10(Math.abs(value)))
  const mantissa = value / Math.pow(10, exponent)
  return (
    <span className="nowrap">
      {mantissa.toFixed(2)} × 10<sup>{formatNumber(exponent, 0)}</sup>
    </span>
  )
}

export function Readout({ rows, label }) {
  return (
    <dl className="readout" aria-label={label}>
      {rows.map(([term, value], index) => (
        <div className="readout-row" key={index}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Chips({ label, options, value, onSelect }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`chip ${option.key === value ? 'active' : ''}`}
          aria-pressed={option.key === value}
          onClick={() => onSelect(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
