/* ═══════════════════════════════════════════════════════════════
   MFX-FLOW · Cookie / consent lišta + podmíněné načtení Vercel Analytics
   - Vercel Web Analytics je bezcookies a anonymní; načte se až po souhlasu.
   - Volba se pamatuje v localStorage ('all' = měřit, 'essential' = neměřit).
═══════════════════════════════════════════════════════════════ */
(function () {
  var KEY = 'mfx-consent';
  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}

  function loadAnalytics() {
    if (window.__mfxAnalytics) return;
    window.__mfxAnalytics = true;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    var s = document.createElement('script');
    s.defer = true;
    s.src = '/_vercel/insights/script.js';
    document.head.appendChild(s);
  }

  if (choice === 'all') { loadAnalytics(); return; }
  if (choice === 'essential') { return; }

  function showBanner() {
    if (document.getElementById('cookie-banner')) return;
    var el = document.createElement('div');
    el.id = 'cookie-banner';
    el.className = 'cookie-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cookies a soukromí');
    el.innerHTML =
      '<div class="cookie-banner__inner">' +
        '<p class="cookie-banner__text">🍪 Rádi bychom měřili <strong>anonymní návštěvnost</strong> (Vercel Analytics, bez cookies), ať web můžeme vylepšovat. Víc v <a href="/zasady-ochrany-osobnich-udaju">zásadách ochrany osobních údajů</a>.</p>' +
        '<div class="cookie-banner__actions">' +
          '<button type="button" class="cookie-banner__btn cookie-banner__btn--ghost" data-consent="essential">Jen nezbytné</button>' +
          '<button type="button" class="cookie-banner__btn cookie-banner__btn--primary" data-consent="all">Přijmout</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-visible'); });

    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-consent]');
      if (!btn) return;
      var v = btn.getAttribute('data-consent');
      try { localStorage.setItem(KEY, v); } catch (e) {}
      if (v === 'all') loadAnalytics();
      el.classList.remove('is-visible');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
