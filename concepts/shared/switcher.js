// Design switcher for the concept review: a small bar at the foot of the main page and of every
// concept page that leads to all the designs (also with the number keys, 0 is the main page).
// Not part of the final site. It finds the concepts from its own location (concepts/shared/), so it
// works wherever the page that loads it lives, as long as the concepts are served as concepts/.

const DESIGNS = [
  { id: '', name: 'Hauptseite' },                 // the landing page, one level above concepts/
  { id: 'ocean-planet', name: 'Ocean Planet' },
  { id: 'ink-atom', name: 'Ink Atom' },
  { id: 'mesh-tide', name: 'Mesh Tide' },
  { id: 'orbit-mesh', name: 'Orbit Mesh' },
  { id: 'moon-torii', name: 'Moon Torii' },
  { id: 'ahorn-bonsai', name: 'Ahorn Bonsai' },
];

const STYLE = `
.design-switch { position: fixed; left: 50%; bottom: 18px; z-index: 60; display: flex; align-items: center; gap: 2px; padding: 4px; translate: -50% 0;
  border: 1px solid rgba(150, 205, 230, .26); border-radius: 999px; background: rgba(10, 20, 32, .74); color: #a8b5c6;
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); box-shadow: 0 12px 32px -16px rgba(0, 0, 0, .6);
  font: 500 11px/1 ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", Menlo, Consolas, monospace;
  letter-spacing: .14em; text-transform: uppercase; white-space: nowrap; view-transition-name: design-switch; }
.design-switch span { padding: 0 10px 0 12px; opacity: .7; }
.design-switch a { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 13px; border-radius: 999px; color: inherit; text-decoration: none; transition: background-color .3s, color .3s; }
.design-switch a:hover { background: rgba(150, 205, 230, .14); color: #eef2f7; }
.design-switch a[aria-current] { background: #22d3ee; color: #03222b; }
.design-switch b { font-weight: 500; opacity: .7; }
[data-theme="light"] .design-switch { border-color: rgba(15, 23, 42, .16); background: rgba(255, 255, 255, .8); color: #44536a; box-shadow: 0 12px 32px -18px rgba(15, 23, 42, .4); }
[data-theme="light"] .design-switch a:hover { background: rgba(15, 23, 42, .07); color: #0f172a; }
[data-theme="light"] .design-switch a[aria-current] { background: #0f172a; color: #f8fafc; }
@media (max-width: 1120px) {
  .design-switch span, .design-switch a:not([aria-current]) i { display: none; }
}
@media (max-width: 620px) {
  .design-switch a i { display: none; }
}
@media (prefers-reduced-motion: reduce) { .design-switch a { transition: none; } }
`;

const CONCEPTS = new URL('../', import.meta.url);
const HOME = new URL('../', CONCEPTS);
const found = DESIGNS.findIndex((design) => design.id && location.pathname.includes(`/${design.id}/`));
const current = found < 0 ? 0 : found;

const style = document.createElement('style');
style.textContent = STYLE;
document.head.append(style);

const nav = document.createElement('nav');
nav.className = 'design-switch';
nav.setAttribute('aria-label', 'Design wählen');
const label = document.createElement('span');
label.textContent = 'Design';
nav.append(label);
const links = DESIGNS.map((design, i) => {
  const link = document.createElement('a');
  link.href = design.id ? new URL(`${design.id}/`, CONCEPTS).href : HOME.href;
  link.title = `${design.name} (Taste ${i})`;
  if (i === current) link.setAttribute('aria-current', 'page');
  const number = document.createElement('b');
  number.textContent = String(i).padStart(2, '0');
  const name = document.createElement('i');
  name.style.fontStyle = 'normal';
  name.textContent = design.name;
  link.append(number, name);
  nav.append(link);
  return link;
});
document.body.append(nav);

// number keys jump to a design, unless someone is typing
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (!/^[0-9]$/.test(e.key)) return;
  const index = Number(e.key);
  if (links[index] && index !== current) links[index].click();
});
