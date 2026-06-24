/**
 * tests/unit/admin-dashboard.test.js
 *
 * Centraal beheer-dashboard (AdminDashboard.gs). SPA met sessie-token + één
 * allowlisted config-schema. Tests dekken: login/sessie, token-gating op alle
 * acties, config-validatie per type, secret-maskering, test-modus, klantacties.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const DASHBOARD_GS = path.resolve(__dirname, '../../licence-server/AdminDashboard.gs');
const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({ ADMIN_WACHTWOORD: 'geheim123' }, opts.props || {});
  const cacheStore = {};
  const auditCalls = [];
  const sheetWrites = [];

  // veiligVergelijk_ + schrijfAuditLog_ + getLicentieSheet_ leven in Code.gs;
  // we bundelen beide files zodat de echte helpers meedraaien.
  const ctx = createGasRuntime([CODE_GS, DASHBOARD_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v) => { cacheStore[k] = v; },
        remove: (k) => { delete cacheStore[k]; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
    },
    Utilities: {
      getUuid: () => 'tok-' + (cacheStore.__c = (cacheStore.__c || 0) + 1),
      computeDigest: () => [1, 2, 3, 4, 5, 6],
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      formatDate: () => '2026-06-11',
    },
    schrijfAuditLog_: (actie, details) => auditCalls.push({ actie, details }),
  });

  // getLicentieSheet_ overschrijven met een mock-sheet
  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({
      getValues: () => ([
        ['Sleutel', 'Naam', 'Email', 'Versie', 'Status', 'Verloopt', 'SsId',
         'Aangemaakt', 'PaymentId', 'LaatsteVal', 'Onboarded', 'Verwijzer'],
        ...(opts.rows || []),
      ]),
    }),
    getRange: (rij, col) => ({ setValue: (v) => sheetWrites.push({ rij, col, v }) }),
  });

  return { ctx, propStore, cacheStore, auditCalls, sheetWrites };
}

// Helper: login en geef geldig token terug
function login(ctx, ww) {
  const r = ctx.adminLogin(ww || 'geheim123');
  return r.token;
}

describe('adminLogin — sessie', () => {
  test('juist wachtwoord: ok + token', () => {
    const { ctx } = maakCtx();
    const r = ctx.adminLogin('geheim123');
    expect(r.ok).toBe(true);
    expect(typeof r.token).toBe('string');
    expect(r.token.length).toBeGreaterThan(0);
  });

  test('onjuist wachtwoord: ok=false, geen token', () => {
    const { ctx } = maakCtx();
    const r = ctx.adminLogin('fout');
    expect(r.ok).toBe(false);
    expect(r.token).toBeUndefined();
  });

  test('wachtwoord met trailing whitespace in property: matcht alsnog', () => {
    const { ctx } = maakCtx({ props: { ADMIN_WACHTWOORD: 'geheim123\n  ' } });
    expect(ctx.adminLogin('geheim123').ok).toBe(true);
  });

  test('brute-force: na 20 pogingen geblokkeerd', () => {
    const { ctx } = maakCtx();
    for (let i = 0; i < 20; i++) ctx.adminLogin('fout');
    const r = ctx.adminLogin('geheim123');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/te veel/i);
  });
});

describe('token-gating: acties zonder geldige sessie worden geweigerd', () => {
  test('adminData zonder token: sessieVerlopen', () => {
    const { ctx } = maakCtx();
    const r = ctx.adminData('niet-bestaand-token');
    expect(r.ok).toBe(false);
    expect(r.sessieVerlopen).toBe(true);
  });

  test('adminZetConfig zonder token: geweigerd, geen write', () => {
    const { ctx, propStore } = maakCtx();
    const r = ctx.adminZetConfig('fout-token', 'PRODUCT_PRIJS', '0.01');
    expect(r.ok).toBe(false);
    expect(propStore.PRODUCT_PRIJS).toBeUndefined();
  });

  test('adminKlantActie zonder token: geweigerd', () => {
    const { ctx } = maakCtx();
    const r = ctx.adminKlantActie('fout', 'x@y.nl', 'intrekken');
    expect(r.ok).toBe(false);
    expect(r.sessieVerlopen).toBe(true);
  });
});

describe('adminData — overzicht + maskering', () => {
  test('geeft kpis, health, schema en gemaskeerde secrets', () => {
    const { ctx } = maakCtx({
      props: { ADMIN_WACHTWOORD: 'geheim123', MOLLIE_API_KEY: 'live_abcd1234XYZ', PRODUCT_PRIJS: '49.00' },
      rows: [
        ['BKHE-AB23-CD45-EF67', 'Jan', 'jan@x.nl', 'Std', 'Actief', '', 'ss1', new Date(), 'tr_1', new Date(), new Date(), ''],
        ['BKHE-GH67-JK89-LM23', 'Piet', 'piet@x.nl', 'Std', 'wacht op TEMPLATE', '', '', new Date(), '', '', '', ''],
      ],
    });
    const token = login(ctx);
    const d = ctx.adminData(token);
    expect(d.ok).toBe(true);
    expect(d.kpis.totaal).toBe(2);
    expect(d.kpis.actief).toBe(1);
    expect(d.kpis.onboarded).toBe(1);
    expect(d.kpis.wachtTemplate).toBe(1);
    expect(d.health.mollie).toBe(true);
    expect(d.health.mollieMode).toBe('live');
    // Secret mag NIET plain teruggestuurd worden
    expect(JSON.stringify(d.config.MOLLIE_API_KEY)).not.toContain('live_abcd1234XYZ');
    expect(d.config.MOLLIE_API_KEY.ingesteld).toBe(true);
    expect(d.config.MOLLIE_API_KEY.masker).toMatch(/••••.*XYZ$/);
  });

  test('testModusAan true wanneer prijs <= 0.01', () => {
    const { ctx } = maakCtx({ props: { ADMIN_WACHTWOORD: 'geheim123', PRODUCT_PRIJS: '0.01' } });
    const d = ctx.adminData(login(ctx));
    expect(d.testModusAan).toBe(true);
  });
});

describe('adminZetConfig — allowlist + validatie per type', () => {
  test('onbekende key: geweigerd', () => {
    const { ctx } = maakCtx();
    const r = ctx.adminZetConfig(login(ctx), 'STIEKEM_KEY', 'x');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/onbekend/i);
  });

  test('prijs buiten bereik: geweigerd', () => {
    const { ctx } = maakCtx();
    const r = ctx.adminZetConfig(login(ctx), 'PRODUCT_PRIJS', '5000');
    expect(r.ok).toBe(false);
  });

  test('prijs geldig: opgeslagen op 2 decimalen', () => {
    const { ctx, propStore } = maakCtx();
    const r = ctx.adminZetConfig(login(ctx), 'PRODUCT_PRIJS', '0,01');
    expect(r.ok).toBe(true);
    expect(propStore.PRODUCT_PRIJS).toBe('0.01');
  });

  test('versie verkeerd formaat: geweigerd', () => {
    const { ctx } = maakCtx();
    expect(ctx.adminZetConfig(login(ctx), 'PRODUCT_VERSIE', 'nieuwste').ok).toBe(false);
    expect(ctx.adminZetConfig(login(ctx), 'PRODUCT_VERSIE', '2.8.0').ok).toBe(true);
  });

  test('json ongeldig: geweigerd', () => {
    const { ctx } = maakCtx();
    expect(ctx.adminZetConfig(login(ctx), 'FEATURE_FLAGS', '{kapot').ok).toBe(false);
    expect(ctx.adminZetConfig(login(ctx), 'FEATURE_FLAGS', '{"auto_apply_update":true}').ok).toBe(true);
  });

  test('url zonder https: geweigerd', () => {
    const { ctx } = maakCtx();
    expect(ctx.adminZetConfig(login(ctx), 'VERSIE_INSTRUCTIES_URL', 'boekhoudbaar.nl').ok).toBe(false);
    expect(ctx.adminZetConfig(login(ctx), 'VERSIE_INSTRUCTIES_URL', 'https://boekhoudbaar.nl/update/').ok).toBe(true);
  });

  test('email zonder @: geweigerd', () => {
    const { ctx } = maakCtx();
    expect(ctx.adminZetConfig(login(ctx), 'SUPPORT_EMAIL', 'geenmail').ok).toBe(false);
    expect(ctx.adminZetConfig(login(ctx), 'SUPPORT_EMAIL', 'help@boekhoudbaar.nl').ok).toBe(true);
  });

  test('keuze buiten opties: geweigerd', () => {
    const { ctx } = maakCtx();
    expect(ctx.adminZetConfig(login(ctx), 'VERSIE_ERNST', 'super-kritiek').ok).toBe(false);
    expect(ctx.adminZetConfig(login(ctx), 'VERSIE_ERNST', 'kritiek').ok).toBe(true);
  });

  test('lege waarde: property wordt verwijderd', () => {
    const { ctx, propStore } = maakCtx({ props: { ADMIN_WACHTWOORD: 'geheim123', GLOBAL_BERICHT: 'oud' } });
    const r = ctx.adminZetConfig(login(ctx), 'GLOBAL_BERICHT', '');
    expect(r.ok).toBe(true);
    expect(propStore.GLOBAL_BERICHT).toBeUndefined();
  });

  test('secret-wijziging audit-logt zonder de waarde te lekken', () => {
    const { ctx, auditCalls } = maakCtx();
    ctx.adminZetConfig(login(ctx), 'MOLLIE_API_KEY', 'live_supergeheim9999');
    const secretAudit = auditCalls.find((c) => /MOLLIE_API_KEY/.test(c.actie));
    expect(secretAudit).toBeDefined();
    expect(JSON.stringify(secretAudit)).not.toContain('live_supergeheim9999');
  });
});

describe('adminZetTestModus', () => {
  test('aan: prijs 0.01 + ref 0', () => {
    const { ctx, propStore } = maakCtx({ props: { ADMIN_WACHTWOORD: 'geheim123', PRODUCT_PRIJS: '49.00' } });
    const r = ctx.adminZetTestModus(login(ctx), true);
    expect(r.ok).toBe(true);
    expect(r.testModusAan).toBe(true);
    expect(propStore.PRODUCT_PRIJS).toBe('0.01');
    expect(propStore.REF_KORTING).toBe('0');
  });

  test('uit: prijs 49.00 + ref verwijderd', () => {
    const { ctx, propStore } = maakCtx({ props: { ADMIN_WACHTWOORD: 'geheim123', PRODUCT_PRIJS: '0.01', REF_KORTING: '0' } });
    const r = ctx.adminZetTestModus(login(ctx), false);
    expect(r.testModusAan).toBe(false);
    expect(propStore.PRODUCT_PRIJS).toBe('49.00');
    expect(propStore.REF_KORTING).toBeUndefined();
  });
});

describe('adminKlantActie', () => {
  const rows = [
    ['BKHB-1', 'Jan', 'jan@x.nl', 'Std', 'Actief', '', 'ss1', new Date(), 'tr_1', new Date(), new Date(), 'ref'],
  ];

  test('intrekken: zet status, geen verwijdering', () => {
    const { ctx, sheetWrites } = maakCtx({ rows: rows });
    const r = ctx.adminKlantActie(login(ctx), 'jan@x.nl', 'intrekken');
    expect(r.ok).toBe(true);
    const statusWrite = sheetWrites.find((w) => w.col === 5);
    expect(statusWrite.v).toMatch(/Ingetrokken/);
  });

  test('verwijderen: pseudonymiseert PII, PaymentId-kolom (9) ongemoeid', () => {
    const { ctx, sheetWrites } = maakCtx({ rows: rows });
    const r = ctx.adminKlantActie(login(ctx), 'jan@x.nl', 'verwijderen');
    expect(r.ok).toBe(true);
    const cols = sheetWrites.map((w) => w.col);
    expect(cols).toContain(2);  // naam
    expect(cols).toContain(3);  // email
    expect(cols).not.toContain(9);  // PaymentId blijft (AWR)
  });

  test('onbekend e-mail: nette fout', () => {
    const { ctx } = maakCtx({ rows: rows });
    const r = ctx.adminKlantActie(login(ctx), 'onbekend@x.nl', 'intrekken');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/geen licentie/i);
  });
});

describe('Source-level: SPA-architectuur', () => {
  const src = fs.readFileSync(DASHBOARD_GS, 'utf8');

  test('geen Cyrillische tekens (heredoc-corruptie-guard)', () => {
    expect(/[Ѐ-ӿ]/.test(src)).toBe(false);
  });

  test('login via google.script.run (geen form-submit → geen sandbox-bug)', () => {
    expect(src).toMatch(/google\.script\.run[\s\S]*\.adminLogin\(ww\)/);
  });

  test('token in sessionStorage (alleen-deze-tab)', () => {
    expect(src).toMatch(/sessionStorage\.setItem\('bhb_admin_token'/);
    expect(src).toMatch(/sessionStorage\.getItem\('bhb_admin_token'/);
  });

  test('Code.gs route ?actie=admin wijst naar het dashboard', () => {
    const code = fs.readFileSync(CODE_GS, 'utf8');
    expect(code).toMatch(/renderAdminDashboard_\(\)/);
  });
});
