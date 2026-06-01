/**
 * tests/unit/cycle63-demo-fidelity.test.js
 *
 * Cycle 63 — demo-pagina afgestemd op het ECHTE product (beta-screenshots)
 * én op de homepage-hero, zodat alle drie de surfaces één verhaal vertellen
 * (Layer-7 "Unified Truth"): zelfde fictieve firma (Studio Veld) + zelfde
 * kerncijfers + zelfde dashboard-structuur (9 KPI's, gezondheid, bespaard,
 * BTW-kwartaaloverzicht, kengetallen).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const demo = fs.readFileSync(path.resolve(__dirname, '../../website/demo/index.html'), 'utf8');

describe('CYCLE 63: demo ↔ product structuur', () => {
  test('Dashboard heeft alle 9 KPI-labels van het echte product', () => {
    ['Omzet (YTD)', 'Kosten (YTD)', 'Nettowinst', 'Winstmarge', 'Banksaldo',
     'Open debiteuren', 'Open crediteuren', 'BTW saldo', 'Verwacht (30d)']
      .forEach((label) => expect(demo).toContain(label));
  });

  test('Gezondheidsscore-balk aanwezig (zoals product)', () => {
    expect(demo).toMatch(/Gezondheid:/);
  });

  test('Bespaard-sectie 3 kolommen', () => {
    ['Al bespaard', 'Nog te benutten', 'Maximale besparing']
      .forEach((l) => expect(demo).toContain(l));
  });

  test('BTW-kwartaaloverzicht met Q1-Q4 + jaartotaal', () => {
    ['Q1 (jan-mrt)', 'Q2 (apr-jun)', 'Q3 (jul-sep)', 'Q4 (okt-dec)', 'Jaar totaal']
      .forEach((k) => expect(demo).toContain(k));
  });

  test('Kengetallen-tabel met de echte rijen', () => {
    ['Current ratio', 'Solvabiliteit', 'Debiteurendagen', 'Cash runway', 'burn rate']
      .forEach((k) => expect(demo).toMatch(new RegExp(k, 'i')));
  });

  test('Toont dat er 15 tabbladen zijn (eerlijk over volledige scope, cycle 66)', () => {
    expect(demo).toMatch(/15 tabbladen/);
    // Beleggingen geschrapt in cycle 66: geen source-managed setup +
    // GOOGLEFINANCE accepteert geen AMS:-prefix. Box-3-vermogen loopt
    // via Privé → Vermogensoverzicht (Prive.gs, wél source-managed).
    expect(demo).not.toContain('Beleggingen');
    ['Cashflow', 'Debiteuren', 'Crediteuren', 'Jaarrekening']
      .forEach((t) => expect(demo).toContain(t));
  });
});

describe('CYCLE 63: demo ↔ homepage-hero consistentie (Unified Truth)', () => {
  const hero = fs.readFileSync(path.resolve(__dirname, '../../website/preview.svg'), 'utf8');

  test('Zelfde fictieve firma: Studio Veld', () => {
    expect(demo).toContain('Studio Veld');
    expect(hero).toContain('Studio Veld');
  });

  test('Zelfde kern-omzet €42.180 op beide surfaces', () => {
    expect(demo).toMatch(/42\.180/);
    expect(hero).toMatch(/42\.180/);
  });

  test('Zelfde BTW-saldo €6.218 op beide surfaces', () => {
    expect(demo).toMatch(/6\.218/);
    expect(hero).toMatch(/6\.218/);
  });

  test('BTW-saldo = verschuldigd − voorbelasting (8.420 − 2.202 = 6.218)', () => {
    expect(demo).toMatch(/8\.420/);
    expect(demo).toMatch(/2\.202/);
    // rekenkundige consistentie
    expect(8420 - 2202).toBe(6218);
  });

  test('Geen oude "Test BV"-data meer (was inconsistent met hero)', () => {
    expect(demo).not.toContain('Test BV');
    expect(demo).not.toMatch(/34\.250/);
  });
});

describe('CYCLE 63: balans blijft kloppen (debet = credit)', () => {
  test('Activa-totaal = Passiva-totaal = €35.935', () => {
    const totalen = demo.match(/€ 35\.935/g) || [];
    expect(totalen.length).toBeGreaterThanOrEqual(2);
  });
});
