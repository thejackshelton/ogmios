---
id: 260417-wl1
mode: quick
status: complete
date: 2026-04-18
---

# Quick Task 260417-wl1 — Summary

## What shipped

- **Hero asset** — `docs/public/ear.png` (800×800 PNG, ~1.0 MB; downloaded from the supplied Discord CDN URL, converted from WebP→PNG via `sips`, downsized from 1453×1453).
- **Custom VitePress theme** — `docs/.vitepress/theme/{index.ts,custom.css,env.d.ts}`.
  - Extends `DefaultTheme`, imports a single `custom.css`.
  - Palette tokens (`--shoki-navy-*`, `--shoki-coral-*`) drive VP vars at both `:root` and `.dark` so the force-dark initial paint is correct.
  - Overrides cover: surfaces, text, borders, brand ramp, buttons (brand + alt), hero name colour, hero image vignette, tip/info custom blocks, code blocks + code tabs, local search, nav/sidebar active states, selection.
- **Config changes** — `docs/.vitepress/config.ts`:
  - `appearance: "dark"` → `"force-dark"` (light mode disabled by design).
  - `theme-color` meta: `#646cff` → `#fc8277`.
- **Hero swap** — `docs/index.md`: `image.src` `/logo.svg` → `/ear.png` with a descriptive alt.

## Verification

- `pnpm --filter @shoki/docs build` completes cleanly (`build complete in ~2s`).
- New `theme/index.ts` had a TS diagnostic for the CSS side-effect import; resolved by adding `theme/env.d.ts` with `declare module "*.css"`.
- Pre-existing `process.env` diagnostic in `config.ts` was **not** introduced by this change (present before; missing `@types/node` — out of scope).

## Not done (intentional)

- `docs/public/logo.svg` is left in place — it may still be referenced by `favicon.svg` tooling or future marketing; removal is a separate decision.
- No further PNG compression (pngquant/oxipng not installed); 1.0 MB at 800×800 is acceptable for the hero but could be shaved with lossy compression later.
- Light-mode styles not written — `force-dark` means they would never render.

## Files touched

- `docs/public/ear.png` *(new)*
- `docs/.vitepress/theme/index.ts` *(new)*
- `docs/.vitepress/theme/custom.css` *(new)*
- `docs/.vitepress/theme/env.d.ts` *(new)*
- `docs/.vitepress/config.ts`
- `docs/index.md`
