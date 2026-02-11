# Repository Guidelines

## Project Structure & Module Organization
This is a Vite + React single-page app for exploring the Mandelbrot set.
- `src/main.jsx`: React entry point.
- `src/App.jsx`: core rendering logic and UI controls.
- `src/App.css`, `src/index.css`: component and global styles.
- `public/`: static assets copied at build time.
- `.github/workflows/pages.yml`: GitHub Pages build/deploy pipeline.
- `dist/`: production build output (generated; do not edit directly).

## Build, Test, and Development Commands
Use Node 20+ (CI uses Node 20).
- `npm ci`: install dependencies from lockfile (preferred for clean setups/CI).
- `npm run dev`: start Vite dev server with HMR.
- `npm run build`: create production bundle in `dist/`.
- `npm run preview`: serve the built app locally for verification.
- `npm run lint`: run ESLint on `js/jsx` files.

## Coding Style & Naming Conventions
- Follow existing style: 2-space indentation, semicolon-free JavaScript, single quotes.
- Use functional React components and hooks.
- Component files use PascalCase (`App.jsx`); utility/helper identifiers use camelCase (`hslToRgb`).
- Keep constants uppercase when shared/static (`DEFAULT_VIEW`).
- Run `npm run lint` before opening a PR; lint rules come from `eslint.config.js` (React Hooks + React Refresh + recommended JS rules).

## Testing Guidelines
There is currently no automated test framework configured.
- Minimum expectation: run `npm run lint` and `npm run build` before submitting changes.
- For behavior changes, include manual verification steps in the PR (example: zoom in/out, reset, iteration slider behavior).
- If adding tests, place them under `src/` with clear `*.test.jsx` naming and document the run command you introduce.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects (example: `Add Mandelbrot explorer`).
- Write focused commits with one logical change each.
- PRs should include: purpose, key changes, validation steps, and screenshots/GIFs for UI changes.
- Link related issues when applicable and note any deployment impact (GitHub Pages workflow on `main`).
