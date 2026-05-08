/**
 * MFX-FLOW · Lead capture endpoint (Google Apps Script)
 *
 * Co dela:
 *  1) Prijme POST z formulare na webu
 *  2) Validuje honeypot (anti-spam)
 *  3) Detekuje duplicaty (stejny kontakt za poslednich 24h)
 *  4) Zapise lead do Google Sheetu (s defaultnim STATUS = "novy")
 *  5) Posle notifikacni email majiteli
 *  6) Posle auto-reply email klientovi (pokud zadal email)
 *
 * Setup viz README.md v rootu projektu.
 *
 * DULEZITE:
 *  - Pred prvnim deployem spust funkci setupSheet() (vytvori list + dropdown).
 *  - Po editaci kodu MUSIS vytvorit NOVY deployment version
 *    (Deploy -> Manage deployments -> tuzka u stavajici verze -> New version),
 *    jinak se zmeny neprojevi a webu zustane stara URL.
 */

// ====== KONFIGURACE — uprav podle svych potreb ====== //
const CONFIG = {
  // Email kam chodi notifikace o novem leadu
  NOTIFY_EMAIL: 'mojzisekf@gmail.com',

  // Jmeno odesilatele v auto-reply (jak se zobrazi v poste klienta)
  REPLY_FROM_NAME: 'MFX-FLOW',

  // Predmet auto-reply emailu klientovi
  REPLY_SUBJECT: 'Diky za poptavku — MFX-FLOW',

  // Nazev listu v Google Sheetu
  SHEET_NAME: 'Leads',

  // Pokud true, posle se klientovi auto-reply (pokud zadal email)
  SEND_AUTOREPLY: true,

  // Duplicate detection: jak daleko dozadu hledat (v hodinach)
  DUPLICATE_WINDOW_HOURS: 24,

  // Hodnoty pro STATUS dropdown (1. je default pro nove leady)
  STATUS_VALUES: ['novy', 'kontaktovan', 'klient', 'nezajem', 'spam'],
};

// Indexy sloupcu (1-based, jak Sheets API vyzaduje)
const COL = {
  DATE: 1,
  NAME: 2,
  CONTACT: 3,
  KIND: 4,
  GDPR: 5,
  USER_AGENT: 6,
  REFERRER: 7,
  STATUS: 8,
  NOTES: 9,
};
const HEADER = [
  'Datum', 'Jmeno', 'Kontakt', 'Typ poptavky', 'GDPR',
  'UserAgent', 'Referrer', 'STATUS', 'POZNAMKY'
];
// ===================================================== //


/**
 * Hlavni POST handler — vola se pri odeslani formulare z webu
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ─── Anti-spam: honeypot pole ───
    if (data.website && data.website.length > 0) {
      return jsonResponse({ status: 'ok', spam: true });
    }

    // ─── Validace povinnych poli ───
    if (!data.name || !data.contact) {
      return jsonResponse({ status: 'error', message: 'Chybi povinna pole' });
    }

    const sheet = getOrCreateSheet();
    const timestamp = new Date();

    // ─── Duplicate detection ───
    const isDuplicate = findRecentDuplicate(sheet, data.contact, timestamp);
    const status = isDuplicate ? 'spam' : CONFIG.STATUS_VALUES[0];

    // ─── Zapis do Sheetu ───
    sheet.appendRow([
      timestamp,
      data.name || '',
      data.contact || '',
      data.kind || '',
      data.gdpr ? 'ANO' : 'NE',
      data.userAgent || '',
      data.referrer || '',
      status,
      '',  // POZNAMKY
    ]);

    // ─── Notifikace majiteli (s flag pro duplikaty) ───
    sendOwnerNotification(data, timestamp, isDuplicate);

    // ─── Auto-reply klientovi (NE pokud je duplicate, NE pokud kontakt neni email) ───
    if (CONFIG.SEND_AUTOREPLY && !isDuplicate && isEmail(data.contact)) {
      sendAutoReply(data.contact, data.name);
    }

    return jsonResponse({ status: 'ok', duplicate: isDuplicate });

  } catch (err) {
    console.error('doPost error:', err);
    return jsonResponse({ status: 'error', message: String(err) });
  }
}


/**
 * GET endpoint — pomocny, vraci jen "alive" zpravu pro test
 */
function doGet() {
  return jsonResponse({ status: 'alive', service: 'MFX-FLOW lead capture' });
}


/**
 * Jednorazova priprava listu — spustit MANUALNE pred prvnim deployem.
 *
 * Vytvori list "Leads", nastavi hlavicku, formatovani a dropdown na sloupci STATUS.
 * Idempotentni — pokud uz list existuje, jen overi a doplni co chybi.
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  // Hlavicka
  const headerRange = sheet.getRange(1, 1, 1, HEADER.length);
  headerRange.setValues([HEADER]);
  headerRange.setFontWeight('bold').setBackground('#f0f0f0');
  sheet.setFrozenRows(1);

  // Sirky sloupcu (priblizne)
  sheet.setColumnWidth(COL.DATE, 150);
  sheet.setColumnWidth(COL.NAME, 160);
  sheet.setColumnWidth(COL.CONTACT, 200);
  sheet.setColumnWidth(COL.KIND, 180);
  sheet.setColumnWidth(COL.GDPR, 60);
  sheet.setColumnWidth(COL.USER_AGENT, 200);
  sheet.setColumnWidth(COL.REFERRER, 140);
  sheet.setColumnWidth(COL.STATUS, 130);
  sheet.setColumnWidth(COL.NOTES, 320);

  // Data validation pro STATUS sloupec (dropdown)
  const statusRange = sheet.getRange(2, COL.STATUS, sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.STATUS_VALUES, true)
    .setAllowInvalid(false)
    .setHelpText('Vyber jednu z hodnot: ' + CONFIG.STATUS_VALUES.join(' / '))
    .build();
  statusRange.setDataValidation(rule);

  // Format data — datum
  sheet.getRange(2, COL.DATE, sheet.getMaxRows() - 1, 1)
    .setNumberFormat('dd.MM.yyyy HH:mm:ss');

  console.log('setupSheet OK — list "' + CONFIG.SHEET_NAME + '" pripraven.');
  SpreadsheetApp.getUi && SpreadsheetApp.getUi().alert(
    'Setup hotov!',
    'List "' + CONFIG.SHEET_NAME + '" je pripraven s ' + HEADER.length + ' sloupci a STATUS dropdownem.\n\nDalsi krok: spust testRun() pro overeni a pak Deploy -> Web app.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}


/**
 * Vrati referenci na Sheet, pripadne ho vytvori (fallback pokud setupSheet neprobehl)
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    setupSheet();
    sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  }
  return sheet;
}


/**
 * Hleda v Sheetu jestli stejny kontakt prisel za poslednich N hodin.
 * Normalizuje kontakt (lowercase email / cislice-only telefon) pred porovnanim.
 */
function findRecentDuplicate(sheet, contact, now) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const cutoff = new Date(now.getTime() - CONFIG.DUPLICATE_WINDOW_HOURS * 3600 * 1000);
  const data = sheet.getRange(2, 1, lastRow - 1, COL.CONTACT).getValues();
  const target = normalizeContact(contact);

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowDate = row[COL.DATE - 1];
    const rowContact = row[COL.CONTACT - 1];
    if (!rowDate || !(rowDate instanceof Date)) continue;
    if (rowDate < cutoff) continue;
    if (normalizeContact(rowContact) === target) return true;
  }
  return false;
}


/**
 * Normalizace kontaktu pro porovnani:
 *  - email: trim + lowercase
 *  - telefon: jen cislice (smaze mezery, +, zavorky)
 */
function normalizeContact(c) {
  const s = String(c || '').trim();
  if (isEmail(s)) return s.toLowerCase();
  return s.replace(/\D/g, '');
}


/**
 * Posle notifikacni email majiteli (s flag pro duplikaty)
 */
function sendOwnerNotification(data, timestamp, isDuplicate) {
  const dupTag = isDuplicate ? '[DUPLICATE] ' : '';
  const subject = `${dupTag}Novy lead: ${data.name} — ${data.kind || 'nespecifikovano'}`;
  const lines = [
    isDuplicate
      ? '⚠ Tento kontakt uz prisel za poslednich ' + CONFIG.DUPLICATE_WINDOW_HOURS + 'h. Lead je oznacen jako spam.'
      : 'Prisla nova poptavka z webu mfx-flow:',
    '',
    `Jmeno:    ${data.name}`,
    `Kontakt:  ${data.contact}`,
    `Typ:      ${data.kind || '—'}`,
    `GDPR:     ${data.gdpr ? 'ANO' : 'NE'}`,
    `Cas:      ${timestamp.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}`,
    '',
    `UserAgent: ${data.userAgent || '—'}`,
    `Referrer:  ${data.referrer || '—'}`,
    '',
    '— MFX-FLOW lead bot',
  ];

  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: subject,
    body: lines.join('\n'),
  });
}


/**
 * Posle auto-reply klientovi
 */
function sendAutoReply(toEmail, name) {
  const firstName = (name || '').split(' ')[0] || '';
  const greeting = firstName ? `Ahoj ${firstName},` : 'Dobry den,';

  const body = [
    greeting,
    '',
    'diky za zpravu! Tvoje poptavka dorazila a do 24 hodin se ti ozvu',
    'a probereme dalsi kroky.',
    '',
    'Pokud je situace urgentni, klidne zavolej rovnou — telefon najdes',
    'na webu v sekci kontakt.',
    '',
    'Hezky den,',
    'MFX-FLOW',
    '',
    '---',
    'Tento email je automaticka odpoved na tvou poptavku z mfx-flow.cz.',
  ].join('\n');

  MailApp.sendEmail({
    to: toEmail,
    subject: CONFIG.REPLY_SUBJECT,
    body: body,
    name: CONFIG.REPLY_FROM_NAME,
  });
}


/**
 * Detekuje, jestli string vypada jako email
 */
function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str || '').trim());
}


/**
 * Pomocna funkce — vraci JSON odpoved
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * Test funkce — pust ji manualne v editoru pro overeni, ze vse funguje.
 * Posle fake POST se vsemi sloupci, oversi Sheet zapis + email.
 */
function testRun() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        name: 'Test Klient',
        contact: 'mojzisekf@gmail.com',
        kind: 'Vizitka — 6 000 Kc',
        gdpr: true,
        userAgent: 'TestRunner / Apps Script',
        referrer: 'manual-test',
      })
    }
  };
  const result = doPost(fakeEvent);
  const output = result.getContent();
  console.log('testRun result: ' + output);

  // Druhe volani by melo detekovat duplicate
  const result2 = doPost(fakeEvent);
  console.log('testRun #2 (mel by byt duplicate): ' + result2.getContent());
}
