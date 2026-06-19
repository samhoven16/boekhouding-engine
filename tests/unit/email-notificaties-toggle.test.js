/**
 * tests/unit/email-notificaties-toggle.test.js
 *
 * Klant-wens: "ik wil niet dat mijn klant elke dag random mails krijgt, makkelijk
 * aan/uit." Eén master-instelling 'E-mailnotificaties' (Ja/Nee) gate't alle
 * klant-gerichte meldingsmails (BTW-deadline, suppletie, KIA, bewaarplicht,
 * hoge-uitgave). Standaard AAN; menu-actie toggleEmailNotificaties flipt 'm.
 * Betalingsherinneringen naar de eigen klanten blijven buiten de gate.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const TRIGGERS = path.resolve(__dirname, '../../src/Triggers.gs');

function ctxMet(instellingen) {
  const store = Object.assign({}, instellingen);
  const ctx = createGasRuntime([TRIGGERS], {});
  ctx.getInstelling_ = (k) => (k in store ? store[k] : '');
  ctx.setInstelling_ = (k, v) => { store[k] = String(v); };
  ctx.isJa_ = (s) => /^\s*(ja|j|true|1|aan|yes)\s*$/i.test(String(s));
  ctx.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ toast() {} }),
    getUi: () => ({ alert() {} }),
  };
  return { ctx, store };
}

describe('emailNotificatiesAan_', () => {
  test('niet ingesteld → standaard AAN (backward-compat)', () => {
    expect(ctxMet({}).ctx.emailNotificatiesAan_()).toBe(true);
  });
  test("'Nee' → UIT", () => {
    expect(ctxMet({ 'E-mailnotificaties': 'Nee' }).ctx.emailNotificatiesAan_()).toBe(false);
  });
  test("'Ja'/'JA'/' ja ' → AAN (case/space-tolerant)", () => {
    expect(ctxMet({ 'E-mailnotificaties': 'Ja' }).ctx.emailNotificatiesAan_()).toBe(true);
    expect(ctxMet({ 'E-mailnotificaties': ' JA ' }).ctx.emailNotificatiesAan_()).toBe(true);
  });
});

describe('toggleEmailNotificaties — één klik aan/uit', () => {
  test('AAN → schrijft Nee', () => {
    const { ctx, store } = ctxMet({});             // default aan
    ctx.toggleEmailNotificaties();
    expect(store['E-mailnotificaties']).toBe('Nee');
  });
  test('UIT → schrijft Ja', () => {
    const { ctx, store } = ctxMet({ 'E-mailnotificaties': 'Nee' });
    ctx.toggleEmailNotificaties();
    expect(store['E-mailnotificaties']).toBe('Ja');
  });
});

describe('dagelijkseTaken gate (broncode-borging)', () => {
  const src = fs.readFileSync(TRIGGERS, 'utf8');
  const taken = src.slice(src.indexOf('function dagelijkseTaken'));
  test('routine-mail (BTW-deadline) gegate; compliance-detectie draait ALTIJD', () => {
    expect(taken).toMatch(/const _mailNotifAan = emailNotificatiesAan_\(\)/);
    // BTW-deadline-herinnering (routine) hangt aan de master-gate
    expect(taken).toMatch(/_mailNotifAan && isJa_\(getInstelling_\('BTW aangifte herinnering'\)\)/);
    // F-cross-PR: suppletie/KIA/bewaarplicht-DETECTIE (+ durable audit-log van een
    // wettelijke verplichting) mag NIET door de mail-gate uitgezet worden.
    expect(taken).not.toMatch(/_mailNotifAan && typeof controleerSuppletieProactief_/);
    expect(taken).not.toMatch(/_mailNotifAan && typeof controleerKiaMisserProactief_/);
    expect(taken).not.toMatch(/_mailNotifAan && typeof controleerBewaarplichtAlert_/);
  });
  test('betalingsherinneringen blijven ONgegate (zakelijk-essentieel)', () => {
    expect(taken).toMatch(/_runTaak_\('herinneringen',\s*function\(\) \{ stuurAutomatischeBetalingsherinneringen_\(ss\); \}\)/);
  });
});
