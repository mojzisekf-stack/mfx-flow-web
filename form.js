/* ═══════════════════════════════════════════════════════════════
   MFX-FLOW · Form handler
   - Validace polí (jméno, kontakt = email/tel CZ, GDPR)
   - Honeypot anti-spam
   - Fetch POST na Google Apps Script Web App endpoint
   - States: default → sending → sent / error
═══════════════════════════════════════════════════════════════ */

// Apps Script Web App URL — z env proměnných.
// Lokálně: .env.local (VITE_FORM_ENDPOINT=...)
// Production (Vercel): nastav v Vercel dashboardu → Settings → Environment Variables
const FORM_ENDPOINT = (import.meta?.env?.VITE_FORM_ENDPOINT) || '';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RX = /^(\+?420)?\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/;

const form = document.getElementById('lead-form');

if (form) {
  form.addEventListener('submit', handleSubmit);

  // Live clear errors při typing
  form.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', () => clearError(el.name));
    el.addEventListener('change', () => clearError(el.name));
  });
}

async function handleSubmit(e) {
  e.preventDefault();

  // Reset stavů
  form.classList.remove('sent', 'error');

  // Honeypot — bot vyplnil pole, tiše předstírej úspěch
  if (form.website && form.website.value) {
    form.classList.add('sent');
    return;
  }

  // Validace
  if (!validateForm()) return;

  // Sending state
  form.classList.add('sending');

  const payload = {
    name: form.name.value.trim(),
    contact: form.contact.value.trim(),
    kind: form.kind.value,
    gdpr: form.gdpr.checked,
    userAgent: navigator.userAgent,
    referrer: document.referrer || 'direct',
  };

  try {
    if (!FORM_ENDPOINT || FORM_ENDPOINT.includes('REPLACE_ME')) {
      throw new Error('VITE_FORM_ENDPOINT není nastavený. Zkontroluj .env.local.');
    }

    // Apps Script vrátí simple response, ale CORS preflight neumí.
    // Použijeme text/plain content-type → simple request, žádný preflight.
    await fetch(FORM_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    // S `mode: no-cors` neumíme číst response → optimisticky předpokládáme úspěch.
    // Kontrolu provedeme v Sheetu / emailu.
    form.classList.remove('sending');
    form.classList.add('sent');
    form.reset();

  } catch (err) {
    console.error('Form submit failed:', err);
    form.classList.remove('sending');
    form.classList.add('error');
  }
}

function validateForm() {
  let valid = true;

  // Jméno
  const name = form.name.value.trim();
  if (name.length < 2) {
    showError('name', 'Napiš mi prosím jméno (alespoň 2 znaky).');
    valid = false;
  }

  // Kontakt — email nebo telefon
  const contact = form.contact.value.trim();
  if (!contact) {
    showError('contact', 'Napiš telefon nebo e-mail, ať tě můžu kontaktovat.');
    valid = false;
  } else if (!EMAIL_RX.test(contact) && !PHONE_RX.test(contact.replace(/\s/g, ''))) {
    showError('contact', 'Tohle nevypadá jako platný e-mail ani český telefon.');
    valid = false;
  }

  // GDPR
  if (!form.gdpr.checked) {
    showError('gdpr', 'Bez souhlasu se zpracováním údajů to bohužel nejde.');
    valid = false;
  }

  return valid;
}

function showError(fieldName, message) {
  const el = form.querySelector(`[data-error-for="${fieldName}"]`);
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  // Označ pole jako neplatné
  const input = form.elements[fieldName];
  if (input) input.classList.add('is-invalid');
}

function clearError(fieldName) {
  const el = form.querySelector(`[data-error-for="${fieldName}"]`);
  if (el) {
    el.hidden = true;
    el.textContent = '';
  }
  const input = form.elements[fieldName];
  if (input) input.classList.remove('is-invalid');
}
