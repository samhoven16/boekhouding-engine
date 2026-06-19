/**
 * tests/unit/vluchtige-keys-chokepoint.test.js
 *
 * RATEL voor de bug-klasse-3-chokepoint (Utils.gs): vluchtige ScriptProperty-
 * keys met TTL. Bewijst dat set→lees werkt, dat verlopen keys lazy (bij lezen)
 * én eager (via de sweep) verdwijnen, en dat de sweep niet-vluchtige keys met
 * rust laat. Dit is wat de 500KB-cliff structureel onmogelijk maakt.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function runtime(initieel) {
  const store = Object.assign({}, initieel || {});
  const props = {
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: (k) => { delete store[k]; },
    getProperties: () => Object.assign({}, store),
  };
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs'], {
    PropertiesService: { getScriptProperties: () => props, getUserProperties: () => props },
  });
  return { ctx, store };
}

describe('klasse 3 — vluchtige-key chokepoint', () => {
  test('zet → lees geeft de waarde terug binnen TTL', () => {
    const { ctx } = runtime();
    ctx.zetVluchtigeKey_('SUPPLETIE_GEMELD_', '2026Q1', 12345, 90);
    expect(ctx.leesVluchtigeKey_('SUPPLETIE_GEMELD_', '2026Q1')).toBe(12345);
  });

  test('verlopen key: lees geeft null ÉN verwijdert de key (lazy expiry)', () => {
    const { ctx, store } = runtime();
    ctx.zetVluchtigeKey_('SUPPLETIE_GEMELD_', 'oud', 1, -1);  // ttl -1 dag = al verlopen
    expect(ctx.leesVluchtigeKey_('SUPPLETIE_GEMELD_', 'oud')).toBeNull();
    expect('SUPPLETIE_GEMELD_oud' in store).toBe(false);
  });

  test('sweep verwijdert alleen verlopen vluchtige keys; laat de rest staan', () => {
    const { ctx, store } = runtime();
    ctx.zetVluchtigeKey_('SUPPLETIE_GEMELD_', 'oud', 1, -1);   // verlopen
    ctx.zetVluchtigeKey_('SUPPLETIE_GEMELD_', 'vers', 1, 90);  // vers
    store['herinneringsStap_F1'] = '2';   // andere prefix — niet-vluchtig
    store['willekeurig'] = 'x';
    const n = ctx.ruimVluchtigeKeysOp_();
    expect(n).toBe(1);
    expect('SUPPLETIE_GEMELD_oud' in store).toBe(false);
    expect('SUPPLETIE_GEMELD_vers' in store).toBe(true);
    expect('herinneringsStap_F1' in store).toBe(true);
    expect('willekeurig' in store).toBe(true);
  });

  test('wis verwijdert expliciet', () => {
    const { ctx } = runtime();
    ctx.zetVluchtigeKey_('SUPPLETIE_GEMELD_', 'Y', 1, 90);
    ctx.wisVluchtigeKey_('SUPPLETIE_GEMELD_', 'Y');
    expect(ctx.leesVluchtigeKey_('SUPPLETIE_GEMELD_', 'Y')).toBeNull();
  });

  test('corrupte/oude waarde (geen exp) → lees geeft veilig null', () => {
    const { ctx, store } = runtime({ 'SUPPLETIE_GEMELD_legacy': 'kapot-geen-json' });
    expect(ctx.leesVluchtigeKey_('SUPPLETIE_GEMELD_', 'legacy')).toBeNull();
    expect(ctx.ruimVluchtigeKeysOp_()).toBe(0);  // corrupt ≠ verlopen → niet geteld
  });
});
