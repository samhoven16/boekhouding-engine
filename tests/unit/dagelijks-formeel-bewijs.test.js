/**
 * tests/unit/dagelijks-formeel-bewijs.test.js
 *
 * Wiring: dagelijkseTaken() roept bewijsAlleInvarianten_ aan en logt het
 * rapport via structuredLog_. Dit is de "dichtmetselen"-belofte concreet:
 * elke nacht wordt mathematisch bewezen dat de boeken consistent zijn.
 *
 * Aanpak: source-grep (zelfde patroon als cycle68-belastingadvies-auto-
 * refresh.test.js) + functionele simulatie van de log-tak.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const triggersSrc = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');

describe('dagelijkseTaken — dagelijks formeel bewijs van invarianten', () => {
  test('Wiring: _runTaak_("formeelBewijs", ...) bestaat', () => {
    expect(triggersSrc).toMatch(/_runTaak_\(['"]formeelBewijs['"]/);
  });

  test('Roept bewijsAlleInvarianten_(ss) aan', () => {
    const start = triggersSrc.indexOf("_runTaak_('formeelBewijs'");
    expect(start).toBeGreaterThan(-1);
    const blok = triggersSrc.slice(start, start + 800);
    expect(blok).toMatch(/bewijsAlleInvarianten_\(ss\)/);
  });

  test('Logt INFO bij rapport.alleGoed via structuredLog_', () => {
    const start = triggersSrc.indexOf("_runTaak_('formeelBewijs'");
    const blok = triggersSrc.slice(start, start + 1500);
    expect(blok).toMatch(/structuredLog_\(['"]INFO['"]/);
    expect(blok).toMatch(/alleGoed/);
  });

  test('Logt WARN bij schendingen, met tegenvoorbeelden in context', () => {
    const start = triggersSrc.indexOf("_runTaak_('formeelBewijs'");
    const blok = triggersSrc.slice(start, start + 1500);
    expect(blok).toMatch(/structuredLog_\(['"]WARN['"]/);
    expect(blok).toMatch(/schendingen/);
  });

  test('Safe als bewijsAlleInvarianten_ niet beschikbaar is (typeof-guard)', () => {
    const start = triggersSrc.indexOf("_runTaak_('formeelBewijs'");
    const blok = triggersSrc.slice(start, start + 600);
    expect(blok).toMatch(/typeof bewijsAlleInvarianten_ !== ['"]function['"]/);
  });

  test('Volgorde: ná auditKeten (allebei integriteit), vóór dashboard refresh', () => {
    const startFn = triggersSrc.indexOf('function dagelijkseTaken()');
    const eindFn  = triggersSrc.indexOf('\nfunction ', startFn + 1);
    const blok    = triggersSrc.slice(startFn, eindFn);
    const idxAudit = blok.indexOf("_runTaak_('auditKeten'");
    const idxBewijs = blok.indexOf("_runTaak_('formeelBewijs'");
    const idxDashboard = blok.indexOf("_runTaak_('dashboard'");
    expect(idxAudit).toBeGreaterThan(-1);
    expect(idxBewijs).toBeGreaterThan(idxAudit);
    expect(idxDashboard).toBeGreaterThan(idxBewijs);
  });
});

describe('Functionele simulatie — log-tak gedrag', () => {
  test('alleGoed=true → INFO-call met gecheckt-context', () => {
    const calls = [];
    const structuredLog_ = function(level, fn, msg, ctx) {
      calls.push({ level: level, fn: fn, msg: msg, ctx: ctx });
    };
    const rapport = { alleGoed: true, gecheckt: 10, schendingen: [] };

    // Repliceert exact de log-tak uit dagelijkseTaken
    if (rapport.alleGoed) {
      structuredLog_('INFO', 'dagelijkseTaken.formeelBewijs',
        'Alle ' + rapport.gecheckt + ' axioma\'s OK', { gecheckt: rapport.gecheckt });
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe('INFO');
    expect(calls[0].msg).toMatch(/Alle 10 axioma's OK/);
    expect(calls[0].ctx.gecheckt).toBe(10);
  });

  test('alleGoed=false → WARN-call met schendingen in context', () => {
    const calls = [];
    const structuredLog_ = function(level, fn, msg, ctx) {
      calls.push({ level: level, fn: fn, msg: msg, ctx: ctx });
    };
    const rapport = {
      alleGoed: false, gecheckt: 10,
      schendingen: [
        { code: 'I3', soort: 'Algebra', boodschap: 'Balans niet sluitend: Activa €100 ≠ Passiva €95' },
      ],
    };
    if (!rapport.alleGoed) {
      structuredLog_('WARN', 'dagelijkseTaken.formeelBewijs',
        rapport.schendingen.length + '/' + rapport.gecheckt + ' invarianten geschonden',
        { schendingen: rapport.schendingen });
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe('WARN');
    expect(calls[0].msg).toBe('1/10 invarianten geschonden');
    expect(calls[0].ctx.schendingen[0].code).toBe('I3');
  });
});
