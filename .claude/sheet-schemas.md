# Sheet Column Schemas — boekhouding-engine

> AUTHORITATIVE SOURCE for all sheet column layouts.
> All GAS code uses 0-based array indices.
> Column N in Sheets UI = index N-1 in code.
> ALWAYS verify here before writing/reading sheet data.

---

## VERKOOPFACTUREN (Sheets: "Verkoopfacturen")

```
[0]  Factuur ID              numeric    e.g. 1, 2, 3
[1]  Factuurnummer           string     e.g. "F000001"  ← formatted with prefix
[2]  Datum                   Date       factuurdatum (ISO stored as Date)
[3]  Vervaldatum             Date       datum + betalingstermijn
[4]  Klant ID                string     e.g. "REL0001"
[5]  Klantnaam               string
[6]  KvK klant               string
[7]  BTW-nr klant            string
[8]  Omschrijving            string     semicolon-joined regel omschrijvingen
[9]  Bedrag excl. BTW        number     totalExcl (rounded)
[10] BTW %                   string     btwLabel e.g. "21% (hoog)"
[11] BTW bedrag              number     totalBtw (rounded)
[12] Bedrag incl. BTW        number     totalIncl (rounded)
[13] Betaald bedrag          number     0 initially; updated on payment
[14] Status                  string     FACTUUR_STATUS: Concept/Verzonden/Betaald/Vervallen/Gecrediteerd
[15] Betaaldatum             Date|''    empty until paid
[16] Betalingsreferentie     string
[17] Projectcode             string
[18] Notities                string
[19] PDF URL                 string     Google Drive URL; '' until generated
[20] Grootboekrekening       string     e.g. "8000" (via bepaalOmzetRekening_)
[21] Aangemaakt op           Date       new Date() at creation
[22] Aangemaakt door         string     Session.getActiveUser().getEmail()
```

**Critical indices used in BTW aangifte (BTW.gs:berekenBtwAangifte_):**
- `[2]` = datum (for quarter filtering)
- `[9]` = grondslag excl. BTW
- `[10]` = BTW label (for tarief classification)
- `[11]` = BTW bedrag

**Critical indices used in Dashboard KPI:**
- `[12]` = totalIncl (for open debiteuren)
- `[13]` = betaald (for open debiteuren = incl - betaald)
- `[14]` = status (skip BETAALD/GECREDITEERD)

**Critical index for idempotency guard (Triggers.gs):**
- `[0]` = factuurNr (numeric, checked for duplicates before appendRow)
- `[1]` = factuurNummerOpgemaakt (formatted, used in error messages)

**Dunning (stuurAutomatischeBetalingsherinneringen_):**
- `[3]` = vervaldatum
- `[14]` = status
- `[19]` = PDF URL (for attachment in reminder email)

---

## INKOOPFACTUREN (Sheet: "Inkoopfacturen")

```
[0]  Inkoop ID               numeric    e.g. 1, 2
[1]  Intern nummer           string     e.g. "IK123"
[2]  Datum ontvangst         Date       new Date() at entry
[3]  Factuurdatum leverancier Date      actual invoice date ← used for BTW date filtering!
[4]  Factuurref. leverancier string
[5]  Leverancier ID          string     e.g. "REL0002"
[6]  Leveranciernaam         string
[7]  Omschrijving            string
[8]  Bedrag excl. BTW        number
[9]  BTW %                   string     btwLabel e.g. "21% (hoog)"
[10] BTW bedrag              number
[11] Bedrag incl. BTW        number     ← used for crediteurenOpen in Dashboard
[12] Status                  string     FACTUUR_STATUS: Concept/Betaald
[13] Betaaldatum             Date|''
[14] Betaalrekening          string
[15] Kostenrekening          string     e.g. "7990" (via bepaalKostenrekening_)
[16] Projectcode             string
[17] Notities                string
[18] Bijlage URL             string
[19] Aangemaakt op           Date
```

**Critical indices used in BTW aangifte (BTW.gs:berekenBtwAangifte_):**
- `[3]` = factuurdatum leverancier (NOT [2]!) for quarter filtering
- `[8]` = grondslag excl. BTW
- `[9]` = BTW label
- `[10]` = BTW bedrag ← this is voorbelasting (r5b)

**Critical indices used in Dashboard KPI:**
- `[11]` = bedragIncl (for crediteurenOpen)
- `[12]` = status (skip BETAALD)

---

## JOURNAALPOSTEN (Sheet: "Journaalposten")

```
[0]  Boeking ID              string     e.g. "BK000001"
[1]  Datum                   Date
[2]  Omschrijving            string
[3]  Dagboek                 string     Verkoopboek/Inkoopboek/Bankboek/Memoriaal
[4]  Debet rekening          string     grootboekrekening code e.g. "1100"
[5]  Debet omschrijving      string     naam van rekening [4]
[6]  Credit rekening         string
[7]  Credit omschrijving     string
[8]  Bedrag                  number     rondBedrag_
[9]  BTW %                   string     e.g. "21%" or "Geen"
[10] BTW bedrag              number
[11] Referentie              string     e.g. factuurnummer
[12] Projectcode             string
[13] Type                    string     BOEKING_TYPE
[14] Notities                string
[15] Aangemaakt op           Date       new Date()
```

---

## RELATIES (Sheet: "Relaties")

```
[0]  Relatie ID              string     e.g. "REL0001"
[1]  Type                    string     RELATIE_TYPE: Klant/Leverancier/Klant & Leverancier
[2]  Naam                    string     ← primary lookup key
[3]  Contactpersoon          string
[4]  Adres                   string
[5]  Postcode                string
[6]  Plaats                  string
[7]  Land                    string
[8]  KvK-nummer              string
[9]  BTW-nummer              string
[10] Email                   string     ← used for sending invoices/reminders
[11] Telefoon                string
[12] IBAN                    string
[13] Betalingstermijn (dagen) number
[14] Standaard BTW           string
[15] Standaard kostenrekening string
[16] Actief                  string     "Ja"/"Nee"
[17] Notities                string
[18] Aangemaakt op           Date
```

---

## BANKTRANSACTIES (Sheet: "Banktransacties")

```
[0]  Transactie ID           string
[1]  Datum                   Date
[2]  Omschrijving            string
[3]  Bedrag                  number     positive=ontvangst, negative=betaling
[4]  Type                    string     Betaling/Ontvangst
[5]  Rekening                string     eigen IBAN
[6]  Tegenrekening           string
[7]  Tegenpartij             string
[8]  Referentie              string
[9]  Grootboekrekening       string
[10] Gekoppeld aan           string     relatie ID
[11] Gekoppeld factuur       string     factuurnummer
[12] Status                  string     Ongekoppeld/Gekoppeld/Verwerkt
[13] Notities                string
[14] Aangemaakt op           Date
```

---

## INSTELLINGEN (Sheet: "Instellingen")

Key-value sheet. `getInstelling_(sleutel)` reads column[0] for key, returns column[1].

**Known keys (sleutel → waarde):**
```
'Bedrijfsnaam'                   → company name
'BTW-nummer'                     → e.g. NL123456789B01
'KvK-nummer'                     → Chamber of Commerce number
'IBAN'                           → bank account
'Bankrekening op factuur'        → IBAN shown on invoices (may differ)
'Factuurprefix'                  → e.g. "F" → produces "F000001"
'Betalingstermijn (dagen)'       → default payment term
'BTW aangifte herinnering'       → 'Ja'/'Nee' for deadline email
'Email accountant'               → accountant email for export
'Drive map facturen'             → Drive folder URL
'Drive map boekjaar'             → Drive folder URL
```

---

## HERHALENDE KOSTEN (Sheet: "Herhalende Kosten")

Column layout defined by `voegHerhalendeKostToe_()` and read by `verwerkHerhalendeKosten_()`:

```
[0]  ID                      string     e.g. "HK0001"
[1]  Naam                    string     descriptive name e.g. "Kantoorhuur"
[2]  Leverancier             string     optional counterparty name
[3]  Bedrag (excl. BTW)      number     ← parseFloat; invalid → 0 silently
[4]  BTW tarief              string     e.g. "21% (hoog)"
[5]  Frequentie              string     Wekelijks/Maandelijks/Kwartaal/Halfjaarlijks/Jaarlijks
[6]  Volgende datum          Date       ← DANGER: must be valid Date; NaN crashes loop silently
[7]  Grootboekrekening       string     e.g. "7000 Overige kosten" → split(' ')[0] → "7000"
[8]  Status                  string     'Actief'/'Inactief'
[9]  Automatisch boeken      string     'Ja'/'Nee'
[10] Notities                string     optional notes
[11] Zakelijk %              number     0–100; default 100 (volledig zakelijk)
                                        privé-deel (100 - %) boekt naar 2400 Privéonttrekkingen
```

---

## GROOTBOEKSCHEMA (Sheet: "Grootboekschema")

```
[0]  Code                    string     e.g. "8000"
[1]  Naam                    string     e.g. "Omzet diensten"
[2]  Type                    string     Activa/Passiva/Opbrengsten/Kosten/Eigen vermogen
[3]  Categorie               string
[4]  Balans/W&V              string     "Balans" or "W&V"
[5]  Saldo                   number     computed/cached
```

---

## BTW AANGIFTE (Sheet: "BTW Aangifte")

Generated output sheet — read-only from code perspective.
Written by `zetBtwAangifteOpSheet_()` in BTW.gs.

---

## KEY INVARIANTS FOR SHEET ACCESS

1. **VERKOOPFACTUREN [3] is vervaldatum, NOT factuurdatum**
   - Factuurdatum = [2]
   - Vervaldatum = [3]
   - Dunning uses [3] for expiry checks

2. **INKOOPFACTUREN [3] is factuurdatum leverancier, NOT datum ontvangst**
   - BTW.gs date filtering uses [3] for inkoopfacturen (not [2])
   - [2] = datum ontvangst (when WE received it)

3. **Betaald bedrag in VF is [13] NOT a boolean**
   - Open amount = [12] (incl) - [13] (betaald)
   - Status [14] can still be non-BETAALD even if [13] > 0 (partial payment)

4. **Herhalende kosten [7] contains "CODE naam" format**
   - `.split(' ')[0]` extracts just the code
   - Malformed value → wrong rekening used silently
