/**
 * tests/unit/cycle34-test-helpers.test.js
 *
 * Cycle 34 — verifieert het gedrag van de gedeelde mock-helpers
 * (tests/__helpers__/mocks.js). Deze infrastructuur-verbetering
 * elimineert ~30 regels duplicatie per nieuwe cycle-test.
 */
'use strict';

const { maakSheetMock, maakStoreMock, maakPropertiesServiceMock } = require('../__helpers__/mocks');

describe('CYCLE 34: maakSheetMock', () => {
  test('Bouwt sheet met initial data', () => {
    const s = maakSheetMock([['H1', 'H2'], ['a', 'b']]);
    expect(s.getLastRow()).toBe(2);
    expect(s.getLastColumn()).toBe(2);
    expect(s.getDataRange().getValues()).toEqual([['H1', 'H2'], ['a', 'b']]);
  });

  test('appendRow voegt rij toe', () => {
    const s = maakSheetMock([['H1']]);
    s.appendRow(['x']);
    expect(s.getLastRow()).toBe(2);
    expect(s._data[1]).toEqual(['x']);
  });

  test('getRange.setValue muteert data + logt in _writes', () => {
    const s = maakSheetMock([['H1'], ['a']]);
    s.getRange(2, 1).setValue('Z');
    expect(s._data[1][0]).toBe('Z');
    expect(s._writes).toHaveLength(1);
    expect(s._writes[0]).toEqual({ op: 'setValue', r: 2, c: 1, v: 'Z' });
  });

  test('getRange.setValues muteert blok', () => {
    const s = maakSheetMock([['H1', 'H2'], ['a', 'b']]);
    s.getRange(2, 1, 1, 2).setValues([['X', 'Y']]);
    expect(s._data[1]).toEqual(['X', 'Y']);
  });

  test('Chained range-setters (setNumberFormat etc.) retourneren range', () => {
    const s = maakSheetMock([['H1']]);
    const r = s.getRange(1, 1);
    expect(r.setNumberFormat('€#,##0.00').setFontWeight('bold').setBackground('#fff')).toBe(r);
  });

  test('clearContents leegt data', () => {
    const s = maakSheetMock([['H'], ['x']]);
    s.clearContents();
    expect(s._data).toEqual([]);
  });
});

describe('CYCLE 34: maakStoreMock', () => {
  test('Roundtrip set + get', () => {
    const s = maakStoreMock();
    s.setProperty('foo', 'bar');
    expect(s.getProperty('foo')).toBe('bar');
  });

  test('Initial values', () => {
    const s = maakStoreMock({ a: '1', b: '2' });
    expect(s.getKeys().sort()).toEqual(['a', 'b']);
  });

  test('setProperties bulk-set', () => {
    const s = maakStoreMock();
    s.setProperties({ x: 1, y: 2 });
    expect(s.getProperty('x')).toBe('1');   // gestringificeerd
    expect(s.getProperty('y')).toBe('2');
  });

  test('deleteProperty', () => {
    const s = maakStoreMock({ a: '1' });
    s.deleteProperty('a');
    expect(s.getProperty('a')).toBeNull();
  });

  test('Missing key → null', () => {
    const s = maakStoreMock();
    expect(s.getProperty('missing')).toBeNull();
  });

  test('_data exposes backing object voor direct test-mutation', () => {
    const s = maakStoreMock();
    s._data.injected = 'value';
    expect(s.getProperty('injected')).toBe('value');
  });
});

describe('CYCLE 34: maakPropertiesServiceMock', () => {
  test('Geen opts → drie aparte stores', () => {
    const ps = maakPropertiesServiceMock();
    ps.getScriptProperties().setProperty('a', '1');
    expect(ps.getUserProperties().getProperty('a')).toBeNull();
  });

  test('Initial values per store', () => {
    const ps = maakPropertiesServiceMock({
      script: { k1: 'v1' },
      user: { k2: 'v2' },
    });
    expect(ps.getScriptProperties().getProperty('k1')).toBe('v1');
    expect(ps.getUserProperties().getProperty('k2')).toBe('v2');
  });

  test('Hergebruik bestaande store-mock', () => {
    const shared = maakStoreMock({ shared: 'yes' });
    const ps = maakPropertiesServiceMock({ script: shared });
    expect(ps.getScriptProperties().getProperty('shared')).toBe('yes');
    expect(ps._stores.script).toBe(shared);
  });
});
