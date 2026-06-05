# Stresstest Runbook — manuele acceptatie-tests

> Voor wat `tests/integration/ultieme-stresstest.test.js` niet kan: échte Google-omgeving, echte Drive-quota, echte triggers, echte webhook-bursts. Plan ~2 uur in test-account.

## Voorbereiding

1. Maak een test-Google-account aan met aparte Drive
2. Installeer BoekHoudbaar zoals een nieuwe klant zou doen
3. Zet Bedrijfsnaam = "Test Stresstest 2026"
4. Run `setup()` en vul minimum velden in
5. Open Audit-log sheet in extra tab — refresh na elke test

---

## R1. Mollie webhook idempotency-storm

**Doel:** verifiëren dat 3× zelfde Mollie-payment.id binnen 10s leidt tot 1 boeking + 2 IDEMPOTENT-log entries.

**Stappen:**
1. Activeer Mollie test-mode in `Instellingen`
2. Maak test-factuur €100 met `Betaallink tonen = Ja`
3. Open Mollie-test-dashboard → mark payment "paid"
4. Wacht tot eerste webhook arrives (Audit-log toont entry)
5. Klik in Mollie-dashboard 2× extra "trigger webhook" binnen 10s
6. Inspecteer:
   - Journaalposten sheet: zoek `MOLLIE-{payment_id}` → moet **1 rij** tonen, niet 3
   - Audit-log: moet 1× "Mollie betaling geboekt" + 2× "Mollie webhook IDEMPOTENT" tonen

**Dodelijk teken:** 2 of 3 boekingen op zelfde payment.id. Klant ziet €300 ontvangen ipv €100.

---

## R2. Drive-quotum vol bij `sluitJaarAf` archief

**Doel:** verifiëren dat archief-failure leidt tot CLEAN abort (geen teller-reset, geen prefix-update).

**Stappen:**
1. Vul test-Drive tot ~14.9GB van 15GB (upload grote ZIP-files)
2. Open BoekHoudbaar → Boekhouding → Jaarafsluiting wizard
3. Bevestig de dialog (jaarafsluiting starten)
4. Verwacht: **clean abort** met dialog "Het archief kon niet worden aangemaakt"

**Verifieer ná abort:**
- Factuurprefix in Instellingen: **ONVERANDERD** (nog steeds F2026-)
- VOLGEND_FACTUUR_NR in PropertiesService: **ONVERANDERD**
- Audit-log: 1× "Jaarafsluiting AFGEBROKEN" entry
- Géén nieuwe boekingen met type `Resultaatverwerking`

**Dodelijk teken:** prefix wel veranderd of teller wel reset, terwijl archief mislukte. State is dan inconsistent.

---

## R3. GAS execution-timeout bij grote import

**Doel:** verifiëren dat een 10.000-regel bankboek-import niet faalt zonder audit-spoor.

**Stappen:**
1. Genereer test-CSV met 10.000 willekeurige bank-transacties (script bijgeleverd `scripts/gen-stress-csv.js`)
2. Import via Bankboek → Importeren
3. Verwacht: import voltooid OF expliciete melding "Te grote import — split in delen"

**Dodelijk teken:** GAS-timeout (6 min) zonder enige audit-log; klant ziet "Script timed out" maar weet niet wat is geboekt en wat niet.

---

## R4. Echte concurrent triggers — form-submit storm

**Doel:** verifiëren dat 5 form-submits binnen 1 seconde géén dubbele factuurnummers genereren.

**Stappen:**
1. Open hoofdformulier in 5 browser-tabs
2. Vul in alle tabs identieke factuur in (klant X, €100, 21%)
3. Klik in alle tabs binnen 1 seconde "Verzenden"
4. Wacht 30s op trigger-verwerking
5. Verifieer:
   - Verkoopfacturen: **5 rijen** met **unieke** factuurnummers (F2026-001 t/m F2026-005)
   - Audit-log: géén "Factuur DUBBEL geblokkeerd" entries (zou alleen mogen bij identieke handmatige factuurnummers)

**Dodelijk teken:** 2 facturen met zelfde nummer F2026-001 → KvK + belastingdienst-risico (Wet OB art. 35a).

---

## R5. Datum 29-feb 2027 in factuur

**Doel:** verifiëren dat de A4-fix in productie werkt (na PR-A merge).

**Stappen:**
1. Open Nieuwe boeking dialog
2. Type datum: `29-02-2027`
3. Klik Verzenden

**Dodelijk teken (vóór fix):** factuur wordt aangemaakt met datum `01-03-2027` zonder waarschuwing.
**Verwacht (na fix):** dialog blokkeert met "29 februari bestaat niet in 2027 (geen schrikkeljaar). Bedoelde je 28-02 of 01-03?"

---

## R6. BTW-nummer lowercase op factuur-PDF

**Doel:** verifiëren dat een lowercase BTW-nummer NIET in de PDF eindigt (na PR-B fix).

**Stappen:**
1. Vul Instellingen BTW-nummer: `nl123456789b01` (lowercase)
2. Genereer factuur
3. Download PDF

**Dodelijk teken (vóór fix):** PDF toont `nl123456789b01` → niet geldig voor belastingdienst-aangifte.
**Verwacht (na fix):** ofwel Instellingen weigert lowercase input, ofwel PDF toont automatisch uppercase `NL123456789B01`.

---

## R7. Periode-sluiting hack via Nieuwe boeking

**Doel:** verifiëren dat boeken in afgesloten jaar geblokkeerd wordt (na PR-A merge).

**Stappen:**
1. Voer `sluitJaarAf()` uit (zoals in #224 — sluit huidig jaar af)
2. Open Nieuwe boeking dialog
3. Vul datum: `15-06-{huidigJaar}` (jaar dat net is afgesloten)
4. Klik Verzenden

**Dodelijk teken (vóór fix):** boeking wordt geaccepteerd → balans in archief klopt niet meer met actieve sheet.
**Verwacht (na fix):** dialog blokkeert met "Boekjaar {jaar} is afgesloten op {datum}. Een correctie kan alleen via accountant-modus."

---

## R8. Handmatige cell-overschrijving

**Doel:** verifiëren dat `controleerBalans_` (Gezondheidscheck) saldo-tampering detecteert.

**Stappen:**
1. Maak 5 normale boekingen (omzet + kosten mix)
2. Open Grootboekschema sheet direct
3. Overschrijf saldo van `8000 Omzet 21%` handmatig met `999999`
4. Run: BoekHoudbaar → Controle → Gezondheidscheck

**Verwacht:** Gezondheidscheck rapporteert mismatch tussen Grootboekschema-saldo en aggregatie van Journaalposten.
**Dodelijk teken:** Status "OK" — silent acceptatie van datacorruptie.

---

## Rapportage-template

Na uitvoering, vul per test in:

```
R{N}: {kort label}
  Status: [PASS | FAIL | NIET UITGEVOERD]
  Tijd: {start} - {einde}
  Resultaat: {wat zag je echt}
  Dodelijk teken aanwezig: [Ja / Nee]
  Audit-log entries gevonden: {citaat}
  Schermafdrukken: {pad / link}
  Conclusie: {1 zin}
```

Voeg het ingevulde rapport toe als comment op de stresstest-PR. Per FAIL: open een aparte issue met label `stresstest-finding`.
