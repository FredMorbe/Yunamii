# Yunamii Studio — Website

Static site for [yunamii.com](https://yunamii.com). Plain HTML, CSS and JavaScript (ES modules), no build step and no dependencies.

## Layout

| Path | What |
|---|---|
| `site/` | The website that gets deployed (landing page, Impressum, Datenschutz) |
| `site/js/hero.js`, `site/js/backdrop.js` | Interactive hero: tree image with code-driven blossoms, code-drawn blurred backdrop. The backdrop (`#bg`) is drawn once per layout at one pixel per css pixel (it is out of focus anyway); only the water below the horizon (`#bg-fx`: shimmer and ripples) is redrawn every frame. Frames are limited to about 100 per second, and the loop waits instead of failing while the canvas has no size |
| `site/js/site.js` + `ui.js`, `petals.js`, `showcase.js`, `process.js`, `waves.js` | Page behaviour (ES modules): menu/header/reveal/section index, site-wide petal layer (a few petals, some behind the page items, some landing on card/panel/button edges for 4–9 s, see the constants at the top of `petals.js`), project showcase, scroll-driven process vine, seigaiha footer |
| `site/assets/branches/` | Static cropped WebP cherry branches at the window edge (built by `tools/optimize-assets.py` from `source-assets/branches/`) |
| `site/assets/hero/` | The tree (`tree.webp`, with its colour grade baked in), the sprites (`sprites/*.webp`) and the two small data files; all built by `tools/optimize-assets.py` from `source-assets/hero/` |
| `source-assets/` | The lossless sources of the images above (the tree and the sprites as PNG, the branches before their alpha was compressed, the uncropped branch originals `ast*.png`). Not deployed |
| `tools/optimize-assets.py` | Rebuilds the optimised images in `site/assets/` from `source-assets/` (Pillow only): `python tools/optimize-assets.py` |
| `site/assets/products/` | Screenshots for the showcase (Cubamii, Katsumii, Media Center) |
| `site/assets/fonts/` | Self-hosted Fraunces (display) and DM Sans (text), latin subset |
| `concepts/` | Design concepts, published under `/concepts/` while they are under review (the workflow copies them next to the site). `shared/switcher.js` adds a bar to switch between the main page and the concepts, `shared/logo.webp` is the Yunamii mark (transparent, works on dark and light pages) and `shared/wordmark.webp` the lettering of the logo (used as a CSS mask, so it takes the text colour); all concepts show both in their header (the cyan mark is turned to the colour of a concept by the `--logo-filter` token of its stylesheet: teal in Orbit Mesh and Mesh Tide, gold or vermilion in Moon Torii; Ink Atom and Ocean Planet keep the cyan, which is their accent); `site/index.html` loads it too. Run with `python tools/dev-server.py concepts 5176`, or open them through the site's dev server, which serves them under `/concepts/` |
| `concepts/ocean-planet/` | Concept "Ocean Planet": WebGL2 sea at sunrise (`js/scene/`), orbit map of the products, canvas globe, light/dark |
| `concepts/ink-atom/` | Concept "Ink Atom" (hero only): the headline's full stop is the nucleus of a hydrogen atom, its electron cloud is sampled in `js/orbital.js` and drawn in `js/atom.js` |
| `concepts/mesh-tide/` | Concept "Mesh Tide" (hero only): a lattice of 25 600 nodes on moving water, Gerstner waves and all drawing in one WebGL2 vertex shader (`js/tide.js`); the pointer stirs the water, a press drops a stone |
| `concepts/orbit-mesh/` | Concept "Orbit Mesh" (hero only): the same net, bent by Mars and its two moons (gravity wells whose sum is evaluated in the vertex shader, `js/orbit.js`); the bodies are sprites that sit in their wells and hide the lines behind them: Mars is a photo (`assets/mars.webp`) laid on a sphere, Phobos and Deimos are round balls with craters made of formulas, locked to Mars like the real ones; one sun lights all three, so the moons show phases as they go round; the edge of a body hides the net exactly (no bare ring round it), and by day the sky fills the shadow side, which fades a little into the page |
| `concepts/moon-torii/` | Concept "Moon Torii" (a full page: the hero below, then the layout of the main page): a rim-lit moon, a gate of light and slowly spreading water rings, all drawn by one fragment shader (`js/scene.js`); the pointer shifts the layers a little, the sun follows the mouse or the last click, very slowly (a second dropdown chooses: mouse, click or fixed): the side of the planet it is on gives the direction of the light and the distance gives the phase, from no shadow at all on the planet's centre to a thin crescent far away; a click or tap on the planet is a solar eclipse (the picture of the planet dimmed to 5 % with a glowing rim; the next click ends it, and the sun stands still meanwhile; an eclipse that starts in the light scheme turns the page dark for its length, the whole page fading slowly into the new scheme (3.5 s in, 5 s out, as slowly as the eclipse itself; the switch in the header still opens the new scheme as a circle from the planet), and its end brings the light back, while one that starts in the dark scheme leaves the scheme alone; using the switch in between is the visitor's own choice and is kept), a click on the water drops a slow ring, and a small dropdown (`js/picker.js`) turns Mars (the default) into the moon or Earth. The moon, Mars and Earth carry photos (`assets/*.webp`) as their surface and are lit by the shader (Earth with a light blue air). Mars has Phobos and Deimos, Earth its Moon, drawn from formulas on slanted orbits. A switch in the header (`js/theme.js`, same `yunamii-theme` key and `data-theme` as Ocean Planet; without a stored choice the page is dark) turns night into day: a plain white page without a gradient, the gate in vermilion lacquer, the rings in ink, no stars, and the planets are transparent where the sun does not light them (the atmosphere lies in front), so only their lit part stands out from the sky (the small moons are not: they stay opaque with a dark shadow side, so a moon crossing a planet hides it); the shader gets a `uDay` uniform and the new scheme opens as a circle from the planet. Below the hero the page has the layout of the main page in the same language (`js/page.js` with `ui.js`, `showcase.js`, `process.js`, `ripples.js`; `showcase.js` and `process.js` are copies of the main page's): a strip (Games, Learning, Products, Studio), Work (project tabs with the Cubamii phone carousel and tilting product windows, then the "Still budding" cards), Open Source, Approach (every step is a moon phase that waxes as the line grows with the scroll), About (a gate inside the ring of the moon, drawn as it scrolls into view, with a small moon on the ring), Contact (rings spreading from one point) and a footer of slow water rings; the header gets a frosted bar once the page has moved, the section index sits on the right edge from 1400 px, and below 1020 px the navigation moves into the menu. The product and card images are copies in `assets/products/` and `assets/cards/` (the concept stays self-contained); the legal links point to the pages of the main site |
| `prototype/`, `prototype-code/` | Earlier hero experiments (not deployed) |
| `reference/` | Approved design mockup |
| `tools/dev-server.py` | Local static server without caching; also serves `concepts/` under `/concepts/` (the `PORT` environment variable overrides the port) |

## Loading the first screen

`site/index.html` announces everything the first screen needs in its `<head>` (the three fonts, the tree, the two data files, the sprites, and every script as `modulepreload`), so the browser fetches all of it at once instead of discovering one file after the other; `js/hero.js` then asks for exactly those files, all at the same time. Pictures are decoded off the main thread (`createImageBitmap`). The petals (two full-window canvases) start only after the hero is on screen. The images are WebP: the sprites with a lossless alpha channel, the tree and the branches with a lossy one (the settings and the checks against the lossless sources are in `tools/optimize-assets.py`). Measured on GitHub Pages before the change: 33 requests, 1.9 MB, the hero ready after about 2.3 s, in three steps one after the other; afterwards all 37 requests start together and add up to about 0.9 MB (measured locally, uncompressed).

## Run locally

```bash
python tools/dev-server.py site 5175
```

Then open http://localhost:5175.

## Deploy

`.github/workflows/pages.yml` publishes `site/` to GitHub Pages on every push to `main`, with `concepts/` copied to `/concepts/` next to it.
One-time setup: repository Settings → Pages → Source: **GitHub Actions**.
The custom domain (DNS at Cloudflare, `CNAME` file) is not set up yet.

## Before going live

- Take the design concepts offline: remove the "Assemble the site" step of `.github/workflows/pages.yml` (publish `site` again) and the `concepts/shared/switcher.js` script at the end of `site/index.html`.
- Fill in the yellow placeholders in `site/impressum.html` and `site/datenschutz.html`.
- Replace the contact link in `site/index.html` (marked `TODO`) with the public contact address.
- Gravity Merge and Yunamii Language are shown as "Coming soon" concepts; link them once they exist.
- Media Center is shown as "In development" under its working title; check the name and whether it should be public yet.
- Check the project copy in the showcase (Cubamii, Katsumii, Media Center) and the process step texts: they were written from the screenshots and READMEs.
