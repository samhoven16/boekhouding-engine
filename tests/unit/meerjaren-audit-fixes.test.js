/**
 * Meerjaren-audit 2026-06-10 — regressietests voor de fixes die deze
 * ronde direct gepatched zijn.
 *
 * Zie .claude/meerjaren-audit-2026-06-10.md voor de bevindingen.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const lees = (f) => fs.readFileSync(path.resolve(__dirname, '../../', f), 'utf8');

describe('Boekingen.gs — herberekeningGrootboekSaldi: O(N×M) timeout-bug', () => {
  const src = lees('src/Boekingen.gs');
  const blok = src.slice(
    src.indexOf('function herberekeningGrootboekSaldi'),
    src.indexOf('function exporteerGrootboekkaart'));

  test('roept updateGrootboekSaldo_ NIET meer aan in de loop (O(N×M) → O(N))', () => {
    expect(blok).not.toMatch(/updateGrootboekSaldo_\(/);
  });

  test('aggregeert in-memory en doet één batch-write op de GB-tab', () => {
    expect(blok).toMatch(/new Map\(\)/);
    expect(blok).toMatch(/setValues\(saldoKolom\)/);
  });

  test('houdt LockService.waitLock zodat we niet midden in een boeking herberekenen', () => {
    expect(blok).toMatch(/LockService\.getScriptLock/);
    expect(blok).toMatch(/waitLock\(/);
  });

  test('respecteert grootboek-type bij teken (Actief/Kosten vs Passief/Opbrengsten)', () => {
    expect(blok).toMatch(/Actief.*Kosten|Kosten.*Actief/);
    expect(blok).toMatch(/===\s*'debet'|\?\s*1\s*:|kant\s*===\s*'debet'/);
  });

  test('rapporteert onbekende rekeningen ipv stil overslaan', () => {
    expect(blok).toMatch(/onbekendeRekeningen/);
    expect(blok).toMatch(/schrijfAuditLog_\('Saldi herberekend'/);
  });
});

describe('licence-server — drip-keys cleanup (2028-quotum-tijdbom)', () => {
  const src = lees('licence-server/Code.gs');
  const blok = src.slice(
    src.indexOf('function verstuurDripsDagelijks_'),
    src.indexOf('function verstuurDripsDagelijks_') + 4000);

  test('verstuurDripsDagelijks_ ruimt drip_*-keys op voor afgeronde klanten', () => {
    expect(blok).toMatch(/Drip-cleanup/);
    expect(blok).toMatch(/_verwijderDripKeys_/);
    expect(blok).toMatch(/DRIP_SCHEDULE\.reduce/);
  });

  test('cleanup-drempel is "laatste drip + 14 dagen" (geen hardcoded magic number)', () => {
    expect(blok).toMatch(/cleanupOuderDanDagen\s*=\s*laatsteDripDag\s*\+\s*14/);
  });
});

describe('Utils.gs — versie-info liegt niet meer', () => {
  const src = lees('src/Utils.gs');
  const blok = src.slice(
    src.indexOf('function getVersieInfo'),
    src.indexOf('function getVersieInfo') + 600);

  test('geen hardcoded "2.0.0"-string meer (Diagnostiek toonde dit terwijl HUIDIGE_VERSIE >2)', () => {
    expect(blok).not.toMatch(/versie:\s*'2\.0\.0'/);
  });

  test('leest HUIDIGE_VERSIE runtime', () => {
    expect(blok).toMatch(/HUIDIGE_VERSIE/);
  });

  test('aangemaakt-jaar is dynamisch (new Date().getFullYear())', () => {
    expect(blok).toMatch(/new Date\(\)\.getFullYear\(\)/);
  });
});

describe('Engagement.gs — jaaroverzicht-knop off-by-one', () => {
  const src = lees('src/Engagement.gs');

  test('huidigJaar = vorigJaar + 1 (knop "Door naar X" toont nooit meer het terugkijk-jaar)', () => {
    const idx = src.indexOf('function toonJaaroverzicht');
    expect(idx).toBeGreaterThan(-1);
    const blok = src.slice(idx, idx + 800);
    expect(blok).toMatch(/const huidigJaar = vorigJaar \+ 1/);
  });
});

describe('Fiscaal.gs — toonStakingsWizard is geen "voor nu"-stub meer', () => {
  const src = lees('src/Fiscaal.gs');
  const blok = src.slice(
    src.indexOf('function toonStakingsWizard'),
    src.indexOf('function toonStakingsWizard') + 2200);

  test('geen "voor nu"-bekentenis meer in de gebruikersgerichte code', () => {
    expect(blok).not.toMatch(/Voor nu: documenteer via alert/);
    expect(blok).not.toMatch(/Werkelijke wizard: extend simuleerWatAls_/);
  });

  test('toont een echte checklist met 4 wettelijke punten', () => {
    expect(blok).toMatch(/1\. Stakingsbalans/);
    expect(blok).toMatch(/2\. Stakingsaftrek/);
    expect(blok).toMatch(/3\. FOR/);
    expect(blok).toMatch(/4\. Laatste BTW-aangifte/);
  });

  test('leest STAKINGSAFTREK uit BELASTING-config (niet hardcoded)', () => {
    expect(blok).toMatch(/B\.STAKINGSAFTREK/);
  });
});

describe('FAQ — twee nieuwe jaar-2+ FAQ-items', () => {
  const faq = lees('website/faq/index.html');

  test('fiscaal-partner-vraag (Sam-mail-afvanger)', () => {
    expect(faq).toMatch(/fiscaal partner/i);
    expect(faq).toMatch(/Boekhoudbaar voert de boekhouding van jouw onderneming/);
  });

  test('eenmanszaak-overdracht-vraag (jaar-3+ scenario)', () => {
    expect(faq).toMatch(/overdragen aan mijn opvolger/i);
    expect(faq).toMatch(/Maak eigenaar/);
  });
});
