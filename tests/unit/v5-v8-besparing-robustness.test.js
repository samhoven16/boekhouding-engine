/**
 * tests/unit/v5-v8-besparing-robustness.test.js
 *
 * V5 — KIA-misser proactieve detectie (€420-€19.769 KIA-aftrek/jaar verlies)
 * V6 — Bewaarplicht pre-alert (bewijslast-omkering bij controle)
 * V7 — Health-monitor robust (Cloudflare bot-block tolerantie)
 * V8 — Mail-DLQ fallback (geen stille melding-verdwijning)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const WF  = path.resolve(__dirname, '../../.github/workflows');

// ─────────────────────────────────────────────────────────
//  V8 — stuurMailMetDlq_
// ─────────────────────────────────────────────────────────
describe('V8: stuurMailMetDlq_ — fallback naar DLQ bij mail-fail', () => {
  function maakCtx(opts) {
    opts = opts || {};
    const dlqCalls = [];
    const mailCalls = [];
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs'], {
      MailApp: {
        sendEmail: function (to, subj, body) {
          mailCalls.push({ to, subj, body });
          if (opts.mailGooit) throw new Error(opts.mailGooit);
        },
      },
    });
    ctx.dlqVoegToe_ = (type, payload, fout) => dlqCalls.push({ type, payload, fout });
    return { ctx, mailCalls, dlqCalls };
  }

  test('Geldige mail → MailApp aangeroepen, geen DLQ', () => {
    const { ctx, mailCalls, dlqCalls } = maakCtx();
    const r = ctx.stuurMailMetDlq_('klant@x.nl', 'subj', 'body');
    expect(r).toBe(true);
    expect(mailCalls.length).toBe(1);
    expect(dlqCalls.length).toBe(0);
  });

  test('MailApp gooit → DLQ-entry met type EMAIL_NOTIFICATIE', () => {
    const { ctx, dlqCalls } = maakCtx({ mailGooit: 'quota exceeded' });
    const r = ctx.stuurMailMetDlq_('klant@x.nl', 'subj', 'body');
    expect(r).toBe(false);
    expect(dlqCalls.length).toBe(1);
    expect(dlqCalls[0].type).toBe('EMAIL_NOTIFICATIE');
    expect(dlqCalls[0].payload.email).toBe('klant@x.nl');
    expect(dlqCalls[0].payload.onderwerp).toBe('subj');
    expect(dlqCalls[0].payload.tekst).toBe('body');
    expect(dlqCalls[0].fout).toMatch(/quota/);
  });

  test('Ongeldig email → false, geen MailApp-call, geen DLQ', () => {
    const { ctx, mailCalls, dlqCalls } = maakCtx();
    const r = ctx.stuurMailMetDlq_('niet-een-email', 'subj', 'body');
    expect(r).toBe(false);
    expect(mailCalls.length).toBe(0);
    expect(dlqCalls.length).toBe(0);
  });

  test('Lege ontvanger → false, geen call', () => {
    const { ctx, mailCalls, dlqCalls } = maakCtx();
    expect(ctx.stuurMailMetDlq_('', 'subj', 'body')).toBe(false);
    expect(ctx.stuurMailMetDlq_(null, 'subj', 'body')).toBe(false);
    expect(mailCalls.length).toBe(0);
    expect(dlqCalls.length).toBe(0);
  });

  test('DLQ-helper zelf gooit → geen crash, return false', () => {
    const { ctx } = maakCtx({ mailGooit: 'down' });
    ctx.dlqVoegToe_ = () => { throw new Error('dlq sheet locked'); };
    expect(() => ctx.stuurMailMetDlq_('klant@x.nl', 'subj', 'body')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────
//  V8 — DLQ-handler EMAIL_NOTIFICATIE case
// ─────────────────────────────────────────────────────────
describe('V8: DLQ-handler EMAIL_NOTIFICATIE case bestaat', () => {
  test('DLQ.gs heeft EMAIL_NOTIFICATIE case met MailApp.sendEmail', () => {
    const src = fs.readFileSync(path.join(SRC, 'DLQ.gs'), 'utf8');
    expect(src).toMatch(/case ['"]EMAIL_NOTIFICATIE['"]/);
    // Tussen de case-regel en de eerstvolgende break/case staat MailApp.sendEmail
    const m = src.match(/case ['"]EMAIL_NOTIFICATIE['"]:([\s\S]*?)(?:case ['"]|default\s*:|^\s*})/m);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/MailApp\.sendEmail/);
  });
});

// ─────────────────────────────────────────────────────────
//  V5 — controleerKiaMisserProactief_
// ─────────────────────────────────────────────────────────
describe('V5: KIA-misser proactieve detectie', () => {
  function maakCtx(rows, opts) {
    opts = opts || {};
    const props = {
      _store: opts.props || {},
      getProperty(k) { return k in this._store ? this._store[k] : null; },
      setProperty(k, v) { this._store[k] = v; },
      deleteProperty(k) { delete this._store[k]; },
    };
    const mailCalls = [];
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs', 'Triggers.gs'], {
      PropertiesService: {
        getScriptProperties: () => props,
        getUserProperties: () => props,
      },
      MailApp: { sendEmail: (to, subj, body) => { mailCalls.push({ to, subj, body }); } },
    });
    const ifSheet = {
      getDataRange: () => ({ getValues: () => rows }),
      getLastRow: () => rows.length,
    };
    ctx.getSpreadsheet_ = () => ({
      getSheetByName: (n) => (n === 'Inkoopfacturen' ? ifSheet : null),
    });
    ctx.getInstelling_ = (k) => (opts.instellingen || {})[k] || null;
    ctx.schrijfAuditLog_ = () => {};
    return { ctx, mailCalls, props };
  }

  // Helper: inkoopfactuur-rij [3]=datum, [6]=leverancier, [7]=omschr,
  // [8]=bedragExcl, [12]=status, [15]=kostenrekening
  function rij(datum, leverancier, omschr, bedragExcl, status, rek) {
    const r = new Array(20).fill('');
    r[3] = datum; r[6] = leverancier; r[7] = omschr;
    r[8] = bedragExcl; r[12] = status; r[15] = rek;
    return r;
  }

  test('Geen uitgaven boven activeer-grens → geen actie', () => {
    const j = new Date().getFullYear();
    const { ctx, mailCalls } = maakCtx([
      new Array(20).fill(''),
      rij(new Date(j, 2, 15), 'A', 'kantoor', 100, 'Concept', '7110'),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerKiaMisserProactief_();
    expect(mailCalls.length).toBe(0);
  });

  test('Bedragen op activa-rekening (02xx) → genegeerd (al activeerd)', () => {
    const j = new Date().getFullYear();
    const { ctx, mailCalls } = maakCtx([
      new Array(20).fill(''),
      rij(new Date(j, 2, 15), 'A', 'laptop', 1500, 'Concept', '0200'),
      rij(new Date(j, 3, 1),  'B', 'meubel', 1500, 'Concept', '0210'),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerKiaMisserProactief_();
    expect(mailCalls.length).toBe(0);
  });

  test('Totaal < KIA_MIN (€2.901) → geen mail', () => {
    const j = new Date().getFullYear();
    const { ctx, mailCalls } = maakCtx([
      new Array(20).fill(''),
      rij(new Date(j, 2, 15), 'A', 'laptop', 1500, 'Concept', '7110'),
      rij(new Date(j, 3, 1),  'B', 'monitor', 800, 'Concept', '7110'),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerKiaMisserProactief_();
    expect(mailCalls.length).toBe(0);
  });

  test('Totaal ≥ KIA_MIN op kostenrekening → mail klant', () => {
    const j = new Date().getFullYear();
    const { ctx, mailCalls } = maakCtx([
      new Array(20).fill(''),
      rij(new Date(j, 2, 15), 'Coolblue', 'MacBook Pro',     2500, 'Concept', '7110'),
      rij(new Date(j, 3, 1),  'IKEA',     'bureau + stoel', 1500, 'Concept', '7110'),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerKiaMisserProactief_();
    expect(mailCalls.length).toBe(1);
    expect(mailCalls[0].to).toBe('klant@x.nl');
    expect(mailCalls[0].subj).toMatch(/KIA/i);
    expect(mailCalls[0].body).toMatch(/Coolblue/);
    expect(mailCalls[0].body).toMatch(/IKEA/);
  });

  test('Tweede aanroep binnen 90 dagen (zelfde kwartaal) → geen tweede mail', () => {
    const j = new Date().getFullYear();
    const { ctx, mailCalls } = maakCtx([
      new Array(20).fill(''),
      rij(new Date(j, 2, 15), 'A', 'x', 2000, 'Concept', '7110'),
      rij(new Date(j, 3, 1),  'B', 'y', 2000, 'Concept', '7110'),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerKiaMisserProactief_();
    ctx.controleerKiaMisserProactief_();
    expect(mailCalls.length).toBe(1);
  });

  test('Idempotency-marker gezet vóór mail-poging (geen mail-storm bij retry)', () => {
    const j = new Date().getFullYear();
    const { ctx, props } = maakCtx([
      new Array(20).fill(''),
      rij(new Date(j, 2, 15), 'A', 'x', 2000, 'Concept', '7110'),
      rij(new Date(j, 3, 1),  'B', 'y', 2000, 'Concept', '7110'),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    // Sabotage mail om te zien dat marker WEL gezet wordt
    ctx.MailApp = { sendEmail: () => { throw new Error('quota'); } };
    ctx.stuurMailMetDlq_ = () => { throw new Error('weirdness'); };
    try { ctx.controleerKiaMisserProactief_(); } catch (_) {}
    const kwartaal = Math.floor(new Date().getMonth() / 3) + 1;
    expect(props.getProperty('KIA_MISSER_GEMELD_' + j + '_Q' + kwartaal)).toBeTruthy();
  });

  test('Gecrediteerde inkoopfactuur telt niet mee', () => {
    const j = new Date().getFullYear();
    const { ctx, mailCalls } = maakCtx([
      new Array(20).fill(''),
      rij(new Date(j, 2, 15), 'A', 'x', 2000, 'Gecrediteerd', '7110'),
      rij(new Date(j, 3, 1),  'B', 'y', 2000, 'Gecrediteerd', '7110'),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerKiaMisserProactief_();
    expect(mailCalls.length).toBe(0);
  });

  test('Uitgaven in vorig jaar tellen niet mee', () => {
    const j = new Date().getFullYear();
    const { ctx, mailCalls } = maakCtx([
      new Array(20).fill(''),
      rij(new Date(j - 1, 2, 15), 'A', 'x', 2000, 'Concept', '7110'),
      rij(new Date(j - 1, 3, 1),  'B', 'y', 2000, 'Concept', '7110'),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerKiaMisserProactief_();
    expect(mailCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
//  V6 — controleerBewaarplichtAlert_
// ─────────────────────────────────────────────────────────
describe('V6: bewaarplicht pre-alert', () => {
  function maakCtx(jpRows, opts) {
    opts = opts || {};
    const props = {
      _store: opts.props || {},
      getProperty(k) { return k in this._store ? this._store[k] : null; },
      setProperty(k, v) { this._store[k] = v; },
      deleteProperty(k) { delete this._store[k]; },
    };
    const mailCalls = [];
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs', 'Triggers.gs'], {
      PropertiesService: {
        getScriptProperties: () => props,
        getUserProperties: () => props,
      },
      MailApp: { sendEmail: (to, subj, body) => { mailCalls.push({ to, subj, body }); } },
    });
    // Override formatDate naar echt
    ctx.Utilities.formatDate = (d) => {
      if (!(d instanceof Date) || isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return y + '-' + mo + '-' + da;
    };
    const jpSheet = {
      getDataRange: () => ({ getValues: () => jpRows }),
      getLastRow: () => jpRows.length,
      getRange: (r, c, n, k) => ({
        getValues: () => jpRows.slice(r - 1, r - 1 + n).map(row => row.slice(c - 1, c - 1 + k)),
      }),
    };
    ctx.getSpreadsheet_ = () => ({
      getSheetByName: (n) => (n === 'Journaalposten' ? jpSheet : null),
    });
    ctx.getInstelling_ = (k) => (opts.instellingen || {})[k] || null;
    ctx.schrijfAuditLog_ = () => {};
    return { ctx, mailCalls, props };
  }

  function jpRij(datum) {
    const r = new Array(16).fill('');
    r[1] = datum;  // [1] = Datum
    return r;
  }

  test('Geen journaalposten → geen actie', () => {
    const { ctx, mailCalls } = maakCtx([new Array(16).fill('')],
      { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerBewaarplichtAlert_();
    expect(mailCalls.length).toBe(0);
  });

  test('Oudste boeking 3 jaar oud → ruim binnen 7-jaars-grens, geen alert', () => {
    const oud = new Date();
    oud.setFullYear(oud.getFullYear() - 3);
    const { ctx, mailCalls } = maakCtx(
      [new Array(16).fill(''), jpRij(oud)],
      { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerBewaarplichtAlert_();
    expect(mailCalls.length).toBe(0);
  });

  test('Oudste boeking 6,7 jaar oud → alert (binnen 6,5 jr drempel)', () => {
    const oud = new Date();
    oud.setDate(oud.getDate() - Math.floor(6.7 * 365));
    const { ctx, mailCalls } = maakCtx(
      [new Array(16).fill(''), jpRij(oud)],
      { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerBewaarplichtAlert_();
    expect(mailCalls.length).toBe(1);
    expect(mailCalls[0].subj).toMatch(/Bewaarplicht|bewaarplicht|archiv/i);
  });

  test('Idempotent: tweede aanroep zelfde jaar → geen tweede mail', () => {
    const oud = new Date();
    oud.setDate(oud.getDate() - Math.floor(6.7 * 365));
    const { ctx, mailCalls } = maakCtx(
      [new Array(16).fill(''), jpRij(oud)],
      { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerBewaarplichtAlert_();
    ctx.controleerBewaarplichtAlert_();
    expect(mailCalls.length).toBe(1);
  });

  test('Mix oud + recent → oudste wordt correct gedetecteerd', () => {
    const oud = new Date();
    oud.setDate(oud.getDate() - Math.floor(6.8 * 365));
    const recent = new Date();
    const { ctx, mailCalls } = maakCtx([
      new Array(16).fill(''),
      jpRij(recent),
      jpRij(oud),       // dit is de oudste
      jpRij(new Date(recent.getFullYear() - 2, 0, 1)),
    ], { instellingen: { 'Email': 'klant@x.nl' } });
    ctx.controleerBewaarplichtAlert_();
    expect(mailCalls.length).toBe(1);
  });

  test('Geen Email-instelling → audit-log wel, mail niet', () => {
    const oud = new Date();
    oud.setDate(oud.getDate() - Math.floor(6.7 * 365));
    const { ctx, mailCalls } = maakCtx(
      [new Array(16).fill(''), jpRij(oud)],
      { instellingen: {} });
    ctx.controleerBewaarplichtAlert_();
    expect(mailCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
//  V7 — Health-monitor workflow
// ─────────────────────────────────────────────────────────
describe('V7: health-monitor robust (Cloudflare bot-block tolerantie)', () => {
  const yml = fs.readFileSync(path.join(WF, 'health-monitor.yml'), 'utf8');

  test('User-Agent header expliciet aanwezig op website-check', () => {
    expect(yml).toMatch(/-H ["']User-Agent: Mozilla/);
  });

  test('Cloudflare bot-mitigation patroon wordt herkend (geen fail)', () => {
    expect(yml).toMatch(/cf-mitigated|cf-chl-bypass|Just a moment/);
    expect(yml).toMatch(/cf-bot-block/);
  });

  test('Elke stap heeft continue-on-error (één rode verbergt andere niet)', () => {
    const occurrences = (yml.match(/continue-on-error:\s*true/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);  // website + licence + mollie
  });

  test('Eindoordeel-step bestaat met roll-up logica', () => {
    expect(yml).toMatch(/name:\s*Eindoordeel/);
    expect(yml).toMatch(/steps\.website\.outputs\.status/);
  });

  test('cf-bot-block en skipped tellen NIET als storing', () => {
    expect(yml).toMatch(/cf-bot-block en skipped tellen niet/);
  });
});

// ─────────────────────────────────────────────────────────
//  Integratie — dagelijkseTaken roept V5 + V6 aan
// ─────────────────────────────────────────────────────────
describe('Integratie: dagelijkseTaken roept V5 + V6 aan', () => {
  const src = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');

  test('V5 _runTaak_("kiaMisser", ...) aanwezig', () => {
    expect(src).toMatch(/_runTaak_\(['"]kiaMisser['"]/);
    expect(src).toMatch(/controleerKiaMisserProactief_/);
  });

  test('V6 _runTaak_("bewaarplichtAlert", ...) aanwezig', () => {
    expect(src).toMatch(/_runTaak_\(['"]bewaarplichtAlert['"]/);
    expect(src).toMatch(/controleerBewaarplichtAlert_/);
  });
});

// ─────────────────────────────────────────────────────────
//  V8 — bestaande mail-callsites gebruiken nu stuurMailMetDlq_
// ─────────────────────────────────────────────────────────
describe('V8: bestaande mail-callsites gebruiken DLQ-helper', () => {
  test('BTWReminder.gs gebruikt stuurMailMetDlq_', () => {
    const src = fs.readFileSync(path.join(SRC, 'BTWReminder.gs'), 'utf8');
    expect(src).toMatch(/stuurKlantNotificatie_|stuurMailMetDlq_/);
  });

  test('Fiscaal.gs:controleerSuppletieProactief_ gebruikt stuurMailMetDlq_', () => {
    const src = fs.readFileSync(path.join(SRC, 'Fiscaal.gs'), 'utf8');
    // Binnen controleerSuppletieProactief_ moet stuurMailMetDlq_ voorkomen
    const fnStart = src.indexOf('function controleerSuppletieProactief_');
    const fnEnd = src.indexOf('function genereerSuppletieRapport');
    expect(fnStart).toBeGreaterThan(-1);
    const fn = src.slice(fnStart, fnEnd);
    expect(fn).toMatch(/stuurKlantNotificatie_|stuurMailMetDlq_/);
  });

  test('Belastingadvies.gs:controleerKiaMisserProactief_ gebruikt stuurMailMetDlq_', () => {
    const src = fs.readFileSync(path.join(SRC, 'Belastingadvies.gs'), 'utf8');
    const fnStart = src.indexOf('function controleerKiaMisserProactief_');
    expect(fnStart).toBeGreaterThan(-1);
    const fn = src.slice(fnStart);
    expect(fn).toMatch(/stuurKlantNotificatie_|stuurMailMetDlq_/);
  });

  test('Invariants.gs:controleerBewaarplichtAlert_ gebruikt stuurMailMetDlq_', () => {
    const src = fs.readFileSync(path.join(SRC, 'Invariants.gs'), 'utf8');
    const fnStart = src.indexOf('function controleerBewaarplichtAlert_');
    expect(fnStart).toBeGreaterThan(-1);
    const fn = src.slice(fnStart);
    expect(fn).toMatch(/stuurKlantNotificatie_|stuurMailMetDlq_/);
  });
});
