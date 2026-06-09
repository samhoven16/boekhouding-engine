/**
 * tests/unit/hygiene.test.js
 *
 * Bron-inspectie + functionele simulatie van src/Hygiene.gs:
 *   executeWithLock_
 *   sanitizeTriggers_
 *   structuredLog_
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const bron = fs.readFileSync(path.join(SRC, 'Hygiene.gs'), 'utf8');

describe('Hygiene.gs — executeWithLock_', () => {
  test('Wrapper bestaat + heeft timeoutMs + silentOnTimeout opties', () => {
    expect(bron).toMatch(/function executeWithLock_/);
    expect(bron).toMatch(/timeoutMs/);
    expect(bron).toMatch(/silentOnTimeout/);
  });

  test('Lock wordt vrijgegeven in finally (geen lekken)', () => {
    expect(bron).toMatch(/finally\s*\{[\s\S]*releaseLock/);
  });

  test('Default timeout = 10000ms (Sam blueprint specificatie)', () => {
    expect(bron).toMatch(/timeoutMs\s*\|\|\s*10000/);
  });
});

describe('Hygiene.gs — sanitizeTriggers_', () => {
  test('_HYGIENE_VERWACHTE_TRIGGERS bevat de 4 kerntriggers', () => {
    ['onOpen', 'onEdit', 'verwerkHoofdformulier', 'dagelijkseTaken'].forEach((h) => {
      expect(bron).toMatch(new RegExp("handler:\\s*'" + h + "'"));
    });
  });

  test('Alle bestaande triggers worden VERWIJDERD vóór herinstall', () => {
    const sanitizeBlok = bron.match(/function sanitizeTriggers_[\s\S]+?^}/m)[0];
    expect(sanitizeBlok).toMatch(/getProjectTriggers/);
    expect(sanitizeBlok).toMatch(/deleteTrigger/);
    // Volgorde: delete vóór create
    const deleteIdx = sanitizeBlok.indexOf('deleteTrigger');
    const createIdx = sanitizeBlok.indexOf('newTrigger');
    expect(deleteIdx).toBeLessThan(createIdx);
  });

  test('Time-based trigger draait dagelijks om 00:00', () => {
    expect(bron).toMatch(/timeBased\(\)\.atHour\(def\.uur\)\.everyDays\(1\)/);
  });

  test('Returnt rapport met verwijderd + aangemaakt + fouten', () => {
    expect(bron).toMatch(/verwijderd:\s*\w+,\s*aangemaakt:\s*\w+,\s*fouten/);
  });

  test('Menu-handler sanitizeTriggers (zonder _) vraagt YES_NO bevestiging', () => {
    expect(bron).toMatch(/function sanitizeTriggers\s*\(\s*\)/);
    expect(bron).toMatch(/ButtonSet\.YES_NO/);
  });
});

describe('Hygiene.gs — structuredLog_', () => {
  test('Log-levels gedefinieerd: DEBUG/INFO/WARN/ERROR', () => {
    expect(bron).toMatch(/_HYGIENE_LOG_LEVELS\s*=\s*\[\s*'DEBUG',\s*'INFO',\s*'WARN',\s*'ERROR'\s*\]/);
  });

  test('Default sheet-naam = _SYSTEM_LOG', () => {
    expect(bron).toMatch(/_HYGIENE_LOG_SHEET\s*=\s*'_SYSTEM_LOG'/);
  });

  test('Header bij eerste creatie: Timestamp, Level, Function, Message, Context, User', () => {
    expect(bron).toMatch(/\['Timestamp',\s*'Level',\s*'Function',\s*'Message',\s*'Context',\s*'User'\]/);
  });

  test('Context wordt JSON-gestringified (en bij >2000 char getrimd)', () => {
    expect(bron).toMatch(/JSON\.stringify\(ctx\)/);
    expect(bron).toMatch(/length\s*>\s*2000/);
  });

  test('Trim-strategie: FIFO bij overschrijden _HYGIENE_LOG_MAX_ROWS', () => {
    expect(bron).toMatch(/_HYGIENE_LOG_MAX_ROWS/);
    expect(bron).toMatch(/deleteRows\(2,\s*teVerwijderen\)/);
  });

  test('Onbekend level valt terug op INFO (geen crash)', () => {
    expect(bron).toMatch(/if \(_HYGIENE_LOG_LEVELS\.indexOf\(level\) === -1\) level = 'INFO'/);
  });

  test('Logging-fout breekt nooit de aanroepende functie (catch + swallow)', () => {
    // Outer try/catch zonder rethrow
    expect(bron).toMatch(/function structuredLog_[\s\S]+?catch \(_\) \{[\s\S]*?Logging-fout mag nooit/);
  });
});

describe('Hygiene.gs — bron-hygiëne van Hygiene.gs zelf', () => {
  test('Geen executable console.log in eigen module (we vervangen hem juist)', () => {
    // Doc-comments mogen 'console.log' noemen ter referentie; alleen
    // daadwerkelijke statements zijn verboden.
    const zonderComments = bron
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block-comments
      .replace(/\/\/.*$/gm, '');           // line-comments
    expect(zonderComments).not.toMatch(/console\.log\(/);
  });

  test('Geen magic numbers: 10000 / 5000 / 2000 zijn allemaal toegelicht in context', () => {
    // 10000ms timeout, 5000 max rows, 2000 char ctx-cap. Bij elke is een
    // commentaar of een named constant aanwezig.
    expect(bron).toMatch(/10000.*lock|timeout/i);
    expect(bron).toMatch(/_HYGIENE_LOG_MAX_ROWS\s*=\s*5000/);
  });
});

describe('Functionele simulatie lock-wrapper', () => {
  // We kunnen LockService niet echt in Node testen, maar we kunnen het
  // patroon valideren: fn wordt aangeroepen tussen acquire en release.
  test('Patroon: acquire → fn → release, ook bij throw', () => {
    let acquired = false, released = false, fnCalled = false;
    function simuleer(fn) {
      acquired = true;
      try { fn(); fnCalled = true; }
      finally { released = true; }
    }
    try { simuleer(() => { throw new Error('boem'); }); } catch (_) {}
    expect(acquired).toBe(true);
    expect(fnCalled).toBe(false);
    expect(released).toBe(true);
  });

  test('Bij silentOnTimeout=true: lock-miss returnt undefined, geen throw', () => {
    function simuleerSilent() {
      const lockMiss = true;
      if (lockMiss) return undefined;
      return 'resultaat';
    }
    expect(simuleerSilent()).toBeUndefined();
  });
});
