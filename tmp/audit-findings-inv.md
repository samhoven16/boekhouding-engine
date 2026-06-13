# Audit-findings — cross-validatie-invariants
Hashes van gelezen file-versies: zie tmp/file-hashes.txt.

## Batch INV-A — wiskundige-fundering.md, invariants.md, Invariants.gs, Boekingen.gs, Validaties.gs

### Per-invariant analyse (I₁-I₁₀)
- I₁: pre-write 3 lagen OK (Invariants.gs:108-133, 528-535 T3 in centen; Boekingen.gs:62-88, 100-128 één-rij-model). Geen tegenvoorbeeld via API. Geen suspensie.
- I₂: GEBROKEN — F-INV-002 (silent return bij lock-timeout/ontbrekend GB-tabblad, Boekingen.gs:380-384/388-392; rollback-laag 150-181 vuurt alleen op thrown errors). herberekeningGrootboekSaldi (490-573) veilig herstel.
- I₃: indirect via I₁+I₂; post-hoc FormeelBewijs.gs:230 (ε=0.05) + GezondheidCheck.gs:395. Zelfde tegenvoorbeeld als F-INV-002.
- I₄: pre-write gate is DODE CODE — F-INV-003 (valideerInvariantsVoorFactuur_/valideerBtwAansluiting_ nul callers in src/; tarief-domein {0,0.09,0.21} niet gevalideerd). Storno-suspensie VEILIG (markering + verifier-filter FormeelBewijs.gs:265 + aangifte-filter BTW.gs:192/269 consistent).
- I₅: n.v.t. batch; post-hoc FormeelBewijs.gs:288-319.
- I₆: OK drielaags (teller-lock Boekingen.gs:1028-1039; gate Invariants.gs:67-94 aangeroepen Triggers.gs:692-693; post-hoc). Restrisico F-INV-008 (TOCTOU).
- I₇: GEEN pre-write afdwinging — F-INV-006; verifier waarschuwing-only (TODO FormeelBewijs.gs:381-387 erkent dit).
- I₈: GEBROKEN — F-INV-001 (Invalid-Date-bypass van alle 3 gates) + F-INV-004 (post-hoc verifier leest kolom [14]=Notities i.p.v. [15]=Aangemaakt op ⇒ permanente no-op). Suspensies: ontgrendeling (1271-1430, 3 gates + duurzame audit) VEILIG; self-heal corrupt JSON (1202-1243) bewust compromis; jaarafsluitings-ordening veilig. Storno datum=NU correct.
- I₉: PARTIEEL — F-INV-005 (hard-block alleen 0100/0200/0300; 1400/4100 warn-only én eigen fallbacks boeken erop; verifier-heuristiek '000' mist ze).
- I₁₀: n.v.t. batch; dagelijks via Triggers.gs:1578-1579; "blokker vóór indienen"-claim (wiskundige-fundering.md:123) niet geverifieerd — voor BTW.gs-specialist.

### .claude/wiskundige-fundering.md
Gelezen: regels 1-135. Aspecten: I₁ OK 17-22; I₂ claim ondermijnd door F-INV-002 (24-32); I₃ OK 34-39; I₄ 41-47 → F-INV-003; I₅ OK 49-54; I₆ OK 56-59; I₇ 61-64 → F-INV-006; I₈ 66-73 → F-INV-001/004; I₉ 75-78 → F-INV-005; I₁₀ n.v.t.

### .claude/invariants.md
Gelezen: regels 1-252. Accuraat t.o.v. gelezen code (128-131, 121-141, 24-35, 75-80/94-97, 176/233-247). Geen zelfstandige vondsten.

### src/Invariants.gs
Gelezen: regels 1-761. I₁ OK 108-172/503-535/467-480 (naarCenten_ float-grens correct); I₂ OK 540-567 (T4); I₄ VONDST F-INV-003 (188-249, 431-439); I₆ OK 67-94 + F-INV-008; I₈ OK 569-577 (T5); I₉ VONDST F-INV-005 (142-171). Overig: checkKorGrens_/checkBtwTariefVerdacht_/detecteerOngekoppeldeBankuitgaven_ niet aangesloten → F-INV-007. Nevenobservatie: regel 756 capt op 21 i.p.v. 20 (cosmetisch).

### src/Boekingen.gs
Gelezen: regels 1-1481. I₁ OK 62-88/100-137; I₂ F-INV-002 (376-392); I₄ storno-suspensie OK 296-332; I₆ OK 1028-1039; I₈ F-INV-001 (regel 19 + 102); ontgrendel-suspensie OK 1271-1430; self-heal OK 1202-1243; I₉ F-INV-005 (1153-1179).

### src/Validaties.gs
Gelezen: regels 1-223. I₁-I₁₀: n.v.t., alleen formaat-validaties stamgegevens (BTW-nr 22-41, IBAN MOD-97 48-81 zelf gecontroleerd: correct, KvK 88-104, e-mail 110-125, postcode 132-147). Geen vondsten.

#### F-INV-001 [HOOG] src/Boekingen.gs:19
Quote: `const boekDatum = opt.datum instanceof Date ? opt.datum : new Date(opt.datum || new Date());`
Probleem: niet-ISO datum-string ('15-11-2025') ⇒ Invalid Date ⇒ alle drie I₈-gates falen stil (NaN-vergelijking regel 26 altijd false; jaarAlAfgesloten_(NaN) regel 42 matcht niets; T5 slaat zichzelf over via !isNaN-guard). Regel 102 schrijft de rauwe string; Sheets (NL-locale) interpreteert die als datum in het afgesloten jaar ⇒ boeking in gesloten periode zonder weigering. Post-hoc vangnet kapot (F-INV-004).
Fix: hard weigeren bij isNaN(boekDatum.getTime()) (DATUM_ONGELDIG); altijd boekDatum schrijven i.p.v. opt.datum.
Owner: Sam (dev)

#### F-INV-002 [HOOG] src/Boekingen.gs:380-384
Quote: `} catch (e) { Logger.log('updateGrootboekSaldo_: kon geen lock krijgen ...'); safeAuditLog_('GROOTBOEK LOCK', ...); return; }`
Probleem: silent return bij lock-timeout (en ontbrekend GROOTBOEKSCHEMA, 388-392) maakt de compensating-action-laag (150-181) onbereikbaar (vuurt alleen op thrown errors). Scenario: rij geschreven, debet bijgewerkt, credit-lock faalt ⇒ normale return ⇒ geen rollback/CORRUPT/fout ⇒ grootboek eenzijdig verschoven (I₂+I₃ gebroken) met alleen een audit-regel als spoor.
Fix: throwen bij lock-fail of statusobject dat maakJournaalpost_ op CORRUPT laat markeren.
Owner: Sam (dev)

#### F-INV-003 [MIDDEL] src/Invariants.gs:431
Quote: `function valideerInvariantsVoorFactuur_(ss, factuur) { valideerFactuurnummerUniek_(ss, factuur.factuurnummer); valideerBtwAansluiting_(`
Probleem: I₄-pre-write-gate is dode code (nul callers in src/; alleen valideerFactuurnummerUniek_ los aangeroepen, Triggers.gs:692). Tarief-domein {0,0.09,0.21} wordt bovendien niet gevalideerd (0.19 passeert). I₄ steunt volledig op dagelijkse post-hoc verifier ⇒ schendingen tot 24u onopgemerkt.
Fix: aanroepen in factuur-write-flow + tarief-domein afdwingen.
Owner: Sam (dev)

#### F-INV-004 [HOOG] src/FormeelBewijs.gs:421
Quote: `const aangemaakt = data[i][14];  // kolom: aangemaakt op`
Probleem: per sheet-schemas.md:114-115 is JOURNAALPOSTEN [14]=Notities (string), [15]=Aangemaakt op (Date); maakJournaalpost_ (Boekingen.gs:117-118) bevestigt. Check `aangemaakt instanceof Date` is met string altijd false ⇒ I₈-post-hoc-bewijs is permanente no-op: rapporteert "geldig" óók bij aantoonbare achteraf-boeking in gesloten periode (het gat van F-INV-001).
Fix: index [14] → [15] + regressietest die achteraf-boeking als schending verwacht.
Owner: Sam (dev)

#### F-INV-005 [MIDDEL] src/Invariants.gs:159 (+ src/Boekingen.gs:1170, 1178)
Quote: `const ambiguousParents = ['1400', '4100'];` … `// alleen waarschuwen via audit-log.`
Probleem: I₉ (universeel leaf-only) voor 1400/4100 niet afgedwongen én eigen fallbacks boeken erop (bepaalBtwVerkoopRekening_ → '4100', bepaalBtwVoorbelastingRekening_ → '1400' bij onherkend label); post-hoc verifier herkent alleen '000'-codes als parent ⇒ structureel en onzichtbaar geschonden.
Fix: fallbacks naar leaf (4110/1410) of axioma formeel amenderen met whitelist die ook in verifier staat.
Owner: Sam (dev)

#### F-INV-006 [MIDDEL] src/FormeelBewijs.gs:381-387
Quote: `// TODO audit-ronde 2 ...: I₇ blokkeert nu // niet in de factuur-creatie-flow — alleen post-hoc detectie.`
Probleem: I₇ (datum-nummer-monotonie) geen pre-write afdwinging; teller alleen creatie-monotoon. Tegenvoorbeeld: 12-06-2026→045, daarna factuur gedateerd 05-01-2026→046; alleen waarschuwing volgende dag.
Fix: pre-write check of gemotiveerde override in factuur-flow.
Owner: Sam (dev)

#### F-INV-007 [LAAG] src/Invariants.gs:263, 631, 688
Quote: `function checkKorGrens_(ss, jaaromzetTotaal) {` (idem checkBtwTariefVerdacht_, detecteerOngekoppeldeBankuitgaven_)
Probleem: drie beschermingsfuncties met caller-contracten in docstrings hebben nul aanroepen in src/ (alleen tests) ⇒ beloofde runtime-waarschuwingen bestaan niet voor de klant. controleerBewaarplichtAlert_ is wél aangesloten (Triggers.gs:1555).
Fix: aansluiten of verwijderen.
Owner: Sam (dev)

#### F-INV-008 [LAAG] src/Invariants.gs:78-93
Quote: `const data = sheet.getDataRange().getValues(); const target = String(factuurnummer).trim(); for (let i = 1; i < data.length; i++) {`
Probleem: uniciteitscheck read-then-write zonder lock; bij teller-corruptie + gelijktijdige submits passeren beide ⇒ duplicaat ondanks gate (dekt eigen doelscenario niet volledig).
Fix: check + append samen onder zelfde lock als volgendFactuurnummer_.
Owner: Sam (dev)

Status-tabel: I₁ OK | I₂ F-INV-002 | I₃ volgt I₂ | I₄ F-INV-003 | I₅ OK batch | I₆ OK + F-INV-008 | I₇ F-INV-006 | I₈ F-INV-001+004 | I₉ F-INV-005 | I₁₀ n.v.t. batch. Zwaartepunt: I₈-keten (poort én vangnet tegelijk uitgeschakeld).

## Batch INV-B — BTW, Bankboek, BoekingEngine, FormeelBewijs, HerhalendeKosten, Jaarafsluiting, Prive, Triggers
Bekende vondsten F-INV-001..008 en F-TAX-153 geverifieerd als nog aanwezig (niet opnieuw gerapporteerd). Cross-refs zelf gelezen: Boekingen.gs:16-137/270-321/1153-1179, Invariants.gs:500-578, Config.gs:125-200, Dashboard.gs:189, DriveStructuur.gs:320-399.

### src/BTW.gs — Gelezen: 1-923. I₅-som conform axioma (289-292, 344-348); r3a/r1d_nul-dubbeltelling-preventie correct (315-320); F-TAX-153 geverifieerd open (324/340). VONDSTEN F-INV-026..029, 032, 033.
### src/Bankboek.gs — Gelezen: 1-185. I₁/I₈/I₉ OK via maakJournaalpost_ + leaf-codes. VONDST F-INV-036.
### src/BoekingEngine.gs — Gelezen: 1-1086. berekenBtw I₄-correct incl. null-scheiding (122-144); audit-keten writer/verifier consistent. Deelt F-INV-033.
### src/FormeelBewijs.gs — Gelezen: 1-539. I₂/I₃/I₄/I₆-verifiers OK; F-INV-004/006 geverifieerd ongewijzigd. VONDSTEN F-INV-022, 031, 034, 035.
### src/HerhalendeKosten.gs — Gelezen: 1-517. Split zakelijk/privé sluit exact; HK-id onder lock. VONDSTEN F-INV-023..025.
### src/Jaarafsluiting.gs — Gelezen: 1-200. VONDSTEN F-INV-020 (BLOCKER), 021.
### src/Prive.gs — Gelezen: 1-519. Raakt I₁-I₁₀ niet (eigen tabbladen, geen journaalposten); input-validatie correct. Geen vondsten.
### src/Triggers.gs — Gelezen: 1-2517. Verkoop-/inkoop-/declaratie-paden I₁-sluitend; EMAIL_PENDING-protocol veilig; I₆-gates aanwezig. VONDSTEN F-INV-030, 032, 033, 037.

#### F-INV-020 [BLOCKER] src/Jaarafsluiting.gs:177-183 (× Boekingen.gs:40-51, Invariants.gs:571-577)
Quote: `for (let i = 0; i < boekingen.length; i++) { const b = boekingen[i]; ... boekingIds.push(maakJournaalpost_(ss, b)); }`
Probleem: elke resultaatverwerkings-boeking draagt ref JA-{jaar} + datum 31-12-{jaar}; maakJournaalpost_ checkt vóór elke write jaarAlAfgesloten_ dat op precies die ref matcht ⇒ boeking #1 schrijft de JA-tag, boeking #2 wordt door de eigen guard geweigerd. Elke echte administratie (≥2 W&V-rekeningen met saldo) ⇒ afsluiting crasht altijd na exact één boeking; her-run geblokkeerd door pre-flight (146-154); alle jaar-N-boekingen voortaan geweigerd. Eindstand: half-afgesloten, vergrendeld jaar; I₂/I₃-doelstand onbereikbaar. (F-TAX-093 checkte alleen de overdracht en miste deze binnen-loop-interactie.)
Fix: jaarafsluitings-boekingen whitelisten in beide gates (vlag/type) of JA-ref pas als laatste atomair zetten; regressietest met ≥2 W&V-rekeningen.
Owner: Sam (dev)

#### F-INV-021 [MIDDEL] src/Jaarafsluiting.gs:50-61
Quote: `boekingen.push({ ... debet: code, credit: REKENING_RESULTAAT_BOEKJAAR, bedrag: saldo, ... });`
Probleem: negatief W&V-saldo (creditnota's > omzet) ⇒ bedrag ≤ 0 ⇒ validator-throw midden in de loop ⇒ zelfde partial-close-staat als F-INV-020.
Fix: bij negatief saldo debet/credit omkeren + Math.abs. Owner: Sam (dev)

#### F-INV-022 [HOOG] src/FormeelBewijs.gs:464-474
Quote: `if (c.endsWith('000') && other.startsWith(c.charAt(0))) return true;`
Probleem: I₉-verifier-heuristiek vlagt echte leaf-rekeningen 1000/2000/4000/7000/8000 (mét zelfde-cijfer-buren) als parent; 8000 = default-omzet, 4000 = elke inkoop ⇒ vrijwel elke journaalpost dagelijks als I₉-schending ⇒ alleGoed structureel false, WARN-spam, echte schendingen verdrinken. (Omgekeerde fout t.o.v. F-INV-005.)
Fix: expliciete parent-whitelist identiek aan Invariants.gs. Owner: Sam (dev)

#### F-INV-023 [HOOG] src/HerhalendeKosten.gs:98-107 (× 333-380, Invariants.gs:558-565)
Quote: `<option value="5200 Huurkosten">5200 – Huurkosten</option>` … `debet: rekening, credit: '1200',`
Probleem: dialog biedt 5xxx/6xxx-rekeningen die NIET in STANDAARD_GROOTBOEK bestaan (kosten = 7xxx) ⇒ REKENING_ONBEKEND-throw; loop heeft geen per-rij try/catch ⇒ falende rij schuift nooit op én blokkeert alle volgende rijen ⇒ stille permanente uitval van alle herhalende kosten zodra klant huur/verzekering/software kiest. Ook label "7000 Overige kosten" fout (7000=Inkoopkosten).
Fix: opties gelijktrekken met schema + per-rij try/catch met FOUT-status (zoals datum-pad 313-320). Owner: Sam (dev)

#### F-INV-024 [HOOG] src/HerhalendeKosten.gs:347-371
Quote: `if (isJa_(auto) && bedrag > 0) { const zakelijkBedrag = rondBedrag_(bedrag * (splitPct / 100)); ... debet: rekening, credit: '1200', bedrag: zakelijkBedrag,`
Probleem: BTW-tarief wordt geregistreerd maar bij auto-boeken genegeerd: geen voorbelasting-post, geen INKOOPFACTUREN-rij ⇒ (1) bank gecrediteerd voor excl terwijl incasso incl is (structurele 1200-drift); (2) voorbelasting huur/abonnementen verschijnt nooit in r5b (aangifte leest alleen INKOOPFACTUREN) ⇒ klant vraagt structureel te weinig terug.
Fix: auto-boeking via verwerkUitgavenUitHoofdformulier_ (zelfde chokepoint) of incl boeken met 1410/1420-post. Owner: Sam (dev)

#### F-INV-025 [MIDDEL] src/HerhalendeKosten.gs:350-376
Quote: `if (zakelijkBedrag > 0) { maakJournaalpost_...} if (privaatBedrag > 0) { maakJournaalpost_...} geboekt++; ... setProperty(idemKey, 'DONE');`
Probleem: idemKey pas ná beide posts gezet; crash ertussen ⇒ retry herboekt geslaagde post(en) ⇒ dubbele journaalpost die geen verifier ziet. Lock beschermt alleen gelijktijdigheid, niet retry-after-crash.
Fix: PENDING vóór eerste post, DONE na succes (patroon Triggers.gs:770-847). Owner: Sam (dev)

#### F-INV-026 [HOOG] src/BTW.gs:283-285 (+859)
Quote: `} else if (btwBedrag > 0) { aangifte.r5b += btwBedrag; }`
Probleem: negatieve inkoop-BTW (leveranciers-creditnota) wordt genegeerd i.p.v. in mindering gebracht op r5b ⇒ voorbelasting te hoog ⇒ te veel teruggevraagd ⇒ naheffing+boete. Asymmetrisch met verkoop-zijde die negatieve rijen wél ondersteunt (194-197, 426-431).
Fix: btwBedrag !== 0 accepteren; waarschuwing bij negatieve som. Owner: Sam (dev)

#### F-INV-027 [HOOG] src/BTW.gs:617-758
Quote: `function sluitBtwPeriode() { ... maakJournaalpost_(ss, { datum, omschr: `BTW afdracht ${kwartaal} ${jaar} – 21%`, ... });`
Probleem: geen idempotency-guard; afdracht-posten gedateerd vandaag (640) vallen buiten de vergrendelde periode ⇒ tweede run (dubbelklik/crash-retry) boekt alle salderingsposten dubbel ⇒ 4110/4120 negatief, 4100/1400 dubbel verschoven — corrupt grootboek dat geen verifier vlagt.
Fix: ref BTW-{kwartaal}-{jaar} (al op elke post, 650) vóór boeken opzoeken en bij bestaan weigeren (patroon jaarAlAfgesloten_). Owner: Sam (dev)

#### F-INV-028 [MIDDEL] src/BTW.gs:701-711 (× Boekingen.gs:1173-1179)
Quote: `debet: '4100', credit: '1400', bedrag: aangifte.r5b,`
Probleem: (1) voorbelasting geboekt op 1410/1420 maar afgeboekt van 1400 ⇒ 1410/1420 groeien eeuwig, 1400 structureel negatief (balans sluit, saldi betekenisloos; verkoop-zijde is wél consistent). (2) pro-rata: alleen aftrekbaar deel afgeboekt; niet-aftrekbaar deel blijft als spook-vordering staan i.p.v. naar kosten.
Fix: per tarief van 1410/1420 afboeken; niet-aftrekbaar deel naar kostenrekening. Owner: Sam (dev)

#### F-INV-029 [MIDDEL] src/BTW.gs:681,694 (× Config.gs:165-174)
Quote: `debet: '4130', credit: '4100',` … `debet: '4100', credit: '4140',`
Probleem: 4130/4140 bestaan niet in STANDAARD_GROOTBOEK ⇒ zodra r1e_btw of r4a_btw > 0 is throwt T4 ná de al-geslaagde 4110/4120-posten ⇒ halve periodesluiting; retry dubbelt de eerste posten (F-INV-027).
Fix: rekeningen toevoegen of herrouteren + pre-flight op alle doelrekeningen. Owner: Sam (dev)

#### F-INV-030 [MIDDEL] src/Triggers.gs:996-1023
Quote: `debet: kostenRek || '7990', credit: '4000', bedrag: bedragExcl, ...` … `// Niet-aftrekbare BTW (privé-deel) → naar kostenrekening`
Probleem: bij Zakelijk% < 100 wordt alleen de BTW gesplitst; excl gaat 100% naar kosten en privé-BTW óók naar kosten i.p.v. 2400 ⇒ privé-deel drukt fiscale winst (te veel IB-aftrek). Inconsistent met HerhalendeKosten dat excl wél splitst. Boekingen sluiten (I₁ OK), classificatie fiscaal fout.
Fix: excl splitsen: zakelijk% naar kostenRek, rest+privé-BTW naar 2400. Owner: Sam (dev)

#### F-INV-031 [MIDDEL] src/FormeelBewijs.gs:163-169 (+297-313)
Quote: `totaalDebet += bedrag; / totaalCredit += bedrag;  // (gelijk per I₁)`
Probleem: I₁-verifier tautologisch (verschil ≡ 0); I₅-verifier hertest producer tegen eigen formules ⇒ fouten in r5b (F-INV-026, F-TAX-153) per definitie onzichtbaar. De geclaimde tweede verdedigingslaag bestaat voor I₁/I₅ feitelijk niet. (Verdiept F-ACC-008.)
Fix: I₁ op rij-integriteit + steekproef; I₅ tegen onafhankelijke bron (grootboek-saldi 4110/4120/1410/1420 vs rubrieken). Owner: Sam (dev)

#### F-INV-032 [MIDDEL] src/BTW.gs:772-783 (+832-852; Triggers.gs:865-880)
Quote: `if (status === FACTUUR_STATUS.GECREDITEERD) continue; totaalOmzet += parseFloat(vfData[i][9]) || 0;`
Probleem: storno laat grondslag [9] staan (alleen BTW→0); controleerKor/getBtwPerMaand_/YTD-snapshot skippen alleen GECREDITEERD ⇒ gestorneerde omzet telt mee ⇒ onterecht "BOVEN KOR-grens"-advies (juridisch significant) + te hoge dashboard-omzet. berekenBtwAangifte_ doet het wél goed (192).
Fix: overal dezelfde dubbele status-gate. Owner: Sam (dev)

#### F-INV-033 [MIDDEL] src/BTW.gs:886 (× BoekingEngine.gs:127-130, BTW.gs:242-246)
Quote: `if (l.includes('vrijgesteld') || l.includes('verlegd') || l.includes('geen btw')) return null; return 0.21;`
Probleem: drie tegenstrijdige defaults voor onbekend label: parseBtwTarief_→0.21 (factureert!), berekenBtw→0, aangifte→buiten elke rubriek ⇒ Form-pad met vrij label "BTW 20%" factureert 21% die nooit in r5a wordt afgedragen.
Fix: één gedeelde parser met hard-fail in factuur-flow; 0.21-fallback weg. Owner: Sam (dev)

#### F-INV-034 [LAAG] src/FormeelBewijs.gs:503-516
Quote: `const refDatum = new Date(nu.getFullYear(), nu.getMonth() - k * 3, 15); ... const huidig = kwartaalR5d[4];`
Probleem: I₁₀ vergelijkt onvolledig lopend kwartaal met EWMA van volle kwartalen ⇒ begin elk kwartaal dagelijks vals "BTW-anomalie"-alarm ⇒ alarmmoeheid.
Fix: pro-rata-extrapolatie of alleen in laatste maand/bij aangifte draaien. Owner: Sam (dev)

#### F-INV-035 [LAAG] src/FormeelBewijs.gs:297,510 (× BTW.gs:333-338, 368)
Quote: `const a = berekenBtwAangifte_(ss, van, tot);` (verifiers 6×/dag)
Probleem: berekenBtwAangifte_ heeft side-effects (pro-rata-audit-log + telemetrie) ⇒ dagelijkse log-vervuiling drukt echte events uit de 100-entry buffer.
Fix: read-only-vlag voor verifier-aanroepen. Owner: Sam (dev)

#### F-INV-036 [LAAG] src/Bankboek.gs:9-22 (× 61-65)
Quote: `bericht += `Boekhoudkundig saldo (1200): ${formatBedrag_(boekhoudSaldo)}\n`;`
Probleem: label zegt "1200" maar telt BANKTRANSACTIES; journaalpost-gedreven 1200-mutaties ontbreken ⇒ vals "verschil" bij afstemming ⇒ klant voert dubbel in. (= F-ACC-063 vanuit invariant-perspectief.)
Fix: grootboek-1200 gebruiken of beide bronnen tonen. Owner: Sam (dev)

#### F-INV-037 [LAAG] src/Triggers.gs:1256-1257
Quote: `const termijn = parseInt(data['Betalingstermijn (dagen)'] || '30'); const vervaldatum = new Date(datum.getTime() + termijn * 24*60*60*1000);`
Probleem: legacy-formulier-pad mist `|| 30`-fallback ná parseInt (NaN ⇒ Invalid vervaldatum ⇒ dunning/markeerVervallen skippen stil) + mist duplicate-/korting-gates van hoofdpad.
Fix: zelfde validatie als hoofdpad of pad deprecaten. Owner: Sam (dev)

Status-tabel batch B: I₁ creatie OK/verifier vacuüm; I₂ tegenvoorbeelden F-INV-023/024/025/027/028; I₃ houdt; I₅ brondata-gaten F-INV-024/026/032/033 + F-TAX-153 open; I₈ guard veroorzaakt zelf F-INV-020; I₉ verifier false positives F-INV-022; I₁₀ vals alarm F-INV-034/035. Zwaartepunt: F-INV-020 + cluster F-INV-022/023/024.

## Batch INV-C — Utils.gs + invariants.test, cycle2/5/7/22, betaling-integriteit, grootboek-saldo-cache
Positief: withLock_/withRetry_/withCheckpoint_ degelijk (1505-1619); KPI-snapshot met schema-versie-guard (700-727); noodLog_ met PII-masking; MOD-97 via lange-deling correct; cycle7-storno en grootboek-saldo-cache verankeren I₁/I₂ correct met het juiste assertiepatroon. grootboek-saldo-cache.test.js: geen vondsten.

#### F-INV-040 [HOOG] src/Utils.gs:215
Quote: `const d = parseDatum_(ruw);` gevolgd door `if (!d || isNaN(d.getTime())) { throw ... }`
Probleem: parseDatumStrict_ belooft throw-bij-invalid maar delegeert naar parseDatum_, dat bij élke ongeldige string vandaag teruggeeft ⇒ de guard is dood; parseDatumStrict_('31-02-2026') → vandaag, geen throw ⇒ boeking in verkeerd kwartaal — precies het BTW-mismatch-scenario dat de P22-fix moest voorkomen. (Verdiept F-INV-001/F-TAX-152.)
Fix: interne gevalideerde parser of null-mode + throw. Owner: Sam (dev)

#### F-INV-041 [MIDDEL] src/Utils.gs:516-517
Quote: `van: parseDatum_(startStr) || new Date(new Date().getFullYear(), 0, 1),`
Probleem: parseDatum_ is nooit falsy ⇒ kalenderjaar-fallback is dode code; ontbrekende Boekjaar-instellingen ⇒ degenererende één-dags-periode ⇒ periode-gefilterde rapportages tonen vrijwel niets, zonder fout.
Fix: expliciete !startStr-check vóór parse. Owner: Sam (dev)

#### F-INV-042 [MIDDEL] src/Utils.gs:124-127
Quote: `* Rondt een bedrag af op 2 decimalen (bankiersmethode)` / `return Math.round((parseFloat(bedrag) || 0) * 100) / 100;`
Probleem: (a) claim "bankiersmethode" onjuist (Math.round = half-up); (b) teken-asymmetrie op halve centen: rondBedrag_(0.125)=0.13 maar rondBedrag_(-0.125)=-0.12 ⇒ rondBedrag_(x) ≠ -rondBedrag_(-x) ⇒ €0,01-drift tussen bedrag en creditnota-tegenhanger (I₁/I₃-relevant).
Fix: doc corrigeren + teken-symmetrisch afronden. Owner: Sam (dev)

#### F-INV-043 [MIDDEL] src/Utils.gs:796-799, 814
Quote: `if (resp.getResponseCode() !== 200) { ... return 1.0; }`
Probleem: ECB-storing/onbekende valuta ⇒ silently koers 1.0 ⇒ $10.000 geboekt als €10.000; alleen Logger.log — onbegrensde silent drift tegen de eigen doctrine.
Fix: throw/null + caller weigert/markeert; audit + UI-waarschuwing. Owner: Sam (dev)

#### F-INV-044 [LAAG] src/Utils.gs:158
Quote: `.replace(/\.(?=\d{3})/g, '')  // Verwijder duizendtalpunten`
Probleem: Engelse decimaalpunt vóór 3 cijfers wordt als duizendtal gestript: parseBedrag_('0.005')→5 (×1000); ook in Strict-variant.
Fix: alleen strippen bij aanwezige komma of bevestigend patroon. Owner: Sam (dev)

#### F-INV-045 [LAAG] src/Utils.gs:300
Quote: `const json = JSON.stringify(input, Object.keys(input).sort());`
Probleem: array-replacer dropt geneste keys ⇒ verschillende inputs kunnen zelfde "audit-bestendige" hash krijgen.
Fix: recursieve canonieke serialisatie. Owner: Sam (dev)

#### F-INV-046 [HOOG] tests/unit/invariants.test.js:94-100 (13× herhaald)
Quote: `try { ctx.valideerJournaalpostBalans_('', '8000', 100); } catch (e) { expect(e.code).toBe('JOURNAALPOST_REK_LEEG'); }`
Probleem: 13 van 14 negatieve invariant-tests zonder fail-guard/expect.assertions ⇒ als de validator stopt met gooien blijven ze groen — ze verankeren "ALS gegooid dan deze code" i.p.v. "er MOET gegooid worden". (Regel 64-72 toont dat het juiste patroon bekend was.)
Fix: expect(() => ...).toThrow + code-check, of guard-throw in elk try-blok. Owner: Sam (dev)

#### F-INV-047 [LAAG] tests/unit/invariants.test.js:259-264 — KOR-grensgeval accepteert 'naderend' ÉN 'ok' (disjunctief = verankert niets). Fix: één status pinnen. Owner: Sam.
#### F-INV-048 [LAAG] src/Invariants.gs:218 (verankerd door invariants.test.js:215-223)
Quote: `const tolerantie = Math.max(0.01 * regels.length, 0.02);`
Probleem: I₄-axioma staat ±0,01 toe; implementatie-vloer 0,02 voor 1-regel-factuur is 2× ruimer en het axioma-grensgeval is ongetest.
Fix: vloer 0,01 of axioma bijwerken + grensgevaltest. Owner: Sam (dev)

#### F-INV-049 [HOOG] src/Boekingen.gs:155-181 (verankerd door cycle2-atomic:111-120)
Quote: `} catch (saldoErr) { if (debetGedaan) { ... } throw saldoErr; }` — CORRUPT alleen in de geneste rollback-fail-branch.
Probleem: appendRow is al geslaagd; bij debet-fail-eerst en bij credit-fail-met-geslaagde-rollback blijft de journaalpost-rij ONGEMARKEERD staan terwijl het grootboek de boeking niet bevat ⇒ zwevende rij die rapportages meetellen (I₂-schending); header/comment beloven CORRUPT-markering; test asserteert het gat als correct.
Fix: rij CORRUPT markeren (of verwijderen) in álle saldo-faalpaden; test uitbreiden. Owner: Sam (dev)

#### F-INV-050 [HOOG] src/Triggers.gs:153-155, 177-179 (verankerd door cycle5-immutable:101-107)
Quote: `const oud = e.oldValue !== undefined ? e.oldValue : ''; ... if (String(oud) === String(nieuw)) return;`
Probleem: multi-cel-edits (paste/delete/drag/sort) leveren geen e.value/oldValue ⇒ ''==='' ⇒ return: niets geaudit; A1 'I2:K40' matcht de kolomlijst sowieso niet ⇒ de immutability-detectie is blind voor precies de realistische bulk-manipulatiepaden; test dekt alleen single-cell.
Fix: range>1 cel als wijziging behandelen + kolom-matching via getColumn()-bereik. Owner: Sam (dev)

#### F-INV-051 [LAAG] src/Boekingen.gs:217-226 — storno-van-storno mogelijk; origineel daarna netto actief maar permanent "alGestorneerd" ⇒ deadlock. Fix: storno-ketens detecteren/weigeren. Owner: Sam. (Verdiept F-ACC-005.)

#### F-INV-052 [BLOCKER] src/GezondheidCheck.gs:407-408
Quote: `if (bw === 'Activa')  totaalActiva  += saldo; if (bw === 'Passiva') totaalPassiva += saldo;`
Probleem: kolom [4] bevat uitsluitend 'Balans'/'W&V' (Setup.gs:555, Config.gs; type-kolom [2] = 'Actief'/'Passief') ⇒ beide vergelijkingen matchen NOOIT ⇒ totalen 0 ⇒ verschil 0 < 0.005 ⇒ controleerBalansStrikt_ retourneert ALTIJD OK, op elke administratie. I₃-strikt (jaarrekening ε=0,005 — wiskundige-fundering.md:39; aangeroepen als poort vóór accountant-export, DriveStructuur.gs:311-312; FormeelBewijs.gs:243 verwijst ernaar) is een permanente no-op. Geen enkele test dekt deze functie (cycle22 test alleen de soepele variant) — dát maskeerde de fout.
Fix: filter bw === 'Balans' en splits op type-kolom [2] (zoals controleerBalans_ 347-353); regressietest met €0,01-scheve balans.
Owner: Sam (dev)

#### F-INV-053 [MIDDEL] .claude/sheet-schemas.md:216
Quote: `[2]  Type                    string     Activa/Passiva/Opbrengsten/Kosten/Eigen vermogen`
Probleem: werkelijke enum is 'Actief'/'Passief'/'Kosten'/'Opbrengst'; dit verplichte waarheidsdocument is de plausibele BRON van F-INV-052 — elke toekomstige wijziging op basis hiervan reproduceert dezelfde fout-klasse.
Fix: regel 216 corrigeren + expliciet maken dat [4] de balans-selector is. Owner: Sam (dev)

#### F-INV-054 [LAAG] src/GezondheidCheck.gs:342-367 — leeg/ontbrekend Grootboekschema ⇒ vacuous 'OK (€0,00)'. Fix: lengte-guard met FOUT-status. Owner: Sam.

#### F-INV-055 [HOOG] src/GezondheidCheck.gs:527 (gemaskeerd door betaling-integriteit.test.js:35-42)
Quote: `const ref = String(jpData[i][9] || '').trim();` (mock: `r[9] = ref;`)
Probleem: index [9] = 'BTW %' ('21%'/'Geen'); Referentie staat op [11] (sheet-schemas.md:109-111 + maakJournaalpost_) ⇒ bankRefs bevat in productie nooit factuurnummers ⇒ ELKE betaalde factuur wordt gerapporteerd als "zonder journaalpost" (permanente false-positive) en het advies "maak journaalpost aan" creëert bij opvolging dubbele posten (échte I₂-schending). Testmock codeert exact dezelfde verkeerde index — implementatie i.p.v. sheet-contract verankerd (cycle7-helper heeft de index wél goed: r[11]).
Fix: jpData[i][11]; testmock op gedocumenteerd schema bouwen. Owner: Sam (dev)

#### F-INV-056 [MIDDEL] cycle2:4, cycle5:3, cycle7:4, Boekingen.gs:139/144, Invariants.gs:134
Quote: `* Axiom 9 (atomair)...` / `// CYCLE-5 (axiom 5 — immutable na commit)` / `// (axiom 13)`
Probleem: minstens twee afwijkende axioma-nummeringen die niet in de canonieke wiskundige-fundering.md bestaan ("axiom 13" bestaat niet) ⇒ traceerbaarheid invariant↔afdwinging↔test gebroken.
Fix: hernummeren naar I₁-I₁₀ of mapping-tabel toevoegen. Owner: Sam (dev)

## Wave A — inv_02 (audit2/3 + boeking/cycle tests) — gelezen volledig; bron-cross-check src/Triggers.gs:309-398
[F-INV-077] HOOG audit2-security-high.test.js:121-127 — hashketen-claim via source-grep (`toMatch(/SHA_256/)`); draait hash nooit, geen tamper-detectie. Slaagt ook als keten-wiskunde kapot. Verzwakte proxy.
[F-INV-078] MIDDEL audit2-security-high.test.js:136-142 — "geen throw" is comment, geen assertie; implementatie die entryHash='' zet passeert. Geen onderscheid getekend/ongetekend.
[F-INV-079] LAAG audit2-security-high.test.js:111-119 — grep bevestigt read+write van AUDIT_KETEN_HASH maar niet dat gelezen waarde de volgende hash voedt. Keten-koppeling niet bewaakt.
[F-INV-080] MIDDEL audit2.test.js:30-45 — I₅ null-sheet crash-guard: 0=0+0 tautologisch; som-vergelijking nooit op niet-triviale invoer.
[F-INV-081] MIDDEL audit2.test.js:47-71 — I₅: één inkoop-rij; verkoopzijde r1a..r1e/r4a blijft 0 dus niet geverifieerd; tolerantie toBeCloseTo(,1) losser dan "afgerond op €1".
[F-INV-082] LAAG audit2.test.js:124-139 — I₁: maakJournaalpost_ weggemockt; alleen debet-arg geïnspecteerd, credit/gelijkheid nooit uitgevoerd.
[F-INV-083] LAAG audit3-rework.test.js:82-86 — NOLOCK-skip via source-grep; verifier nooit gedraaid op keten met NOLOCK-rijen.
[F-INV-084] LAAG audit3-rework.test.js:108-109 — I₈ PERIODE_ONTGRENDELD: grep bevestigt logregel-aanwezigheid, niet duurzame keten-vastlegging of guard-herstel.
[F-INV-085..088] INFO — audit2-runtime-cross-pr (geen I_n-claim, n.v.t.), audit2-voice-klantreis (geen I_n, n.v.t.), cycle17 (raakt I₂ als preservatie, eerlijk afgebakend, done), boekingEngine (I₄ + null-vs-0 BTW ECHT getest, OK). cycle69 OK (echte SHA+tamper+correcte broken-rij).

## Wave A — inv_03 (golive/meerjaren/cycle tests) — gelezen volledig
[F-INV-097] HOOG golive-audit-blockers.test.js:14-16 — I₅ via brontekst-grep `toMatch(/aangifte.r5d = aangifte.saldo/)`; draait berekenBtwAangifte_ nooit. Tautologisch t.o.v. invariant.
[F-INV-098] HOOG golive-audit-blockers.test.js:19-23 — I₅ als negatieve substring-match `not.toMatch(/r3a_btw \|\| 0\)/)`; broos (mist `r3a_btw||0` of `+a.r3a_btw`); echte validator valideerBtwInvariants_ nooit aangeroepen.
[F-INV-099] LAAG golive-audit-blockers.test.js:26-38 — dunning-kolomfix via brontekst-grep, geen run; buiten I_n-mandaat maar zwakke-proxy-vorm.
[F-INV-100] MIDDEL meerjaren-audit-fixes.test.js:34-37 — herberekent grootboeksaldi (raakt I₂) maar test is woord-grep "Actief/Kosten" + teken-ternary; rekent geen saldo na; omgekeerd teken passeert. Naam suggereert I₂-borging die ontbreekt.

## Wave A — inv_01 (property-suite + audit2-batches) — gelezen volledig; bron-cross-check FormeelBewijs.gs
[F-INV-057] BLOCKER formeel-bewijs-invarianten.test.js:182-211 — ENIGE contact met productie is regex-source-grep (bestaat function _bewijs_Ix_); geen _bewijs_Ix_/bewijsAlleInvarianten_/berekenBtw aangeroepen (file importeert alleen fs+path). Hele "property-based" suite slaagt ook als ELKE productie-verifier kapot is. Claim "1000+ random inputs" onwaar.
[F-INV-058] BLOCKER idem:41-47 — I₁: telt bedrag op en trekt het meteen af → totaal per constructie 0. Tautologie.
[F-INV-059] BLOCKER idem:64-76 — I₄: incl en verwacht uit zelfde expressie excl+btw → verschil altijd 0. Bewaakt I₄ niet.
[F-INV-060] HOOG idem:78-89 — I₄ adversarial: "detectie" is lokale if in de test, niet de productie-detector.
[F-INV-061] HOOG idem:93-108 — I₆: test construeert zelf unieke 1..500 + Set.size → test JS Set, niet volgendFactuurnummer_.
[F-INV-062] HOOG idem:112-118 — I₇: bouwt zelf stijgende reeks i → tautologie; datum→nr-koppeling nergens.
[F-INV-063] MIDDEL idem:137-176 — I₁₀: EWMA/sigma in test geherimplementeerd; productie _bewijs_I10_ niet aangeroepen.
[F-INV-064] MIDDEL idem:structureel — alleen I₁/I₄/I₆/I₇/I₁₀ describe-blokken; I₂/I₃/I₅/I₈/I₉ GEEN property-test → balans-wetten onbewaakt.
[F-INV-065] HOOG audit2-fiscaal-high.test.js:80-87 — I₇: test asserteert expliciet dat I₇ NIET in factuur-creatie wordt afgedwongen (TODO-comment volstaat). Bevestigt dat I₇ slechts waarschuwt.
[F-INV-066] MIDDEL audit2-fiscaal-high.test.js:118-140 — I₈: herimplementeert label/motivatie-validatie i.p.v. echte guard; journaalpost in afgesloten periode nooit getest op reject.
[F-INV-067] MIDDEL audit2-med-low-batch1.test.js:145-152 — grept tolerantie-string in ánder testbestand; kan opgerekte marge legitimeren zonder schending aan te tonen.
[F-INV-068] MIDDEL audit2-med-low-batch2.test.js:84-99 — I₅: grept `r3a_grondslag += grondslag` in bron; berekenBtwAangifte_ niet gedraaid; som-sluitendheid niet gecontroleerd.
[F-INV-069] LAAG audit2-med-low-batch2.test.js:51-82 — I₅-classificatie via source-grep op helper-bestaan; geen echte input.
[F-INV-070] MIDDEL audit2-r3-fixes.test.js:45-59 — audit-keten/I₈-tamper via regex-grep op bronstructuur; geen race/schrijfAuditLog_ gedraaid.
[F-INV-071] HOOG audit2-ronde2-hoog.test.js:33-63 — I₅ pro-rata: bewijst dubbeltelling-fix alleen via regex; negatieve grep broos; geen numerieke case via berekenBtwAangifte_.
[F-INV-072] MIDDEL audit2-ronde2-hoog.test.js:89-126 — audit-keten via grep op SHA-256-regel; verifieerAuditChain_ niet uitgevoerd; echte tamper nooit gesimuleerd.
[F-INV-073] LAAG audit2-ronde2-hoog.test.js:128-189 — trust-anchor via indexOf-volgorde/grep; immutability-gedrag niet getest.
