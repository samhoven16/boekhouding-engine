/**
 * tests/unit/audit-anker-mail.test.js
 *
 * C4 — Externe anker voor de hash-keten via mail-naar-self. Gmail-
 * tijdstempel is van een derde partij (Google) → bewijswaarde voor
 * 2031-controle dat de hash op die datum bestond. Klant kan niet zelf
 * de hele keten herrekenen want de mail-archief is buiten zijn directe
 * controle om aan te passen zonder spoor te laten.
 *
 * Audit 2026-06-12.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx(opts) {
  opts = opts || {};
  const mails = [];
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs'], {
    Session: {
      getActiveUser: () => ({ getEmail: () => (opts.email !== undefined ? opts.email : 'klant@bedrijf.nl') }),
    },
    MailApp: {
      getRemainingDailyQuota: () => (opts.quota !== undefined ? opts.quota : 100),
      sendEmail: (o) => { mails.push(o); if (opts.mailGooit) throw new Error(opts.mailGooit); },
    },
  });
  ctx.getInstelling_ = (k) => (k === 'Audit-anker e-mail' ? (opts.instellingWaarde || 'Aan') : '');
  return { ctx, mails };
}

describe('C4: _verstuurAuditAnchorMail_ — dagelijkse anker-mail', () => {
  test('Default (instelling "Aan") → mail wordt verstuurd', () => {
    const { ctx, mails } = maakCtx();
    const r = ctx._verstuurAuditAnchorMail_('2026-06-12', 42, 'abcdef0123456789', '0000');
    expect(r).toBe(true);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('klant@bedrijf.nl');
    expect(mails[0].subject).toMatch(/Audit-anker 2026-06-12/);
    expect(mails[0].subject).toMatch(/abcdef012345/);  // hash-prefix in subject
    expect(mails[0].body).toMatch(/Keten-hash:\s*abcdef0123456789/);
    expect(mails[0].body).toMatch(/Entry-count:\s*42/);
    expect(mails[0].body).toMatch(/Vorige hash:\s*0000/);
    expect(mails[0].body).toMatch(/art\. 52 AWR/);
  });

  test('Vorige hash leeg → "(geen)" in mail (eerste anker ooit)', () => {
    const { ctx, mails } = maakCtx();
    ctx._verstuurAuditAnchorMail_('2026-06-12', 0, 'eerstehash', '');
    expect(mails[0].body).toMatch(/Vorige hash:\s*\(geen\)/);
  });

  test('Instelling "Uit" → geen mail verstuurd', () => {
    const { ctx, mails } = maakCtx({ instellingWaarde: 'Uit' });
    const r = ctx._verstuurAuditAnchorMail_('2026-06-12', 1, 'h', '');
    expect(r).toBe(false);
    expect(mails).toHaveLength(0);
  });

  test('Instelling "Nee" / "off" → ook respecteerd, case-insensitief', () => {
    expect(maakCtx({ instellingWaarde: 'Nee' }).ctx._verstuurAuditAnchorMail_('d', 1, 'h', '')).toBe(false);
    expect(maakCtx({ instellingWaarde: 'OFF' }).ctx._verstuurAuditAnchorMail_('d', 1, 'h', '')).toBe(false);
  });

  test('Geen geldig e-mailadres → geen mail, geen crash', () => {
    expect(maakCtx({ email: '' }).ctx._verstuurAuditAnchorMail_('d', 1, 'h', '')).toBe(false);
    expect(maakCtx({ email: 'geen-at-teken' }).ctx._verstuurAuditAnchorMail_('d', 1, 'h', '')).toBe(false);
  });

  test('Mail-quota bijna op (<5) → geen mail (geeft voorrang aan factuurmail)', () => {
    const { ctx, mails } = maakCtx({ quota: 3 });
    const r = ctx._verstuurAuditAnchorMail_('d', 1, 'h', '');
    expect(r).toBe(false);
    expect(mails).toHaveLength(0);
  });

  test('MailApp.sendEmail throwt → geen crash, return false', () => {
    const { ctx } = maakCtx({ mailGooit: 'quota-op' });
    expect(() => ctx._verstuurAuditAnchorMail_('d', 1, 'h', '')).not.toThrow();
    expect(ctx._verstuurAuditAnchorMail_('d', 1, 'h', '')).toBe(false);
  });

  test('Body bevat GEEN persoonsgegevens of boekingsdata (alleen hash + count + datum)', () => {
    const { ctx, mails } = maakCtx();
    ctx._verstuurAuditAnchorMail_('2026-06-12', 42, 'abcdef', 'prev');
    const body = mails[0].body;
    // Hash is eenrichtingsfunctie — body benoemt dit expliciet
    expect(body).toMatch(/eenrichtingsfunctie/i);
    expect(body).toMatch(/GEEN boekingsdata/);
  });

  test('Body bevat opt-out-instructie', () => {
    const { ctx, mails } = maakCtx();
    ctx._verstuurAuditAnchorMail_('d', 1, 'h', '');
    expect(mails[0].body).toMatch(/Instellingen.*Audit-anker e-mail.*Uit/);
  });
});

describe('C4: integratie met schrijfDagelijksAuditAnchor_', () => {
  test('schrijfDagelijksAuditAnchor_ roept _verstuurAuditAnchorMail_ aan na sheet-write', () => {
    const fs = require('fs');
    const path = require('path');
    const ENG = fs.readFileSync(path.resolve(__dirname, '../../src/BoekingEngine.gs'), 'utf8');
    // Volgorde: appendRow → setProperty → _verstuurAuditAnchorMail_
    const idxAppend = ENG.indexOf('sheet.appendRow([vandaag');
    const idxMail = ENG.indexOf('_verstuurAuditAnchorMail_');
    expect(idxAppend).toBeGreaterThan(-1);
    expect(idxMail).toBeGreaterThan(idxAppend);
  });

  test('Aanroep zit in try-catch zodat mail-fout sheet-write niet teruglopen', () => {
    const fs = require('fs');
    const path = require('path');
    const ENG = fs.readFileSync(path.resolve(__dirname, '../../src/BoekingEngine.gs'), 'utf8');
    const idx = ENG.indexOf('_verstuurAuditAnchorMail_(vandaag');
    const voor = ENG.slice(Math.max(0, idx - 80), idx);
    expect(voor).toMatch(/try\s*\{/);
  });
});
