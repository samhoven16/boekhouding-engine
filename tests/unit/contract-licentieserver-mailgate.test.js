/**
 * tests/unit/contract-licentieserver-mailgate.test.js
 *
 * CONTRACT-GUARD (Noordster Fase 0, B-1; bug-klasse "mail buiten de poort").
 * De bestaande guard (contract-klant-notificatie-gate.test.js) kijkt alleen naar src/.
 * De licentieserver (licence-server/) stuurt ook mail, naar klanten en naar de eigenaar.
 *
 * Regel: elke uitgaande mail (MailApp.sendEmail of een POST naar Brevo smtp/email) heeft
 * binnen de 3 regels erboven een marker `klant-mail-ok[<categorie>]: <reden>`.
 * Categorieen: eigenaar | klant-transactioneel | klant-drip.
 * Een nieuwe ongemarkeerde send faalt, en dwingt de auteur te kiezen wie de ontvanger is.
 * Voor klant-drip geldt extra: de aanroeper controleert de afmelding (dripuit_).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../../licence-server');
const bestanden = fs.readdirSync(DIR).filter((f) => f.endsWith('.gs'));
const SEND = /MailApp\.sendEmail\s*\(|api\.brevo\.com\/v3\/smtp\/email/;
const MARKER = /klant-mail-ok\[(eigenaar|klant-transactioneel|klant-drip)\]:\s*\S/;
// Een regel die alleen tekst bevat (bv. een log- of uitlegregel over MailApp) is geen send.
const isCommentaar = (r) => /^\s*(\/\/|\*|\/\*)/.test(r);

function sends() {
  const uit = [];
  bestanden.forEach((f) => {
    const regels = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n');
    regels.forEach((r, i) => {
      if (SEND.test(r) && !isCommentaar(r) && !/^\s*['"].*['"]\s*[+;]?\s*$/.test(r)) {
        const boven = regels.slice(Math.max(0, i - 3), i).join('\n');
        const m = boven.match(MARKER);
        uit.push({ f, regel: i + 1, tekst: r.trim().slice(0, 70), cat: m ? m[1] : null });
      }
    });
  });
  return uit;
}

describe('CONTRACT — licentieserver-mail is gemarkeerd (B-1)', () => {
  const lijst = sends();

  test('de scan vindt de bekende verzendpunten (anders is de regex stuk)', () => {
    expect(lijst.length).toBeGreaterThanOrEqual(10);
    expect(lijst.some((s) => s.f === 'AdminDashboard.gs')).toBe(true);
  });

  test('elke verzending heeft een marker met categorie en reden', () => {
    const zonder = lijst.filter((s) => !s.cat).map((s) => `${s.f}:${s.regel}  ${s.tekst}`);
    expect(zonder).toEqual([]);
  });

  test('klant-drip: de aanroeper slaat afgemelde adressen over', () => {
    const code = fs.readFileSync(path.join(DIR, 'Code.gs'), 'utf8');
    const roep = code.indexOf('verstuurDripMail_(naam, email, sleutel, drip);');
    const gate = code.indexOf("props.getProperty('dripuit_'");
    expect(roep).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(roep);
  });
});
