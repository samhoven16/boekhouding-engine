/**
 * tests/unit/quota-gate-notificatie-uitstel.test.js
 *
 * Quota-gate op stuurMailMetDlq_ (lage-prio proactieve notificaties).
 *
 * EmailQuotaGuard.mogelijkVerzenden_ was een DODE GATE: gedefinieerd + getest,
 * maar nergens aangeroepen. Daardoor konden lage-prio notificaties (suppletie-
 * tip, BTW-deadline, bewaarplicht) bij bijna-uitgeputte Gmail-quota de laatste
 * slots opmaken die factuur/herinnering (omzet-kritiek) nodig hebben.
 *
 * Fix: stuurMailMetDlq_ — de gedeelde chokepoint van álle lage-prio notificaties
 * — gate't nu op mogelijkVerzenden_('NORMAAL'). Bij KRITIEK/OP gaat de mail
 * direct naar de DLQ (retry zodra de quota morgen reset), zonder een slot te
 * verbruiken. Bij onbereikbare quota-API: graceful doorlaten (geen valse uitstel).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx({ resterend, quotaThrows }) {
  const sent = [];
  const dlq = [];
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'EmailQuotaGuard.gs'], {
    MailApp: {
      getRemainingDailyQuota: () => { if (quotaThrows) throw new Error('quota-API down'); return resterend; },
      sendEmail: (to, subj, body) => { sent.push({ to, subj, body }); },
    },
  });
  ctx.dlqVoegToe_ = (type, payload, fout) => { dlq.push({ type, payload, fout }); };
  return { ctx, sent, dlq };
}

describe('Quota-gate — lage-prio notificaties wijken bij kritieke Gmail-quota', () => {
  test('quota OK (100 over) → notificatie wordt direct verstuurd, geen DLQ', () => {
    const { ctx, sent, dlq } = maakCtx({ resterend: 100 });
    const r = ctx.stuurMailMetDlq_('eigenaar@example.nl', 'BTW-deadline', 'tekst');
    expect(r).toBe(true);
    expect(sent).toHaveLength(1);
    expect(dlq).toHaveLength(0);
  });

  test('quota KRITIEK (3 over) → NIET verstuurd, wel naar DLQ (slot gereserveerd)', () => {
    const { ctx, sent, dlq } = maakCtx({ resterend: 3 });
    const r = ctx.stuurMailMetDlq_('eigenaar@example.nl', 'Suppletie-tip', 'tekst');
    expect(r).toBe(false);
    expect(sent).toHaveLength(0);
    expect(dlq).toHaveLength(1);
    expect(dlq[0].type).toBe('EMAIL_NOTIFICATIE');
    expect(dlq[0].payload.email).toBe('eigenaar@example.nl');
  });

  test('quota OP (0 over) → naar DLQ, geen send', () => {
    const { ctx, sent, dlq } = maakCtx({ resterend: 0 });
    ctx.stuurMailMetDlq_('eigenaar@example.nl', 'Bewaarplicht', 'tekst');
    expect(sent).toHaveLength(0);
    expect(dlq).toHaveLength(1);
  });

  test('quota-API onbereikbaar → graceful doorlaten (geen valse uitstel)', () => {
    const { ctx, sent, dlq } = maakCtx({ quotaThrows: true });
    const r = ctx.stuurMailMetDlq_('eigenaar@example.nl', 'Suppletie-tip', 'tekst');
    expect(r).toBe(true);
    expect(sent).toHaveLength(1);
    expect(dlq).toHaveLength(0);
  });
});
