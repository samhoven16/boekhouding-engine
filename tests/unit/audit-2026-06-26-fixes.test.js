/**
 * tests/unit/audit-2026-06-26-fixes.test.js
 *
 * Ratel-tests voor de geverifieerde BLOCKER/HOOG-bevindingen uit de
 * integrale audit-ronde 2026-06-26:
 *
 *  - [HOOG]    NieuweBoeking drag&drop-IIFE crashte (`dz` null) voor élke klant
 *              ZONDER Gemini-key (de default) → "Technische fout" op het hoofd-
 *              boekingsscherm. Null-guard toegevoegd.
 *  - [BLOCKER] sluitBtwPeriode boekte naar 4130/4140 (verlegde BTW) die NIET in
 *              STANDAARD_GROOTBOEK stonden → REKENING_ONBEKEND-crash midden in de
 *              afsluiting. Rekeningen toegevoegd + ensure-helper voor oude kopieën.
 *  - [HOOG]    MIA-percentage 45,5% bestaat niet (max 45%; Fiscaal.gs gebruikt al
 *              27/36/45). Constante + teksten gecorrigeerd naar "tot 45%".
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const lees = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

describe('Audit 2026-06-26 — dropzone null-crash (NieuweBoeking)', () => {
  const src = lees('NieuweBoeking.gs');
  test('de drag&drop-IIFE heeft een null-guard vóór addEventListener', () => {
    // Anker: getElementById('dropzone') → if (!dz) return → pas dan addEventListener.
    expect(src).toMatch(
      /getElementById\('dropzone'\);\s*\n\s*if\s*\(\s*!dz\s*\)\s*return;[\s\S]*?dz\.addEventListener/);
  });
  test('geen ongeguarde dz.addEventListener direct na de getElementById (regressie)', () => {
    expect(src).not.toMatch(/getElementById\('dropzone'\);\s*\n\s*dz\.addEventListener/);
  });
});

describe('Audit 2026-06-26 — verlegde-BTW-rekeningen 4130/4140', () => {
  test('STANDAARD_GROOTBOEK bevat 4130 én 4140 als Passief/Balans', () => {
    const cfg = lees('Config.gs');
    expect(cfg).toMatch(/code:'4130'[\s\S]{0,120}?type:'Passief'[\s\S]{0,80}?bw:'Balans'/);
    expect(cfg).toMatch(/code:'4140'[\s\S]{0,120}?type:'Passief'[\s\S]{0,80}?bw:'Balans'/);
  });

  test('_zorgGrootboekRekeningBestaat_ voegt een ontbrekende rekening toe (idempotent)', () => {
    const ctx2 = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs']);
    const rijen = [['Code', 'Naam', 'Type', 'Categorie', 'B/W', 'Saldo'],
      ['4100', 'Te betalen BTW', 'Passief', 'Kortlopende schulden', 'Balans', 0]];
    const appended = [];
    const sheet = {
      getDataRange: () => ({ getValues: () => rijen }),
      appendRow: (row) => { appended.push(row); rijen.push(row); },
    };
    const ss = { getSheetByName: () => sheet };
    // 4130 ontbreekt → toegevoegd
    expect(ctx2._zorgGrootboekRekeningBestaat_(ss, '4130')).toBe(true);
    expect(appended).toHaveLength(1);
    expect(String(appended[0][0])).toBe('4130');
    // tweede keer → bestaat al → no-op
    expect(ctx2._zorgGrootboekRekeningBestaat_(ss, '4130')).toBe(false);
    expect(appended).toHaveLength(1);
    // 4100 bestaat al → no-op
    expect(ctx2._zorgGrootboekRekeningBestaat_(ss, '4100')).toBe(false);
  });

  test('sluitBtwPeriode ensure-t 4130/4140 vóór de verlegde boekingen (wiring)', () => {
    const btw = lees('BTW.gs');
    expect(btw).toMatch(/_zorgGrootboekRekeningBestaat_\(ss,\s*'4130'\)/);
    expect(btw).toMatch(/_zorgGrootboekRekeningBestaat_\(ss,\s*'4140'\)/);
    // vóór de eerste verlegde maakJournaalpost_ (debet 4130)
    const idxEnsure = btw.indexOf("_zorgGrootboekRekeningBestaat_(ss, '4130')");
    const idxBoeking = btw.indexOf("debet: '4130'");
    expect(idxEnsure).toBeGreaterThan(-1);
    expect(idxBoeking).toBeGreaterThan(idxEnsure);
  });
});

describe('Audit-LONG-4 — BTW-deadline in weekoverzicht (geen maand-overflow)', () => {
  const t = lees('Triggers.gs');
  const deadline = (jaar, kNum) => new Date(jaar, kNum * 3 + 1, 0);  // de formule die nu in Triggers staat
  test('Q1 → 30 april', () => { const d = deadline(2026, 1); expect(d.getMonth()).toBe(3); expect(d.getDate()).toBe(30); });
  test('Q2 → 31 juli', () => { const d = deadline(2026, 2); expect(d.getMonth()).toBe(6); expect(d.getDate()).toBe(31); });
  test('Q3 → 31 oktober', () => { const d = deadline(2026, 3); expect(d.getMonth()).toBe(9); expect(d.getDate()).toBe(31); });
  test('Q4 → 31 januari volgend jaar', () => { const d = deadline(2026, 4); expect(d.getFullYear()).toBe(2027); expect(d.getMonth()).toBe(0); expect(d.getDate()).toBe(31); });
  test('Triggers gebruikt de overflow-vrije formule (geen setMonth op kwartaal-einde)', () => {
    expect(t).toMatch(/new Date\(nu\.getFullYear\(\), kNum \* 3 \+ 1, 0\)/);
    expect(t).not.toMatch(/deadline\.setMonth\(deadline\.getMonth\(\) \+ 1\)/);
  });
});

describe('Audit-CALC-4 — activeringsgrens (€450) uit centrale config', () => {
  test('de inkoop-investeringssignaal leest B.ACTIVEER_GRENS i.p.v. hardcoded 450', () => {
    expect(lees('Triggers.gs')).toMatch(/getBelasting_\(\)\.ACTIVEER_GRENS/);
  });
});

describe('Audit-CALC-5 — herhalende-kosten dropdown gebruikt ECHTE grootboekrekeningen', () => {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs']);
  const hk = lees('HerhalendeKosten.gs');
  // alle codes uit de dropdown moeten bestaan in STANDAARD_GROOTBOEK, anders
  // gooit maakJournaalpost_ REKENING_ONBEKEND en wordt de kost NOOIT geboekt.
  const opties = [...hk.matchAll(/<option value="(\d{3,4})\s/g)].map((m) => m[1]);
  test('de dropdown bevat opties (sanity)', () => {
    expect(opties.length).toBeGreaterThanOrEqual(8);
  });
  test('ELKE dropdown-grootboekcode bestaat in STANDAARD_GROOTBOEK', () => {
    const onbekend = opties.filter((code) => ctx.zoekGrootboekNaam_(code) === code);
    expect(onbekend).toEqual([]);  // zoekGrootboekNaam_ geeft de code terug als de rekening niet bestaat
  });
  test('geen fantoom 5xxx/6xxx-codes meer (regressie)', () => {
    expect(opties.filter((c) => /^[56]/.test(c))).toEqual([]);
  });
  test('fallback-rekening is 7990 (bestaat), niet 7000-met-verkeerde-naam', () => {
    expect(hk).toMatch(/\|\| '7990'/);
    expect(hk).not.toMatch(/\|\| '7000 Overige kosten'/);
  });
});

describe('Audit-CALC-3 — KOR-grens uit één bron (geen 20000-drift)', () => {
  // De KOR-omzetgrens stond 4× hardcoded (BTW.gs, Notificaties.gs 2×, CustomFunctions.gs).
  // Ze matchten toevallig op 20000 → stille divergentie bij wetswijziging/klant-override.
  // Nu: getBelasting_().KOR_GRENS voor de runtime-paden + de service-vrije const
  // KOR_GRENS_BASIS voor de pure @customfunction.
  test('Belastingadvies.gs definieert KOR_GRENS_BASIS en baseert KOR_GRENS daarop', () => {
    const ba = lees('Belastingadvies.gs');
    expect(ba).toMatch(/const\s+KOR_GRENS_BASIS\s*=\s*20000\s*;/);
    expect(ba).toMatch(/KOR_GRENS:\s*KOR_GRENS_BASIS/);
    expect(ba).not.toMatch(/KOR_GRENS:\s*20000/);  // geen losse magic number meer
  });
  test('BTW.gs en Notificaties.gs lezen getBelasting_().KOR_GRENS (geen hardcoded vergelijking)', () => {
    expect(lees('BTW.gs')).toMatch(/getBelasting_\(\)\.KOR_GRENS/);
    const not = lees('Notificaties.gs');
    expect(not).toMatch(/getBelasting_\(\)\.KOR_GRENS/);
    // De KOR-blokvergelijkingen mogen geen kale 18000/20000 meer bevatten
    expect(not).not.toMatch(/kpi\.omzet\s*>=\s*18000/);
    expect(not).not.toMatch(/kpi\.omzet\s*<\s*20000/);
    expect(not).not.toMatch(/kpi\.omzet\s*>=\s*20000/);
  });
  test('CustomFunctions.KOR_GESCHIKT leest de const, niet een eigen 20000-literal', () => {
    const cf = lees('CustomFunctions.gs');
    // de vergelijking gebruikt `grens` (afgeleid van KOR_GRENS_BASIS), niet `<= 20000`.
    // Dit IS de single-source-proof: revert naar `n <= 20000` → deze test wordt rood.
    expect(cf).toMatch(/var\s+grens\s*=\s*\(typeof\s+KOR_GRENS_BASIS\s*===\s*'number'\)\s*\?\s*KOR_GRENS_BASIS\s*:\s*20000/);
    expect(cf).toMatch(/n\s*<=\s*grens/);
    expect(cf).not.toMatch(/n\s*<=\s*20000/);  // regressie: geen kale literal-vergelijking
  });
  test('KOR_GESCHIKT gedraagt zich correct op de grens (boundary)', () => {
    // NB: const-bindings worden niet als ctx-property geëxporteerd in de vm-harness
    // (zelfde reden als STANDAARD_GROOTBOEK → source-regex), maar de closure van
    // KOR_GESCHIKT ziet KOR_GRENS_BASIS wél in de gedeelde script-scope. De
    // single-source-koppeling zelf is geborgd door de regex-test hierboven.
    const ctx = createGasRuntime(['Belastingadvies.gs', 'CustomFunctions.gs']);
    expect(ctx.KOR_GESCHIKT(19999)).toBe('JA — KOR mogelijk');
    expect(ctx.KOR_GESCHIKT(20000)).toBe('JA — KOR mogelijk');   // exact = nog mogelijk
    expect(ctx.KOR_GESCHIKT(20001)).toBe('NEE — boven drempel');
    expect(ctx.KOR_GESCHIKT('onzin')).toBe('Onbekend');
  });
});

describe('Audit-LONG-2 — jaarwisseling-waarschuwing het hele jaar (niet alleen Q1)', () => {
  const ds = lees('DriveStructuur.gs');
  test('checkJaarwisselingNodig_ stopt NIET meer na maart (maand > 3 guard weg)', () => {
    expect(ds).not.toMatch(/const\s+maand\s*=\s*new Date\(\)\.getMonth\(\)\s*\+\s*1;[\s\S]{0,80}?if\s*\(\s*maand\s*>\s*3\s*\)\s*return;/);
    expect(ds).not.toMatch(/if\s*\(\s*maand\s*>\s*3\s*\)\s*return;/);
  });
  test('de 1×/dag-throttle (jaarwisselingWaarschuwingTs) blijft staan — geen spam', () => {
    expect(ds).toMatch(/jaarwisselingWaarschuwingTs/);
  });
});

describe('Audit 2026-06-26 — A-351 factuur-tab waarschuwt vooraf bij ontbrekende bedrijfsgegevens', () => {
  const nb = lees('NieuweBoeking.gs');
  test('banner wordt berekend uit Bedrijfsnaam + IBAN', () => {
    expect(nb).toMatch(/factuurBedrijfsBanner/);
    expect(nb).toMatch(/getInstelling_\('Bedrijfsnaam'\)/);
    expect(nb).toMatch(/_ibanNB/);
  });
  test('banner staat in het factuur-panel (niet bij kosten/declaratie)', () => {
    expect(nb).toMatch(/id="panel-factuur">\s*\n\s*\$\{factuurBedrijfsBanner\}/);
  });
});

describe('Audit 2026-06-26 — A-357 gids-hub linkt de 4 hoogste-intentie-gidsen', () => {
  const hub = fs.readFileSync(path.resolve(__dirname, '../../website/gids/index.html'), 'utf8');
  ['boekhoudprogramma-zonder-abonnement', 'moneybird-alternatief-2026',
    'e-boekhouden-vs-moneybird-vs-boekhoudbaar', 'exact-online-stoppen-besparing'].forEach((slug) => {
    test('zichtbare kaart-link voor /gids/' + slug, () => {
      expect(hub).toMatch(new RegExp('href="/gids/' + slug + '/" class="gids-kaart"'));
    });
  });
});

describe('Audit 2026-06-26 — A-335 setup-watchdog detecteert ontbrekende triggers', () => {
  const setup = lees('Setup.gs');
  test('watchdog controleert de kritieke trigger-handlers read-only', () => {
    expect(setup).toMatch(/getProjectTriggers\(\)/);
    expect(setup).toMatch(/Achtergrond-taak ontbreekt:/);
    expect(setup).toMatch(/triggerOntbreekt/);
  });
  test('ontbrekende trigger escaleert naar de owner (stil-kapot-preventie)', () => {
    expect(setup).toMatch(/meldFataalAanOwner_\('SETUP_INCOMPLEET'/);
  });
});

describe('Audit 2026-06-26 — copy klopt met de code', () => {
  test('Branding upload-hint adverteert GEEN SVG (de uploader weigert SVG om XSS)', () => {
    const br = lees('Branding.gs');
    // de hint-regel (color:#888) mag geen "SVG" meer beloven
    expect(br).not.toMatch(/color:#888[^<]*SVG/);
    // en de weigering bestaat nog (regressie)
    expect(br).toMatch(/geen SVG/i);
  });
  test('/functies belooft geen niet-bestaande BTW-rubriek 3b', () => {
    const fns = fs.readFileSync(
      path.resolve(__dirname, '../../website/functies/index.html'), 'utf8');
    expect(fns).not.toMatch(/rubriek 1a, 1b, 3b/);
  });
});

describe('Audit 2026-06-26 — MIA-percentage (45,5% bestaat niet)', () => {
  const src = lees('Belastingadvies.gs');
  test('MIA_PCT is 0.45, niet het niet-bestaande 0.455', () => {
    expect(src).toMatch(/MIA_PCT:\s*0\.45\b/);
    expect(src).not.toMatch(/MIA_PCT:\s*0\.455/);
  });
  test('geen "45,5%" meer in de MIA-adviesteksten', () => {
    expect(src).not.toMatch(/45,5%/);
  });
  test('Fiscaal.gs blijft de categorische 27/36/45 gebruiken (corroboratie, regressie)', () => {
    const fis = lees('Fiscaal.gs');
    expect(fis).toMatch(/0\.45/);
    expect(fis).not.toMatch(/0\.455/);
  });
});
