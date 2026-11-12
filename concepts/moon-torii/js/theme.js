// Light and dark colour scheme. The choice is stored; without one the system setting decides
// (see the inline script in <head>, which sets data-theme before the first paint).

const KEY = 'yunamii-theme';
const PAGE = { dark: '#07070e', light: '#ffffff' };

// Returns { current(), set(theme, seconds) }. The switch changes the scheme as a circle that opens from the
// planet. set() is for the eclipse: the old page fades into the new one over `seconds`, all of it at once, and
// the choice is not stored, so a reload brings back the visitor's own choice. `onToggle` is called when the
// visitor uses the switch.
export function initTheme({ reduceMotion, origin, onChange, onToggle }) {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  let wanted = root.dataset.theme;      // the scheme that is asked for last; the page follows once its transition runs
  let latest = 0;                       // which transition is the newest: a skipped one must not clear the class of the next

  const apply = (theme) => {
    root.dataset.theme = theme;
    meta.content = PAGE[theme];
    toggle.setAttribute('aria-checked', String(theme === 'dark'));
    onChange(theme);
  };
  apply(root.dataset.theme);

  // fade: seconds of a cross-fade of the whole page; without it the new scheme opens as a circle from the planet
  function change(next, store, fade) {
    wanted = next;
    if (store) {
      try { localStorage.setItem(KEY, next); } catch { /* storage blocked: the choice lasts for this page view */ }
    }
    if (reduceMotion || !document.startViewTransition) { apply(next); return; }

    // the class switches off the default cross-fade, which is kept for moving between designs
    const mine = ++latest;
    const kind = fade ? 'theme-fade' : 'theme-change';
    root.classList.remove('theme-fade', 'theme-change');
    root.classList.add(kind);
    if (fade) root.style.setProperty('--theme-fade', `${fade}s`);
    const transition = document.startViewTransition(() => apply(next));
    transition.finished.finally(() => { if (mine === latest) root.classList.remove(kind); });
    if (fade) {
      transition.ready.catch(() => { /* skipped by a newer transition: the scheme is applied anyway */ });
      return;
    }

    // the new scheme opens as a circle, like the day breaking from the planet
    const { x, y } = origin(toggle);
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 1100, easing: 'cubic-bezier(.5, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }, () => { /* transition skipped (e.g. tab in the background): the theme is applied anyway */ });
  }

  toggle.addEventListener('click', () => {
    if (onToggle) onToggle();
    change(wanted === 'dark' ? 'light' : 'dark', true);
  });

  return {
    current: () => wanted,
    set(theme, seconds) { if (theme !== wanted) change(theme, false, seconds); },
  };
}
