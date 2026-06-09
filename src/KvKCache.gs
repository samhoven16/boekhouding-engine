/**
 * KvKCache.gs
 * ════════════════════════════════════════════════════════════════
 * Permanent cache voor KvK-bedrijfsgegevens — 1× per klant
 * ════════════════════════════════════════════════════════════════
 *
 * Sam's principe: "Maximaal €0,03 cost per klant (eenmalig). Klant mag
 * nooit verrast worden door onverwachte kosten."
 *
 * KvK Open Data API: eerste 100 calls/maand gratis bij developers.kvk.nl,
 * daarna ~€0,03/call. Bestaande haalDataKvK_ in Utils.gs gebruikt een
 * 24u CacheService cache — overleeft NIET een week, dus bij elke
 * inspectie + paar dagen later opnieuw = nieuwe API-call. Dat past
 * niet bij de eenmalig-belofte.
 *
 * Deze module:
 *   - ververseKvKBedrijfsgegevens()
 *       Publieke menu-handler. Wist Instellingen-velden, vraagt KvK-
 *       nummer (of leest het uit Instellingen), doet exact 1 API-call,
 *       schrijft handelsnaam + adres terug naar Instellingen. Logged
 *       datum + audit-entry. Idempotent bij herhaalde clicks (geeft
 *       waarschuwing als laatste verversing < 24u geleden).
 *
 *   - getKvKCacheDatum_()
 *       Pure read voor diagnostics: wanneer is laatst opgehaald?
 *
 * KEY DESIGN: na 1× ophalen staat alle bedrijfsdata in de standaard
 * Instellingen-keys (Bedrijfsnaam, Adres, Postcode, Plaats). Bestaande
 * code (Verkoopfacturen.gs, Setup.gs) leest die al — dus de cache IS
 * gewoon de sheet. Permanent, transparant, klant-eigenaar.
 */

const _KVK_CACHE_DATUM_KEY = '_KVK Laatste Verversing';
const _KVK_VERVERS_RATE_LIMIT_UREN = 24;  // waarschuw bij <24u herhaling

/**
 * Wanneer is KvK voor het laatst opgehaald? null als nog nooit.
 *
 * @returns {Date|null}
 */
// eslint-disable-next-line no-unused-vars
function getKvKCacheDatum_() {
  try {
    if (typeof getInstelling_ !== 'function') return null;
    const ruw = getInstelling_(_KVK_CACHE_DATUM_KEY);
    if (!ruw) return null;
    const d = new Date(String(ruw));
    return isFinite(d.getTime()) ? d : null;
  } catch (_) {
    return null;
  }
}

/**
 * Menu-handler: refresh bedrijfsgegevens uit KvK Open Data.
 * Doet exact 1 API-call, schrijft naar Instellingen, niets meer.
 *
 * Vereisten:
 *   - KvK API-key ingesteld (via Instellingen → KvK API-key)
 *   - KvK-nummer ingesteld in Instellingen (8 cijfers)
 *
 * Idempotency: bij herhaalde klik < 24u → confirmation-dialog.
 */
// eslint-disable-next-line no-unused-vars
function ververseKvKBedrijfsgegevens() {
  const ui = SpreadsheetApp.getUi();

  // 1. Lees huidig KvK-nummer
  let kvkNummer = '';
  try {
    kvkNummer = String(getInstelling_('KvK-nummer') || '').replace(/\D/g, '');
  } catch (_) {}
  if (!/^\d{8}$/.test(kvkNummer)) {
    ui.alert(
      'KvK-nummer ontbreekt',
      'Vul eerst je KvK-nummer in via tab Instellingen (8 cijfers). Daarna kun je hier de auto-fill uit KvK starten.',
      ui.ButtonSet.OK
    );
    return;
  }

  // 2. Anti-bombarding: waarschuw bij herhaling < 24u (klant betaalt €0,03)
  const laatste = getKvKCacheDatum_();
  if (laatste) {
    const urenSinds = (Date.now() - laatste.getTime()) / (1000 * 60 * 60);
    if (urenSinds < _KVK_VERVERS_RATE_LIMIT_UREN) {
      const bevestig = ui.alert(
        'Recent al opgehaald',
        'KvK-gegevens zijn ' + Math.round(urenSinds) + ' uur geleden opgehaald.\n' +
          'Een nieuwe ophaal kost ~€0,03 (eerste 100/maand gratis op KvK Open Data).\n\n' +
          'Toch opnieuw ophalen?',
        ui.ButtonSet.YES_NO
      );
      if (bevestig !== ui.Button.YES) return;
    }
  }

  // 3. Roep haalDataKvK_ (bestaande) aan — exact 1 API-call
  let data = null;
  try {
    if (typeof haalDataKvK_ === 'function') {
      data = haalDataKvK_(kvkNummer);
    }
  } catch (_) {}

  if (!data) {
    ui.alert(
      'Ophalen mislukt',
      'Geen gegevens ontvangen. Mogelijke oorzaken:\n' +
        '  • KvK API-key ontbreekt (Instellingen → KvK API-key)\n' +
        '  • Onbekend KvK-nummer\n' +
        '  • KvK API tijdelijk uit (probeer over een paar minuten)\n\n' +
        'Bestaande velden zijn NIET overschreven.',
      ui.ButtonSet.OK
    );
    return;
  }

  // 4. Schrijf naar bestaande Instellingen-keys (dezelfde die Verkoopfacturen
  //    al gebruikt voor brief-papier — geen aparte data-store).
  const adresRegel = [data.adres, data.huisnummer].filter(Boolean).join(' ').trim();
  try {
    if (data.naam)      setInstelling_('Bedrijfsnaam', data.naam);
    if (adresRegel)     setInstelling_('Adres', adresRegel);
    if (data.postcode)  setInstelling_('Postcode', data.postcode);
    if (data.plaats)    setInstelling_('Plaats', data.plaats);
    setInstelling_(_KVK_CACHE_DATUM_KEY, new Date().toISOString());
  } catch (e) {
    ui.alert('Wegschrijven mislukt: ' + e.message);
    return;
  }

  try { safeAuditLog_('KvK verversing', 'Bedrijfsgegevens opgehaald voor ' + kvkNummer); } catch (_) {}

  ui.alert(
    '✅ Bedrijfsgegevens bijgewerkt',
    'Opgehaald uit KvK Open Data:\n\n' +
      '  Naam:     ' + (data.naam || '–') + '\n' +
      '  Adres:    ' + (adresRegel || '–') + '\n' +
      '  Postcode: ' + (data.postcode || '–') + '\n' +
      '  Plaats:   ' + (data.plaats || '–') + '\n\n' +
      'Deze gegevens worden gebruikt op je facturen en in rapporten.\n' +
      'Wijzigt er iets bij KvK? Klik dit menu-item opnieuw om te verversen.',
    ui.ButtonSet.OK
  );
}
