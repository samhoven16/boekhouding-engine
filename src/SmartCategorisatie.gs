/**
 * SmartCategorisatie.gs
 * Slimme automatische categorisatie van banktransacties en bonnen.
 *
 * Gebaseerd op pijnpunt-analyse vs. concurrenten:
 *  - Expensify: "categorisatie fouten" — wij doen het beter met NL-specifieke regels
 *  - Yuki:      "AI boeking" — wij matchen keywords aan grootboekrekeningen
 *  - Excel:     "handmatig, foutgevoelig" — wij automatiseren de categorisatie
 *  - Hubdoc:    "fouten herkenning" — wij combineren bedrag + tekst + partij
 *
 * HOE HET WERKT:
 *  1. Banktransactie binnenkomt via import of handmatige invoer
 *  2. `suggereerCategorie_()` analyseert omschrijving + tegenpartij + bedrag
 *  3. Geeft een suggestie terug: { rekening, naam, zekerheid }
 *  4. Zekerheid > 80% → automatisch boeken, anders tonen aan gebruiker
 */

// ─────────────────────────────────────────────
//  KEYWORD-REKENING MAPPING (NL-specifiek)
// ─────────────────────────────────────────────

const CATEGORIE_REGELS = [
  // ── Huur & Vastgoed ─────────────────────────
  { keywords: ['huur', 'huurpenning', 'servicekosten woning', 'verhuurder', 'vastgoed'],
    rekening: '5200', naam: 'Huurkosten',       zekerheid: 90 },

  // ── Energie & Nutsvoorzieningen ──────────────
  { keywords: ['vattenfall', 'eneco', 'essent', 'nuon', 'greenchoice', 'energie', 'stroom', 'gas',
               'electra', 'elektriciteit', 'waterleiding', 'evides', 'dunea', 'vitens'],
    rekening: '5300', naam: 'Energie & Water',  zekerheid: 92 },

  // ── Telecom & Internet ───────────────────────
  { keywords: ['kpn', 't-mobile', 'vodafone', 'tele2', 'odido', 'ziggo', 'xs4all', 'telfort',
               'simyo', 'hollandsnieuwe', 'bellen', 'internet abonnement', 'mobiel abonnement',
               'vaste lijn', 'telefoon', 'telecom'],
    rekening: '5400', naam: 'Telefoon & Internet', zekerheid: 90 },

  // ── Verzekeringen ────────────────────────────
  { keywords: ['centraal beheer', 'interpolis', 'aegon', 'nationale nederlanden', 'nn', 'allianz',
               'aon', 'univé', 'achmea', 'cz', 'menzis', 'ohra', 'avéro', 'verzekering',
               'premie', 'polis', 'wia', 'aov'],
    rekening: '5500', naam: 'Verzekeringen',    zekerheid: 88 },

  // ── Brandstof & Auto ────────────────────────
  { keywords: ['shell', 'bp', 'esso', 'total', 'tinq', 'tango', 'texaco', 'argos', 'brandstof',
               'benzine', 'diesel', 'tanken', 'tankstation'],
    rekening: '5600', naam: 'Brandstof',        zekerheid: 92 },

  // ── Lease & Mobiliteit ───────────────────────
  { keywords: ['lease', 'arval', 'athlon', 'louwman', 'mobiliteit', 'ov-chipkaart', 'ns.nl',
               'gvb', 'ret', 'htm', 'connexxion', 'arriva', 'trein', 'bus abonnement'],
    rekening: '5650', naam: 'Mobiliteit & Lease', zekerheid: 85 },

  // ── Kantoorartikelen ─────────────────────────
  { keywords: ['staples', 'office depot', 'bol.com', 'coolblue', 'mediamarkt', 'alternate',
               'printpapier', 'toner', 'inkt', 'printer', 'scanner', 'kantoorbenodigdheden',
               'postzegel', 'postnl', 'dhl pakket'],
    rekening: '5700', naam: 'Kantoorkosten',    zekerheid: 75 },

  // ── Software & Abonnementen ──────────────────
  { keywords: ['microsoft', 'google workspace', 'adobe', 'dropbox', 'slack', 'zoom', 'teams',
               'notion', 'mailchimp', 'hubspot', 'exact', 'moneybird', 'software', 'licentie',
               'abonnement', 'saas', 'cloud', 'subscription', 'spotify', 'netflix'],
    rekening: '5710', naam: 'Software & Abonnementen', zekerheid: 82 },

  // ── Accountant & Advies ──────────────────────
  { keywords: ['accountant', 'boekhouder', 'administratie', 'belastingadviseur', 'notaris',
               'juridisch', 'advocaat', 'consultant', 'advies'],
    rekening: '5800', naam: 'Advies & Accountant', zekerheid: 85 },

  // ── Reclame & Marketing ──────────────────────
  { keywords: ['google ads', 'facebook ads', 'instagram', 'linkedin', 'advertentie', 'reclame',
               'drukkerij', 'flyer', 'website', 'seo', 'marketing', 'branding', 'fotograaf'],
    rekening: '5900', naam: 'Marketing & Reclame', zekerheid: 80 },

  // ── Personeel & Salaris ──────────────────────
  { keywords: ['salaris', 'loon', 'salarisverwerking', 'adp', 'nmbrs', 'loket.nl', 'hr',
               'payroll', 'personeelskosten', 'uurloon', 'freelancer betaling'],
    rekening: '4400', naam: 'Personeelskosten', zekerheid: 88 },

  // ── Belastingen & Heffingen ──────────────────
  { keywords: ['belastingdienst', 'belasting', 'btw', 'omzetbelasting', 'vennootschapsbelasting',
               'inkomstenbelasting', 'gemeentelijke belasting', 'ozb', 'waterschapsheffing'],
    rekening: '6000', naam: 'Belastingen',      zekerheid: 95 },

  // ── Bankkosten ────────────────────────────────
  { keywords: ['abnamro', 'ing ', 'rabobank', 'abn amro', 'sns bank', 'regiobank', 'triodos',
               'bunq', 'knab', 'bankkosten', 'provisie', 'rente', 'servicekosten rekening'],
    rekening: '6100', naam: 'Bankkosten',       zekerheid: 80 },

  // ── Eten & Representatie ─────────────────────
  { keywords: ['restaurant', 'lunch', 'diner', 'eten', 'catering', 'horeca', 'cafe', 'koffie',
               'albert heijn', 'jumbo', 'lidl', 'aldi', 'supermarkt', 'representatie',
               'mcdonalds', 'burger king', 'thuisbezorgd', 'uber eats', 'deliveroo'],
    rekening: '5850', naam: 'Representatie & Eten', zekerheid: 70 },

  // ── Intresten ontvangen ──────────────────────
  { keywords: ['rente ontvangen', 'rentevergoeding', 'rentebijschrijving', 'spaarrente'],
    rekening: '8500', naam: 'Rente-inkomsten',  zekerheid: 90 },

  // ── Omzet inkomsten ──────────────────────────
  { keywords: ['factuur', 'factuurnummer', 'faktura', 'betaling factuur'],
    rekening: '8000', naam: 'Omzet',            zekerheid: 75,
    alleenInkomsten: true },

  // ── Investeringen / Apparatuur ───────────────
  { keywords: ['laptop', 'computer', 'macbook', 'ipad', 'server', 'monitor', 'camera',
               'apparatuur', 'inventaris', 'machine', 'installatie'],
    rekening: '0500', naam: 'Inventaris',       zekerheid: 72 },
];

// ─────────────────────────────────────────────
//  HOOFDFUNCTIE: SUGGEREER CATEGORIE
// ─────────────────────────────────────────────

/**
 * Analyseert een banktransactie en geeft een categoriesuggestie terug.
 *
 * @param {string} omschrijving  - Omschrijving van de transactie
 * @param {string} tegenpartij   - Naam tegenrekening / rekeninghouder
 * @param {number} bedrag        - Bedrag (positief = ontvangst, negatief = betaling)
 * @returns {{ rekening, naam, zekerheid, bron }} of null als geen match
 */
function suggereerCategorie_(omschrijving, tegenpartij, bedrag) {
  const tekst = ((omschrijving || '') + ' ' + (tegenpartij || '')).toLowerCase();
  const isInkomst = (bedrag || 0) > 0;

  let besteMatch = null;
  let hoogsteScore = 0;

  for (const regel of CATEGORIE_REGELS) {
    // Sla omzet-regels over voor betalingen (niet voor inkomsten)
    if (regel.alleenInkomsten && !isInkomst) continue;
    // Sla kosten-regels over voor inkomsten (rekening begint niet met 8)
    if (!regel.alleenInkomsten && isInkomst && !regel.rekening.startsWith('8') && !regel.rekening.startsWith('6')) continue;

    let treffers = 0;
    let trefferGewicht = 0;

    for (const kw of regel.keywords) {
      if (tekst.includes(kw.toLowerCase())) {
        treffers++;
        // Langere keyword = hogere betrouwbaarheid
        trefferGewicht += kw.length;
      }
    }

    if (treffers === 0) continue;

    // Score = basiszekerheid * (gewogen treffers / totaal keywords)
    const score = regel.zekerheid * (trefferGewicht / (regel.keywords.join('').length / 3));
    const gecappedScore = Math.min(99, score);

    if (gecappedScore > hoogsteScore) {
      hoogsteScore = gecappedScore;
      besteMatch = {
        rekening: regel.rekening,
        naam:     regel.naam,
        zekerheid: Math.round(gecappedScore),
        bron:     'keyword',
      };
    }
  }

  return besteMatch;
}

// ─────────────────────────────────────────────
//  BATCH CATEGORISATIE VOOR BANKTRANSACTIES
// ─────────────────────────────────────────────

/**
 * Loopt alle niet-gecategoriseerde banktransacties door en vult
 * automatisch de grootboekrekening in wanneer de zekerheid hoog genoeg is.
 *
 * Drempel: >= 80% → automatisch; 50-79% → markeer als suggestie (geel);
 *          < 50% → niet categoriseren.
 */
function autoCategoriseerTransacties() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  const data = sheet.getDataRange().getValues();

  const DREMPEL_AUTO    = 80;  // Automatisch invullen
  const DREMPEL_SUGGEST = 50;  // Geel markeren als suggestie

  let automatisch = 0;
  let gesuggereerd = 0;
  let nietsGedaan = 0;

  for (let i = 1; i < data.length; i++) {
    const grootboek = String(data[i][9] || '').trim();
    if (grootboek) continue; // Al gecategoriseerd

    const omschrijving = String(data[i][2] || '');
    const tegenpartij  = String(data[i][7] || '');
    const bedrag       = parseFloat(data[i][3]) || 0;

    const suggestie = suggereerCategorie_(omschrijving, tegenpartij, bedrag);
    if (!suggestie) { nietsGedaan++; continue; }

    if (suggestie.zekerheid >= DREMPEL_AUTO) {
      // Automatisch invullen
      sheet.getRange(i + 1, 10).setValue(suggestie.rekening + ' ' + suggestie.naam);
      sheet.getRange(i + 1, 10).setBackground('#E8F5E9');  // Groen: zeker
      sheet.getRange(i + 1, 14).setValue(`Auto (${suggestie.zekerheid}%)`);
      automatisch++;
    } else if (suggestie.zekerheid >= DREMPEL_SUGGEST) {
      // Suggestie markeren (geel), geen automatische boeking
      sheet.getRange(i + 1, 10).setValue('💡 ' + suggestie.rekening + ' ' + suggestie.naam + '?');
      sheet.getRange(i + 1, 10).setBackground('#FFF9C4');  // Geel: suggestie
      gesuggereerd++;
    } else {
      nietsGedaan++;
    }
  }

  const totaal = automatisch + gesuggereerd + nietsGedaan;
  SpreadsheetApp.getUi().alert(
    'Automatisch categoriseren',
    `Resultaat (${totaal} transacties geanalyseerd):\n\n` +
    `✅ Automatisch gecategoriseerd: ${automatisch}\n` +
    `💡 Suggestie toegevoegd (geel): ${gesuggereerd}\n` +
    `⚠ Niet herkend: ${nietsGedaan}\n\n` +
    `Controleer de gele suggesties en keur ze goed of pas ze aan.\n` +
    `Groene regels zijn automatisch ingevuld.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  SLIMME FACTUURKOPPELING (bedrag + referentie)
// ─────────────────────────────────────────────

/**
 * Verbeterde versie van de factuurkoppeling.
 * Matcht banktransacties aan verkoopfacturen op basis van:
 * 1. Exact factuurnummer in omschrijving (hoogste prioriteit)
 * 2. Exact bedrag + klantnaam
 * 3. Bedrag binnen €0.01 tolerantie + datum ±90 dagen
 *
 * Adresseert de pijn van: "betalingen koppelen aan facturen" (Excel, Twinfield)
 */
function slaansFuzzyKoppelTransacties_() {
  const ss = getSpreadsheet_();
  const btSheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);

  const btData = btSheet.getDataRange().getValues();
  const vfData = vfSheet.getDataRange().getValues();

  // Bouw factuur-index op: factuurnummer → rij-index
  const factuurIndex = {};
  for (let i = 1; i < vfData.length; i++) {
    const nr = String(vfData[i][1] || '').toLowerCase();
    factuurIndex[nr] = i;
  }

  let gekoppeld = 0;

  for (let i = 1; i < btData.length; i++) {
    if (btData[i][10]) continue; // Al gekoppeld
    const bedrag     = Math.abs(parseFloat(btData[i][3]) || 0);
    const omschr     = String(btData[i][2] || '').toLowerCase();
    const tegenpartij = String(btData[i][7] || '').toLowerCase();
    const isOntvangst = parseFloat(btData[i][3]) > 0;

    if (!isOntvangst || bedrag < 1) continue; // Alleen inkomende betalingen koppelen

    let gevondenFactuurRij = null;
    let koppelMethode = '';

    // Methode 1: Factuurnummer in omschrijving
    for (const [nr, rijIdx] of Object.entries(factuurIndex)) {
      if (omschr.includes(nr)) {
        gevondenFactuurRij = rijIdx;
        koppelMethode = 'factuurnummer in omschrijving';
        break;
      }
    }

    // Methode 2: Exact bedrag + klantnaam
    if (!gevondenFactuurRij) {
      for (let j = 1; j < vfData.length; j++) {
        const vfBedrag = parseFloat(vfData[j][12]) || 0; // Bedrag incl BTW
        const status   = vfData[j][14];
        if (status === FACTUUR_STATUS.BETAALD) continue;
        if (Math.abs(vfBedrag - bedrag) < 0.005) {
          const klantnaam = String(vfData[j][5] || '').toLowerCase();
          if (tegenpartij.includes(klantnaam.split(' ')[0]) || klantnaam.includes(tegenpartij.split(' ')[0])) {
            gevondenFactuurRij = j;
            koppelMethode = 'bedrag + klantnaam';
            break;
          }
        }
      }
    }

    // Methode 3: Exact bedrag + datum tolerantie ±90 dagen
    if (!gevondenFactuurRij) {
      const btDatum = btData[i][1] ? new Date(btData[i][1]) : null;
      for (let j = 1; j < vfData.length; j++) {
        const vfBedrag = parseFloat(vfData[j][12]) || 0;
        const status   = vfData[j][14];
        if (status === FACTUUR_STATUS.BETAALD) continue;
        if (Math.abs(vfBedrag - bedrag) < 0.005 && btDatum) {
          const vfDatum = vfData[j][2] ? new Date(vfData[j][2]) : null;
          if (vfDatum) {
            const dagenVerschil = Math.abs((btDatum - vfDatum) / (1000 * 60 * 60 * 24));
            if (dagenVerschil <= 90) {
              gevondenFactuurRij = j;
              koppelMethode = 'bedrag + datum';
              break;
            }
          }
        }
      }
    }

    if (gevondenFactuurRij !== null) {
      // Markeer transactie als gekoppeld
      btSheet.getRange(i + 1, 11).setValue(vfData[gevondenFactuurRij][1]); // Factuurnummer
      btSheet.getRange(i + 1, 14).setValue('Auto: ' + koppelMethode);

      // Markeer factuur als betaald
      vfSheet.getRange(gevondenFactuurRij + 1, 15).setValue(FACTUUR_STATUS.BETAALD);
      vfSheet.getRange(gevondenFactuurRij + 1, 14).setValue(bedrag);

      Logger.log(`Gekoppeld via ${koppelMethode}: factuur ${vfData[gevondenFactuurRij][1]}`);
      gekoppeld++;
    }
  }

  return gekoppeld;
}

// ─────────────────────────────────────────────
//  CATEGORIE LEERMODEL: KLANT-EIGEN REGELS
// ─────────────────────────────────────────────

/**
 * Slaat een klant-eigen categorieregel op zodat toekomstige transacties
 * van dezelfde partij automatisch gecategoriseerd worden.
 * Adresseert: "consistent mismatch" bij terugkerende leveranciers.
 */
function leerCategorie_(tegenpartij, rekening, naam) {
  if (!tegenpartij || !rekening) return;

  const props = PropertiesService.getScriptProperties();
  const bestaand = props.getProperty('CATEGORIE_LEERREGELS');
  const regels = bestaand ? JSON.parse(bestaand) : {};

  const sleutel = tegenpartij.toLowerCase().trim().slice(0, 40);
  regels[sleutel] = { rekening, naam, aangeleerd: new Date().toISOString() };

  props.setProperty('CATEGORIE_LEERREGELS', JSON.stringify(regels));
  Logger.log('Categorieregel geleerd: ' + sleutel + ' → ' + rekening);
}

/**
 * Zoekt in de geleerde regels of deze tegenpartij eerder gecategoriseerd is.
 */
function zoekGeleerdeCategorie_(tegenpartij) {
  if (!tegenpartij) return null;

  const props = PropertiesService.getScriptProperties();
  const bestaand = props.getProperty('CATEGORIE_LEERREGELS');
  if (!bestaand) return null;

  const regels = JSON.parse(bestaand);
  const sleutel = tegenpartij.toLowerCase().trim().slice(0, 40);

  // Exact match
  if (regels[sleutel]) return { ...regels[sleutel], zekerheid: 95, bron: 'geleerd' };

  // Gedeeltelijke match
  for (const [k, v] of Object.entries(regels)) {
    if (sleutel.includes(k) || k.includes(sleutel)) {
      return { ...v, zekerheid: 80, bron: 'geleerd (gedeeltelijk)' };
    }
  }

  return null;
}
