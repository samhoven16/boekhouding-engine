/**
 * Validaties.gs
 * NL-specifieke invoervalidatie met duidelijke foutmeldingen.
 *
 * KANS: "Systeem beslist" — niet de gebruiker verantwoordelijk voor fouten,
 * maar het systeem dat fouten voorkomt VOORDAT ze gemaakt worden.
 *
 * KANS: "Instant zekerheid" — gebruiker ziet meteen of iets klopt.
 *
 * ADRESSEERT:
 *  - "Users maken fouten" (UX) → guardrails
 *  - "Support vragen" (Product) → zelf-uitleggende validatieberichten
 *  - "Compliance risico" (Wave) → NL-specifieke formatcontroles
 *  - "Angst fouten/BTW" (Sales) → zekerheid door validatie
 */

// ─────────────────────────────────────────────
//  NL BTW-NUMMER VALIDATIE
//  Formaat: NL + 9 cijfers + B + 2 cijfers → NL123456789B01
// ─────────────────────────────────────────────

function valideerBtwNummer_(btwNr) {
  if (!btwNr) return { geldig: false, fout: 'BTW-nummer is leeg.' };

  const schoon = btwNr.replace(/\s/g, '').toUpperCase();

  if (!/^NL\d{9}B\d{2}$/.test(schoon)) {
    return {
      geldig: false,
      fout: `BTW-nummer "${btwNr}" heeft het verkeerde formaat.\n` +
            `Juist formaat: NL + 9 cijfers + B + 2 cijfers\n` +
            `Voorbeeld: NL123456789B01\n\n` +
            `Uw BTW-nummer staat op de correspondentie van de Belastingdienst.`,
    };
  }

  return { geldig: true };
}

// ─────────────────────────────────────────────
//  IBAN VALIDATIE (NL-focus, accepteert ook EU)
//  NL IBAN: NL + 2 check digits + 4 letters bank + 10 digits
// ─────────────────────────────────────────────

function valideerIban_(iban) {
  if (!iban) return { geldig: false, fout: 'IBAN is leeg.' };

  const schoon = iban.replace(/\s/g, '').toUpperCase();

  // Basis format check
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(schoon)) {
    return {
      geldig: false,
      fout: `"${iban}" ziet er niet uit als een geldig IBAN.\n` +
            `Nederlands IBAN voorbeeld: NL91 ABNA 0417 1643 00\n` +
            `Uw IBAN staat op uw bankpas, app of rekeningafschrift.`,
    };
  }

  // MOD-97 check (internationaal IBAN algoritme)
  const herordend = schoon.slice(4) + schoon.slice(0, 4);
  const numeriek  = herordend.split('').map(c => c >= 'A' ? (c.charCodeAt(0) - 55).toString() : c).join('');
  let rest = 0;
  for (const karakter of numeriek) {
    rest = (rest * 10 + parseInt(karakter)) % 97;
  }

  if (rest !== 1) {
    return {
      geldig: false,
      fout: `IBAN "${iban}" heeft een ongeldig controlegetal (rest=${rest}, verwacht 1).\n` +
            `Controleer of u het IBAN correct heeft overgetypt.`,
    };
  }

  return { geldig: true };
}

// ─────────────────────────────────────────────
//  KVK-NUMMER VALIDATIE
//  Formaat: precies 8 cijfers
// ─────────────────────────────────────────────

function valideerKvkNummer_(kvk) {
  if (!kvk) return { geldig: false, fout: 'KvK-nummer is leeg.' };

  const schoon = kvk.replace(/\s/g, '');

  if (!/^\d{8}$/.test(schoon)) {
    return {
      geldig: false,
      fout: `KvK-nummer "${kvk}" moet precies 8 cijfers zijn.\n` +
            `Uw KvK-nummer staat op het uittreksel van de Kamer van Koophandel\n` +
            `of via kvk.nl (zoek op uw bedrijfsnaam).`,
    };
  }

  return { geldig: true };
}

// ─────────────────────────────────────────────
//  EMAIL VALIDATIE
// ─────────────────────────────────────────────

function valideerEmail_(email) {
  if (!email) return { geldig: false, fout: 'E-mailadres is leeg.' };

  const schoon = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(schoon)) {
    return {
      geldig: false,
      fout: `"${email}" is geen geldig e-mailadres.\n` +
            `Voorbeeld: naam@bedrijf.nl`,
    };
  }

  return { geldig: true };
}

// ─────────────────────────────────────────────
//  NL POSTCODE VALIDATIE
//  Formaat: 4 cijfers + spatie + 2 letters (1234 AB)
// ─────────────────────────────────────────────

function valideerPostcode_(postcode) {
  if (!postcode) return { geldig: false, fout: 'Postcode is leeg.' };

  const schoon = postcode.replace(/\s/g, '').toUpperCase();

  if (!/^\d{4}[A-Z]{2}$/.test(schoon)) {
    return {
      geldig: false,
      fout: `Postcode "${postcode}" heeft het verkeerde formaat.\n` +
            `Juist formaat: 4 cijfers + 2 letters (bijv. 1234 AB).`,
    };
  }

  return { geldig: true };
}

// ─────────────────────────────────────────────
//  BEDRAG VALIDATIE
// ─────────────────────────────────────────────

function valideerBedrag_(bedrag, minBedrag, maxBedragWaarschuwing) {
  const b = parseFloat(String(bedrag || '').replace(',', '.'));

  if (isNaN(b)) {
    return { geldig: false, fout: `"${bedrag}" is geen geldig bedrag. Gebruik cijfers, bijv. 1250.50` };
  }

  if (minBedrag !== undefined && b < minBedrag) {
    return { geldig: false, fout: `Bedrag (${formatBedrag_(b)}) is te laag. Minimum: ${formatBedrag_(minBedrag)}` };
  }

  if (maxBedragWaarschuwing !== undefined && b > maxBedragWaarschuwing) {
    // Waarschuwing maar niet blokkeren
    return {
      geldig: true,
      waarschuwing: `Let op: Dit is een hoog bedrag (${formatBedrag_(b)}). Controleer of dit correct is.`,
    };
  }

  return { geldig: true };
}

// ─────────────────────────────────────────────
//  INSTELLINGEN VALIDEREN (bij opslaan)
//  Adresseert: "Users vullen niks in" + "systeem vult zelf"
// ─────────────────────────────────────────────

function valideerEnMeldInstellingen() {
  const ui = SpreadsheetApp.getUi();
  const fouten = [];
  const waarschuwingen = [];

  const btwNr   = getInstelling_('BTW-nummer');
  const kvk     = getInstelling_('KvK-nummer');
  const iban    = getInstelling_('IBAN');
  const email   = getInstelling_('Factuur e-mailadres') || getInstelling_('E-mail');
  const postcode = getInstelling_('Postcode');
  const bedrijf = getInstelling_('Bedrijfsnaam');
  const mode    = getInstelling_('Gebruik') || 'Zakelijk';

  // Bedrijfsnaam is altijd verplicht
  if (!bedrijf) fouten.push('❌ Bedrijfsnaam is niet ingevuld (tabblad Instellingen, rij 2)');

  // BTW-nummer valideren (alleen als niet KOR en zakelijk)
  if (mode !== 'Privé' && btwNr) {
    const r = valideerBtwNummer_(btwNr);
    if (!r.geldig) fouten.push(`❌ BTW-nummer: ${r.fout}`);
    else waarschuwingen.push('✅ BTW-nummer: geldig formaat');
  }

  // KvK valideren
  if (kvk) {
    const r = valideerKvkNummer_(kvk);
    if (!r.geldig) fouten.push(`❌ KvK-nummer: ${r.fout}`);
    else waarschuwingen.push('✅ KvK-nummer: geldig formaat');
  }

  // IBAN valideren
  if (iban) {
    const r = valideerIban_(iban);
    if (!r.geldig) fouten.push(`❌ Bankrekening (IBAN): ${r.fout}`);
    else waarschuwingen.push('✅ IBAN: geldig');
  }

  // Email valideren
  if (email) {
    const r = valideerEmail_(email);
    if (!r.geldig) fouten.push(`❌ E-mailadres: ${r.fout}`);
  }

  // Postcode valideren
  if (postcode) {
    const r = valideerPostcode_(postcode);
    if (!r.geldig) waarschuwingen.push(`⚠️ Postcode: ${r.fout}`);
  }

  if (fouten.length === 0 && waarschuwingen.length === 0) {
    ui.alert('✅ Instellingen in orde', 'Alle gecontroleerde velden zijn correct.', ui.ButtonSet.OK);
    return;
  }

  const alles = [...fouten, '', ...waarschuwingen].join('\n');
  ui.alert(
    fouten.length > 0 ? '⚠️ Instellingen controleren' : '✅ Instellingen gecontroleerd',
    alles || 'Alles in orde.',
    ui.ButtonSet.OK
  );
}
