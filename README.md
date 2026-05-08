# MFX-FLOW — osobní web

Statický web webové agentury. Vanilla HTML/CSS/JS + Three.js animace, build přes Vite, deploy na Vercel. Formulář posílá data do Google Sheetu přes Google Apps Script.

---

## Lokální development

```bash
npm install
npm run dev
```

Dev server běží na `http://localhost:5173` s hot reloadem.

```bash
npm run build      # produkční build do dist/
npm run preview    # lokální náhled produkčního buildu
```

---

## Setup formuláře (Google Apps Script + Sheets)

Poprvé musíš vytvořit Sheet a nasadit Apps Script. Trvá ~25 minut.

**Co vznikne:** list `Leads` v Google Sheetu s 9 sloupci, dropdown na sloupci STATUS (`nový / kontaktován / klient / nezájem / spam`), automatická duplicate detection (stejný kontakt 2× za 24 h → flag spam), notifikační email + auto-reply klientovi.

### 1. Vytvoř Google Sheet

1. Otevři [https://sheets.new](https://sheets.new) — vytvoří nový spreadsheet pod účtem `mojzisekf@gmail.com`
2. Pojmenuj ho **MFX-FLOW · Leady**
3. **Nemusíš** ručně přidávat sloupce — vytvoří je `setupSheet()` v kroku 3

### 2. Vlož Apps Script kód

1. V Sheetu: **Extensions → Apps Script** (otevře se nová záložka)
2. Editor má prázdný `Code.gs` se sample funkcí — **smaž celý jeho obsah** (Ctrl+A, Delete)
3. Otevři lokálně [`apps-script/Code.gs`](apps-script/Code.gs), **zkopíruj celý obsah**, vlož do editoru
4. **Save** (Ctrl+S nebo ikona diskety)
5. Vlevo nahoře přejmenuj projekt na **MFX-FLOW lead capture**

### 3. Spusť `setupSheet()` (jednorázově)

Tento krok připraví list, hlavičku a STATUS dropdown.

1. V editoru v dropdownu nahoře (vedle ▶ Run) vyber funkci **`setupSheet`**
2. Klikni **Run** ▶
3. Apps Script si vyžádá **oprávnění**:
   - **Review permissions** → vyber účet `mojzisekf@gmail.com`
   - Google ukáže "unverified app" varování — klikni **Advanced → Go to MFX-FLOW lead capture (unsafe)** (je to tvůj vlastní script, je to v pořádku)
   - **Allow** pro Spreadsheet + Mail
4. Po dokončení skript ukáže alert "Setup hotov!"
5. Vrať se do Sheetu — uvidíš:
   - Nový list `Leads` s 9 formátovanými sloupci
   - Sloupec H (STATUS) má dropdown s 5 hodnotami

### 4. Test backendu (`testRun()`)

1. V editoru vyber funkci **`testRun`** v dropdownu
2. Klikni **Run** ▶
3. Po doběhnutí ověř:
   - V Sheetu **2 řádky** (druhý má `STATUS = spam` — duplicate detection funguje ✓)
   - Schránka `mojzisekf@gmail.com` má notifikační email + email s `[DUPLICATE]` v subjectu + auto-reply
4. Pokud test selže → viz Troubleshooting níže

### 5. Deploy jako Web App

1. V editoru: **Deploy → New deployment**
2. Klikni ikonu ozubeného kola **Select type → Web app**
3. Vyplň:
   - Description: `Production v1`
   - Execute as: **Me (mojzisekf@gmail.com)**
   - Who has access: **Anyone** ⚠️ (nutné — anonymní formuláře z webu nemůžou autentizovat)
4. **Deploy** → potvrď oprávnění (pokud znovu vyžádá)
5. **Zkopíruj Web app URL** (končí na `/exec`) — klikni na copy ikonu

### 6. Vlož URL do `.env.local`

Vytvoř soubor `.env.local` v rootu projektu (zkopíruj `.env.example`):

```env
VITE_FORM_ENDPOINT=https://script.google.com/macros/s/AKfyc.../exec
```

Restartuj dev server (`npm run dev`).

> 🔧 **Pokud zatím nemáš Node.js** a používáš PowerShell preview server (`.claude/serve.ps1`), `.env.local` se nečte — Vite ho zpracovává při dev/buildu. Pro test bez Node.js dočasně hardcoduj URL přímo do [`form.js:11`](form.js):
> ```js
> const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfyc.../exec';
> ```
> Po doinstalaci Node.js to vrať zpět na `import.meta.env.VITE_FORM_ENDPOINT`.

### 7. Test ze živého formuláře

1. Otevři `http://localhost:5173`
2. Scroll na sekci **Kontakt**
3. Vyplň formulář:
   - Jméno (testovací)
   - Kontakt — **použij druhý email**, ne `mojzisekf@gmail.com` (ať si neblokuješ duplicate)
   - Vyber typ poptávky
   - Zaškrtni GDPR
   - **Odeslat poptávku**
4. Tlačítko se má změnit na "✓ Ozveme se do 24 h"
5. Ověř:
   - Sheet → nový řádek se `STATUS = novy`
   - `mojzisekf@gmail.com` → notifikace
   - Druhý email → auto-reply

### 8. Bonus testy: honeypot + duplicate

**Honeypot test** (zda anti-spam funguje):
1. F12 → Console na webu
2. Spusť: `document.getElementsByName('website')[0].value = 'spam'`
3. Pošli formulář — má proběhnout vizuálně OK, ale do Sheetu **nic nepřibude**

**Duplicate test:**
1. Pošli stejný kontakt znovu během 24 h
2. Sheet má nový řádek se `STATUS = spam`
3. Notifikační email má `[DUPLICATE]` v subjectu, **auto-reply se nepošle**

### Aktualizace Apps Script kódu

Když později upravíš `apps-script/Code.gs`:

1. Zkopíruj nový kód do Apps Script editoru, **Save**
2. **Deploy → Manage deployments**
3. U existujícího deploymentu klikni na ikonu tužky (Edit)
4. **Version**: vyber **New version**
5. **Deploy**
6. **URL zůstává stejná** — nemusíš nic měnit v `.env.local`

> ⚠️ Když místo "New version" vyberš "Save & test", URL se NEZMĚNÍ ale kód se **nedeployne** — vždycky musíš vytvořit nový version.

---

## Deploy na Vercel

### První deploy

```bash
npm i -g vercel
vercel login
vercel
```

Vercel CLI tě provede konfigurací:
- **Set up and deploy?** Yes
- **Scope?** tvůj osobní účet
- **Link to existing project?** No
- **Project name?** mfx-flow (nebo cokoli)
- **In which directory is your code?** `./` (default)
- **Override settings?** No (vercel.json už řeší build)

### Nastav environment variables

```bash
vercel env add VITE_FORM_ENDPOINT
```

Vlož stejnou Apps Script URL jako v `.env.local`. Vyber scope **Production**.

### Production deploy

```bash
vercel --prod
```

Dostaneš URL typu `mfx-flow.vercel.app`. Hotovo.

### Příští deploy

Stačí `vercel --prod` z rootu projektu — pokud jsi propojil s GitHubem, deploy se spouští automaticky při pushi.

---

## Struktura projektu

```
.
├── index.html          # hlavní stránka, všechen content
├── styles.css          # design system + komponenty
├── liquid-glass.css    # liquid glass efekt
├── app.js              # Three.js animace + scroll efekty (vanilla, IIFE)
├── liquid-glass.js     # liquid glass interakce
├── form.js             # form handler (modul, používá VITE_ env)
├── apps-script/
│   └── Code.gs         # backend pro form (kopíruje se do Apps Scriptu)
├── public/             # statická aktiva (vytvoř pokud potřebuješ)
├── assets/             # obrázky a další assets
├── uploads/            # nahrané obrázky
├── .env.example        # šablona env proměnných
├── .env.local          # tvoje env (gitignored)
├── package.json        # vite scripts
├── vite.config.js      # build config
└── vercel.json         # deploy config
```

---

## Troubleshooting

### "Form submit failed" v konzoli

- Zkontroluj `.env.local` — `VITE_FORM_ENDPOINT` musí být nastavený a nesmí obsahovat `REPLACE_ME`
- Restartuj dev server po změně `.env.local`
- Apps Script musí být deploynutý jako Web app s **Anyone** přístupem

### Lead nedorazil do Sheetu

- Otevři Apps Script editor → **Executions** (vlevo, ikonka hodinek)
- Najdi poslední `doPost` — pokud má status `Failed`, podívej se do logů
- Často: chybí oprávnění (znovu spusť `testRun` a povol)

### Email auto-reply nedorazil

- Klient ho dostává jen pokud do "kontakt" pole zadal **e-mail** (ne telefon)
- Apps Script má denní limit `MailApp` ~100 e-mailů (vlastní gmail). Pro vyšší objem přejdi na `GmailApp` nebo Resend

### CORS error v konzoli (development)

- Apps Script s `mode: 'no-cors'` nikdy nevrátí čitelnou response, ale request projde. Pokud vidíš CORS error, response prostě nebyla čitelná — zkontroluj Sheet, jestli tam lead je

### Build error "import.meta.env is undefined"

- `form.js` musí být v HTML jako `<script type="module">`. V index.html je to už správně

---

## Co dělat dál

Po prvním funkčním deployi:

1. **Vlastní doména** — kup `mfx-flow.cz`, propoj v Vercel dashboardu (Settings → Domains)
2. **Resend pro lepší e-maily** — Apps Script `MailApp` posílá z gmailové adresy. Resend posílá z vlastní domény (potřebuje DNS verifikaci).
3. **Analytics** — Vercel Analytics (zdarma) nebo Plausible
4. **Cookie banner** — až bude analytika, přidat GDPR cookie consent
5. **Reálné portfolio** — nahradit demo karty skutečnými klienty s odkazy na živé weby

---

## Poznámky pro budoucí editaci

- `app.js` je **vanilla IIFE** s globálním `THREE`. Nepřevádět na modul, rozbije se Three.js animace
- `form.js` je **modul** — má přístup k `import.meta.env` (Vite)
- HTML obsahuje 3 placeholdery na ruční dosazení:
  - Datum založení (`MM / RRRR` v hero/about/footer)
  - Telefon (`+420 777 000 000` na 2 místech)
  - Demo badge `Ukázkový projekt` se přidá ke každé `folio-card` až po rozhodnutí, který projekt je real/demo
