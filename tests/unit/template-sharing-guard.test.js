/**
 * tests/unit/template-sharing-guard.test.js
 *
 * Klant-blocker-klasse: de Master Engine (TEMPLATE_SS_ID) staat op "Beperkt"
 * (Google's default na klonen of na een share-wijziging). De welkomstmail
 * bevat dan een copy-link die de klant een 404 geeft ("Het gewenste bestand
 * bestaat niet"). Dit was Sam's blocker bij de eerste echte €0,01-test.
 *
 * Guard: stuurLicentiemail_ MOET de sharing-state checken vóór hij een
 * link naar de klant bouwt, en bij niet-deelbaar bewust GEEN klant-mail
 * sturen (wel de eigenaar alarmeren + throwen).
 *
 * Test reachability/integratie van de guard, niet de mail-inhoud.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakRuntime(sharingAccess) {
  const klantMails = [];
  const eigenaarMails = [];
  const VAN = 'sam@boekhoudbaar.nl';

  const ACCESS = { ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK',
                   DOMAIN: 'DOMAIN', PRIVATE: 'PRIVATE' };

  const props = {
    TEMPLATE_SS_ID: 'TPL123', BREVO_API_KEY: '', VAN_EMAIL: VAN,
    PRODUCT_NAAM: 'Boekhoudbaar',
  };

  const ctx = createGasRuntime([CODE_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: () => {}, deleteProperty: () => {},
      }),
      getUserProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    },
    DriveApp: {
      Access: ACCESS,
      getFileById: () => ({ getSharingAccess: () => sharingAccess }),
    },
    MailApp: {
      sendEmail: (opt) => {
        // Onderscheid: mail naar VAN_EMAIL = eigenaar-alert; anders klant.
        if (opt && opt.to === VAN) eigenaarMails.push(opt);
        else klantMails.push(opt);
      },
    },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
    Utilities: { formatDate: () => '2026-06-11', getUuid: () => 'uuid' },
    Logger: { log: () => {} },
  });
  return { ctx, klantMails, eigenaarMails, ACCESS };
}

describe('CYCLE 93: stuurLicentiemail_ sharing-guard', () => {
  test('helper _templateIsDeelbaar_ herkent publieke sharing-states', () => {
    const { ctx, ACCESS } = maakRuntime('ANYONE_WITH_LINK');
    expect(ctx._templateIsDeelbaar_('TPL123')).toBe(true);
    // wissel naar ANYONE
    const r2 = maakRuntime(ACCESS.ANYONE);
    expect(r2.ctx._templateIsDeelbaar_('TPL123')).toBe(true);
  });

  test('helper _templateIsDeelbaar_ wijst "Beperkt" (PRIVATE/DOMAIN) af', () => {
    const priv = maakRuntime('PRIVATE');
    expect(priv.ctx._templateIsDeelbaar_('TPL123')).toBe(false);
    const dom = maakRuntime('DOMAIN');
    expect(dom.ctx._templateIsDeelbaar_('TPL123')).toBe(false);
  });

  test('helper fail-closed: lege id → niet deelbaar', () => {
    const { ctx } = maakRuntime('ANYONE_WITH_LINK');
    expect(ctx._templateIsDeelbaar_('')).toBe(false);
  });

  test('niet-deelbaar template → GEEN klant-mail, WEL eigenaar-alert + throw', () => {
    const { ctx, klantMails, eigenaarMails } = maakRuntime('PRIVATE');
    expect(function() {
      ctx.stuurLicentiemail_('Jan', 'jan@klant.nl', 'BKHE-AAAA-BBBB-CCCC');
    }).toThrow(/niet deelbaar/i);
    expect(klantMails.length).toBe(0);            // klant krijgt GEEN kapotte link
    expect(eigenaarMails.length).toBe(1);         // eigenaar wordt gealarmeerd
    expect(eigenaarMails[0].subject).toMatch(/niet deelbaar|Beperkt/i);
  });
});
