# Wiskundige Fundering — Boekhoudbaar als formeel systeem

Boekhoudbaar wordt opgevat als een formeel systeem F = (Σ, A, ⊢):

- **Σ** (alfabet): rekeningcodes ∈ {1100, 1200, …, 8000, …}, factuurnrs ∈ ℕ, BTW-tarieven ∈ {0, 0.09, 0.21}, bedragen ∈ ℚ (rationele getallen op €0,01 afgerond)
- **A** (axioma's): tien invarianten hieronder
- **⊢** (afleidingsregels): journaalpost-creatie, factuur-creatie, BTW-berekening, stornering

Een correct programma is correct **iff** alle invarianten in A gelden op elke staat S ∈ State.

`src/FormeelBewijs.gs` implementeert de runtime-verifier; `tests/property/formeel-bewijs-invarianten.test.js` verifieert ze met property-based testing (1000+ random inputs).

---

## De 10 axioma's

### I₁ — DEBIT/CREDIT BALANS (Algebra)
∀ journaalpost J:  `J.debet_bedrag = J.credit_bedrag`

Gevolg: `ΣJ.debet = ΣJ.credit` over alle journaalposten.

**Mate van afdwinging:** maakJournaalpost_ enforced + post-hoc verifier.

### I₂ — GROOTBOEKSALDO CONSISTENT (Algebra)
∀ rekening R:
```
saldo(R) = Σ {J.bedrag | J raakt R aan debet-zijde}
         - Σ {J.bedrag | J raakt R aan credit-zijde}
```
Anders: GROOTBOEKSCHEMA-saldo en journaalpost-totaal divergeren → silent drift.

**Mate:** post-hoc verifier in `_bewijs_I2_grootboekConsistent_`.

### I₃ — BALANS-WET (Algebra, fundamenteel)
`Σ {R.saldo | R.bw = Activa} = Σ {R.saldo | R.bw = Passiva}`

Tolerantie:
- Lopend boekjaar: ε = 0.05 (floating-point ruis tolerant)
- Jaarrekening: ε = 0.005 (strikt, via `controleerBalansStrikt_`)

### I₄ — FACTUUR-DECOMPOSITIE (Algebra)
∀ factuur F:  
```
F.bedragIncl = F.bedragExcl + F.btwBedrag  (±€0,01 afronding)
F.btwBedrag  = F.bedragExcl × F.btwTarief
```
waar `btwTarief ∈ {0, 0.09, 0.21}` voor NL.

### I₅ — BTW-AANGIFTE SLUITEND (Algebra)
```
A.r5a = A.r1a_btw + A.r1b_btw + A.r1c_btw + A.r1e_btw + A.r4a_btw
A.r5d = A.r5a - A.r5b
```
Afgerond op €1 conform Belastingdienst-aangifte.

### I₆ — FACTUURNUMMER-UNICITEIT (Getaltheorie)
∀ F₁, F₂ ∈ Verkoopfacturen:  `F₁ ≠ F₂ ⟹ F₁.nr ≠ F₂.nr`

Wettelijk verplicht door **art. 35 Wet OB**. Dubbele factuurnummers = naheffing-risico.

### I₇ — FACTUURNUMMER-MONOTONIE (Getaltheorie)
∀ F₁, F₂ met `F₁.datum ≤ F₂.datum`:  `F₁.nr ≤ F₂.nr`

Uitzondering: jaarwisseling reset de teller (per-boekjaar monotonie).

### I₈ — AFGESLOTEN PERIODE IMMUTABILITY (Verzamelingsleer)
Zij P ⊂ Tijd een afgesloten periode. ∀ J nieuwe journaalpost:
```
J.datum ∈ P  ⟹  reject(J)
```
Set-theoretisch: P is gesloten onder modificaties = "frozen subset".

**Afgedwongen door:** `maakJournaalpost_` guard (Boekingen.gs:36+).

### I₉ — REKENINGSCHEMA LEAF-ONLY-BOEKINGEN (Discrete wiskunde)
Het Grootboekschema vormt een **rooted forest** waar leaf-rekeningen de enige zijn waarop journaalposten mogen aangrijpen. Parent-rekeningen zijn aggregaten.

Graf-theoretisch: ∀ J: `J.debet ∈ leaves(Grootboekforest) ∧ J.credit ∈ leaves(Grootboekforest)`

### I₁₀ — BAYESIAANSE BTW-ANOMALIE (Statistiek)
Zij μ = EWMA(laatste 4 kwartalen r5d), σ = sample-stddev.

Bij `|r5d_huidig - μ| > 2σ`: posterior-waarschijnlijkheid van invoerfout is hoog. Waarschuw vóór indiening.

Bayes-formulering:
```
P(invoerfout | spike) ∝ P(spike | invoerfout) × P(invoerfout)
```
Met `spike = afwijking > 2σ` en `P(invoerfout) ≈ 5%` baseline.

---

## Property-based testing

Per invariant: 100+ random inputs, beide kanten:

| Property | Beschrijving |
|---|---|
| Positive | Random valid state → invariant geldt |
| Negative (adversarial) | Random invalid state → invariant gedetecteerd als geschonden |

Voor I₁₀ specifiek: 100 random historieën met 10σ-spike → 100% detectie verwacht (bewijst de detector heeft 0% false-negative rate op grote afwijkingen).

---

## Uitvoering tegen live administratie

```js
const rapport = bewijsAlleInvarianten_(ss);
if (rapport.alleGoed) {
  console.log('✓ Wiskundig consistent.');
} else {
  rapport.schendingen.forEach(s => {
    console.log('✗', s.code, '(' + s.soort + '):', s.boodschap);
    if (s.tegenvoorbeeld) console.log('  Tegenvoorbeeld:', s.tegenvoorbeeld);
  });
}
```

**Roep aan vanuit:**
- `dagelijkseTaken()` — automatische dagelijkse verificatie
- Pre-jaarafsluiting (verplicht passeren vóór close)
- Pre-BTW-aangifte indienen (anomalie-detector als blokker)
- Pre-accountant-export (audit-defensiebewijs)

---

## Waarom dit alles?

Dubbele boekhouding is in principe een **gesloten formeel systeem**. Als één axioma faalt, faalt het hele systeem. Sam vroeg om "dichtmetselen" — letterlijk: bewijzen dat elke combinatie van inputs ofwel correct verwerkt wordt, ofwel hard gereject. Geen middenweg, geen "silent drift", geen "het ziet er wel ongeveer goed uit".

Property-based testing (Hughes 2000, "QuickCheck") dekt edge-cases die handmatige tests missen omdat de inputs uit de hele input-ruimte komen, niet uit de intuïtie van de ontwikkelaar.

Resultaat: een boekhouding die wiskundig defendeerbaar is bij elke Belastingdienst-controle, accountant-review en eigen audit.
