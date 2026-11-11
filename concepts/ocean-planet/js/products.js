// Product showcase: tabs and panels (the accessible control) plus the orbit map above them,
// where every product circles the sun on its own path. Both select the same panel.

const CENTER = [320, 212];           // in the orrery's viewBox
const TILT = (-14 * Math.PI) / 180;  // matches the rotate() on the orbit group
const FLAT = 0.4;                    // ry / rx of the orbit ellipses
// orbit radius, seconds per revolution, start angle; in tab order, innermost first
const ORBITS = [[84, 90, 0.5], [138, 130, 2.5], [192, 180, 4.2], [246, 250, 5.6], [300, 330, 1.6]];

export function initProducts({ reduceMotion }) {
  const root = document.querySelector('[data-showcase]');
  const tablist = root.querySelector('[role="tablist"]');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  const orrery = document.getElementById('orrery');
  const planets = tabs.map((tab) => orrery.querySelector(`.planet[data-product="${tab.dataset.product}"]`));
  const paths = [...orrery.querySelectorAll('.orbits ellipse')];

  function select(index, { animate = true, focus = false } = {}) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      planets[i].classList.toggle('is-active', on);
      paths[i].classList.toggle('is-active', on);
    });
    if (animate) {
      // restart the entrance animation
      panels[index].classList.remove('is-entering');
      void panels[index].offsetWidth;
      panels[index].classList.add('is-entering');
    }
    if (focus) tabs[index].focus();
    // on narrow screens the tabs scroll sideways: keep the selected one in view
    if (tablist.scrollWidth > tablist.clientWidth) {
      tablist.scrollTo({ left: tabs[index].offsetLeft - tablist.offsetLeft - 20, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('pointerenter', () => planets[i].classList.add('is-hover'));
    tab.addEventListener('pointerleave', () => planets[i].classList.remove('is-hover'));
    planets[i].addEventListener('click', () => {
      select(i);
      // the map sits above the panel: bring the chosen product into view if it is cut off
      if (panels[i].getBoundingClientRect().bottom > innerHeight) {
        tablist.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
    planets[i].addEventListener('pointerenter', () => tab.classList.add('is-hover'));
    planets[i].addEventListener('pointerleave', () => tab.classList.remove('is-hover'));
  });

  tablist.addEventListener('keydown', (e) => {
    const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const next = { ArrowRight: current + 1, ArrowDown: current + 1, ArrowLeft: current - 1, ArrowUp: current - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select((next + tabs.length) % tabs.length, { focus: true });
  });

  select(0, { animate: false });

  // ---- orbit map
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);
  let time = 0;
  let last = 0;
  let raf = 0;

  function place() {
    planets.forEach((planet, i) => {
      const [radius, period, start] = ORBITS[i];
      const angle = start + (time / period) * Math.PI * 2;
      const ex = radius * Math.cos(angle);
      const ey = radius * FLAT * Math.sin(angle);
      const x = CENTER[0] + ex * cosT - ey * sinT;
      const y = CENTER[1] + ex * sinT + ey * cosT;
      planet.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      // labels point away from the right edge
      const label = planet.lastElementChild;
      const left = x > 440;
      label.setAttribute('x', left ? -18 : 18);
      label.setAttribute('text-anchor', left ? 'end' : 'start');
    });
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    time += Math.min((now - last) / 1000, 0.1);
    last = now;
    place();
  }

  place();
  if (reduceMotion) return;
  new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(raf);
    if (entry.isIntersecting) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }).observe(orrery);
}
