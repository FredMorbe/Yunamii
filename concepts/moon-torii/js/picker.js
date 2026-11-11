// A picker: a button that opens a short list. It is a custom listbox, so that it looks like the rest
// of the page, with the keyboard behaviour of a native one: arrows, Home and End move, Enter or
// Space choose, Escape closes. A press outside closes it as well. Used for the planet and for the way
// the sun moves. Each option has a data-value; it may have a data-label, which is what the button
// shows (otherwise the text of the option). A button may carry a .planet-dot that shows the value.

export function createPicker(root, { initial, onChange }) {
  const button = root.querySelector('.planet-btn');
  const list = root.querySelector('.planet-list');
  const label = root.querySelector('.planet-name');
  const dot = button.querySelector('.planet-dot');
  const options = [...list.querySelectorAll('[role="option"]')];
  let current = Math.max(0, options.findIndex((option) => option.dataset.value === initial));
  let active = current;

  // the chosen option shows on the button
  function show(index) {
    current = index;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    label.textContent = options[index].dataset.label ?? options[index].textContent.trim();
    if (dot) dot.dataset.planet = options[index].dataset.value;
  }

  // the option the keyboard or the pointer is on
  function highlight(index) {
    active = (index + options.length) % options.length;
    options.forEach((option, i) => option.toggleAttribute('data-active', i === active));
    list.setAttribute('aria-activedescendant', options[active].id);
  }

  function open() {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    highlight(current);
    list.focus();
  }

  function close(returnFocus) {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  }

  function choose(index) {
    close(true);
    if (index === current) return;
    show(index);
    onChange(options[index].dataset.value);
  }

  button.addEventListener('click', () => (list.hidden ? open() : close(false)));
  button.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    open();
  });

  list.addEventListener('keydown', (e) => {
    const moves = { ArrowDown: () => highlight(active + 1), ArrowUp: () => highlight(active - 1), Home: () => highlight(0), End: () => highlight(options.length - 1) };
    if (moves[e.key]) { e.preventDefault(); moves[e.key](); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key === 'Tab') close(false);
  });
  list.addEventListener('click', (e) => {
    const option = e.target.closest('[role="option"]');
    if (option) choose(options.indexOf(option));
  });
  list.addEventListener('pointermove', (e) => {
    const option = e.target.closest('[role="option"]');
    if (option) highlight(options.indexOf(option));
  });
  list.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) close(false); });
  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) close(false); });

  show(current);
}
