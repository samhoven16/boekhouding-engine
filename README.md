# Boekhoudprogramma voor ZZP & MKB
### Google Forms + Google Spreadsheets + Apps Script

Een **volledig, gratis boekhoudprogramma** voor ZZP-ers en MKB-bedrijven, gebouwd op Google Workspace.
Geen abonnement, geen installatie – werkt volledig in Google Drive.

---

## Functies

| Module | Functionaliteit |
|---|---|
| **Facturatie** | Verkoopfacturen aanmaken met PDF, herinneringen, creditnota's |
| **Inkoopfacturen** | Registreren en bijhouden van leveranciersrekeningen |
| **Bankboek** | Handmatig invoeren of CSV-import, bankafstemming |
| **Dubbel boekhouden** | Volledig journaalboek conform NL GAAP (RGS-schema) |
| **BTW aangifte** | Kwartaalberekening incl. alle rubrieken (1a t/m 5d) |
| **Balans** | Actuele balans conform Nederlandse standaard |
| **W&V Rekening** | Winst- en verliesrekening per boekjaar |
| **Cashflow** | Maandelijks cashflow overzicht |
| **Jaarrekening** | Gecombineerd jaaroverzicht |
| **Dashboard** | KPI's, waarschuwingen, kengetallen |
| **Debiteuren** | Openstaande facturen, vervallijst |
| **Crediteuren** | Openstaande leveranciersrekeningen |
| **Relatiebeheer** | Klanten en leveranciers |
| **Afschrijvingen** | Lineaire afschrijving vaste activa |
| **KOR controle** | Kleine Ondernemers Regeling bewaking |

---

## Installatie

### Vereisten
- Google-account (gratis)
- Google Drive toegang
- Google Sheets / Google Forms

### Stap 1 – Script aanmaken

1. Ga naar [script.google.com](https://script.google.com)
2. Klik op **Nieuw project**
3. Klik op het tandwiel ⚙ → **Projectinstellingen** → kopieer de **Script ID**

### Stap 2 – Code uploaden (clasp)

```bash
# Installeer clasp (vereist Node.js)
npm install -g @google/clasp

# Login bij Google
clasp login

# Clone het project
git clone https://github.com/samhoven16/boekhouding-engine.git
cd boekhouding-engine

# Initialiseer clasp met uw Script ID
clasp clone <SCRIPT_ID>

# Upload alle bestanden
clasp push
```

### Stap 3 – Handmatig uploaden (zonder clasp)

1. Open [script.google.com](https://script.google.com) en maak een nieuw project
2. Verwijder de standaard `Code.gs`
3. Maak voor elk `.gs` bestand in `src/` een nieuw scriptbestand aan:
   - Klik op **+** → **Script**
   - Geef het dezelfde naam (bijv. `Config`)
   - Plak de inhoud
4. Vervang `appsscript.json` via **Projectinstellingen** → **appsscript.json weergeven**

### Stap 4 – Eerste keer opstarten

1. Open een **nieuw Google Spreadsheet**
2. Ga naar **Extensies** → **Apps Script**
3. Koppel het script aan de spreadsheet
4. **Vernieuwen** de spreadsheet (F5)
5. Klik in het menu op **Boekhouding** → **Instellingen & Beheer** → **Setup uitvoeren**
6. Geef de gevraagde rechten (Google Drive, Gmail, Forms)
7. Wacht ~60 seconden – alle tabbladen en formulieren worden aangemaakt

### Stap 5 – Bedrijfsgegevens invullen

Ga naar tabblad **Instellingen** en vul uw gegevens in:
- Bedrijfsnaam, adres, KvK-nummer
- BTW-nummer
- IBAN
- Boekjaarperiode
- E-mailadres voor rapporten

---

## Gebruik

### Verkoopfactuur aanmaken
1. **Boekhouding** → **Facturen** → **Nieuwe verkoopfactuur aanmaken**
2. Of gebruik de directe formulier-link (zie tabblad Instellingen)
3. Na invullen wordt automatisch een PDF gegenereerd in Google Drive
4. Verstuur via **Boekhouding** → **Facturen** → **Verkoopfactuur als PDF versturen**

### Inkoopfactuur registreren
1. **Boekhouding** → **Facturen** → **Inkoopfactuur registreren**
2. Vul leveranciersnaam, factuurnummer en bedrag in
3. Factuur wordt automatisch geboekt als crediteur

### Banktransactie invoeren
1. **Boekhouding** → **Bankboek** → **Banktransactie invoeren**
2. Of importeer een bankafschrift via CSV: **Bankafschrift importeren (CSV)**
3. Het systeem koppelt automatisch transacties aan open facturen via de referentie

### BTW aangifte
1. **Boekhouding** → **BTW** → kies het gewenste kwartaal
2. De aangifte wordt berekend op basis van alle facturen in die periode
3. Alle rubrieken (1a t/m 5d) worden ingevuld
4. Vervolgens **BTW journaalpost sluiten** om de periode te boeken

### Rapporten genereren
- **Balans**: actuele vermogenspositie
- **W&V Rekening**: resultaten over het boekjaar
- **Cashflow**: geldstromen per maand
- **Dashboard**: KPI overzicht met waarschuwingen

---

## Grootboekschema (RGS)

Het programma gebruikt het **Referentie Grootboekschema (RGS)** conform de Nederlandse standaard:

| Reeks | Type |
|---|---|
| 0xxx | Vaste activa |
| 1xxx | Vlottende activa & liquide middelen |
| 2xxx | Eigen vermogen |
| 3xxx | Langlopende schulden |
| 4xxx | Kortlopende schulden |
| 7xxx | Kosten (resultatenrekening) |
| 8xxx | Opbrengsten (resultatenrekening) |

---

## Google Forms

De setup maakt automatisch **5 Google Forms** aan:

| Formulier | Doel |
|---|---|
| Verkoopfactuur aanmaken | Nieuwe factuur invoeren (tot 3 regelitems) |
| Inkoopfactuur registreren | Leveranciersrekening boeken |
| Banktransactie invoeren | Bankafschrift handmatig invoeren |
| Relatie toevoegen | Klant of leverancier aanmaken |
| Handmatige journaalpost | Correcties, beginbalans, afschrijvingen |

De links naar de formulieren staan op het tabblad **Instellingen**.

---

## Technische details

### Bestanden

```
appsscript.json          - Google Apps Script manifest
src/
  Config.gs              - Constanten, grootboekschema, BTW tarieven
  Setup.gs               - Eenmalige setup (tabbladen + forms)
  Menu.gs                - Aangepast Sheets menu
  Triggers.gs            - Form submission handlers
  Boekingen.gs           - Dubbel boekhoudingsengine
  Verkoopfacturen.gs     - Facturen, PDF generatie, e-mail
  Inkoopfacturen.gs      - Inkoopfacturen administratie
  Bankboek.gs            - Bankrekening beheer
  BTW.gs                 - BTW aangifte berekening
  Rapportages.gs         - Balans, W&V, Cashflow, Jaarrekening
  Dashboard.gs           - KPI dashboard
  Utils.gs               - Hulpfuncties
```

### Triggers

- **onOpen**: menu aanmaken bij openen spreadsheet
- **onFormSubmit (5x)**: elk formulier heeft een trigger
- **Dagelijks om 08:00**: vervallen facturen markeren, BTW herinneringen

### Benodigde OAuth Scopes

- `spreadsheets` – tabbladen lezen/schrijven
- `forms` – formulieren aanmaken
- `drive` – PDF's opslaan
- `gmail.send` – e-mails versturen
- `script.scriptapp` – triggers instellen
- `documents` – (optioneel voor Doc-gebaseerde PDF's)

---

## BTW Wetgeving (NL)

Het programma ondersteunt de Nederlandse BTW wetgeving:

- **21%** – standaard (hoog) tarief
- **9%** – verlaagd (laag) tarief (voedsel, boeken, geneesmiddelen)
- **0%** – nultarief (export, IC leveringen)
- **Vrijgesteld** – onderwijs, gezondheidszorg, etc.
- **Verlegd** – BTW verlegd naar afnemer
- **KOR** – Kleine Ondernemers Regeling (< €20.000 omzet)

Aangifte termijnen:
| Kwartaal | Deadline |
|---|---|
| Q1 (jan-mrt) | 30 april |
| Q2 (apr-jun) | 31 juli |
| Q3 (jul-sep) | 31 oktober |
| Q4 (okt-dec) | 31 januari (volgend jaar) |

---

## Licentie

MIT License – vrij te gebruiken en aan te passen.

---

## Bijdragen

Pull requests welkom! Zie issues voor openstaande verbeterpunten.

Meld bugs via: [github.com/samhoven16/boekhouding-engine/issues](https://github.com/samhoven16/boekhouding-engine/issues)
