# Yunamii Studio — Website

Static site for [yunamii.com](https://yunamii.com). Plain HTML, CSS and JavaScript (ES modules), no build step and no dependencies.

## Layout

| Path | What |
|---|---|
| `site/` | The website that gets deployed (landing page, Impressum, Datenschutz) |
| `site/js/hero.js`, `site/js/backdrop.js` | Interactive hero: tree image with code-driven blossoms, code-drawn blurred backdrop |
| `site/js/site.js` + `ui.js`, `petals.js`, `showcase.js`, `process.js`, `waves.js` | Page behaviour (ES modules): menu/header/reveal/section index, site-wide petal layer (a few petals, some behind the page items, some landing on card/panel/button edges for 4–9 s, see the constants at the top of `petals.js`), project showcase, scroll-driven process vine, seigaiha footer |
| `site/assets/branches/` | Static cropped WebP cherry branches at the window edge (made from `hero/sprites/ast*.png`, which the page no longer loads; `ast3` is unused) |
| `site/assets/products/` | Screenshots for the showcase (Cubamii, Katsumii, Media Center) |
| `site/assets/fonts/` | Self-hosted Fraunces (display) and DM Sans (text), latin subset |
| `concepts/` | Design concepts (not deployed). Run with `python tools/dev-server.py concepts 5176`; `shared/switcher.js` adds a bar to switch between them |
| `concepts/ocean-planet/` | Concept "Ocean Planet": WebGL2 sea at sunrise (`js/scene/`), orbit map of the products, canvas globe, light/dark |
| `concepts/ink-atom/` | Concept "Ink Atom" (hero only): the headline's full stop is the nucleus of a hydrogen atom, its electron cloud is sampled in `js/orbital.js` and drawn in `js/atom.js` |
| `concepts/gravity-lens/` | Concept "Gravity Lens" (hero only): a black hole bends the coordinate grid behind it, one fragment shader with the lens equation of a point mass (`js/lens.js`) |
| `concepts/shiki-bonsai/` | Concept "Shiki Bonsai" (hero only): a bonsai grown from a seed number (`js/grow.js`) and drawn in 3D with seasons, wind and falling leaves (`js/tree.js`) |
| `concepts/mesh-tide/` | Concept "Mesh Tide" (hero only): a lattice of 25 600 nodes on moving water, Gerstner waves and all drawing in one WebGL2 vertex shader (`js/tide.js`); the pointer stirs the water, a press drops a stone |
| `prototype/`, `prototype-code/` | Earlier hero experiments (not deployed) |
| `reference/` | Approved design mockup |
| `tools/dev-server.py` | Local static server without caching |

## Run locally

```bash
python tools/dev-server.py site 5175
```

Then open http://localhost:5175.

## Deploy

`.github/workflows/pages.yml` publishes `site/` to GitHub Pages on every push to `main`.
One-time setup: repository Settings → Pages → Source: **GitHub Actions**.
The custom domain (DNS at Cloudflare, `CNAME` file) is not set up yet.

## Before going live

- Fill in the yellow placeholders in `site/impressum.html` and `site/datenschutz.html`.
- Replace the contact link in `site/index.html` (marked `TODO`) with the public contact address.
- Gravity Merge and Yunamii Language are shown as "Coming soon" concepts; link them once they exist.
- Media Center is shown as "In development" under its working title; check the name and whether it should be public yet.
- Check the project copy in the showcase (Cubamii, Katsumii, Media Center) and the process step texts: they were written from the screenshots and READMEs.
- `site/assets/hero/sprites/ast1-4.png` (about 3 MB) are the uncropped originals of `assets/branches/*.webp`; remove them from `site/` if you do not want to deploy them.
