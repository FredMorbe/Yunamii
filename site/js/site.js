// Page behaviour: mobile menu, project carousel arrows, scroll reveal. No dependencies.
(() => {
  'use strict';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // mobile menu
  const overlay = document.getElementById('mobileOverlay');
  const menuBtn = document.getElementById('menuBtn');
  if (overlay && menuBtn) {
    const setMenu = (open) => {
      overlay.classList.toggle('open', open);
      overlay.setAttribute('aria-hidden', String(!open));
      menuBtn.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    menuBtn.addEventListener('click', () => setMenu(true));
    document.getElementById('closeMenu').addEventListener('click', () => setMenu(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  }

  // project carousel
  const cards = document.getElementById('cards');
  if (cards) {
    const behavior = reduceMotion ? 'auto' : 'smooth';
    const step = () => cards.querySelector('.card').getBoundingClientRect().width + 16;
    document.getElementById('prev').addEventListener('click', () => {
      if (cards.scrollLeft < 12) cards.scrollTo({ left: cards.scrollWidth, behavior });
      else cards.scrollBy({ left: -step(), behavior });
    });
    document.getElementById('next').addEventListener('click', () => {
      if (cards.scrollLeft + cards.clientWidth > cards.scrollWidth - 12) cards.scrollTo({ left: 0, behavior });
      else cards.scrollBy({ left: step(), behavior });
    });
  }

  // scroll reveal: content stays visible without JS (the hidden state is only applied under .js)
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reduceMotion) {
    items.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { threshold: 0.12 });
    items.forEach((el) => io.observe(el));
  }
})();
