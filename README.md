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
