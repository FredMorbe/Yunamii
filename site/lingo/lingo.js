// Page behaviour of the product page that the shared modules do not have. Everything else (menu, header, reveal, petals, tabs and
// carousels, the vine, the footer waves) is ../js/site.js, the hero is ../js/hero.js.

// The foreground of the hero fades in with the scene (css, on html[data-hero]); if the hero never reports, it appears after a moment anyway.
const fore = document.querySelector('.hero-fore');
if (!fore) throw new Error('lingo: .hero-fore not found');
setTimeout(() => fore.classList.add('is-shown'), 4500);
