// "From Idea to Experience": a vine grows along the steps as the section scrolls into view,
// and a blossom opens at every step it reaches. Steps can be clicked to read more.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function initProcess({ reduceMotion }) {
  const steps = document.querySelector('[data-steps]');
  if (!steps) return;
  const items = [...steps.querySelectorAll('.step')];
  const detail = document.getElementById('stepDetail');
  if (!detail) throw new Error('process: #stepDetail not found');

  const n = items.length;
  const at = (i) => 0.04 + (i / (n - 1)) * 0.96; // progress at which step i opens
  let active = -1, swap = 0, pinned = null, pinnedAtCount = 0, count = 0;

  const setActive = (i) => {
    if (i === active) return;
    const first = active < 0;
    active = i;
    items.forEach((s, k) => s.classList.toggle('is-active', k === i));
    const token = ++swap;
    detail.classList.add('is-swapping');
    setTimeout(() => {
      if (token !== swap) return;
      detail.textContent = items[i].dataset.detail;
      detail.classList.remove('is-swapping');
    }, first || reduceMotion ? 0 : 200);
  };

  const update = () => {
    const r = steps.getBoundingClientRect(), h = innerHeight;
    const p = reduceMotion ? 1 : clamp((h * 0.82 - r.top) / (r.height + h * 0.18), 0, 1);
    steps.style.setProperty('--p', clamp((p - 0.04) / 0.96, 0, 1).toFixed(3));
    count = 0;
    items.forEach((s, i) => {
      s.classList.toggle('is-on', p >= at(i) || s.dataset.manual === '1');
      if (p >= at(i)) count++;
    });
    if (pinned !== null && count !== pinnedAtCount) pinned = null; // scrolling takes over again
    setActive(pinned !== null ? pinned : Math.max(0, count - 1));
  };

  items.forEach((s, i) => s.querySelector('.step-btn').addEventListener('click', () => {
    s.dataset.manual = '1';
    pinned = i;
    pinnedAtCount = count;
    s.classList.add('is-on');
    setActive(i);
  }));

  let queued = false;
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  update();
}
