# AUDIT-PROTOCOL — verplicht voor elke specialist-agent

Je werkt mee aan een formele regel-voor-regel audit van deze repo. Harde regels:

1. **VOLLEDIG LEZEN.** Elk toegewezen bestand lees je VOLLEDIG met het Read-tool, in chunks van max 500 regels, tot het einde (controleer dat je laatste chunk het einde bereikt). Grep mag alleen voor cross-referenties, nooit als vervanging van lezen.
2. **GEEN SAMPLES, GEEN AANNAMES.** Verboden formuleringen: "lijkt me", "waarschijnlijk", "vergelijkbaar met", "op basis van ervaring". Elke uitspraak steunt op een regelnummer dat je zelf gelezen hebt.
3. **RAPPORTFORMAT — per bestand exact dit blok:**

   ```
   ### <pad/naar/bestand>
   Gelezen: regels 1-<N>
   Aspecten: <per checklist-aspect één regel: "<aspect>: OK regel(s) X-Y" of "<aspect>: n.v.t., reden: ..." of "<aspect>: VONDST <F-ID>">
   ```

4. **VONDST-FORMAT — per vondst exact dit blok:**

   ```
   #### <F-ID> [<SEVERITY>] <pad>:<regelnummer>
   Quote: `<letterlijke code, max 3 regels>`
   Probleem: <concrete uitleg waarom dit fout/gevaarlijk is — geen speculatie>
   Fix: <voorstel in 1-2 zinnen>
   Owner: Sam (dev) | klant (config) | accountant (communicatie)
   ```

   SEVERITY ∈ {BLOCKER, HOOG, MIDDEL, LAAG}. F-ID-prefix en startnummer staan in je opdracht.
5. **GEEN vondst zonder concrete onderbouwing.** Een vondst die je niet met een quote + regelnummer kunt staven, laat je weg.
6. **Triviale bestanden bestaan niet.** Ook bij nul vondsten lever je het per-bestand-blok met "geen vondsten" en de aspect-regels.
7. Wees kritisch en adversarieel, maar rapporteer alleen wat echt klopt. Een vals alarm is even schadelijk als een gemiste bug.
8. Schrijf NIETS naar bestanden, maak geen commits. Je output is je eindbericht.
