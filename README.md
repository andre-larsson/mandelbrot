# Mandelbrot Explorer (Escape-Time Fractals)

Interactive GitHub Pages app for exploring classic escape-time fractals in the browser.

## Included fractals

- Mandelbrot (default)
- Julia (with configurable constant `c`)
- Burning Ship
- Tricorn

## Features

- Click/tap to zoom in
- Shift+click or right-click to zoom out
- Pinch-to-zoom on touch devices
- Drag to pan
- Two-finger tap to zoom out (mobile)
- Iteration slider
- Pan cache for smoother movement at fixed zoom/iteration settings

## Circles and spirals explainer

`patterns.html` is a second page with four interactive figures that explain why escape-time plots are full of circles and spirals:

1. Orbit explorer: drag `c` and watch the orbit of 0 spiral into its cycle (or out, in seahorse valley).
2. Escape bands: each band edge is the curve `|z_n(c)| = 2`; smooth shading shows the equipotentials.
3. Interior multiplier: interior points colored by the multiplier `λ` of their attracting cycle, with the exact cardioid and period-2 bulb formulas as an overlay.
4. Misiurewicz zoom: zooming in by `|ρ|` turns the picture by `arg ρ`, which traces logarithmic spirals.

The explorer links to it from the sidebar. Live URL: https://andre-larsson.github.io/mandelbrot/patterns.html

## Development

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Lint

```bash
npm run lint
```

## Deploy

This repo is configured for GitHub Pages via GitHub Actions.

Live URL:

- https://andre-larsson.github.io/mandelbrot/
