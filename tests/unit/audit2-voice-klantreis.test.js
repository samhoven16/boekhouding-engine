/**
 * tests/unit/audit2-voice-klantreis.test.js
 *
 * Audit-vondsten ronde 2 — voice + klantreis quick-wins:
 *
 *   1. EmailQuotaGuard "kunnen we" → "kan Boekhoudbaar" (principe #7)
 *   2. BTWReminder "Uw boekhoudprogramma" → "— Boekhoudbaar" (consistency)
 *   3. Bedankt-pagina tijdsbeloftes consistent (1 belofte, geen 2 verschillende)
 *   4. P4 (pensioenklant) OAuth-uitleg vóór de actie-knop
 *   5. Migratie-FAQ op homepage voor persona-3 (technische klant)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const quota   = fs.readFileSync(path.join(ROOT, 'src/EmailQuotaGuard.gs'), 'utf8');
const btw     = fs.readFileSync(path.join(ROOT, 'src/BTWReminder.gs'), 'utf8');
const code    = fs.readFileSync(path.join(ROOT, 'licence-server/Code.gs'), 'utf8');
const home    = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');

describe('Voice patch #1 — EmailQuotaGuard geen "wij"-personificatie', () => {
  test('Body bevat NIET "kunnen we" (was: principe #7-schending)', () => {
    const start = quota.indexOf('Boekhoudbaar verstuurt facturen');
    const blok = quota.slice(start, start + 1200);
    expect(blok).not.toMatch(/kunnen we de rest van de dag/);
  });

  test('Body bevat WEL "kan Boekhoudbaar" (passieve substitutie)', () => {
    expect(quota).toMatch(/kan\\n\s*['"] \+\n?\s*['"]Boekhoudbaar de rest van de dag/);
  });

  test('Workspace-tip is concreter: "15× zoveel ruimte" (principe #2 concreet)', () => {
    expect(quota).toMatch(/15× zoveel ruimte/);
  });
});

describe('Voice patch #2 — BTWReminder signature gestandaardiseerd', () => {
  test('Niet meer "Uw boekhoudprogramma" als signature', () => {
    expect(btw).not.toMatch(/Uw boekhoudprogramma`/);
  });

  test('Wel "— Boekhoudbaar" als signature (consistency met EmailQuota + factuur)', () => {
    expect(btw).toMatch(/— Boekhoudbaar`/);
  });

  test('Open uw boekhoudprogramma → "Open Boekhoudbaar" (product-naam)', () => {
    expect(btw).toMatch(/Open Boekhoudbaar en kies/);
    expect(btw).not.toMatch(/Open uw boekhoudprogramma/);
  });
});

describe('Klantreis #3 — Tijdsbeloftes consistent op bedankt-pagina', () => {
  test('Eén tijds-belofte voor mail-delivery (5 minuten)', () => {
    const start = code.indexOf('Bedankt voor je aankoop');
    const blok = code.slice(start, start + 1500);
    // Beide regels noemen "5 minuten" — geen 1-min + 5-min mix
    expect(blok).toMatch(/Binnen 5 minuten staat er een e-mail/);
    expect(blok).toMatch(/Niets binnen na 5 minuten/);
    expect(blok).not.toMatch(/Binnen enkele minuten/);
    expect(blok).not.toMatch(/Binnen een minuut/);
  });
});

describe('Klantreis #4 — P4 (pensioenklant) OAuth-uitleg vóór knop', () => {
  test('Pre-button prep zin: "3 Google-schermen"', () => {
    const start = code.indexOf('Open mijn boekhouding →');
    expect(start).toBeGreaterThan(-1);
    const rond = code.slice(Math.max(0, start - 600), start);
    expect(rond).toMatch(/3 Google-schermen/);
  });

  test('Concrete actie-instructie: "Geavanceerd → Ga naar Boekhoudbaar (onveilig)"', () => {
    const start = code.indexOf('Open mijn boekhouding →');
    const rond = code.slice(Math.max(0, start - 600), start);
    expect(rond).toMatch(/Geavanceerd → Ga naar Boekhoudbaar \(onveilig\)/);
  });

  test('Prep-zin staat VLAK voor de knop (visuele nabijheid)', () => {
    const buttonStart = code.indexOf('Open mijn boekhouding →');
    // lastIndexOf vanaf de knop: pakt de prep-zin (vlak vóór de knop), niet de
    // gelijkluidende voorbereidende comment eerder in het bestand.
    const start = code.lastIndexOf('3 Google-schermen', buttonStart);
    expect(start).toBeGreaterThan(-1);
    expect(buttonStart).toBeGreaterThan(-1);
    // Binnen 500 chars → vlakbij; de knop-inline-CSS (~245 chars) domineert de afstand.
    expect(buttonStart - start).toBeLessThan(500);
  });
});

describe('Klantreis #5 — Migratie-FAQ op homepage voor persona-3', () => {
  test('Nieuwe FAQ-item id="migratie" bestaat', () => {
    expect(home).toMatch(/<details id="migratie">/);
  });

  test('Summary noemt 3 grootste concurrenten expliciet', () => {
    const start = home.indexOf('id="migratie"');
    const blok = home.slice(start, start + 2000);
    expect(blok).toMatch(/Moneybird/);
    expect(blok).toMatch(/Exact/);
    expect(blok).toMatch(/Boekhouden/);
  });

  test('Antwoord linkt naar bestaande migratie-gidsen', () => {
    const start = home.indexOf('id="migratie"');
    const blok = home.slice(start, start + 2000);
    // SEO-fix batch 1: .html → trailing-slash conventie (canonical)
    expect(blok).toMatch(/href="\/gids\/moneybird-alternatief-2026\//);
  });

  test('Antwoord noemt 3 export-formaten weg uit Boekhoudbaar', () => {
    const start = home.indexOf('id="migratie"');
    const blok = home.slice(start, start + 2000);
    expect(blok).toMatch(/CSV/);
    expect(blok).toMatch(/XAF/);
    expect(blok).toMatch(/JSONL/);
  });

  test('Antwoord linkt naar /continuiteit/ pagina (cross-reference)', () => {
    const start = home.indexOf('id="migratie"');
    const blok = home.slice(start, start + 2000);
    expect(blok).toMatch(/href="\/continuiteit\/"/);
  });
});

describe('Anti-regressie: bestaande FAQ-items intact', () => {
  test('google-warning FAQ blijft', () => {
    expect(home).toMatch(/<details id="google-warning">/);
  });

  test('gmail FAQ blijft', () => {
    expect(home).toMatch(/<details id="gmail">/);
  });
});
