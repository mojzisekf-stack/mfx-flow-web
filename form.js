/* ═══════════════════════════════════════════════════════════════
   MFX-FLOW · Univerzální form handler
   - Obsluhuje libovolný formulář s atributem [data-mfx-form]
   - Typ formuláře v data-form-type (lead / tip / kurz) → posílá se jako `type`
   - Validace: [required] pole + [data-validate="contact|email"]
   - Honeypot anti-spam (skryté pole name="website")
   - Fetch POST (no-cors) na Google Apps Script endpoint
   - Stavy: default → sending → sent / error (třídy na <form>)
═══════════════════════════════════════════════════════════════ */

// Apps Script Web App URL — natvrdo (statický deploy, bez Vite buildu).
// Apps Script endpoint je veřejný (autorizace "Anyone"), proto není citlivý.
const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxen3DdgHCIQoLxzjebJDjeMF5z3AyWtJZJIraitEbghBOF5dF92yy4XGCMiYzTBrWKFQ/exec';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RX = /^(\+?420)?\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/;

const DEFAULT_MESSAGES = {
  required: 'Tohle pole prosím vyplň.',
  requiredCheck: 'Bez zaškrtnutí to bohužel nejde.',
  contact: 'Tohle nevypadá jako platný e-mail ani český telefon.',
  email: 'Tohle nevypadá jako platný e-mail.',
  short: 'Napiš prosím alespoň 2 znaky.',
};

// Inicializuj každý formulář na stránce
document.querySelectorAll('[data-mfx-form]').forEach(initForm);

function initForm(form) {
  form.addEventListener('submit', (e) => handleSubmit(e, form));

  // Živé mazání chyb při psaní / změně
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('input', () => clearError(form, el.name));
    el.addEventListener('change', () => clearError(form, el.name));
  });
}

async function handleSubmit(e, form) {
  e.preventDefault();
  form.classList.remove('sent', 'error');

  // Honeypot — bot vyplnil skryté pole, tiše předstírej úspěch
  if (form.website && form.website.value) {
    form.classList.add('sent');
    return;
  }

  if (!validateForm(form)) return;

  form.classList.add('sending');

  const payload = collectPayload(form);

  try {
    if (!FORM_ENDPOINT || FORM_ENDPOINT.includes('REPLACE_ME')) {
      throw new Error('FORM_ENDPOINT není nastavený.');
    }

    // Apps Script neumí CORS preflight → text/plain = simple request bez preflightu.
    await fetch(FORM_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    // no-cors → response nečteme, optimisticky předpokládáme úspěch.
    // Kontrola probíhá v Sheetu / e-mailu.
    form.classList.remove('sending');
    form.classList.add('sent');
    form.reset();
  } catch (err) {
    console.error('Form submit failed:', err);
    form.classList.remove('sending');
    form.classList.add('error');
  }
}

// Sesbírá všechna pojmenovaná pole (kromě honeypotu) + typ formuláře
function collectPayload(form) {
  const payload = {
    type: form.dataset.formType || 'lead',
    userAgent: navigator.userAgent,
    referrer: document.referrer || 'direct',
    page: location.pathname || '/',
  };

  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.name || el.name === 'website') return;
    if (el.type === 'checkbox') {
      payload[el.name] = el.checked;
    } else {
      payload[el.name] = el.value.trim();
    }
  });

  // ─── Kompatibilita se staršími Apps Scripty (vyžadují name + contact) ───
  // Nový/rozšířený Code.gs si poradí i bez tohohle, ale se starou verzí
  // by se waitlist (jen e-mail) ztratil a u tipu by zmizely detaily firmy.
  if (payload.type === 'kurz') {
    if (!payload.contact) payload.contact = payload.email || '';
    if (!payload.name)    payload.name = 'Waitlist kurzu';
    if (!payload.kind)    payload.kind = 'Kurz – waitlist';
  } else if (payload.type === 'tip') {
    payload.kind = 'Affiliate tip → ' + (payload.firma || '') +
      (payload.firmaContact ? ' · ' + payload.firmaContact : '') +
      (payload.note ? ' · ' + payload.note : '');
  }

  return payload;
}

function validateForm(form) {
  let valid = true;

  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.name || el.name === 'website') return;

    const rule = el.dataset.validate; // 'contact' | 'email' | undefined
    const isRequired = el.hasAttribute('required');

    // Checkbox (GDPR, čestné prohlášení)
    if (el.type === 'checkbox') {
      if (isRequired && !el.checked) {
        showError(form, el.name, el.dataset.errorMsg || DEFAULT_MESSAGES.requiredCheck);
        valid = false;
      }
      return;
    }

    const value = (el.value || '').trim();

    if (isRequired && !value) {
      showError(form, el.name, el.dataset.errorMsg || DEFAULT_MESSAGES.required);
      valid = false;
      return;
    }
    if (!value) return; // nepovinné a prázdné → OK

    if (el.name === 'name' && value.length < 2) {
      showError(form, el.name, DEFAULT_MESSAGES.short);
      valid = false;
      return;
    }
    if (rule === 'contact') {
      const ok = EMAIL_RX.test(value) || PHONE_RX.test(value.replace(/\s/g, ''));
      if (!ok) { showError(form, el.name, DEFAULT_MESSAGES.contact); valid = false; }
    } else if (rule === 'email') {
      if (!EMAIL_RX.test(value)) { showError(form, el.name, DEFAULT_MESSAGES.email); valid = false; }
    }
  });

  return valid;
}

function showError(form, fieldName, message) {
  const el = form.querySelector(`[data-error-for="${fieldName}"]`);
  if (el) {
    el.textContent = message;
    el.hidden = false;
  }
  const input = form.elements[fieldName];
  if (input && input.classList) input.classList.add('is-invalid');
}

function clearError(form, fieldName) {
  if (!fieldName) return;
  const el = form.querySelector(`[data-error-for="${fieldName}"]`);
  if (el) {
    el.hidden = true;
    el.textContent = '';
  }
  const input = form.elements[fieldName];
  if (input && input.classList) input.classList.remove('is-invalid');
}
