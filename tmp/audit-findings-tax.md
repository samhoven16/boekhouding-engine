# Audit-findings — tax-compliance
Hashes van gelezen file-versies: zie tmp/file-hashes.txt.

## Batch TAX-A — BTW.gs, BtwExport.gs, BTWReminder.gs, EUVerkoop.gs

### src/BTW.gs
Gelezen: regels 1-921 (volledig)
Aspecten:
- BTW-tariefclassificatie null vs 0: OK regels 877-887 (parseBtwTarief_ retourneert null voor vrijgesteld/verlegd, 0.00 voor nultarief). Splitsing vrijgesteld vs nultarief in pro-rata: OK regels 211-223, 308-321.
- r1a/r1b/r1c/r1d/r1e/r4a-classificatie: VONDST F-TAX-001 (r3a/3b verwarring), VONDST F-TAX-002 (verlegde inkoop r4a mist r5b-aftrek). Overig r1a/r1b/r1e/r1d OK regels 205-247.
- I₅ (r5a = r1a+r1b+r1c+r1e+r4a): OK regels 289-292, 404-407.
- KIA/MKB/IB/zelfstandigenaftrek/Zvw/DGA/urencriterium: n.v.t., geen IB-logica in dit bestand.
- Suppletie: VONDST F-TAX-003. Bewaarplicht: n.v.t.
- KOR-grens €20.000: OK regels 785-812. BTW-tarieven 21%/9%: OK regels 387, 395, 882-883.

### src/BtwExport.gs
Gelezen: regels 1-326 (volledig)
Aspecten:
- null vs 0: OK regels 287-295. r-rubrieken: VONDST F-TAX-004. I₅: OK regel 295 (r5d = r5a − r5b).
- KIA/MKB/IB/Zvw/DGA/suppletie/bewaarplicht: n.v.t., export-formatter.
- AWR art. 8: OK regels 21, 79, 272-276.

### src/BTWReminder.gs
Gelezen: regels 1-305 (volledig)
Aspecten:
- null vs 0: n.v.t., leest alleen berekende velden. Rubriek-weergave: OK 238-254, VONDST F-TAX-005 (saldo als "5g").
- Deadlines: OK regels 23-27 (Q1→30 apr, Q4→31 jan); venster 14 dagen OK 64-65.
- Overig: n.v.t., reminder-dialog zonder fiscale berekening.

### src/EUVerkoop.gs
Gelezen: regels 1-355 (volledig)
Aspecten:
- Rubriek: OK regels 5-8, 282 (ICP correct aan 3b gekoppeld — in tegenstelling tot BTW.gs/BtwExport.gs).
- OSS-drempel €10.000: OK regels 19, 199. ICP-termijn: OK 282, 322. VIES graceful fail: OK 85-142.
- KIA/MKB/IB/Zvw/suppletie/bewaarplicht/DGA: n.v.t.

#### F-TAX-001 [HOOG] src/BTW.gs:229-230
Quote: `if (_isEuBuitenNlBtwNr_(btwNrKlant)) {` / `aangifte.r3a_grondslag += grondslag;`
Probleem: Intracommunautaire leveringen (ICL) horen op het OB-formulier in rubriek 3b, niet 3a (3a = export buiten EU). Code accumuleert ICL onder `r3a` en labelt dat op sheet (BTW.gs:561) en in export (BtwExport.gs:290) als "Leveringen binnen de EU (ICL)". Omdat de export 1-op-1 overgetypt wordt (BtwExport.gs:266), belandt het ICL-bedrag in de verkeerde rubriek → onjuiste aangifte + mismatch met ICP-opgaaf. EUVerkoop.gs:282 gebruikt wél correct 3b.
Fix: hernoem r3a_grondslag → r3b_grondslag overal; verifieer dat geen buiten-EU-export in deze tak valt.
Owner: Sam (dev)

#### F-TAX-002 [HOOG] src/BTW.gs:279-285
Quote: `if (/verlegd/i.test(btwLabel)) { aangifte.r4a_grondslag += grondslag; aangifte.r4a_btw += btwBedrag; } else if (btwBedrag > 0) { aangifte.r5b += btwBedrag;`
Probleem: bij inkoop met verlegde BTW is de ondernemer BTW verschuldigd (r4a → telt mee in r5a via regel 291) maar mag die BTW óók als voorbelasting (r5b) aftrekken — netto €0 voor volledig aftrekgerechtigde ZZP'er. De code telt verlegde BTW alleen bij r4a, niet bij r5b → saldo te betalen structureel te hoog voor elke ZZP'er met EU-inkopen/verlegde diensten.
Fix: in de verlegd-tak `aangifte.r5b += btwBedrag` toevoegen (pro-rata-toerekening waar relevant); verifieer tegen sluitBtwPeriode_-journaalpost (BTW.gs:689-699) die wél 4140↔4100 boekt.
Owner: Sam (dev)

#### F-TAX-003 [MIDDEL] src/BTW.gs:716-738
Quote: `snaps[jaar + '_' + kwartaal] = { saldo: aangifte.saldo, ... vastgelegdOp: new Date().toISOString(),`
Probleem: snapshot voor suppletie-detectie bevat geen indien-datum waartegen de wettelijke 8-weken-klok (boetevrij) kan lopen; zonder termijn-veld kan de detector geen "boetevrij venster verstreken"-waarschuwing geven.
Fix: veld voor (voorgenomen) indieningsmoment toevoegen; suppletie-detector toetst 8-weken-grens daartegen.
Owner: Sam (dev)

#### F-TAX-004 [MIDDEL] src/BtwExport.gs:290
Quote: `r3a: { naam: 'Leveringen naar landen binnen EU (IC)', grondslag: r(aangifte.r3a_grondslag), btw: 0 },`
Probleem: zelfde rubriek-verwarring als F-TAX-001 in het bestand dat de accountant letterlijk overtypt; r2a (289) en r3a overlappen begripsmatig op het echte formulier.
Fix: export-key + naam naar r3b zodra F-TAX-001 opgelost.
Owner: Sam (dev)

#### F-TAX-005 [MIDDEL] src/BTWReminder.gs:269-273
Quote: `<td class="code">5g</td>` / `<td><b>${aangifte.saldo > 0.005 ? 'Te betalen aan Belastingdienst' : ...}</b></td>`
Probleem: saldo-rij gelabeld als rubriek "5g" (= schatting vorige aangiften), terwijl het eindsaldo rubriek 5c/5d is. Tip op regel 278 instrueert klant expliciet "vul ze in bij ... 5g" → klant vult te-betalen-bedrag in verkeerd vakje. BtwExport.gs:295 gebruikt wel "5d".
Fix: code-cel en tip-tekst naar 5c/5d, consistent met BtwExport.gs.
Owner: Sam (dev)

Niet-vondsten ter bevestiging: I₅-som conform axioma; r3a (IC-grondslag) terecht buiten r5a-som; KOR €20.000 en OSS €10.000 correct 2026; parseBtwTarief_ null/0-scheiding conform danger-zone; pro-rata-noemer telt alleen écht-vrijgestelde omzet als beperkend (art. 15 Wet OB).

## Batch TAX-B — Belastingadvies.gs, TaxRegistry.gs

### src/Belastingadvies.gs
Gelezen: regels 1-1919 (volledig)
Aspecten:
- IB-schijven 2026: VONDST F-TAX-030 (schijf-2 0.3748 vs 0.3756 tegenstrijdig), F-TAX-031 (IB_SCHIJF_1_MAX naamgeving/fallback); IB_SCHIJVEN regel 167-176.
- Zelfstandigenaftrek 2026: OK regel 131 (1200). Startersaftrek: OK regel 132 (2123).
- Zvw 2026: VONDST F-TAX-032 (4,85% / €79.409 niet live gevalideerd; intern consistent met regel 1561).
- MKB-winstvrijstelling: VONDST F-TAX-033 (0.1270 "ongewijzigd" zonder bron). ORDE: OK regels 870-959 (KIA vóór MKB, art. 3.79a).
- KIA-staffel 2026: OK regels 303-309 + 549-558 (continu over zone-grenzen).
- Heffingskortingen: AHK OK 149-152 + 651-665; VONDST F-TAX-034 (arbeidskorting mist opbouwfase, 675-685 + 153-158).
- Urencriterium 1.225: OK regel 313 + gebruik 1224-1264.
- null vs 0: n.v.t. in IB-grondslag; wel VONDST F-TAX-035 (zonnepanelen-copy regel 1911).
- Jaartallen vs tariefsjaar: OK fallback 256-282 (laatstBekendJaar + placeholder-flag); VONDST F-TAX-036 (TARIEFSJAAR-fallback hardcoded 2026, regel 321).

### src/TaxRegistry.gs
Gelezen: regels 1-298 (volledig)
Aspecten:
- IB/zelfstandigenaftrek/Zvw/MKB/KIA/heffingskortingen/urencriterium: n.v.t., registry bevat alleen TAX-BTW-001 + TAX-ADM-001 (slice-1, regel 11).
- null vs 0: n.v.t., TAX-BTW-001 is datum-arithmetiek (registry_values: null regel 31).
- Jaartallen: OK valid_from_year/valid_until_year per regel (27-28, 41-42); bewaartermijn 7/10 jaar (46-49) conform art. 52 AWR; BTW-deadline-logica (130-153) consistent. Geen vondsten.

#### F-TAX-030 [HOOG] src/Belastingadvies.gs:169
Quote: `{ tot: 79137,    pct: 0.3756 },  // schijf 2`
Probleem: schijf-2-tarief 2026 staat op 37,56% terwijl 2025-config 0.3748 heeft (regel 111) en er geen bronregel is die de 2026-verhoging staaft; marginaalIbTarief_-doc (608) en banner (602) herhalen 37,56% zonder bron. Schijf 2 raakt elke ZZP'er met winst €38.883–€79.137 direct in geschatteIB.
Fix: verifieer definitief 2026-tarief op belastingdienst.nl; zet IB_SCHIJVEN[1].pct + IB_SCHIJVEN_AOW[1].pct (169, 174) eenduidig met bron-comment.
Owner: Sam (dev)

#### F-TAX-031 [MIDDEL] src/Belastingadvies.gs:146
Quote: `IB_SCHIJF_1_MAX:        79137,   // bovengrens schijf 2`
Probleem: legacy-sleutel heet IB_SCHIJF_1_MAX maar bevat de bovengrens van schijf 2; fallback in berekenIBProgressief_ (578-580) en marginaalIbTarief_ (617) belast bij corrupt/override-array alles tot €79.137 tegen 35,7% → forse onderbelasting schijf-2-inkomen.
Fix: hernoem of laat fallback de IB_SCHIJVEN-array reconstrueren; unit-test voor legacy-fallback.
Owner: Sam (dev)

#### F-TAX-032 [MIDDEL] src/Belastingadvies.gs:159
Quote: `ZVW_PCT:                0.0485,` / `ZVW_MAX_INKOMEN:        79409,`
Probleem: Zvw 2026-waardes niet tegen live bron gevalideerd (belastingdienst.nl fetch gaf 403); intern consistent (0,0485×79409=€3.851, regel 1561) maar niet onafhankelijk gestaafd; telt direct mee in totaleFiscaleLast (1325).
Fix: handmatig verifiëren op belastingdienst.nl/zvw; bevestigingsdatum als comment.
Owner: Sam (dev)

#### F-TAX-033 [HOOG] src/Belastingadvies.gs:134
Quote: `MKB_WINSTVRIJSTELLING:  0.1270,  // Ongewijzigd t.o.v. 2025`
Probleem: MKB-vrijstelling 2026 op 12,70% met onbewezen aanname "ongewijzigd", terwijl het percentage de afgelopen jaren stapsgewijs verlaagd is (2024 13,31% → 2025 12,70%) en verdere verlaging in het Belastingplan-traject is aangekondigd. Te hoge vrijstelling → IB-onderschatting → naheffingsrisico.
Fix: definitief 2026-percentage verifiëren op belastingdienst.nl; bron-comment.
Owner: Sam (dev)

#### F-TAX-034 [MIDDEL] src/Belastingadvies.gs:682
Quote: `if (inkomen <= topTot) return rondBedrag_(max);` / `const verlaging = (inkomen - afbouwVan) * afbouwPct;`
Probleem: berekenArbeidskorting_ mist de opbouwfase volledig (korting is niet vanaf €0 al maximaal); voor lage winst wordt arbeidskorting overschat → geschatteIB te laag (1321). Functiedoc erkent "vereenvoudigd model" (668) maar effect verlaagt een getoond belastingbedrag.
Fix: opbouw-knik toevoegen of in UI expliciet als bovengrens-schatting labelen.
Owner: Sam (dev) + accountant (communicatie)

#### F-TAX-035 [LAAG] src/Belastingadvies.gs:1911
Quote: `Zonnepanelen op uw eigen woning zijn BTW-vrij (0% BTW bij aankoop, mits u terugleverd).`
Probleem: mengt "BTW-vrij" (vrijgesteld) met 0%-tarief (nultarief) en stelt ten onrechte terugleveren als voorwaarde; sinds 2023 geldt het nultarief op aanschaf/installatie bij de eigen woning zonder dat vereiste. Ook spelfout "terugleverd".
Fix: herformuleren naar nultarief-formulering zonder terugleververeiste.
Owner: accountant (communicatie)

#### F-TAX-036 [LAAG] src/Belastingadvies.gs:321
Quote: `TARIEFSJAAR:            heeftJaarTarieven ? jaar : 2026,`
Probleem: fallback-TARIEFSJAAR hardcoded 2026 terwijl tarief-fallback dynamisch laatstBekendJaar gebruikt (256-263); bij ontbrekende toekomstjaren toont de klant-tekst (1901, 768) en snapshot-meta (1336) een ander jaar dan de werkelijk gebruikte tabel.
Fix: `TARIEFSJAAR: heeftJaarTarieven ? jaar : laatstBekendJaar`.
Owner: Sam (dev)

Positief geverifieerd (TAX-B): KIA-staffel 2026 correct en continu; KIA-vóór-MKB-volgorde juist; zelfstandigenaftrek €1.200 en urencriterium 1.225 correct; TaxRegistry bewaarplicht 7/10 jaar correct. Niet live te valideren (403 op belastingdienst.nl): F-TAX-030/032/033 → handmatige check vereist.

## Batch TAX-C — Belastingvoordeel.gs, BelastingOptimizer.gs, Fiscaal.gs
Cross-ref basis: canonical config Belastingadvies.gs regels 303-315, 70-73/131-134/186-189, berekenKiaAftrek_ 549-557.

### src/Belastingvoordeel.gs
Gelezen: regels 1-1146
Aspecten:
- KIA-staffel 2026: OK 1110-1117 (simuleerWatAls_ delegeert naar canonical berekenKiaAftrek_); UI-grenzen €2.901/€71.683/28%/€20.072 OK 212-213, 383-384. VONDST F-TAX-061 (KIA_MIN-fallback in tip-engine).
- MIA/EIA: n.v.t. (alleen tekst "27-45%"/"40%" 213/214/1046, consistent met canonical).
- MKB-orde: VONDST F-TAX-062 (wat-als mist MKB-vrijstelling in grondslag, 1126-1133).
- IB/heffingskortingen: OK 43-46 (config+fallback), 804-807/1128-1131 (delegatie). VONDST F-TAX-060 (fallback-keys/waardes wijken af).
- Zelfstandigenaftrek: VONDST F-TAX-063 (hardcoded €2.470 in tip). Urencriterium OK 131, 193.
- €450-drempel: OK 1026-1027 (B.ACTIVEER_GRENS, fallback 450). Afschrijving: n.v.t. BTW null vs 0: n.v.t. (753-773 boekt alleen positieve bedragen). Suppletie/bewaarplicht: OK tekstueel 196, 215, 918.

### src/BelastingOptimizer.gs
Gelezen: regels 1-289
Aspecten:
- KIA: OK 49-51, 105, 124-125 (delegatie). VONDST F-TAX-064 (LP-variant negeert afbouwzone).
- IB: VONDST F-TAX-065 (default 0.3693). €450/bedrijfsmiddel: VONDST F-TAX-066. MIA/EIA/MKB/zelfstandigenaftrek/afschrijving/BTW/suppletie: n.v.t.

### src/Fiscaal.gs
Gelezen: regels 1-447
Aspecten:
- KIA: OK 44-62 (delegatie + config-velden). MIA/EIA: OK 67-82 (mutual exclusion 79); VONDST F-TAX-067 (MIA hardcoded fallback 0.36).
- IB-display: OK 90-91. Stakingsaftrek-urencriterium-tekst OK 176-178. €450: VONDST F-TAX-068. BTW null vs 0: n.v.t. (232-234 saldo-vergelijking).
- Suppletie: VONDST F-TAX-069 (termijn-communicatie). DGA: VONDST F-TAX-070 (fallback 56000, regel 17).

#### F-TAX-060 [MIDDEL] src/Belastingvoordeel.gs:43-46
Quote: `const effectiefTarief = winst > 0 ? ib / winst : (BELASTING.IB_SCHIJF_1_PCT || 0.3582);` / `const marginaalTarief = winst > BELASTING.IB_SCHIJF_1_MAX ? (BELASTING.IB_SCHIJF_2_PCT || 0.495) : effectiefTarief;`
Probleem: fallback-keys IB_SCHIJF_1_PCT/IB_SCHIJF_1_MAX/IB_SCHIJF_2_PCT bestaan niet in de canonical IB_SCHIJVEN-structuur; `winst > undefined` is altijd false ⇒ marginaaltarief valt altijd terug op gemiddeld tarief ⇒ besparingsbedragen op dashboard te laag voor hoge winsten. Fallback 0.495 staat bovendien op de plek van "schijf 2".
Fix: marginaaltarief uit canonical IB_SCHIJVEN (zelfde bron als berekenIBProgressief_).
Owner: Sam (dev)

#### F-TAX-061 [LAAG] src/Belastingvoordeel.gs:1052-1053
Quote: `if (bedrag >= ((B && B.KIA_MIN) || 2901) - 500 && bedrag < ((B && B.KIA_MIN) || 2901)) {`
Probleem: tweede plek met hardcoded 2901; bij Prinsjesdag-wijziging stil afwijkend van config (single-source-of-truth-doel).
Fix: centrale KIA_MIN-getter.
Owner: Sam (dev)

#### F-TAX-062 [HOOG] src/Belastingvoordeel.gs:1126-1133
Quote: `const belastbaar = Math.max(0, nieuw.winst - nieuw.aftrek);` / `const ibBruto = berekenIBProgressief_(belastbaar, BELASTING, aow);`
Probleem: wat-als-simulator past geen MKB-winstvrijstelling toe ná ondernemersaftrek (wettelijke volgorde: winst − ondernemersaftrek − 12,7% MKB = belastbaar) ⇒ IB op extra omzet ~12,7% van grondslag overschat ⇒ "netto effect" (1143) te pessimistisch en inconsistent met hoofdberekening ernaast (344-348).
Fix: zelfde MKB-stap als hoofdberekening of gedeelde grondslag-naar-IB-functie.
Owner: Sam (dev)

#### F-TAX-063 [HOOG] src/Belastingvoordeel.gs:146
Quote: `zelfstandigenaftrek (€2.470), startersaftrek (€2.123 eerste 3 jaar),`
Probleem: hardcoded €2.470 (2025-bedrag) in maart-tip terwijl canonical 2026-config expliciet `ZELFSTANDIGENAFTREK: 1200, // Verlaagd per 2026 (was €2.470 in 2025)` (Belastingadvies.gs:131). Klant verwacht te hoge aftrek.
Fix: literal vervangen door BELASTING.ZELFSTANDIGENAFTREK/STARTERSAFTREK van het relevante belastingjaar.
Owner: Sam (dev)

#### F-TAX-064 [MIDDEL] src/BelastingOptimizer.gs:198-220
Quote: `engine.setObjectiveCoefficient('x_' + i + '_' + t, investeringen[i].bedrag * kiaPct);`
Probleem: LP-variant maximaliseert lineair bedrag×0.28 en negeert drempel (<€2.901 = 0%), plafond (€20.072) en afbouwzone; lpStatus:'OPTIMAL' (220) suggereert exactheid terwijl advies in drempel/afbouw-scenario's fout kan zijn.
Fix: LP alleen voor gegarandeerd-lineaire zone, anders brute-force; of benadering expliciet labelen.
Owner: Sam (dev)

#### F-TAX-065 [LAAG] src/BelastingOptimizer.gs:90-91
Quote: `const tarief = (isFinite(marginaalTarief) && marginaalTarief > 0 && marginaalTarief < 1) ? marginaalTarief : 0.3693;`
Probleem: default 0.3693 (+ docstring "36.93% box 1 tot €76.817 in 2026") matcht de schijf-2-baseline (37,48%) niet; display-/schattingswaarde te laag.
Fix: default uit canonical IB-schijven of verplicht uit getBelasting_().
Owner: Sam (dev)

#### F-TAX-066 [MIDDEL] src/BelastingOptimizer.gs:101-105
Quote: `const b = investeringen[i].bedrag;` / `if ((mask >> i) & 1) sN1 += b; else sN += b;` / `const aftrek = kiaAftrekVoorTotaal_(sN, B) + kiaAftrekVoorTotaal_(sN1, B);`
Probleem: investeringen < €450 (art. 3.45 Wet IB) tellen ten onrechte mee in het KIA-jaartotaal ⇒ te hoog KIA-totaal en onjuist timing-advies.
Fix: filter/waarschuw bij bedrag < B.ACTIVEER_GRENS.
Owner: Sam (dev)

#### F-TAX-067 [LAAG] src/Fiscaal.gs:67-73
Quote: `const pct = parseFloat(inv.miaPct) || 0.36;` / `return rondBedrag_(parseFloat(inv.bedrag) * pct);`
Probleem: MIA-percentage uit UI-input met hardcoded fallback 0.36, niet config-driven (EIA leest wél B.EIA_PCT, regel 80); RVO-percentages (27/36/45) wijzigen jaarlijks; dropdown (121-125) en fallback op meerdere plekken.
Fix: MIA_PCT_LIJST in BELASTING_PER_JAAR; dropdown + fallback daaruit.
Owner: Sam (dev)

#### F-TAX-068 [MIDDEL] src/Fiscaal.gs:44-45
Quote: `const totaalJaar = parseFloat(inv.totaalKiaJaar) || bedrag;` / `const kia = (typeof berekenKiaAftrek_ === 'function') ? berekenKiaAftrek_(totaalJaar, B) : 0;`
Probleem: berekenInvesteringsAftrek past de €450-per-bedrijfsmiddel-uitsluiting niet toe; investering van €300 krijgt MIA (67-73) en telt mee in KIA-totaal ⇒ te hoog aftrekbedrag in stapeling-dialog.
Fix: bij bedrag < B.ACTIVEER_GRENS KIA/MIA/EIA = 0 met uitleg.
Owner: Sam (dev)

#### F-TAX-069 [MIDDEL] src/Fiscaal.gs:314-315 (+256-258, 360)
Quote: `'in te dienen bij de Belastingdienst (binnen 5 jaar; de eerste 8 weken zonder boete).\n\n' +`
Probleem: termijn-communicatie mengt naheffingstermijn (5 jaar, art. 20 AWR) met boetevrij venster (8 weken ná ontdekking); tekst koppelt 8 weken niet aan ontdekkingsmoment ⇒ klant kan denken na maanden nog boetevrij te zijn (risico 30% verzuimboete + rente). Mail-subject (325/327) is correcter.
Fix: eenduidige formulering hergebruiken in mail, sheet-header en docstring.
Owner: accountant (communicatie)

#### F-TAX-070 [LAAG] src/Fiscaal.gs:17
Quote: `const DGA_MIN_SALARIS_FALLBACK = 56000;   // last-resort indien getBelasting_ niet beschikbaar`
Probleem: hardcoded gebruikelijkloon-fallback €56.000 (2024-bedrag); 2026-bedrag niet gevalideerd (belastingdienst.nl onbereikbaar in audit); checkDgaSalaris_ (409-425) waarschuwt op basis hiervan.
Fix: 2026-bedrag verifiëren + in jaar-config; fallback alleen noodanker.
Owner: Sam (dev) + accountant (validatie bedrag)

Verdict TAX-C: ⚠️ ZORGEN — F-TAX-062/063 vóór release fixen; KIA-kernberekening zelf delegeert overal correct naar canonical berekenKiaAftrek_ (2026-baseline exact).

## Batch TAX-D — Boekingen.gs, Config.gs, Jaarafsluiting.gs

### src/Boekingen.gs
Gelezen: regels 1-1480
Aspecten:
- null vs 0: OK 1153-1179 + 110-112 (bepaalOmzetRekening_ 21→8000, 9→8010, 0%→8020, Vrijgesteld→8030, Verlegd→8040; null/undefined toont 'Geen', niet '0%').
- BTW-grootboekrekeningen: OK 1165-1179 (verkoop 4110/4120/4100 passief; voorbelasting 1410/1420/1400 actief; default nooit met bedrag geboekt — gated op btwBedrag>0, geverifieerd Verkoopfacturen.gs:417 + storno-pad 251).
- r-rubrieken: n.v.t. (in BTW.gs). KIA/MKB/IB/Zvw: n.v.t. Suppletie/bewaarplicht: OK 1399-1403 (storno behoudt origineel 191-197; ontgrendeling duurzaam gelogd).
- Jaarafsluiting: n.v.t. hier; 40-51 blokkeert boeking in afgesloten jaar.
- Hardcoded: zie F-TAX-092 (Config).

### src/Config.gs
Gelezen: regels 1-346
Aspecten:
- null vs 0: OK 48-62 (BTW.NUL.tarief=0.00; VRIJGESTELD/VERLEGD tarief=null; labels matchen bepaalOmzetRekening_).
- BTW-rekeningen: OK 141-143, 166-168 (1400-reeks actief; 4100-reeks passief).
- Fiscale waardes: VONDST F-TAX-092 (€0,23/km, 73,5%, €450 hardcoded in rekeningnamen). Urencriterium: OK 39-42 (UREN-sheet).
- Jaarafsluiting-rekeningen: OK 155-156 (2500/2600 Passief/EV); 2400 Privéonttrekkingen type Actief/cat EV — atypisch maar bewust, geen fout.

### src/Jaarafsluiting.gs
Gelezen: regels 1-200
Aspecten:
- BTW: n.v.t. (W&V-filter regel 41 sluit balansrekeningen terecht uit). KIA/IB: n.v.t. Suppletie: n.v.t.
- Resultaatverwerking: OK 29-200 (opbrengst debet=code/credit=2500 50-54; kosten debet=2500/credit=code 57-61; overdracht 2500↔2600 winst 89-93 vs verlies 96-100; idempotentie JA-{jaar} 127-136/146-154; pre-flight hard-fail 162-171; jaar-validatie 31/77).

#### F-TAX-090 [MIDDEL] src/Boekingen.gs:251
Quote: `btwTarief:    null,              // BTW-storno aparte handling — niet hier`
Probleem: maakStornoJournaalpost_ storneert alleen de hoofd-journaalpost; de bij verkoop/inkoop apart geboekte BTW-regel (Verkoopfacturen.gs:405-430 / Triggers.gs:721-728) blijft in het grootboek (4110/1410) staan. _markeerFactuurGestorneerd_ (296) houdt de aangifte correct (factuur-gebaseerd), maar het grootboeksaldo wordt niet teruggedraaid ⇒ zwevende BTW-schuld/-vordering, balans-discrepantie bij controle.
Fix: gekoppelde BTW-journaalpost detecteren (zelfde ref) en separaat tegenboeken, of storno op factuur-boekingen via creditnota afdwingen.
Owner: Sam (dev)

#### F-TAX-091 [LAAG] src/Boekingen.gs:787-788
Quote: `debet: code.startsWith('02') ? '7720' : '7710',` / `credit: code.startsWith('01') ? '0190' : '0290',`
Probleem: afschrijvings-prefix-mapping asymmetrisch (debet op '02', credit op '01'); binnen standaardschema consistent, maar niet-standaard activacodes vallen stil op verkeerde default ⇒ verkeerde W&V-toewijzing mogelijk.
Fix: beide keuzes op dezelfde prefix-bron of activacode valideren (01xx/02xx) vóór boeking.
Owner: Sam (dev)

#### F-TAX-092 [MIDDEL] src/Config.gs:208,220,235
Quote: `{ code:'7350', naam:'Reiskosten eigen vervoer (€0,23/km)', ... }` / `{ code:'7520', naam:'Representatiekosten (73,5% aftrekbaar)',...}` / `{ code:'7940', naam:'Kleine aanschaffingen (< €450)', ... }`
Probleem: fiscale waardes hardcoded in rekening-NAMEN (display-only, geen rekenfout) — bij wetswijziging tonen namen verouderde grenzen ⇒ foutieve handmatige invoer. Waardes niet 2026-gevalideerd (extern onbereikbaar in audit).
Fix: jaartal-suffix of bedragen uit namen verwijderen; centrale jaar-constante.
Owner: Sam (dev) + accountant (validatie 2026)

#### F-TAX-093 [LAAG] src/Jaarafsluiting.gs:88-93
Quote: `debet: REKENING_RESULTAAT_BOEKJAAR, credit: REKENING_ONVERDEELDE_WINST,`
Probleem: bevestigde correctheid met fragiele preconditie — overdracht op 01-01-N+1 passeert de JA-guard alleen doordat resultaatverwerking op 31-12-N gedateerd is (regel 35); wijziging van die datum-keuze zou de flow breken. Geen fix vereist.
Fix: optionele test die borgt dat resultaatverwerking-datum altijd 31-12 is.
Owner: Sam (dev, optioneel)

Geen BLOCKER/HOOG in TAX-D. null-vs-0 overal correct; jaarafsluiting fiscaal correct opgezet.

## Batch TAX-H — boete/suppletie-tests + .claude-artefacten

### tests/unit/red-team-belastingdienst-boete.test.js
Gelezen: regels 1-151. Tarief-verwachtingen Tabel I OK (21-65); randen OK (67-76, 125-149); VONDST F-TAX-170. Boete/suppletie-termijnen: n.v.t. (toetst tariefverdenking).

### tests/unit/v3-suppletie-proactief.test.js
Gelezen: regels 1-243. €1.000-drempel correct (71-94, conform Uitv.besl. OB art. 15); 30% verzuim correct (7-9); randen OK (88-100, 160-234); VONDST F-TAX-171 (exact-€1.000-rand ongetest).

### .claude/invariants.md
Gelezen: regels 1-251. null vs 0 OK (14-22, 37-43); afronding OK (123-141); VONDST F-TAX-172 (verlegd-classificatie mist binnenland/EU/buiten-EU-onderscheid).

### .claude/wiskundige-fundering.md
Gelezen: regels 1-134. VONDST F-TAX-173 (I₅-som telt r1e_btw mee — tegenstrijdig met invariants.md "1e grondslag only"); VONDST F-TAX-174 (alfabet Σ sluit null uit); r5a-afronding op €1 OK (54).

#### F-TAX-170 [MIDDEL] tests/unit/red-team-belastingdienst-boete.test.js:39-42
Quote: `test('ATTACK 4: Catering 21% → verdacht (laag tarief)', () => {` / `const r = ctx.checkBtwTariefVerdacht_('Catering Q4 borrel', 0.21);` / `expect(r).not.toBeNull();`
Probleem: test verankert "alle catering = 9%" als harde waarheid; alcoholhoudende dranken zijn 21% (Tabel I post b.12-uitzondering) ⇒ correcte 21%-borrelfactuur wordt "verdacht". Idem ATTACK 1: niet elk "Boekje" kwalificeert. Heuristiek mag nooit blokkeren.
Fix: assertie verzwakken tot "hint aanwezig" + alcohol als bekende false-positive documenteren; nooit hard blokkeren.
Owner: Sam (dev)

#### F-TAX-171 [LAAG] tests/unit/v3-suppletie-proactief.test.js:96-100
Quote: `const { ctx } = maakCtx({ [`${jaar}_Q1`]: { saldo: 2000 } }, 2000.30);` / `expect(ctx.detecteerSuppletieMogelijk_()).toEqual([]);`
Probleem: wettelijke rand op exact €1.000 (Uitv.besl. OB art. 15) ongetest; `>` vs `>=` is een echte 1-euro fiscale grens.
Fix: tests op €999,99 / €1.000,00 / €1.000,01.
Owner: Sam (dev)

#### F-TAX-172 [HOOG] .claude/invariants.md:31-32
Quote: `'Verlegd' (verkoop)       → r1e (grondslag only)` / `'Verlegd' (inkoop)        → r4a (grondslag + btw)`
Probleem: canonical classificatie-tabel mist onderscheid binnenland (verkoop→1e / inkoop→2a) vs EU-B2B (→3b + ICP-opgaaf, art. 37a Wet OB) vs buiten-EU/invoer (→4a/4b); interne r4a-naam voor binnenlandse verlegging wijkt af van officiële rubriek 2a. Bestand claimt zelf "legally significant — do not guess".
Fix: verlegd-regels splitsen per scenario; elke interne r-naam tegen actuele OB-rubrieknummers verifiëren met bron-datum.
Owner: Sam (dev) + accountant-verificatie

#### F-TAX-173 [HOOG] .claude/wiskundige-fundering.md:51
Quote: `A.r5a = A.r1a_btw + A.r1b_btw + A.r1c_btw + A.r1e_btw + A.r4a_btw`
Probleem: I₅-som telt r1e_btw mee terwijl invariants.md regel 30 zegt dat 1e "grondslag only" is (door u verlegde verkoop draagt geen af te dragen btw) — interne tegenstrijdigheid tussen twee canonical bronnen; stuurt I₅-implementatie fout. (Officieel: r5a = btw 1a-1d + 2a + 4a/4b.)
Fix: r1e_btw uit de som; formule exact uitlijnen met OB-rubriek-optelling én invariants.md; 🛑 tot beide overeenstemmen.
Owner: Sam (dev) + accountant-verificatie

#### F-TAX-174 [MIDDEL] .claude/wiskundige-fundering.md:5
Quote: `BTW-tarieven ∈ {0, 0.09, 0.21}`
Probleem: alfabet Σ sluit null (vrijgesteld/verlegd) uit — directe tegenspraak met kern-invariant null≠0 (invariants.md 20-22, idem regel 47 I₄) ⇒ property-based tests genereren het juridisch kritische null-geval nooit.
Fix: Σ en I₄ uitbreiden naar {null, 0, 0.09, 0.21} met expliciete null-noot.
Owner: Sam (dev)

## Batch TAX-F — fiscale tests 1

### tests/unit/audit2-fiscaal-high.test.js — Gelezen: 1-141. VONDST F-TAX-130. Randen OK (129-140).
### tests/unit/belasting-optimizer.test.js — Gelezen: 1-187. KIA config-driven OK (45-50); ordening-claim robuust (77-97); randen OK (109-118, 141-148). VONDST F-TAX-131.
### tests/unit/belasting-overrides.test.js — Gelezen: 1-166. null vs 0 OK (42-54); strikte %-regel OK (65-84); randen OK (86-93). Geen vondsten.
### tests/unit/belastingadvies-helpers.test.js — Gelezen: 1-160. KIA absoluut gepind conform 2026-baseline (28-35: 2901/71683/20072/132747/0,0756/398236) + zone-randen volledig (37-45). VONDST F-TAX-132 (IB-schijven niet gepind).
### tests/unit/belastingadvies-zvw-heffingskorting.test.js — Gelezen: 1-207. Randen OK (42-50, 63-81, 102-118); EU-BTW-nr OK (166-207). VONDST F-TAX-133.
### tests/unit/btw-classificatie-robust.test.js — Gelezen: 1-164. verlegd→r1e / r4a→r5a (I₅) correct (47-91, 160-163); case-varianten OK. VONDST F-TAX-134.
### tests/unit/btw-export.test.js — Gelezen: 1-235. null vs 0 OK (128-136: r5x grondslag null vs r1d_nul 0); randen OK (88-93, 138-148); disclaimer AWR art. 8 aanwezig (105-109). Geen vondsten.
### tests/unit/cycle55-kor-verlegd-mutual-exclusive.test.js — Gelezen: 1-81. KOR×verlegd exclusiviteit juridisch correct; alle 16 combinaties exhaustief (65-80). Geen vondsten.

#### F-TAX-130 [LAAG] tests/unit/audit2-fiscaal-high.test.js:79-93
Quote: `expect(blok).toMatch(/TODO audit-ronde 2/);` … `expect(btw).toMatch(/art\. 15 Wet OB/);`
Probleem: test cementeert open fiscale gaten (I₇ blokkeert niet; inkoop-bijlage niet verplicht) als verwacht gedrag — geborgde fout zonder vervaldatum.
Fix: tracking-issue met deadline aan beide TODO's.
Owner: Sam (dev)

#### F-TAX-131 [LAAG] tests/unit/belasting-optimizer.test.js:109-118
Quote: `{ naam: 'usb-hub', bedrag: 50 }, { naam: 'webcam', bedrag: 80 }`
Probleem: €450-per-bedrijfsmiddel-uitsluiting (art. 3.41/3.45 Wet IB) ongetest; €440 vs €460 scenario ontbreekt.
Fix: test met items net onder/boven €450.
Owner: Sam (dev)

#### F-TAX-132 [MIDDEL] tests/unit/belastingadvies-helpers.test.js:100-158
Quote: `const inkomen = Math.floor(B.IB_SCHIJVEN[0].tot / 2);` … `.toBeCloseTo(inkomen * B.IB_SCHIJVEN[0].pct, 2);`
Probleem: IB-tests volledig config-relatief (anders dan KIA, die bewust absoluut gepind is) ⇒ verkeerde 2026-schijfwaarde blijft groen; config (38.883/35,7%/79.137/37,56%) wijkt af van baseline (38.441/35,82%/76.817/37,48%) — precies wat deze test had moeten vangen.
Fix: absolute pinning-test na bevestiging tegen belastingdienst.nl.
Owner: Sam (dev) + accountant

#### F-TAX-133 [MIDDEL] tests/unit/belastingadvies-zvw-heffingskorting.test.js:37-49
Quote: `expect(ctx.berekenZvw_(w, B)).toBeCloseTo(w * B.ZVW_PCT, 2);`
Probleem: Zvw/heffingskortingen/arbeidskorting volledig config-relatief, geen absolute pinning; formule-aanname (winst×pct met cap) nergens extern verankerd.
Fix: ZVW_PCT, ZVW_MAX_INKOMEN en kortings-maxima absoluut pinnen na verificatie.
Owner: Sam (dev) + accountant

#### F-TAX-134 [MIDDEL] tests/unit/btw-classificatie-robust.test.js:56-70
Quote: `vfRij(new Date('2026-02-01'), 500, 'VRIJGESTELD', 0)` … `expect(r.r1d).toBeCloseTo(500, 1);`
Probleem: test assert alleen gecombineerde r1d; splitsing r1d_vrijgesteld vs r1d_nul (pro-rata-relevant, BTW.gs 219-223/308-322) niet bewaakt op het echte classificatie-pad ⇒ regressie (nultarief in vrijgesteld-emmer ⇒ te lage voorbelasting) blijft groen.
Fix: asserts op de interne splitsingsvelden toevoegen.
Owner: Sam (dev)

## Batch TAX-E — Onboarding, Prive, FormeelBewijs, Urenregistratie, XafExport

### src/Onboarding.gs — Gelezen: 1-959. KIA-wizard/KOR/BTW-frequentie: n.v.t. (niet aanwezig). VONDSTEN F-TAX-110..114 (hardcoded fiscale help-bedragen, niet via getBelasting_).
### src/Prive.gs — Gelezen: 1-519. Privé zonder BTW/journaalpost correct (179-234); tarieven primair via getBelasting_ (311-317). VONDSTEN F-TAX-115..117 (2025-fallbacks; Box3-drempel in label maar niet in rekenkern).
### src/FormeelBewijs.gs — Gelezen: 1-539. I₆ art. 35 OK (324-345); I₇ post-hoc bewust (350-396); I₈ OK (401-441). VONDSTEN F-TAX-118 (I₅ dekt alleen BTW-bedrag-sluiting, niet rubriek-classificatie), F-TAX-119 (I₄-domein mist null).
### src/Urenregistratie.gs — Gelezen: 1-145. Jaargrens OK (124); communicatie art. 3.6 OK (7-12). F-TAX-120 (drempel 1.225 alleen in commentaar; vergelijking elders — cross-check).
### src/XafExport.gs — Gelezen: 1-393. Bewaarplicht-claim OK (6-7); curCode OK (160). VONDSTEN F-TAX-121 (jaar hardcoded huidig), F-TAX-122 (BTW-data niet geëxporteerd), F-TAX-123 (accTp-heuristiek i.p.v. bw-kolom).

#### F-TAX-110 [HOOG] src/Onboarding.gs:191
Quote: `<div class="help">Voor startersaftrek (€2.123 in eerste 3 jaar)...</div>`
Probleem: hardcoded bedrag verwart zelfstandigenaftrek en startersaftrek-verhoging; loopt niet via getBelasting_(); niet 2026-gevalideerd ⇒ onjuist reserveringsadvies.
Fix: correcte 2026-waarden uit getBelasting_(); onderscheid expliciet maken.
Owner: Sam (dev) + accountant

#### F-TAX-111 [MIDDEL] src/Onboarding.gs:190-191
Quote: `startersaftrek (€2.123 in eerste 3 jaar)`
Probleem: startersaftrek geldt max. 3× in eerste 5 jaar (niet "eerste 3 jaar") en vereist urencriterium — beide ontbreken.
Fix: tekst corrigeren.
Owner: accountant + Sam

#### F-TAX-112 [MIDDEL] src/Onboarding.gs:185
Quote: `AOW-gerechtigden krijgen lager schijf-1-tarief (~17,8% i.p.v. 35,7%).`
Probleem: 35,7% wijkt af van eigen norm 35,82% (Prive.gs:304 gebruikt 0,3582) — interne inconsistentie; AOW-tarief niet 2026-gevalideerd.
Fix: uit getBelasting_; consistent maken.
Owner: Sam + accountant

#### F-TAX-113 [HOOG] src/Onboarding.gs:191,218
Quote: `starterbonus WBSO (€7.996 eerste 5 jaar)` … `WBSO-aftrek mogelijk (€15.979 + starterbonus)`
Probleem: twee hardcoded WBSO-bedragen in klant-tekst; RVO stelt jaarlijks vast; niet 2026-gevalideerd ⇒ onjuiste verwachting.
Fix: via config of vervangen door verwijzing rvo.nl/wbso.
Owner: Sam + accountant

#### F-TAX-114 [MIDDEL] src/Onboarding.gs:225
Quote: `Bij staking dit jaar: stakingsaftrek €3.630 (eenmalig per leven)...`
Probleem: hardcoded; niet 2026-gevalideerd ("eenmalig per leven" is correct).
Fix: valideren of uit config.
Owner: accountant

#### F-TAX-115 [MIDDEL] src/Prive.gs:303-305
Quote: `[ { tot: 38441, pct: 0.3582 }, { tot: 76817, pct: 0.3748 }, { tot: Infinity, pct: 0.495 } ]`
Probleem: fallback-schijfgrenzen zijn 2025-waarden (commentaar 299-300 erkent dit) maar titel toont huidig jaar ⇒ bij lege getBelasting_ krijgt klant 2025-grenzen als huidig gelabeld.
Fix: fallback bijwerken of "schatting o.b.v. 2025" tonen.
Owner: Sam + accountant

#### F-TAX-116 [LAAG] src/Prive.gs:315-317
Quote: `_box3Vrij = (_B && _B.BOX3_HEFFINGSVRIJ) || 57684; _box3Forf = ... || 0.0588; _box3Tar = ... || 0.36;`
Probleem: Box3-fallbacks 2025; stelsel in beweging; disclaimers mitigeren.
Fix: bijwerken bij definitieve 2026-parameters.
Owner: Sam + accountant

#### F-TAX-117 [LAAG] src/Prive.gs:376
Quote: `<label>Schulden die aftrekbaar zijn in Box 3 (boven €3.700 drempel)</label>`
Probleem: drempel hardcoded én niet toegepast in rekenkern (regel 432 trekt 1-op-1 af) ⇒ label en logica inconsistent; schatting kan te hoog aftrekken.
Fix: drempel toepassen of claim uit label.
Owner: Sam + accountant

#### F-TAX-118 [HOOG] src/FormeelBewijs.gs:39,299
Quote: `const r5aBerekend = (a.r1a_btw || 0) + (a.r1b_btw || 0) + (a.r1c_btw || 0) + (a.r1e_btw || 0) + (a.r4a_btw || 0);`
Probleem: I₅ valideert alleen BTW-bedrag-aansluiting; misclassificatie van grondslag (21% vs vrijgesteld) sluit nog steeds op r5a ⇒ checker presenteert "I₅ OK" terwijl rubriek-classificatie fout kan zijn — dekkingsgat.
Fix: aanvullende grondslag-consistentie-check of expliciet documenteren wat I₅ wél/niet verifieert.
Owner: Sam + accountant

#### F-TAX-119 [MIDDEL] src/FormeelBewijs.gs:36
Quote: `F.btwBedrag = F.bedragExcl × F.btwTarief  (waar btwTarief ∈ {0, 0.09, 0.21})`
Probleem: I₄-domein mist null (vrijgesteld/verlegd) — strijdig met CLAUDE.md danger-zone null≠0 (consistent met F-TAX-174 in wiskundige-fundering.md).
Fix: domein uitbreiden met null + semantiek-noot.
Owner: Sam + accountant

#### F-TAX-120 [MIDDEL] src/Urenregistratie.gs:1-25,110-130
Quote: `bewijslast voor het 1.225-uren-criterium (art. 3.6 Wet IB)` … `function totaalUrenInBoekjaar_(ss, jaar) { ... }`
Probleem: drempel 1.225 alleen in commentaar; aggregator vergelijkt nooit; consument (Belastingadvies.gs) moet exact 1.225 hanteren — geen waarborg hier.
Fix: cross-check consument; geen wijziging in dit bestand nodig.
Owner: accountant (cross-check)

#### F-TAX-121 [MIDDEL] src/XafExport.gs:56,144
Quote: `const jaar = new Date().getFullYear();`
Probleem: exportjaar hard gekoppeld aan huidig kalenderjaar (header + transactie-filter 320/331) ⇒ 2026-auditfile in januari 2027 onmogelijk; exit-route faalt voor afgesloten jaren. (Consistent met F-ACC-030.)
Fix: jaar-keuze (dialog/parameter), default huidig.
Owner: Sam (dev)

#### F-TAX-122 [MIDDEL] src/XafExport.gs:300,343-369
Quote: `// rij[9]=BTW %, rij[10]=BTW bedrag, ...` (trLine bevat geen vat-element)
Probleem: BTW-data bestaat in bron maar wordt niet in XAF-trLines geëxporteerd ⇒ BTW-aansluiting niet reconstrueerbaar uit auditfile. (Consistent met F-ACC-036; XSD-verplichting niet verifieerbaar — schema-URL onbereikbaar.)
Fix: vatCode/vatAmnt per trLine; verifiëren tegen officiële XSD.
Owner: Sam + accountant

#### F-TAX-123 [LAAG] src/XafExport.gs:214-217
Quote: `const accTp = (eersteCijfer >= '4' && eersteCijfer <= '9') ? 'P' : 'B';`
Probleem: B/P-classificatie via eerste-cijfer-heuristiek terwijl GROOTBOEKSCHEMA expliciete bw-kolom heeft ⇒ classificatie kan afwijken van bron.
Fix: bw-kolom lezen; 'Balans'→B, 'W&V'→P.
Owner: Sam (dev)

## Batch TAX-G — fiscale tests 2

### cycle64-tariefsjaar — Gelezen: 1-61. Fallback = gedocumenteerde last-known-year (Belastingadvies.gs:260,184); randen OK. Geen vondsten.
### cycle67-referral-korting — Gelezen: 1-155. Pricing, geen fiscale grootheid; randen OK (115-145). Geen vondsten.
### cycle68-belastingadvies-auto-refresh — Gelezen: 1-51. Wiring-test; volgorde-invariant OK (40-50). Geen vondsten.
### cycle80-btw-validator-art17 — Gelezen: 1-239. Sanity-drempels heuristisch-acceptabel; randen OK (87-101); GDPR-pseudonymisering OK (160-238). VONDST F-TAX-150.
### jaarafsluiting.test — Gelezen: 1-344. I₁/I₈-dekking sterk (27-177, 235-258); randen OK (62-70, 99-108, 282-304). Geen vondsten.
### mkb-volgorde-na-kia — Gelezen: 1-130. MKB-ná-KIA correct geborgd (structureel + numeriek, geverifieerd tegen staffel). VONDST F-TAX-151.
### parsedatum-rollover-en-btwchecksum — Gelezen: 1-121. Kwartaal-rollover-blokkering OK (38-42); schrikkeljaar OK (44-65); "checksum" eerlijk als format-only gedocumenteerd (118). VONDST F-TAX-152.
### pro-rata-btw-aftrek — Gelezen: 1-174. 80/20 en 50/50 OK; verlegd-als-belast OK (107-118); null vs 0 splitsing OK (159-173 + BTW.gs:219-223). VONDSTEN F-TAX-153 (BLOCKER), F-TAX-154.

#### F-TAX-150 [LAAG] tests/unit/cycle80-btw-validator-art17.test.js:229
Quote: `test('PaymentId blijft ongeschonden (AWR 7-jaars bewaarplicht)', () => {`
Probleem: test borgt PaymentId maar niet dat ná pseudonymisering een fiscaal-toereikend spoor (datum+bedrag+transactie) voor de eigen OB-administratie blijft.
Fix: assertie toevoegen of expliciet documenteren dat fiscale boeking elders ligt.
Owner: accountant / Sam

#### F-TAX-151 [MIDDEL] tests/unit/mkb-volgorde-na-kia.test.js:64
Quote: `const KIA_PCT = 0.28;` … `const kiaAftrek = ronden(kiaInvestering * KIA_PCT);`
Probleem: casus hardcodet KIA als ×28% en omzeilt staffel-randen (€450-ondergrens, €2.901, afbouw-tak, €398.236-cap); fout in afbouw-tak van berekenKia_ zou hier niet opvallen.
Fix: casussen die de echte KIA-functie op afbouw- en boven-cap-input aanroepen.
Owner: Sam (dev)

#### F-TAX-152 [MIDDEL] tests/unit/parsedatum-rollover-en-btwchecksum.test.js:31
Quote: `// Nu: fallback naar new Date() = vandaag → NIET 3 maart 2026`
Probleem: test verankert stille vandaag-fallback bij ongeldige factuurdatum als correct ⇒ factuur kan in verkeerde BTW-periode belanden zonder zichtbare fout.
Fix: parseDatum_ gemarkeerde waarde laten retourneren of aanroeper laten valideren+waarschuwen; test aanpassen.
Owner: Sam (dev)

#### F-TAX-153 [BLOCKER] tests/unit/pro-rata-btw-aftrek.test.js:66 (+ src/BTW.gs:324)
Quote: `// Niets te verminderen — geen belaste omzet om aan toe te rekenen` / `expect(r.r5b).toBeCloseTo(210, 2);`
Probleem: bij 100% vrijgestelde omzet verwacht de test VOLLEDIGE voorbelasting-aftrek (r5b=210). Wettelijk (art. 15 lid 1 Wet OB) is pro-rata = 0/(0+5000) = 0% ⇒ r5b hoort €0. Oorzaak: BTW.gs:324 conditie `vrijgesteldeOmzet > 0 && belasteOmzet > 0` slaat de pro-rata over zodra belasteOmzet === 0 ⇒ r5b valt terug op het volledige bedrag (339-340). Puur-vrijgestelde ondernemer (arts, verzekeringstussenpersoon) trekt 100% af waar 0% mag ⇒ directe naheffing + boete. I₅-saldo blijft intern sluitend dus de invariant-test (120-131) slaagt misleidend.
Fix: BTW.gs:324: bij vrijgesteld>0 && belast===0 aftrek naar €0; test-assertie naar r5b≈0 met _voorbelastingNietAftrekbaar≈210.
Owner: Sam (dev)

#### F-TAX-154 [LAAG] tests/unit/pro-rata-btw-aftrek.test.js:159
Quote: `// 0% (rubriek 1d via nultarief-pad) wordt momenteel ALS vrijgesteld behandeld`
Probleem: verouderde comment — source splitst r1d_nul (belast) al correct af (BTW.gs:221-223, 311-315); comment kan latere lezer de splitsing laten "terugdraaien".
Fix: comment actualiseren.
Owner: Sam (dev)
