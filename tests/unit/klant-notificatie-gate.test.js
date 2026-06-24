/**
 * tests/unit/klant-notificatie-gate.test.js
 *
 * RATEL (bug-klasse 4): stuurKlantNotificatie_ — het chokepoint voor
 * eigenaar-notificaties — moet de master-schakelaar `emailNotificatiesAan_()`
 * respecteren. "Uit" (Instelling 'E-mailnotificaties' = Nee) → NIETS versturen.
 * Dit is wat de klacht "ik wil niet elke dag random mails" structureel oplost:
 * BTW-deadline, suppletie, KIA, bewaarplicht, hoge-uitgave, weekoverzicht en
 * sheet-grootte lopen nu allemaal langs deze ene gate.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function runtime(notifWaarde) {
  const verzonden = [];
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Triggers.gs'], {
    getInstelling_: (k) => (k === 'E-mailnotificaties' ? notifWaarde : ''),
    MailApp: { sendEmail: function () { verzonden.push(Array.prototype.slice.call(arguments)); }, getRemainingDailyQuota: () => 100 },
  });
  return { ctx, verzonden };
}

describe('klasse 4 — stuurKlantNotificatie_ respecteert de master-schakelaar', () => {
  test('notificaties UIT (Nee) → niets verstuurd, returnt false', () => {
    const { ctx, verzonden } = runtime('Nee');
    expect(ctx.stuurKlantNotificatie_('owner@example.nl', 'Onderwerp', 'Body')).toBe(false);
    expect(verzonden.length).toBe(0);
  });

  test('notificaties AAN (Ja) → verstuurd naar de eigenaar', () => {
    const { ctx, verzonden } = runtime('Ja');
    expect(ctx.stuurKlantNotificatie_('owner@example.nl', 'Onderwerp', 'Body')).toBe(true);
    expect(verzonden.length).toBe(1);
    expect(verzonden[0][0]).toBe('owner@example.nl');
  });

  test('default (instelling leeg) → AAN (verstuurt) — opt-out, geen opt-in', () => {
    const { ctx, verzonden } = runtime('');
    ctx.stuurKlantNotificatie_('owner@example.nl', 'O', 'B');
    expect(verzonden.length).toBe(1);
  });
});
