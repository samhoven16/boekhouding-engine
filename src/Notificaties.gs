/**
 * Notificaties.gs
 * Smart proactieve notificaties — vertelt klant precies wat te doen,
 * wanneer, en hoeveel het oplevert in euro's.
 *
 * Klant hoeft niets te weten over fiscaliteit — systeem detecteert
 * automatisch wat relevant is en geeft één concrete actie per tip.
 *
 * Output:
 *   1. Notificaties-tabblad in spreadsheet (gesorteerd op prioriteit)
 *   2. Top-tip via toast bij elke spreadsheet-open
 *   3. Belastingadvies-tab top-banner (al via berekenBelastingvoordeel_)
 */

// ─────────────────────────────────────────────
//  HOOFD-FUNCTIE — verzamel alle proactieve tips
// ─────────────────────────────────────────────

/**
 * Detecteert alle relevante notificaties op basis van:
 *  - Huidige boekhouding (KPI's, openstaande facturen, BTW-saldo)
 *  - Fiscaal profiel (geboortedatum, AOV, R&D, branche)
 *  - Kalender (BTW-deadlines, IB-deadline, jaareinde)
 *
 * @return {Array<{prioriteit, titel, tekst, actie, euros, urgent, deadline}>}
 */
function genereerNotificaties_() {
  const ss = getSpreadsheet_();
  if (!ss) return [];

  const lijst = [];
  const nu = new Date();
  const maand = nu.getMonth() + 1;
  const dag = nu.getDate();

  // OSS / EU B2C-drempel monitor
  try {
    if (typeof ossNotificatie_ === 'function') {
      const oss = ossNotificatie_();
      if (oss) lijst.push(oss);
    }
  } catch (_) {}

  // DGA-salaris monitor (alleen relevant bij BV/NV-klanten)
  try {
    if (typeof dgaSalarisNotificatie_ === 'function') {
      const dga = dgaSalarisNotificatie_();
      if (dga) lijst.push(dga);
    }
  } catch (_) {}
  let kpi, advies, B;
  try { kpi = berekenKpiData_(ss); } catch (_) { kpi = {}; }
  try { advies = berekenBelastingadvies_(ss); } catch (_) { advies = { adviezen: [], aftrekken: [] }; }
  try { B = getBelasting_(); } catch (_) { B = {}; }

  // ── 1. BTW-deadline binnen 14 dagen ───────────────────────────
  const btwDeadlines = [
    { kw: 'Q4 ' + (nu.getFullYear() - 1), datum: new Date(nu.getFullYear(), 0, 31) },
    { kw: 'Q1', datum: new Date(nu.getFullYear(), 3, 30) },
    { kw: 'Q2', datum: new Date(nu.getFullYear(), 6, 31) },
    { kw: 'Q3', datum: new Date(nu.getFullYear(), 9, 31) },
  ];
  btwDeadlines.forEach(function(d) {
    const dagenTot = Math.ceil((d.datum - nu) / 86400000);
    if (dagenTot >= 0 && dagenTot <= 14) {
      lijst.push({
        prioriteit: dagenTot <= 7 ? 100 : 80,
        titel: '⏰ BTW-aangifte ' + d.kw + ': nog ' + dagenTot + ' dag' + (dagenTot === 1 ? '' : 'en'),
        tekst: 'De BTW-aangifte voor ' + d.kw + ' moet uiterlijk ' + formatDatum_(d.datum) + ' worden ingediend.',
        actie: 'Open Boekhouding → BTW → BTW-aangifte ' + d.kw,
        euros: null,
        urgent: dagenTot <= 7,
        deadline: formatDatum_(d.datum),
        bron: 'btw-deadline',
      });
    }
  });

  // ── 2. KOR-grens nadert (laatste €2.000 ruimte) ───────────────
  if (kpi.omzet > 0 && kpi.omzet >= 18000 && kpi.omzet < 20000) {
    const ruimte = 20000 - kpi.omzet;
    lijst.push({
      prioriteit: 70,
      titel: '⚠️ KOR-grens binnen handbereik',
      tekst: 'Je hebt nog ' + formatBedrag_(ruimte) + ' ruimte voor de KOR (€20.000 omzet/jaar). ' +
             'Bij overschrijding moet je BTW gaan rekenen — plan resterende facturen slim.',
      actie: 'Open Boekhouding → BTW → KOR-check',
      euros: null,
      urgent: ruimte < 1000,
      bron: 'kor-grens',
    });
  } else if (kpi.omzet > 20000 && kpi.omzet < 22000) {
    lijst.push({
      prioriteit: 90,
      titel: '🚨 KOR-grens overschreden',
      tekst: 'Je omzet (' + formatBedrag_(kpi.omzet) + ') is over de €20.000 KOR-grens. ' +
             'Meld je af voor de KOR via de Belastingdienst en factureer voortaan met BTW.',
      actie: 'Boekhouding → BTW → KOR-check voor exacte stappen',
      euros: null,
      urgent: true,
      bron: 'kor-overschreden',
    });
  }

  // ── 3. Urencriterium voortgang (november/december) ──────────
  if (maand >= 11) {
    const urenRaw = parseInt(getInstelling_('Gewerkte uren dit jaar') || '0', 10);
    const uren = isFinite(urenRaw) ? urenRaw : 0;
    if (uren > 0 && uren < 1225) {
      const tekort = 1225 - uren;
      lijst.push({
        prioriteit: tekort <= 200 ? 85 : 60,
        titel: '⏱️ Urencriterium: nog ' + tekort + ' uur tot 1.225',
        tekst: 'Je staat op ' + uren + ' uur. Nog ' + tekort + ' uur tot het urencriterium ' +
               'voor zelfstandigenaftrek (€2.470) en startersaftrek. Werk je dat dit jaar nog?',
        actie: 'Update "Gewerkte uren dit jaar" via Instellingen',
        euros: 2470,
        urgent: tekort <= 100 && maand === 12,
        bron: 'urencriterium',
      });
    } else if (uren === 0) {
      lijst.push({
        prioriteit: 60,
        titel: '⏱️ Urenregistratie ontbreekt',
        tekst: 'Voor de zelfstandigenaftrek (€2.470/jaar) is een urenadministratie verplicht ' +
               '(≥ 1.225 uur). Geen registratie = geen aftrek = €914 IB extra.',
        actie: 'Vul "Gewerkte uren dit jaar" in via Instellingen',
        euros: 914,
        urgent: false,
        bron: 'urencriterium-leeg',
      });
    }
  }

  // ── 4. Investeringen voor 31 december (KIA-grens) ─────────────
  if (maand === 12 && B.KIA_MIN) {
    const gbSheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
    if (gbSheet) {
      let inv = 0;
      const data = gbSheet.getDataRange().getValues();
      data.slice(1).forEach(function(r) {
        if (r[0] && String(r[0]).startsWith('02') && parseFloat(r[5]) > 0) inv += parseFloat(r[5]);
      });
      if (inv > 0 && inv < B.KIA_MIN) {
        const tekort = B.KIA_MIN - inv;
        lijst.push({
          prioriteit: 75,
          titel: '🎯 KIA-grens binnen handbereik (' + formatBedrag_(tekort) + ' tekort)',
          tekst: 'Je hebt ' + formatBedrag_(inv) + ' geïnvesteerd. Bij ' + formatBedrag_(B.KIA_MIN) +
                 '+ krijg je 28% extra aftrek (KIA) — dat is ~' +
                 formatBedrag_(tekort * 0.28) + ' belastingvoordeel. Investeer dit jaar nog?',
          actie: 'Boekhouding → Wat-als-rekenmachine om effect te zien',
          euros: tekort * 0.28 * 0.37,
          urgent: dag >= 20,
          bron: 'kia-deadline',
        });
      }
    }
  }

  // ── 5. Niet-benutte aftrekposten uit advies (top 3) ──────────
  const tips = (advies.adviezen || [])
    .filter(function(a) {
      return (a.type === 'TIP' || a.type === 'VOORDEEL') &&
             typeof a.besparing === 'number' && a.besparing > 50;
    })
    .sort(function(a, b) { return b.besparing - a.besparing; })
    .slice(0, 3);
  tips.forEach(function(a, i) {
    lijst.push({
      prioriteit: 40 + (3 - i) * 5,
      titel: a.titel,
      tekst: a.tekst,
      actie: 'Zie Belastingadvies-tab voor stappen',
      euros: a.besparing,
      urgent: false,
      bron: 'aftrek-tip',
    });
  });

  // ── 6. Vervallen openstaande facturen ─────────────────────────
  if (kpi.aantalVervallenFacturen > 0) {
    lijst.push({
      prioriteit: 65,
      titel: '🚨 ' + kpi.aantalVervallenFacturen +
             ' vervallen factu' + (kpi.aantalVervallenFacturen === 1 ? 'ur' : 'ren'),
      tekst: 'Klanten zijn te laat met betalen. Stuur een herinnering om je cashflow op peil te houden.',
      actie: 'Boekhouding → Facturen → Betalingsherinneringen versturen',
      euros: null,
      urgent: kpi.aantalVervallenFacturen >= 3,
      bron: 'vervallen-facturen',
    });
  }

  // ── 7. Profiel onvolledig ─────────────────────────────────────
  const ontbrekend = [];
  if (!getInstelling_('Geboortedatum')) ontbrekend.push('Geboortedatum');
  if (!getInstelling_('Startjaar onderneming')) ontbrekend.push('Startjaar');
  if (!getInstelling_('Bedrijfsactiviteit')) ontbrekend.push('Bedrijfsactiviteit');
  if (ontbrekend.length > 0 && (kpi.omzet > 1000 || kpi.kosten > 1000)) {
    lijst.push({
      prioriteit: 30,
      titel: '📋 Vul je profiel aan voor persoonlijk advies',
      tekst: 'Ontbrekend: ' + ontbrekend.join(', ') + '. Met deze info kunnen we ' +
             'de juiste aftrekposten voor je vinden (kost 1 minuut).',
      actie: 'Boekhouding → Vul je profiel in voor persoonlijk advies',
      euros: null,
      urgent: false,
      bron: 'profiel-onvolledig',
    });
  }

  return lijst.sort(function(a, b) { return b.prioriteit - a.prioriteit; });
}

// ─────────────────────────────────────────────
//  NOTIFICATIES TABBLAD GENEREREN
// ─────────────────────────────────────────────

function toonNotificaties() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName('Notificaties');
  if (!sheet) {
    sheet = ss.insertSheet('Notificaties');
    sheet.setTabColor('#F4B400');
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }

  sheet.getRange(1, 1, 1, 4).merge()
    .setValue('🔔 Wat moet ik nu doen?')
    .setBackground('#0D1B4E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(18).setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 48);

  sheet.getRange(2, 1, 1, 4).merge()
    .setValue('Persoonlijke acties op basis van je boekhouding — ' +
              'gesorteerd op urgentie en euro-impact')
    .setBackground('#F7F9FC').setFontColor('#5F6B7A')
    .setFontSize(11).setHorizontalAlignment('center');
  sheet.setRowHeight(2, 30);

  const notificaties = genereerNotificaties_();
  const totaalImpact = notificaties.reduce(function(s, n) { return s + (n.euros || 0); }, 0);
  const aantalUrgent = notificaties.filter(function(n) { return n.urgent; }).length;

  // Samenvattings-banner met euro-impact
  const samenvattingTekst = notificaties.length === 0
    ? '✅ Alles in orde — geen openstaande acties'
    : (aantalUrgent > 0
        ? '⚠️  ' + aantalUrgent + ' urgent · ' + notificaties.length + ' totaal'
        : '📋 ' + notificaties.length + ' actie' + (notificaties.length === 1 ? '' : 's') + ' open')
      + (totaalImpact > 0 ? '   ·   Totale impact: ' + formatBedrag_(totaalImpact) : '');
  const samenvattingBg = notificaties.length === 0 ? '#E6F7F4'
                       : (aantalUrgent > 0 ? '#FFEBEE' : '#FFF8E1');
  const samenvattingFg = notificaties.length === 0 ? '#1B5E20'
                       : (aantalUrgent > 0 ? '#B71C1C' : '#5A3F00');
  sheet.getRange(3, 1, 1, 4).merge()
    .setValue(samenvattingTekst)
    .setBackground(samenvattingBg).setFontColor(samenvattingFg)
    .setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(3, 38);

  const headers = ['', 'Actie', 'Hoe', 'Voordeel'];
  sheet.getRange(5, 1, 1, 4).setValues([headers])
    .setBackground('#0D1B4E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(11)
    .setVerticalAlignment('middle');
  sheet.setRowHeight(5, 30);
  sheet.setFrozenRows(5);

  if (notificaties.length === 0) {
    sheet.getRange(6, 1, 1, 4).merge()
      .setValue('🎉 Niks dringends. Je boekhouding draait soepel — ga lekker ondernemen!')
      .setBackground('#E6F7F4').setFontColor('#1B5E20')
      .setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    sheet.setRowHeight(6, 48);
  } else {
    let rij = 6;
    notificaties.forEach(function(n) {
      // Kleur-codering: urgent rood, hoge prio oranje, normaal lichtgrijs.
      // Even/oneven banding voor leesbaarheid.
      const evenRij = (rij - 6) % 2 === 0;
      let bg, fg, icon;
      if (n.urgent) {
        bg = evenRij ? '#FFCDD2' : '#FFB3B3'; fg = '#B71C1C'; icon = '🔥';
      } else if (n.prioriteit >= 70) {
        bg = evenRij ? '#FFF8E1' : '#FFECB3'; fg = '#5A3F00'; icon = '⚡';
      } else {
        bg = evenRij ? '#FFFFFF' : '#F7F9FC'; fg = '#1A1A1A'; icon = '📋';
      }
      sheet.getRange(rij, 1).setValue(icon)
        .setBackground(bg).setFontSize(18).setHorizontalAlignment('center')
        .setVerticalAlignment('middle');
      sheet.getRange(rij, 2).setValue(n.titel + '\n' + n.tekst)
        .setBackground(bg).setFontColor(fg).setFontSize(11)
        .setVerticalAlignment('top').setWrap(true);
      sheet.getRange(rij, 2).setRichTextValue(
        SpreadsheetApp.newRichTextValue()
          .setText(n.titel + '\n' + n.tekst)
          .setTextStyle(0, n.titel.length,
            SpreadsheetApp.newTextStyle().setBold(true).setFontSize(12).setForegroundColor(fg).build())
          .setTextStyle(n.titel.length + 1, (n.titel + '\n' + n.tekst).length,
            SpreadsheetApp.newTextStyle().setBold(false).setFontSize(11).setForegroundColor(fg).build())
          .build()
      );
      sheet.getRange(rij, 3).setValue(n.actie)
        .setBackground(bg).setFontColor(fg).setFontSize(10).setFontStyle('italic')
        .setVerticalAlignment('top').setWrap(true);
      sheet.getRange(rij, 4).setValue(n.euros ? formatBedrag_(n.euros) : '—')
        .setBackground(bg).setFontColor(n.euros ? '#1B5E20' : '#9CA3B0')
        .setFontWeight('bold').setFontSize(13).setHorizontalAlignment('right')
        .setVerticalAlignment('middle');
      sheet.setRowHeight(rij, Math.min(110, 56 + Math.floor((n.titel.length + n.tekst.length) / 50) * 14));
      rij++;
    });
  }

  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 460);
  sheet.setColumnWidth(3, 280);
  sheet.setColumnWidth(4, 130);
  sheet.hideGridlines();
  ss.setActiveSheet(sheet);
}
