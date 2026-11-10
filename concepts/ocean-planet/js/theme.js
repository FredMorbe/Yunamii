// Light and dark scheme. The choice is stored; without one the system setting decides
// (see the inline script in <head>, which sets data-theme before the first paint).

const KEY = 'yunamii-theme';
const PAGE = { dark: '#070d16', light: '#f8fafc' };

export function initTheme({ reduceMotion, origin, onChange }) {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const meta = document.querySelector('meta[name="theme-color"]');

  const apply = (theme) => {
    root.dataset.theme = theme;
    meta.content = PAGE[theme];
    toggle.setAttribute('aria-checked', String(theme === 'dark'));
    onChange(theme);
  };
  apply(root.dataset.theme);

  toggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked: the choice lasts for this page view */ }
    if (reduceMotion || !document.startViewTransition) { apply(next); return; }

    // the new scheme opens as a circle, like light spreading from the sun
    const { x, y } = origin(toggle);
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => apply(next));
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 1100, easing: 'cubic-bezier(.5, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }, () => { /* transition skipped (e.g. tab in the background): the theme is applied anyway */ });
  });
}
