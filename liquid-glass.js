/* Liquid Glass — pointer-tracked CSS variables */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const surfaces = document.querySelectorAll('.lg, .btn--glass');
  if (!surfaces.length) return;

  let raf = 0;
  const pending = new Map();

  function flush(){
    pending.forEach((v, el) => {
      el.style.setProperty('--mx', v.x + '%');
      el.style.setProperty('--my', v.y + '%');
      el.style.setProperty('--on', v.on);
    });
    pending.clear();
    raf = 0;
  }

  function schedule(el, x, y, on){
    pending.set(el, { x, y, on });
    if (!raf) raf = requestAnimationFrame(flush);
  }

  surfaces.forEach((el) => {
    let inside = false;
    el.addEventListener('pointerenter', () => { inside = true; schedule(el, 50, 0, 1); });
    el.addEventListener('pointerleave', () => { inside = false; schedule(el, 50, 0, 0); });
    el.addEventListener('pointermove', (e) => {
      if (reduceMotion) return;
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top)  / r.height) * 100;
      schedule(el, x, y, 1);
    });
  });

  // Hero card listens to whole hero section for nicer feel
  const heroCard = document.querySelector('.hero__glass-card');
  const hero = document.getElementById('hero');
  if (heroCard && hero && !reduceMotion) {
    hero.addEventListener('pointermove', (e) => {
      const r = heroCard.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      schedule(heroCard, x, y, 1);
    });
    hero.addEventListener('pointerleave', () => schedule(heroCard, 50, 0, 0));
  }
})();
