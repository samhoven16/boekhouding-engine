/**
 * tests/__helpers__/mocks.js
 *
 * Shared mock-helpers voor GAS-tests. Vóór deze module dupliceerden de
 * cycle-test-files dezelfde ~30 regels sheet-mock en ScriptProperties-
 * store-mock. Met deze helpers krimpt elke test-file met ~50%.
 *
 * Gebruik:
 *   const { maakSheetMock, maakStoreMock } = require('../__helpers__/mocks');
 *   const sheet = maakSheetMock([['Header','Col2'], ['rij1a','rij1b']]);
 *   const store = maakStoreMock({ existing_key: 'value' });
 */

'use strict';

/**
 * Bouwt een GAS Sheet-mock met chained range-API. Alle bekende setters
 * retourneren `this` zodat fluent chaining werkt zonder method-by-method
 * mocking in elke test.
 *
 * @param {Array<Array>} initialData  Data inclusief header-rij. Wordt
 *   in-place gemuteerd door setValue/setValues.
 * @returns {Object} sheet-mock met:
 *   - appendRow(rij): voegt toe + return undefined (zoals echte GAS API)
 *   - getDataRange().getValues(): snapshot van huidige data
 *   - getRange(r, c[, nR, nC]).{setValue,setValues,setNumberFormat,...}: chainable
 *   - getLastRow() / getLastColumn()
 *   - _writes: array met alle setValue/setValues-calls (debugging)
 *   - _data: directe data-array (debugging)
 */
function maakSheetMock(initialData) {
  const data = (initialData && initialData.length) ? initialData.map((r) => r.slice()) : [];
  const writes = [];

  const chainMethods = [
    'setNumberFormat', 'setFontFamily', 'setFontWeight', 'setFontStyle',
    'setBackground', 'setBackgrounds', 'setFontColor', 'setFontColors',
    'setFontSize', 'setHorizontalAlignment', 'setVerticalAlignment',
    'setBorder', 'setWrap', 'merge', 'setNote', 'setNotes',
    'setDataValidation', 'clearContent', 'clearFormat',
  ];

  function makeRange(r, c, nR, nC) {
    const range = {
      setValue: (v) => {
        writes.push({ op: 'setValue', r, c, v });
        while (data.length < r) data.push([]);
        while (data[r - 1].length < c) data[r - 1].push('');
        data[r - 1][c - 1] = v;
        return range;
      },
      setValues: (v) => {
        writes.push({ op: 'setValues', r, c, nR, nC, v });
        for (let i = 0; i < v.length; i++) {
          while (data.length < r + i) data.push([]);
          data[r - 1 + i] = v[i].slice();
        }
        return range;
      },
      getValue: () => (data[r - 1] && data[r - 1][c - 1] != null) ? data[r - 1][c - 1] : '',
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nR || 1); i++) {
          const rowOut = [];
          for (let j = 0; j < (nC || 1); j++) {
            rowOut.push((data[r - 1 + i] && data[r - 1 + i][c - 1 + j] != null)
              ? data[r - 1 + i][c - 1 + j] : '');
          }
          out.push(rowOut);
        }
        return out;
      },
    };
    chainMethods.forEach((m) => { range[m] = () => range; });
    return range;
  }

  return {
    _writes: writes,
    _data: data,
    appendRow: (rij) => { data.push(rij.slice()); },
    getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
    getRange: (r, c, nR, nC) => makeRange(r, c, nR, nC),
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    setColumnWidth: () => {},
    setFrozenRows: () => {},
    setFrozenColumns: () => {},
    clearContents: () => { data.length = 0; },
    insertSheet: undefined,    // override in caller when needed
    hideSheet: () => {},
    showSheet: () => {},
  };
}

/**
 * Bouwt een ScriptProperties-store-mock. Backing is een plain object
 * zodat tests direct kunnen inspecteren / muteren.
 *
 * @param {Object=} initial  Initiële key/value pairs.
 * @returns {Object} store met:
 *   - getKeys(), getProperty(k), setProperty(k,v), setProperties(obj),
 *     deleteProperty(k), deleteAllProperties()
 *   - _data: backing object (debugging + direct mutation in tests)
 */
function maakStoreMock(initial) {
  const data = Object.assign({}, initial || {});
  return {
    _data: data,
    getKeys: () => Object.keys(data),
    getProperty: (k) => (k in data ? data[k] : null),
    setProperty: (k, v) => { data[k] = String(v); },
    setProperties: (obj) => {
      Object.keys(obj || {}).forEach((k) => { data[k] = String(obj[k]); });
    },
    deleteProperty: (k) => { delete data[k]; },
    deleteAllProperties: () => { Object.keys(data).forEach((k) => delete data[k]); },
  };
}

/**
 * Bouwt een PropertiesService-mock met script-, user-, en document-store.
 * Default zijn alle drie aparte stores. Caller kan een gemeenschappelijke
 * store hergebruiken door dezelfde maakStoreMock-instance door te geven.
 *
 * @param {Object=} opts  { script?, user?, document?: maakStoreMock-instanties of initial-obj }
 * @returns {Object} PropertiesService-shaped mock.
 */
function maakPropertiesServiceMock(opts) {
  opts = opts || {};
  function _coerce(x) {
    if (!x) return maakStoreMock();
    if (typeof x.getProperty === 'function') return x;  // al een store-mock
    return maakStoreMock(x);
  }
  const scriptStore   = _coerce(opts.script);
  const userStore     = _coerce(opts.user);
  const documentStore = _coerce(opts.document);
  return {
    getScriptProperties:   () => scriptStore,
    getUserProperties:     () => userStore,
    getDocumentProperties: () => documentStore,
    _stores: { script: scriptStore, user: userStore, document: documentStore },
  };
}

module.exports = {
  maakSheetMock,
  maakStoreMock,
  maakPropertiesServiceMock,
};
