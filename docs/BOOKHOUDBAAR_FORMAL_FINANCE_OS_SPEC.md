# Boekhoudbaar — Formal Finance OS Specification

Deze specificatie is de harde bron van waarheid voor Boekhoudbaar.

Boekhoudbaar is geen mooie spreadsheet. Het is een mathematisch veilig Finance OS met een premium WAUW-laag erbovenop.

Elke toekomstige wijziging aan website, Google Sheet, Apps Script, licentieserver, Mollie-flow of onboarding moet tegen deze specificatie worden beoordeeld.

## Missie

Boekhoudbaar moet tegelijk zijn:

- mathematisch correct
- audit-proof
- premium in UX
- extreem betrouwbaar
- beginnersimpel
- advisor-respectable
- verkoopklaar
- indrukwekkend genoeg als publiek portfolio/CV

Niet slopen wat werkt. Wel alles verbeteren totdat het systeem functioneel veilig en visueel uitzonderlijk is.

## Rollen die het systeem moet simuleren

Elke verbetering moet worden beoordeeld vanuit deze perspectieven:

- formeel systeemarchitect
- accountant
- belastingcontroleur
- Google Apps Script engineer
- UX/UI designer
- motion designer
- security engineer
- product visionair
- sceptische koper
- beginner ZZP’er
- QA-engine

## Harde axioma’s

Deze regels zijn geen tips. Dit zijn invarianten.

1. Debet is altijd gelijk aan credit.
2. Single-entry transacties bestaan niet.
3. Het journaal is de enige waarheid.
4. Gebruik integer cents waar mogelijk.
5. COMMITTED transacties zijn immutable.
6. Correcties gebeuren via storno of inverse boekingen.
7. Er zijn geen writes in gesloten periodes.
8. Alleen leaf accounts mogen boekingen krijgen.
9. Elke write is atomair.
10. Halve transacties mogen niet bestaan.
11. Gebruik UUID’s voor interne integriteit.
12. Factuurnummers worden pas na validatie toegewezen.
13. Rapportages mogen nooit PENDING transacties gebruiken.
14. Alle HTML-output wordt escaped.
15. Vertrouw nooit op input.
16. Elke fout faalt graceful.
17. Geen silent success.
18. Geen looks right als validatie.
19. Alleen mathematisch geldige toestanden mogen bestaan.

## Formele validatie

Elke write is een functie:

```text
state -> new_state
```

Een write is alleen toegestaan als:

```text
invariant(state) = true
invariant(new_state) = true
```

Anders moet de operatie volledig falen of rollbacken.

## Boekhoudkundige kern

De kern moet hard bewijzen of afdwingen:

- double-entry enforcement
- committed-only reporting
- immutable ledger gedrag
- period locks
- atomic writes
- race-condition bescherming
- factuurnummer-integriteit
- integer-cent handling
- account hierarchy enforcement
- webhook idempotency
- XSS-bescherming
- licence integrity
- dashboard truthfulness

## Journal als Single Source of Truth

Dashboard, balans, winst-en-verliesrekening, btw-overzicht, rapportages, tips en KPI’s zijn views op het journaal. Ze mogen nooit zelfstandige bronnen van waarheid worden.

Fout:

```text
Factuur 101 betaald
```

Diepste laag:

```text
TransactionID: T-101 | AccountID: Bank       | DebetCents: 10000 | CreditCents: 0
TransactionID: T-101 | AccountID: Debiteuren | DebetCents: 0     | CreditCents: 10000
```

## Atomic commit protocol

Schrijf transacties eerst als PENDING.

Commit pas wanneer:

- minimaal twee regels bestaan
- exact één kant per regel gevuld is: debet of credit
- geen negatieve cents bestaan
- debet = credit per TransactionID
- periode OPEN is
- alle AccountID’s bestaan
- alle AccountID’s leaf accounts zijn
- alle required fields gevuld zijn
- geen duplicate LineItemID bestaat
- geen duplicate committed TransactionID bestaat

Rapportages gebruiken alleen COMMITTED.

## Immutability en correcties

Na COMMITTED:

- geen DELETE
- geen UPDATE
- geen stille overschrijving

Een fout wordt gecorrigeerd via een nieuwe inverse transactie met verwijzing naar OriginalTransactionID.

## Periode-state machine

Elke periode heeft een status:

- OPEN
- REVIEWED
- CLOSED

Regel:

- OPEN: boeken toegestaan
- REVIEWED: alleen gecontroleerde wijzigingen
- CLOSED: geen writes met boekdatum in die periode

Een transitie van CLOSED terug naar OPEN vereist expliciete super-user actie en audit-log.

## Rekeningstelsel als boom

Het rekeningschema is een hiërarchie.

Elke rekening heeft:

- AccountID
- AccountName
- ParentAccountID
- Class
- Type
- IsLeaf
- AllowPosting
- VATTreatment
- Active

Boekingen mogen alleen op rekeningen waar:

```text
IsLeaf = true
AllowPosting = true
Active = true
```

Journaalregels gebruiken AccountID, niet rekeningnamen.

## Semantische waarheid

Wiskundig correct betekent niet automatisch boekhoudkundig correct.

Als categorisatie, btw-behandeling of interpretatie onzeker is, moet het systeem dat tonen als onzekerheid.

Gebruik taal zoals:

- Controleer dit even.
- Dit lijkt mogelijk afwijkend.
- Dit kan relevant zijn als...
- Overweeg dit met je boekhouder te bespreken.

Vermijd absolute claims.

## Tax safety

Classificeer tax-content altijd als:

- FEIT
- TOOL
- TIP
- INSPIRATIE

FEIT en TOOL mogen alleen als ze verifieerbaar zijn. Gebruik officiële bronnen waar relevant:

- Belastingdienst
- KvK
- Rijksoverheid
- officiële wetgeving

Verboden taal:

- je moet
- dit bespaart belasting
- altijd
- garandeert
- beste manier

Veilige taal:

- dit kan relevant zijn als...
- controleer dit bij de Belastingdienst...
- overweeg dit te bespreken met je boekhouder...
- dit wordt vaak gebruikt voor...

## Sheet WAUW-standaard

De sheet mag nooit voelen als rauwe spreadsheet.

Het moet voelen als een intelligent financieel command center.

Het dashboard beantwoordt direct:

- Hoe sta ik ervoor?
- Wat moet ik nu doen?
- Waar moet ik op letten?
- Wat is afgerond?
- Wat klopt mogelijk niet?

Verplichte productlagen:

1. Command Center
2. Actiepanel
3. Afwijkingendetectie
4. BTW/deadline assistent
5. Empty states per tab
6. Success feedback na acties
7. Trust/uitleglaag

## Empty states

Geen lege tabellen zonder uitleg.

Elke lege sheet legt uit:

- wat hier hoort
- waarom het belangrijk is
- hoe je start
- waar je moet klikken

## Feedbacklaag

Elke afgeronde actie geeft duidelijke feedback:

- verwerkt — je administratie is weer bij
- factuur staat erin
- btw-overzicht is bijgewerkt
- rapportage is vernieuwd

Feedback moet rustig, premium en niet kinderachtig zijn.

## Website WAUW-standaard

De website moet premium, levend, betrouwbaar, cinematic, rustig en intelligent voelen.

Above the fold moet zichtbaar zijn:

- wat het is
- voor wie het is
- het echte product
- de primaire CTA
- concrete trust facts

Gebruik:

- echte productvisuals
- subtiele data-motion
- cursor-reactiviteit
- grid/depth-systeem
- premium shadows
- magnetic CTA’s
- scroll choreography
- motion hierarchy

Vermijd:

- gimmicks
- chaos
- overanimatie
- generieke SaaS-patronen zonder eigenheid

## Trust-laag

Leg rustig en eerlijk uit:

- Boekhoudbaar draait op Google Sheets en Apps Script
- data staat in de eigen Google Drive van de gebruiker
- de maker heeft geen toegang tenzij de gebruiker expliciet deelt
- OAuth-waarschuwingen kunnen voorkomen en waarom
- wat wel en niet veilig is

Toon dit als uitleg voor vrienden/familie, niet als verkooptekst.

## Buy flow

Deze flow moet volledig werken:

```text
Website -> /kopen -> payment page -> Mollie -> webhook -> licence -> email -> installer/copy -> activation -> sheet opens -> user knows next action
```

Als deze flow breekt, stopt alle design/SEO/polish. Eerst de flow herstellen.

## Security eisen

Assume hostile input.

Bescherm tegen:

- XSS in admin panel
- XSS in dialogs
- SVG upload script risk
- malformed CSV
- duplicate webhook calls
- missing properties
- failed email provider
- partial writes
- concurrent writes
- unauthorized licence validation

Gebruik:

- escaping for all HTML
- strict MIME validation
- locks for counters
- idempotent webhooks
- email fallbacks
- owner alerts for failures

## Anti-fake-progress filter

Niet doen zolang de kern niet bewezen veilig is:

- willekeurige SEO
- random animaties
- refactors zonder zichtbaar of veiligheids-effect
- tests-only werk zonder bug
- cosmetiek zonder productimpact

Wel doen:

- invariant protection
- buy-flow fixes
- sheet usability
- visible product improvement
- trust improvement
- error prevention
- conversion improvement

## Werkcyclus

Elke cycle:

1. Vind grootste zwakte.
2. Classificeer:
   - accounting risk
   - UX friction
   - trust gap
   - visual weakness
   - conversion issue
   - architecture flaw
3. Fix exact één coherent probleem.
4. Valideer.
5. Commit.
6. Ga verder.

## Validatie na elke wijziging

Controleer relevant:

- tests
- lint
- conflict markers
- unsafe HTML interpolation
- single-entry mogelijkheid
- period-closed writes
- reports using PENDING rows
- invoice number gaps on validation failure
- malformed input paths
- buy button flow
- product screenshot/preview accuracy

## Persona review

Na elke cycle beoordelen als:

- accountant
- belastinginspecteur
- beginner ZZP’er
- sceptische koper
- designer
- security reviewer
- founder die dit als publiek portfolio gebruikt

Als één persona het afkeurt, fixen.

## Outputformat voor toekomstige agents

```text
Cycle X
Class:
Problem:
Fix:
Validation:
Impact:
Next:
```

Kort. Concreet. Geen fluff.

## Startprioriteit voor volgende autonome run

Begin met een harde audit van de boekhoudkundige kern.

Eerst bewijzen of fixen:

- double-entry
- committed-only reporting
- immutable ledger gedrag
- period locks
- atomic writes
- race conditions
- invoice numbering
- integer cents
- account hierarchy
- webhook idempotency
- XSS-risico’s
- licence integrity
- dashboard truthfulness

Daarna pas:

- website verder WAUW maken
- sheet visueel uitzonderlijk maken
- SEO of growth uitbreiden
