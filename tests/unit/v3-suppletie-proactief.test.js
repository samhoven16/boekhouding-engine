/**
 * tests/unit/v3-suppletie-proactief.test.js
 *
 * V3-FIX (boete-preventie): suppletie-detectie was dood.
 *
 * detecteerSuppletieMogelijk_ LAS BTW_SNAPSHOTS maar niemand schreef het ooit
 * → functie returned altijd []. Klant met retroactieve correctie >€1.000 zag
 * "geen suppletie nodig" → diende niet in → bij latere Belastingdienst-
 * ontdekking: naheffing + 30% verzuimboete + heffingsrente.
 *
 * Fixes geverifieerd:
 *   1. sluitBtwPeriode SCHRIJFT BTW_SNAPSHOTS (broncode-check)
 *   2. detecteerSuppletieMogelijk_ vindt nu verplichte suppletie
 *   3. controleerSuppletieProactief_ mailt + audit-log + idempotent
 *   4. dagelijkseTaken roept de proactieve check aan
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');

describe('V3: sluitBtwPeriode schrijft BTW_SNAPSHOTS (broncode)', () => {
  const src = fs.readFileSync(path.join(SRC, 'BTW.gs'), 'utf8');

  test('Snapshot-write expliciet aanwezig na vergrendelPeriode_', () => {
    // setProperty op BTW_SNAPSHOTS moet voorkomen in sluitBtwPeriode-blok
    expect(src).toMatch(/setProperty\(['"]BTW_SNAPSHOTS['"]/);
  });

  test('Snapshot bevat saldo + alle relevante velden voor latere vergelijking', () => {
    expect(src).toMatch(/saldo:\s+aangifte\.saldo/);
    expect(src).toMatch(/r1a_btw:/);
    expect(src).toMatch(/r5b:/);
    expect(src).toMatch(/vastgelegdOp:/);
  });

  test('Fail-safe: JSON.parse-error voor corrupte snapshot wordt opgevangen', () => {
    // try/catch rond JSON.parse zodat één corrupte snapshot niet alle toekomstige
    // schrijfacties blokkeert
    expect(src).toMatch(/JSON\.parse\(props\.getProperty\(['"]BTW_SNAPSHOTS['"][^)]*\)[^)]*\)/);
  });
});

describe('V3: detecteerSuppletieMogelijk_ werkt nu met geschreven snapshots', () => {
  function maakCtx(snapshotsObj, huidigSaldo) {
    const props = {
      _store: { 'BTW_SNAPSHOTS': JSON.stringify(snapshotsObj || {}) },
      getProperty(k) { return k in this._store ? this._store[k] : null; },
      setProperty(k, v) { this._store[k] = v; },
      deleteProperty(k) { delete this._store[k]; },
    };
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Fiscaal.gs'], {
      PropertiesService: {
        getScriptProperties: () => props,
        getUserProperties: () => props,
      },
    });
    ctx.getSpreadsheet_ = () => ({});
    ctx.berekenBtwAangifte_ = () => ({ saldo: huidigSaldo });
    return { ctx, props };
  }

  test('Geen snapshots → lege array (vroeger gedrag, geen valse alarms)', () => {
    const { ctx } = maakCtx({}, 0);
    expect(ctx.detecteerSuppletieMogelijk_()).toEqual([]);
  });

  test('Snapshot saldo €2.000, nieuw €2.300 (verschil €300) → niet verplicht', () => {
    const jaar = new Date().getFullYear();
    const { ctx } = maakCtx({ [`${jaar}_Q1`]: { saldo: 2000 } }, 2300);
    const out = ctx.detecteerSuppletieMogelijk_();
    expect(out.length).toBe(1);
    expect(out[0].verschil).toBeCloseTo(300, 1);
    expect(out[0].verplicht).toBe(false);  // < €1.000
  });

  test('Snapshot €2.000, nieuw €3.500 (verschil €1.500) → VERPLICHT', () => {
    const jaar = new Date().getFullYear();
    const { ctx } = maakCtx({ [`${jaar}_Q1`]: { saldo: 2000 } }, 3500);
    const out = ctx.detecteerSuppletieMogelijk_();
    expect(out[0].verplicht).toBe(true);
    expect(out[0].verschil).toBeCloseTo(1500, 1);
  });

  test('Negatief verschil ook gedetecteerd (te veel betaald → terug)', () => {
    const jaar = new Date().getFullYear();
    const { ctx } = maakCtx({ [`${jaar}_Q1`]: { saldo: 2000 } }, 500);
    const out = ctx.detecteerSuppletieMogelijk_();
    expect(out[0].verschil).toBeCloseTo(-1500, 1);
    expect(out[0].verplicht).toBe(true);
  });

  test('Ronding-noise (<€0,50) wordt genegeerd', () => {
    const jaar = new Date().getFullYear();
    const { ctx } = maakCtx({ [`${jaar}_Q1`]: { saldo: 2000 } }, 2000.30);
    expect(ctx.detecteerSuppletieMogelijk_()).toEqual([]);
  });
});

describe('V3: controleerSuppletieProactief_ — proactief mailen + idempotent', () => {
  function maakProactiveCtx(opts) {
    const propsStore = Object.assign({ 'BTW_SNAPSHOTS': JSON.stringify(opts.snapshots || {}) },
      opts.extraProps || {});
    const props = {
      _store: propsStore,
      getProperty(k) { return k in this._store ? this._store[k] : null; },
      setProperty(k, v) { this._store[k] = v; },
      deleteProperty(k) { delete this._store[k]; },
    };
    const mailCalls = [];
    const auditCalls = [];
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Fiscaal.gs'], {
      PropertiesService: {
        getScriptProperties: () => props,
        getUserProperties: () => props,
      },
      MailApp: { sendEmail: (to, subj, body) => { mailCalls.push({ to, subj, body }); } },
    });
    ctx.getSpreadsheet_ = () => ({});
    ctx.berekenBtwAangifte_ = () => ({ saldo: opts.huidigSaldo });
    ctx.getInstelling_ = (k) => (opts.instellingen || {})[k] || null;
    ctx.isGeldigEmail_ = (e) => /\S+@\S+\.\S+/.test(String(e || ''));
    ctx.schrijfAuditLog_ = (a, d) => { auditCalls.push({ a, d }); };
    return { ctx, props, mailCalls, auditCalls };
  }

  test('Geen verplichte verschillen → geen mail, geen audit-log', () => {
    const jaar = new Date().getFullYear();
    const { ctx, mailCalls } = maakProactiveCtx({
      snapshots: { [`${jaar}_Q1`]: { saldo: 2000 } },
      huidigSaldo: 2300,  // verschil €300 = <€1.000 → niet verplicht
      instellingen: { 'Email': 'klant@x.nl' },
    });
    ctx.controleerSuppletieProactief_();
    expect(mailCalls.length).toBe(0);
  });

  test('Verplichte suppletie → mail + audit-log, ScriptProperty markeert gemeld', () => {
    const jaar = new Date().getFullYear();
    const { ctx, props, mailCalls, auditCalls } = maakProactiveCtx({
      snapshots: { [`${jaar}_Q1`]: { saldo: 2000 } },
      huidigSaldo: 4000,  // verschil €2.000 = verplicht
      instellingen: { 'Email': 'klant@x.nl' },
    });
    ctx.controleerSuppletieProactief_();
    expect(mailCalls.length).toBe(1);
    expect(mailCalls[0].to).toBe('klant@x.nl');
    expect(mailCalls[0].subj).toMatch(/suppletie/i);
    expect(mailCalls[0].body).toMatch(/Q1/);
    expect(mailCalls[0].body).toMatch(/2\.000|2000/);
    const auditEntry = auditCalls.find(c => /Suppletie/i.test(c.a));
    expect(auditEntry).toBeTruthy();
    // Idempotency-marker geschreven
    expect(props.getProperty(`SUPPLETIE_GEMELD_${jaar}_Q1`)).toBeTruthy();
  });

  test('Tweede aanroep binnen 90 dagen → geen tweede mail (idempotent)', () => {
    const jaar = new Date().getFullYear();
    const { ctx, mailCalls } = maakProactiveCtx({
      snapshots: { [`${jaar}_Q1`]: { saldo: 2000 } },
      huidigSaldo: 4000,
      instellingen: { 'Email': 'klant@x.nl' },
    });
    ctx.controleerSuppletieProactief_();
    ctx.controleerSuppletieProactief_();  // direct daarna
    expect(mailCalls.length).toBe(1);  // niet 2
  });

  test('Aanroep na 91 dagen → mail opnieuw (herinnering nog niet ingediend)', () => {
    const jaar = new Date().getFullYear();
    const oudTs = String(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const { ctx, mailCalls } = maakProactiveCtx({
      snapshots: { [`${jaar}_Q1`]: { saldo: 2000 } },
      huidigSaldo: 4000,
      instellingen: { 'Email': 'klant@x.nl' },
      extraProps: { [`SUPPLETIE_GEMELD_${jaar}_Q1`]: oudTs },
    });
    ctx.controleerSuppletieProactief_();
    expect(mailCalls.length).toBe(1);
  });

  test('Geen Email-instelling → audit-log wel, mail niet', () => {
    const jaar = new Date().getFullYear();
    const { ctx, mailCalls, auditCalls } = maakProactiveCtx({
      snapshots: { [`${jaar}_Q1`]: { saldo: 2000 } },
      huidigSaldo: 4000,
      instellingen: {},  // geen email
    });
    ctx.controleerSuppletieProactief_();
    expect(mailCalls.length).toBe(0);
    expect(auditCalls.some(c => /Suppletie/i.test(c.a))).toBe(true);
  });

  test('Email is ongeldig → mail niet, audit-log wel', () => {
    const jaar = new Date().getFullYear();
    const { ctx, mailCalls, auditCalls } = maakProactiveCtx({
      snapshots: { [`${jaar}_Q1`]: { saldo: 2000 } },
      huidigSaldo: 4000,
      instellingen: { 'Email': 'niet-een-email' },
    });
    ctx.controleerSuppletieProactief_();
    expect(mailCalls.length).toBe(0);
    expect(auditCalls.some(c => /Suppletie/i.test(c.a))).toBe(true);
  });

  test('Idempotency-marker wordt VÓÓR mail-poging geschreven (geen mail-storm bij retry)', () => {
    const jaar = new Date().getFullYear();
    // Simuleer dat MailApp gooit — marker moet alsnog gezet zijn, anders zou
    // een crash-loop dezelfde klant 100×/dag mailen.
    const propsStore = { 'BTW_SNAPSHOTS': JSON.stringify({ [`${jaar}_Q1`]: { saldo: 2000 } }) };
    const props = {
      _store: propsStore,
      getProperty(k) { return k in this._store ? this._store[k] : null; },
      setProperty(k, v) { this._store[k] = v; },
      deleteProperty(k) { delete this._store[k]; },
    };
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Fiscaal.gs'], {
      PropertiesService: {
        getScriptProperties: () => props,
        getUserProperties: () => props,
      },
      MailApp: { sendEmail: () => { throw new Error('mail-quota op'); } },
    });
    ctx.getSpreadsheet_ = () => ({});
    ctx.berekenBtwAangifte_ = () => ({ saldo: 4000 });
    ctx.getInstelling_ = (k) => (k === 'Email' ? 'klant@x.nl' : null);
    ctx.isGeldigEmail_ = () => true;
    ctx.schrijfAuditLog_ = () => {};
    ctx.controleerSuppletieProactief_();
    expect(props.getProperty(`SUPPLETIE_GEMELD_${jaar}_Q1`)).toBeTruthy();
  });
});

describe('V3: dagelijkseTaken roept proactieve suppletie-check aan', () => {
  test('Triggers.gs bevat _runTaak_ aanroep voor suppletieCheck', () => {
    const src = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');
    expect(src).toMatch(/_runTaak_\(['"]suppletieCheck['"]/);
    expect(src).toMatch(/controleerSuppletieProactief_/);
  });
});
