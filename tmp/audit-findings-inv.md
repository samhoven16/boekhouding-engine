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
