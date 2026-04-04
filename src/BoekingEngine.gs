/**
 * BoekingEngine.gs
 * Centrale service-laag voor alle boekingen.
 * Validatie → sanitatie → routering → terugkoppeling.
 * Geen side-effects buiten de spreadsheet. Modulair en testbaar.
 */

// ─── BUSINESS TYPE DEFAULTS ───────────────────
const BUSINESS_TYPES = {
  zzp:       { label: 'ZZP / Freelancer',  btwStandaard: '21% (hoog)', termijn: 30, categorieen: ['Advies & Dienstverlening','Software & Abonnementen','Kantoor & Werkruimte','Auto & Vervoer','Studie & Opleiding'] },
  ecommerce: { label: 'Webshop',           btwStandaard: '21% (hoog)', termijn: 14, categorieen: ['Inkoop / Materialen','Marketing & Reclame','Verzekeringen & Bankkosten','Telecom & Internet','Overige kosten'] },
  saas:      { label: 'SaaS / Software',   btwStandaard: '21% (hoog)', termijn: 30, categorieen: ['Software & Abonnementen','Advies & Dienstverlening','Personeelskosten','Marketing & Reclame','Kantoor & Werkruimte'] },
  mkb:       { label: 'MKB',               btwStandaard: '21% (hoog)', termijn: 30, categorieen: null },
};

// ─── VALIDATIEREGELS ──────────────────────────
const VALIDATIE = {
  factuur: [
    { v: 'klant',  fn: s => String(s||'').trim().length >= 2,  msg: 'Klantnaam is verplicht (min. 2 tekens).' },
    { v: 'datum',  fn: s => /^\d{4}-\d{2}-\d{2}$/.test(s),    msg: 'Voer een geldige datum in (dd-mm-jjjj).' },
    { v: 'r1prijs',fn: n => parseFloat(n||0) > 0,              msg: 'Voer een bedrag in voor regel 1 (groter dan € 0).' },
    { v: 'r1omschr',fn:s => String(s||'').trim().length >= 2,  msg: 'Omschrijving voor regel 1 is verplicht.' },
  ],
  kosten: [
    { v: 'leverancier', fn: s => String(s||'').trim().length >= 2, msg: 'Leveranciernaam is verplicht (min. 2 tekens).' },
    { v: 'datum',       fn: s => /^\d{4}-\d{2}-\d{2}$/.test(s),   msg: 'Voer een geldige datum in.' },
    { v: 'omschr',      fn: s => String(s||'').trim().length >= 3,  msg: 'Omschrijving is verplicht (min. 3 tekens).' },
    { v: 'bedragIncl',  fn: n => parseFloat(n||0) > 0,             msg: 'Voer een bedrag in (groter dan € 0).' },
  ],
  declaratie: [
    { v: 'omschr', fn: s => String(s||'').trim().length >= 3, msg: 'Omschrijving is verplicht (min. 3 tekens).' },
    { v: 'datum',  fn: s => /^\d{4}-\d{2}-\d{2}$/.test(s),   msg: 'Voer een geldige datum in.' },
    { v: 'bedrag', fn: n => parseFloat(n||0) > 0,             msg: 'Voer een bedrag in (groter dan € 0).' },
  ],
};

// ─── SANITATIE ────────────────────────────────
/**
 * Verwijdert gevaarlijke tekens uit een veld.
 * Beschermt tegen XSS en formula-injectie in sheets.
 */
function saniteer_(waarde) {
  if (waarde === null || waarde === undefined) return '';
  let s = String(waarde).trim();
  // Blokkeer spreadsheet-formule-injectie
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Verwijder nul-bytes en control characters
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return s;
}

function saniteerGetal_(waarde) {
  const n = parseFloat(String(waarde || '0').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// ─── VALIDATIE ENGINE ─────────────────────────
/**
 * Valideert boeking-data. Geeft {ok: bool, fouten: [{veld, bericht}]} terug.
 * Wordt zowel client-side (preview) als server-side (definitief) gebruikt.
 */
function valideerBoeking(type, data) {
  const regels = VALIDATIE[type] || [];
  const fouten = [];
  regels.forEach(function(r) {
    const val = data[r.v];
    if (!r.fn(val)) fouten.push({ veld: r.v, bericht: r.msg });
  });
  return { ok: fouten.length === 0, fouten: fouten };
}

// ─── BTW BEREKENING ───────────────────────────
/**
 * Berekent BTW-velden op basis van excl óf incl bedrag.
 * @returns {excl, btw, incl, tarief}
 */
function berekenBtw(tarief, bedragExcl, bedragIncl) {
  const pct = tarief && tarief.includes('21') ? 0.21
            : tarief && tarief.includes('9')  ? 0.09
            : 0;
  const isVrijgesteld = !tarief || tarief.includes('Vrijgesteld') || tarief.includes('Verlegd');
  let excl, btw, incl;
  if (bedragExcl > 0) {
    excl  = Math.round(bedragExcl * 100) / 100;
    btw   = Math.round(excl * pct * 100) / 100;
    incl  = Math.round((excl + btw) * 100) / 100;
  } else if (bedragIncl > 0) {
    incl  = Math.round(bedragIncl * 100) / 100;
    excl  = pct > 0 ? Math.round(incl / (1 + pct) * 100) / 100 : incl;
    btw   = Math.round((incl - excl) * 100) / 100;
  } else {
    excl = btw = incl = 0;
  }
  return { excl: excl, btw: btw, incl: incl, tarief: isVrijgesteld ? null : pct };
}

// ─── CONTEXT VOOR DIALOG ──────────────────────
/**
 * Geeft alle benodigde data voor de dialog terug.
 * Wordt eenmalig geladen bij openen dialog.
 */
function getBoekingContext() {
  const props = PropertiesService.getScriptProperties();
  const bt    = props.getProperty('businessType') || 'zzp';
  const btDef = BUSINESS_TYPES[bt] || BUSINESS_TYPES.zzp;
  const kleur = (typeof getBedrijfsKleur_ === 'function') ? getBedrijfsKleur_() : '#1A237E';

  return {
    btwKeuzes:    BTW_KEUZES,
    categorieen:  KOSTEN_CATEGORIEEN,
    businessType: bt,
    btwStandaard: btDef.btwStandaard,
    termijn:      btDef.termijn,
    bedrijf:      getInstelling_('Bedrijfsnaam') || '',
    kleur:        kleur,
    vandaag:      Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd'),
  };
}

// ─── CENTRALE DISPATCHER ──────────────────────
/**
 * Verwerkt een boeking na validatie.
 * @param {string} type - 'factuur' | 'kosten' | 'declaratie'
 * @param {Object} data - rauwe formulierdata van de dialog
 * @returns {Object} {ok: bool, bericht: string, details: Object}
 */
function verwerkNieuweBoeking(type, data) {
  // 1. Valideer
  const v = valideerBoeking(type, data);
  if (!v.ok) {
    throw new Error(v.fouten.map(function(f) { return f.bericht; }).join('\n'));
  }

  const ss = getSpreadsheet_();

  // 2. Saniteer alle velden
  const s = {};
  Object.keys(data).forEach(function(k) {
    s[k] = typeof data[k] === 'number' ? data[k] : saniteer_(data[k]);
  });

  // 3. Route naar juiste handler
  try {
    if (type === 'factuur')      return _verwerkFactuur_(ss, s);
    if (type === 'kosten')       return _verwerkKosten_(ss, s, data);
    if (type === 'declaratie')   return _verwerkDeclaratie_(ss, s, data);
    throw new Error('Onbekend type: ' + type);
  } catch (e) {
    schrijfAuditLog_('FOUT ' + type, e.message);
    throw e;
  }
}

// ─── FACTUUR HANDLER ──────────────────────────
function _verwerkFactuur_(ss, s) {
  // Bouw data-object in het format dat Triggers.gs verwacht
  const formData = {};
  formData['Klantnaam']                     = s.klant;
  formData['Klant e-mailadres']             = s.email || '';
  formData['Factuurdatum']                  = s.datum;
  formData['Betalingstermijn (dagen)']      = s.termijn || '30';
  formData['BTW tarief']                    = s.btw || '21% (hoog)';
  formData['Korting (in \u20ac)']           = s.korting || '0';
  formData['Notities op factuur']           = s.notities || '';
  formData['Projectcode / Referentie']      = s.referentie || '';
  formData['Factuur direct e-mailen naar klant?'] = s.email ? 'Ja' : 'Nee';
  formData['Factuuradres klant']            = s.klantAdres || '';
  formData['KvK-nummer klant']              = s.kvkKlant || '';
  formData['BTW-nummer klant']              = s.btwNrKlant || '';

  // Regels 1-5
  for (let i = 1; i <= 5; i++) {
    const omschr = s['r' + i + 'omschr'];
    const aantal = s['r' + i + 'aantal'];
    const prijs  = s['r' + i + 'prijs'];
    if (omschr) {
      formData['Regel ' + i + ' \u2013 Omschrijving']                    = omschr;
      formData['Regel ' + i + ' \u2013 Aantal']                          = aantal || '1';
      formData['Regel ' + i + ' \u2013 Prijs per eenheid (excl. BTW)']  = prijs || '0';
    }
  }

  const result = verwerkInkomstenUitHoofdformulier_(ss, formData);
  schrijfAuditLog_('Factuur aangemaakt', 'klant: ' + s.klant);
  const emailVerzonden = !!(result && result.emailVerzonden);
  return {
    ok: true,
    bericht: 'Factuur aangemaakt!' + (emailVerzonden ? ' Verstuurd naar ' + s.email + '.' : ' Geen e-mail (geen adres ingevuld).'),
    factuurnummer: result ? result.factuurnummer : null,
    emailVerzonden,
  };
}

// ─── KOSTEN HANDLER ───────────────────────────
function _verwerkKosten_(ss, s, raw) {
  const bedragIncl = saniteerGetal_(raw.bedragIncl);
  const btwCalc    = berekenBtw(s.btw, 0, bedragIncl);

  // Veldnamen MOETEN overeenkomen met wat verwerkUitgavenUitHoofdformulier_ leest
  const formData = {};
  formData['Leveranciernaam']            = s.leverancier;          // L158: data['Leveranciernaam']
  formData['Factuurdatum uitgave']       = s.datum;                // L160: data['Factuurdatum uitgave']
  formData['Omschrijving uitgave']       = s.omschr;               // L177: data['Omschrijving uitgave']
  formData['Categorie kosten']           = s.categorie || 'Overige kosten'; // L170: data['Categorie kosten']
  formData['Bedrag excl. BTW']           = btwCalc.excl;           // L161: data['Bedrag excl. BTW']
  formData['BTW tarief uitgave']         = s.btw || '21% (hoog)';  // L162: data['BTW tarief uitgave']
  formData['BTW bedrag uitgave']         = btwCalc.btw;            // L163: data['BTW bedrag uitgave']
  formData['Factuurnummer leverancier']  = s.factuurnrLev || '';   // L175: data['Factuurnummer leverancier']

  verwerkUitgavenUitHoofdformulier_(ss, formData);

  // Bon opslaan indien meegestuurd
  let bonUrl = null;
  if (raw.bonBase64) {
    bonUrl = _slaBonoOp_(raw.bonBase64, raw.bonMime, s.datum + '_' + s.leverancier);
  }
  schrijfAuditLog_('Kosten geboekt', s.leverancier + ' ' + bedragIncl);
  const bonBericht_k = bonUrl ? ' Bon opgeslagen in Drive.'
                     : raw.bonBase64 ? ' Let op: bon kon niet worden opgeslagen in Drive.' : '';
  return {
    ok: true,
    bericht: 'Kosten geboekt (\u20ac\u00a0' + bedragIncl.toFixed(2).replace('.', ',') + ').' + bonBericht_k,
    bonUrl: bonUrl,
  };
}

// ─── DECLARATIE HANDLER ───────────────────────
function _verwerkDeclaratie_(ss, s, raw) {
  const bedrag = saniteerGetal_(raw.bedrag);

  // Veldnamen MOETEN overeenkomen met wat verwerkDeclaratieUitHoofdformulier_ leest
  const formData = {};
  formData['Omschrijving declaratie']      = s.omschr;             // L225: data['Omschrijving declaratie']
  formData['Datum declaratie']             = s.datum;              // L213: data['Datum declaratie']
  formData['Bedrag excl. BTW declaratie']  = bedrag;               // L214: data['Bedrag excl. BTW declaratie']
  formData['BTW tarief declaratie']        = s.btw || '0% (nultarief)';          // L215: data['BTW tarief declaratie']
  formData['Categorie declaratie']         = s.categorie || 'Overige kosten';   // L218: data['Categorie declaratie']
  formData['Betaald door (naam)']          = s.betaaldDoor || getInstelling_('Bedrijfsnaam') || ''; // L219

  verwerkDeclaratieUitHoofdformulier_(ss, formData);

  let bonUrl = null;
  if (raw.bonBase64) {
    bonUrl = _slaBonoOp_(raw.bonBase64, raw.bonMime, s.datum + '_declaratie');
  }
  schrijfAuditLog_('Declaratie ingediend', s.omschr + ' ' + bedrag);
  const bonBericht_d = bonUrl ? ' Bon opgeslagen in Drive.'
                     : raw.bonBase64 ? ' Let op: bon kon niet worden opgeslagen in Drive.' : '';
  return {
    ok: true,
    bericht: 'Declaratie ingediend (\u20ac\u00a0' + bedrag.toFixed(2).replace('.', ',') + ').' + bonBericht_d,
    bonUrl: bonUrl,
  };
}

// ─── BON OPSLAAN ─────────────────────────────
function _slaBonoOp_(base64Data, mimeType, naam) {
  try {
    const decoded = Utilities.base64Decode(base64Data);
    const mime    = mimeType || 'image/jpeg';
    const ext     = mime.includes('pdf') ? 'pdf' : (mime.split('/')[1] || 'jpg');
    const blob    = Utilities.newBlob(decoded, mime, naam.replace(/[\/\\:*?"<>|]/g, '_') + '.' + ext);
    let folder;
    const mappen = DriveApp.getFoldersByName('Bonnetjes & Ontvangstbewijzen');
    folder = mappen.hasNext() ? mappen.next() : DriveApp.createFolder('Bonnetjes & Ontvangstbewijzen');
    return folder.createFile(blob).getUrl();
  } catch (e) {
    Logger.log('Bon opslaan mislukt: ' + e.message);
    return null;
  }
}

// ─── AI SCAN (GEMINI VISION) ──────────────────
/**
 * Stuurt een afbeelding/PDF naar Gemini Vision.
 * Geeft gestructureerde extractie terug.
 */
function scanDocumentMetAI(base64Data, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { fout: 'Gemini API-sleutel niet ingesteld (Boekhouding → Instellingen → Gemini API-sleutel).' };

  const prompt = [
    'Analyseer dit document (bon, factuur of kassabon) en extraheer in STRICT JSON (geen markdown, geen uitleg):',
    '{',
    '  "leverancier": "naam van verkoper/leverancier of null",',
    '  "datum": "YYYY-MM-DD of null",',
    '  "factuurnummer": "factuurnummer of null",',
    '  "omschrijving": "1-regelige samenvatting van de aankoop",',
    '  "bedragExcl": numeriek of 0,',
    '  "btwBedrag": numeriek of 0,',
    '  "bedragIncl": numeriek totaal incl. BTW of 0,',
    '  "btwPercentage": 21 of 9 of 0,',
    '  "categorie": "beste categorie uit: Marketing, Software, Kantoor, Advies, Auto, Reiskosten, Maaltijden, Inkoop, Verzekering, Telecom, Studie, Overig"',
    '}',
  ].join('\n');

  try {
    const resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }
          ]}]
        }),
      }
    );
    const json   = JSON.parse(resp.getContentText());
    if (json.error) return { fout: json.error.message };
    const tekst  = json.candidates[0].content.parts[0].text.trim()
                      .replace(/^```[a-z]*\s*/i,'').replace(/```\s*$/i,'').trim();
    return JSON.parse(tekst);
  } catch (e) {
    Logger.log('AI scan fout: ' + e.message);
    return { fout: 'AI kon het document niet lezen. Vul handmatig in.' };
  }
}

// ─── SPRAAK → VELDEN (GEMINI TEXT) ───────────
/**
 * Zet gesproken Nederlandse tekst om naar boeking-velden.
 * @param {string} type - 'factuur' | 'kosten' | 'declaratie'
 */
function parseSpraakinvoer(type, tekst) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return {};

  const schema = {
    factuur:    '{"klant":"naam klant","r1omschr":"omschrijving dienst","r1prijs":bedrag,"r1aantal":1,"email":"email of null","btw":"21% (hoog)"}',
    kosten:     '{"leverancier":"naam","omschr":"omschrijving","bedragIncl":bedrag,"btw":"21% (hoog)","categorie":"categorie"}',
    declaratie: '{"omschr":"omschrijving","bedrag":bedrag,"toelichting":"reden"}',
  };

  const prompt = 'Extraheer boeking-velden uit deze gesproken Nederlandse tekst.\n'
    + 'Geef ALLEEN dit JSON-schema terug (geen uitleg):\n' + (schema[type] || '{}')
    + '\n\nGesproken tekst: "' + tekst + '"';

  try {
    const resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const json  = JSON.parse(resp.getContentText());
    if (json.error) return {};
    const tekst2 = json.candidates[0].content.parts[0].text.trim()
                      .replace(/^```[a-z]*\s*/i,'').replace(/```\s*$/i,'').trim();
    return JSON.parse(tekst2);
  } catch(e) {
    return {};
  }
}

// ─── AUDIT TRAIL ──────────────────────────────
/**
 * Schrijft een auditlog-regel naar ScriptProperties.
 * Wordt ook door Branding.gs e.a. gebruikt.
 */
function schrijfAuditLog_(actie, details) {
  try {
    const props     = PropertiesService.getScriptProperties();
    const gebruiker = Session.getActiveUser().getEmail() || 'systeem';
    const tijdstip  = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd HH:mm:ss');
    const entry     = tijdstip + ' | ' + gebruiker + ' | ' + actie + ' | ' + String(details || '');

    // Houd laatste 100 regels bij in ScriptProperties
    const LOG_KEY = 'auditLogBuffer';
    const bestaand = props.getProperty(LOG_KEY) || '';
    const regels   = bestaand ? bestaand.split('\n') : [];
    regels.push(entry);
    if (regels.length > 100) regels.splice(0, regels.length - 100);
    props.setProperty(LOG_KEY, regels.join('\n'));
    Logger.log('[AUDIT] ' + entry);
  } catch(e) { /* nooit crashen om audit */ }
}

// Backward-compat alias (gebruikt in Branding.gs en Utils.gs)
function auditLog_(actie, details) { schrijfAuditLog_(actie, details); }

// ─── BUSINESS TYPE INSTELLEN ──────────────────
function slaBusinessTypeOp(type) {
  if (!BUSINESS_TYPES[type]) throw new Error('Onbekend type: ' + type);
  PropertiesService.getScriptProperties().setProperty('businessType', type);
  schrijfAuditLog_('businessType gewijzigd', type);
  return true;
}

function getBusinessType() {
  return PropertiesService.getScriptProperties().getProperty('businessType') || 'zzp';
}
