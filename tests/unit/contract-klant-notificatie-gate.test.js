/**
 * tests/unit/contract-klant-notificatie-gate.test.js
 *
 * CONTRACT-GUARD (bug-klasse 4 — klant-mail zonder opt-out-gate). De klant
 * (ZZP'er) klaagde: "ik wil niet dat ik elke dag random mails krijg." Er is een
 * master-schakelaar `emailNotificatiesAan_()` + een chokepoint
 * `stuurKlantNotificatie_()`. Élke INFORMATIEVE notificatie naar de eigenaar
 * (BTW-deadline, suppletie, KIA, bewaarplicht, hoge-uitgave, weekoverzicht,
 * sheet-grootte) moet via dat chokepoint, zodat "uit" écht alles stopt.
 *
 * Deze guard dwingt twee dingen af:
 *  1. Élke directe `MailApp/GmailApp.sendEmail` is bewust gemarkeerd met
 *     `klant-mail-ok: <reden>` (derde-partij-mail, laag-niveau, of safety/
 *     operationeel) — een NIEUWE ongemarkeerde directe send faalt, en dwingt
 *     de auteur naar het gegate chokepoint (of een expliciete reden).
 *  2. De informatieve owner-notificatie-bestanden bevatten GEEN directe send
 *     meer (ze routen via stuurKlantNotificatie_) — regressie-vangst.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const gs = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
function alleGs() {
  return fs.readdirSync(SRC).filter((f) => f.endsWith('.gs'));
}

const SEND = /(?:MailApp|GmailApp)\.sendEmail\s*\(/;
const MARKER = /klant-mail-ok/;

describe('CONTRACT — klant-mail loopt langs de notificatie-gate (klasse 4)', () => {
  test('élke directe sendEmail is gemarkeerd met `klant-mail-ok: <reden>`', () => {
    const ongemarkeerd = [];
    alleGs().forEach((f) => {
      gs(f).split('\n').forEach((regel, i) => {
        if (SEND.test(regel) && !MARKER.test(regel)) {
          ongemarkeerd.push(`${f}:${i + 1}  ${regel.trim().slice(0, 70)}`);
        }
      });
    });
    // Nieuwe directe send? → route via stuurKlantNotificatie_ (gegate) als het
    // een eigenaar-notificatie is, óf markeer met `klant-mail-ok: <reden>`
    // (derde-partij/laag-niveau/safety). Anders faalt deze test.
    expect(ongemarkeerd).toEqual([]);
  });

  test('informatieve owner-notificaties routen via stuurKlantNotificatie_ (geen directe send)', () => {
    // Deze bestanden bevatten precies één owner-notificatie; die moet gegate zijn.
    // NB: suppletie (Fiscaal) + bewaarplicht (Invariants) zijn COMPLIANCE en
    // gaan BEWUST NIET via de gate (direct via stuurMailMetDlq_) — de toggle-
    // toast belooft dat die blijven werken. Hier alleen de informatieve mails.
    [['BTWReminder.gs', /stuurKlantNotificatie_\(/],
      ['Belastingadvies.gs', /stuurKlantNotificatie_\(/]].forEach(([f, re]) => {
      const src = gs(f);
      expect(src).toMatch(re);
      // én geen ongemarkeerde directe send in die bestanden
      src.split('\n').forEach((regel) => {
        if (SEND.test(regel)) expect(regel).toMatch(MARKER);
      });
    });
  });

  test('het chokepoint en de master-schakelaar bestaan', () => {
    const t = gs('Triggers.gs');
    expect(t).toMatch(/function stuurKlantNotificatie_\(/);
    expect(t).toMatch(/function emailNotificatiesAan_\(/);
    expect(t).toMatch(/if \(!emailNotificatiesAan_\(\)\) return false;/); // gate zit IN het chokepoint
  });

  test('compliance-mails (suppletie + bewaarplicht) gaan NIET via de gate', () => {
    // De toggle-toast belooft dat deze blijven werken; ze moeten dus direct via
    // de DLQ-laag, niet via stuurKlantNotificatie_ (die de master-switch checkt).
    const fis = gs('Fiscaal.gs');
    const inv = gs('Invariants.gs');
    expect(fis).toMatch(/stuurMailMetDlq_\([^)]*Suppletie/);
    expect(fis).not.toMatch(/stuurKlantNotificatie_\(/);
    expect(inv).toMatch(/stuurMailMetDlq_\([^)]*[Bb]ewaarplicht/);
    expect(inv).not.toMatch(/stuurKlantNotificatie_\(/);
    // én de toast belooft het ook letterlijk
    expect(gs('Triggers.gs')).toMatch(/compliance-seintjes \(suppletie, bewaarplicht\)/);
  });
});
