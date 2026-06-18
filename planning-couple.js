/* planning-couple.js — MOTEUR COUPLÉ « week-ends d'abord » (TEST, Dr Dehout 2026-06-18)
   Étend planning.js : définit genererTrimestreCouple() en réutilisant ses fonctions
   globales (plNouvelEtat, plAffecter, plChoisirWE, plReequilibrerHeures, …).
   À charger APRÈS planning.js. Branché au bouton « moteur couplé (test) » dans app.js.
   Détails & mesures : CHANTIER_long_weekend.md §6 duodecies. */

/* =====================================================================
   PROTOTYPE (chantier "week-ends d'abord, couplé") — Dr Dehout 2026-06-18
   ---------------------------------------------------------------------
   Nouvel ORDRE de génération sur tout le trimestre :
   Phase 1 — TOUS les week-ends (week-end 1 → N), COUPLÉS :
             • ven (nuit) + dim (24h) = mêmes personnes (consolidation V/D)
             • sam (24h) + jeu (nuit) = mêmes personnes (couple S/J)
             • + 3 tours (TWE) sam & dim (binôme même personne)
   Phase 2 — autres gardes de nuit (lun/mar/mer)
   Phase 3 — unités (jour), continuité au mieux
   Phase 4 — off + récups (la continuité PEUT être cassée pour off/récup)
   Le "long week-end" n'est plus obtenu en évitant le week-end mais en
   compensant par off/récup en fin de course.
   ===================================================================== */
function plCoupleChoisir(pool, etat, dateRef, n, exigerResident, preTri) {
  // Garantit ≥1 résident si demandé et jamais 2 A/S. Trie par équité week-end
  // (sauf si preTri : la liste est déjà ordonnée par préférence). Renvoie ≤ n.
  const tri = preTri ? pool.slice() : plTrier(pool.slice(), "weekend", etat, dateRef, null);
  const choisis = [];
  const estAS = (m) => m.grade === "assistant_specialiste";
  for (const m of tri) {
    if (choisis.length >= n) break;
    // jamais 2 A/S
    if (estAS(m) && choisis.filter(estAS).length >= 1 && n >= 2) {
      // on n'ajoute un 2e A/S que si on a déjà un résident ET qu'il reste de la place sans violer ≥1 résident
      const aResident = choisis.some((c) => c.grade === "resident");
      if (!aResident) continue; // garder un slot pour un résident
      continue; // jamais 2 A/S sur la même journée 24h
    }
    choisis.push(m);
  }
  // garantir ≥1 résident : si on n'a que des A/S, tenter de remplacer le dernier par un résident
  if (exigerResident && choisis.length && !choisis.some((m) => m.grade === "resident")) {
    const res = tri.find((m) => m.grade === "resident" && !choisis.includes(m));
    if (res) { choisis[choisis.length - 1] = res; }
  }
  return choisis.slice(0, n);
}

function genererTrimestreCouple(opts) {
  const annee = opts.annee;
  const moisTrim = (opts.trimestre ? [ (opts.trimestre-1)*3+1, (opts.trimestre-1)*3+2, (opts.trimestre-1)*3+3 ] : opts.mois);
  const medecins = (opts.medecins || []).filter((m) => m.grade !== "pg");
  const preferences = opts.preferences || [];
  if (opts.feriesAdmin) plDefinirFeriesAdmin(opts.feriesAdmin.ajouts, opts.feriesAdmin.retraits);

  const etat = plNouvelEtat(medecins);
  plIndexerPreferences(preferences, etat);
  etat.periodes = plIndexerPeriodes(opts.periodes);
  const ppParDate = plIndexerPrePlaces(opts.prePlaces);
  const sortie = [];
  const conflits = [];
  etat.debutPeriode = plBornesMois(annee, moisTrim[0]).debut;
  plControlerNouveauxEngages(medecins, etat.debutPeriode, conflits);

  // Fenêtre trimestre + poids (gardes & week-ends proratisés au fte sur tout le trimestre).
  const datesTrim = [];
  moisTrim.forEach((mois) => { datesTrim.push.apply(datesTrim, plDatesDuMois(annee, mois)); });
  const within = new Set(datesTrim);
  etat.poidsWeekend = {}; etat.poidsGarde = {};
  medecins.forEach((m) => {
    let dW = 0, dG = 0;
    const iset = etat.indispo[m.id], dset = etat.dispoDeclaree[m.id];
    datesTrim.forEach((d) => {
      if (!plDispoStatique(m, d, iset, dset)) return;
      dG++;
      const jr = plJourSemaine(d); if (jr === 6 || jr === 7) dW++;
    });
    const fte = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1;
    etat.poidsWeekend[m.id] = dW * fte;
    etat.poidsGarde[m.id] = dG * fte;
  });

  const marquerWeekend = (id, sat) => {
    const wk = plWeekendKey(sat);
    if (wk && etat.weekendsTravailles[id] && !etat.weekendsTravailles[id].has(wk)) {
      etat.weekendsTravailles[id].add(wk);
      etat.nbWeekend[id]++; etat.nbWeekendTotal[id]++;
    }
  };

  // ---- PHASE 1 : tous les week-ends, couplés ----
  const samedis = datesTrim.filter((d) => plJourSemaine(d) === 6);
  etat._nbTours = {}; medecins.forEach((m) => etat._nbTours[m.id] = 0);
  samedis.forEach((sat) => {
    const sun = plAdd(sat, 1), fri = plAdd(sat, -1), thu = plAdd(sat, -2);
    plCrediterAbsences(sat, medecins, etat);
    const couv = plCouv();

    // Affecte les 24h d'un jour de WE (couverture GARANTIE) puis couple au
    // jour de nuit (jeu pour sam, ven pour dim) quand c'est possible (préférence,
    // jamais au prix d'un trou). nightDay = jeu/ven, weDay = sam/dim.
    const poserWE = (weDay, nightDay) => {
      const base = medecins.filter((m) =>
        within.has(weDay) && plDispo(m, weDay, etat) &&
        plGardesSemaine(m.id, weDay, etat) < PL_MAX_GARDES_SEMAINE &&
        !plEstNouvelEngage(m, weDay, etat.debutPeriode));
      let pool = base.filter((m) => plPeutWeekend(m.id, sat, etat));
      if (pool.length < couv.gardes_weekend) {  // FILET : mois à 5 WE → on dépasse le plafond 2 WE/mois plutôt qu'un trou
        if (base.length > pool.length) conflits.push({ date: weDay, message: "Plafond 2 week-ends/mois dépassé (mois saturé, repli couverture)." });
        pool = base;
      }
      // Couplables (dispo aussi la nuit couplée) = PRÉFÉRENCE, pas filtre dur.
      const coupkable = (m) => within.has(nightDay) && plDispo(m, nightDay, etat) &&
        plGardesSemaine(m.id, nightDay, etat) < PL_MAX_GARDES_SEMAINE;
      const filtre = plFiltrerPlafond(pool, weDay, etat, PL_HEURES.garde_24h);
      // Tri : couplables d'abord, puis équité week-end → ≥1 résident garanti sur TOUT le pool.
      const triEq = plTrier(filtre.slice(), "weekend", etat, weDay, null);
      const ordre = triEq.slice().sort((a, b) => (coupkable(b) ? 1 : 0) - (coupkable(a) ? 1 : 0));
      const choisis = plCoupleChoisir(ordre, etat, weDay, couv.gardes_weekend, true, true);
      // FILET COUVERTURE : si < 2 gardes faute de résident, compléter (2 A/S toléré
      // en dernier recours) plutôt qu'un trou — et SIGNALER.
      if (choisis.length < couv.gardes_weekend) {
        for (const m of ordre) { if (choisis.length >= couv.gardes_weekend) break; if (!choisis.includes(m)) choisis.push(m); }
      }
      choisis.forEach((m) => {
        plAffecter(sortie, etat, weDay, "garde_24h", m.id, null);
        if (coupkable(m)) plAffecter(sortie, etat, nightDay, "garde_nuit", m.id, null); // couple si possible
        marquerWeekend(m.id, sat);
      });
      const lib = (plJourSemaine(weDay)===6?"Samedi":"Dimanche");
      if (choisis.length < couv.gardes_weekend) conflits.push({ date: weDay, message: lib + " : " + choisis.length + "/" + couv.gardes_weekend + " gardes 24h (effectif insuffisant)." });
      else if (!choisis.some((m) => m.grade === "resident")) conflits.push({ date: weDay, message: lib + " : aucun résident disponible → 2 A/S (à arbitrer)." });
    };
    poserWE(sat, thu);   // samedi couplé jeudi
    poserWE(sun, fri);   // dimanche couplé vendredi

    // Tours : 3 sam + 3 dim, binôme (mêmes personnes), hors gardes du week-end.
    const tourBase = medecins.filter((m) =>
      plDispo(m, sat, etat) && plDispo(m, sun, etat) &&
      !plEstNouvelEngage(m, sat, etat.debutPeriode));
    let tourPool = tourBase.filter((m) => plPeutWeekend(m.id, sat, etat));
    if (tourPool.length < couv.twe_weekend) tourPool = tourBase;
    const triT = tourPool.sort((a, b) => (etat._nbTours[a.id] - etat._nbTours[b.id]) || (plNormGardeCpl(a.id, etat) - plNormGardeCpl(b.id, etat)));
    const tw = triT.slice(0, couv.twe_weekend);
    tw.forEach((m) => {
      plAffecter(sortie, etat, sat, "twe", m.id, null);
      plAffecter(sortie, etat, sun, "twe", m.id, null);
      marquerWeekend(m.id, sat);
      etat._nbTours[m.id] += 1; // 1 week-end de tour (binôme = 1)
    });
    if (tw.length < couv.twe_weekend) conflits.push({ date: sat, message: "Tours : " + tw.length + "/" + couv.twe_weekend + "." });
  });


  // ---- PHASE 2 : autres gardes de nuit (lun/mar/mer + complément jeu/ven) ----
  // Compléter CHAQUE nuit de semaine à min_nuit gardes, ≥1 résident, jamais 2 A/S.
  const minNuit = plCouv().min_nuit;
  datesTrim.forEach((date) => {
    const jr = plJourSemaine(date);
    if (jr === 6 || jr === 7) return;                 // week-end traité en Phase 1
    plCrediterAbsences(date, medecins, etat);
    const dejaG = sortie.filter((s) => s.date === date && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h"));
    let manque = minNuit - dejaG.length;
    if (manque <= 0) return;
    const dejaResident = dejaG.some((s) => { const m = medecins.find((x) => x.id === s.doctor_id); return m && m.grade === "resident"; });
    const dejaAS = dejaG.filter((s) => { const m = medecins.find((x) => x.id === s.doctor_id); return m && m.grade === "assistant_specialiste"; }).length;
    const libres = medecins.filter((m) => plDispo(m, date, etat) &&
      plGardesSemaine(m.id, date, etat) < PL_MAX_GARDES_SEMAINE &&
      !plEstNouvelEngage(m, date, etat.debutPeriode));
    // ≥1 résident d'abord si aucun encore.
    if (!dejaResident) {
      const res = plTrierGardeNuit(plFiltrerPlafond(libres.filter((m) => m.grade === "resident"), date, etat, PL_HEURES.garde_nuit), date, etat)[0];
      if (res) { plAffecter(sortie, etat, date, "garde_nuit", res.id, null); manque--; }
      else conflits.push({ date, message: "Nuit : aucun résident dispo (≥1 obligatoire)." });
    }
    // compléter, jamais 2 A/S.
    let pris = new Set(sortie.filter((s) => s.date === date && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")).map((s) => s.doctor_id));
    let nAS = sortie.filter((s) => s.date === date && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")).filter((s) => { const m = medecins.find((x) => x.id === s.doctor_id); return m && m.grade === "assistant_specialiste"; }).length;
    while (manque > 0) {
      let pool = plFiltrerPlafond(libres.filter((m) => !pris.has(m.id)), date, etat, PL_HEURES.garde_nuit);
      if (nAS >= 1) pool = pool.filter((m) => m.grade !== "assistant_specialiste"); // jamais 2 A/S
      const pick = plTrierGardeNuit(pool, date, etat)[0];
      if (!pick) { conflits.push({ date, message: "Nuit : " + (minNuit - manque) + "/" + minNuit + " gardes." }); break; }
      plAffecter(sortie, etat, date, "garde_nuit", pick.id, null);
      pris.add(pick.id); if (pick.grade === "assistant_specialiste") nAS++;
      manque--;
    }
  });

  // Contrôle ≥1 résident par nuit de semaine : signaler les manques (effectif).
  {
    const grdR = {}; medecins.forEach((m) => grdR[m.id] = m.grade === "resident");
    const parJ = {};
    sortie.forEach((s) => { if (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") (parJ[s.date] = parJ[s.date] || []).push(s.doctor_id); });
    datesTrim.forEach((date) => {
      const jr = plJourSemaine(date);
      if (jr === 6 || jr === 7 || plEstWeekendOuFerie(date)) return;
      const g = parJ[date] || [];
      if (g.length && !g.some((id) => grdR[id]) && !conflits.some((c) => c.date === date && /résident/.test(c.message)))
        conflits.push({ date, message: "Nuit : aucun résident de garde (effectif insuffisant, à arbitrer)." });
    });
  }

  // ---- PHASE 2b : PROMOTION 24h — une garde de nuit de semaine d'un médecin
  //     SOUS-CHARGÉ devient une garde 24h (tient une station + la nuit, +9h),
  //     pour combler les heures/plancher et réduire l'écart. Tient compte des
  //     stations déjà prises ce jour. ----
  {
    const moy = () => { let s=0,n=0; medecins.forEach((m)=>{s+=etat.heures[m.id];n++;}); return n?s/n:0; };
    datesTrim.forEach((date) => {
      const jr = plJourSemaine(date);
      if (jr === 6 || jr === 7 || plEstWeekendOuFerie(date)) return;
      const postes = plPostesOuverts(date, etat.periodes);
      const plan = {};
      sortie.filter((s)=>s.date===date && (s.shift_type==="jour"||s.shift_type==="garde_24h") && s.poste).forEach((s)=>{plan[s.poste]=s.doctor_id;});
      const cle = plLundiDe(date);
      const m0 = moy();
      sortie.filter((s)=>s.date===date && s.shift_type==="garde_nuit").forEach((s)=>{
        if (etat.heures[s.doctor_id] >= m0 - 8) return;            // seulement les sous-chargés (deficit > 8h)
        const med = medecins.find((x)=>x.id===s.doctor_id); if (!med) return;
        const st = plChoisirStation(med, postes.filter((c)=>!plSansContinuite(c)), plan, etat, cle);
        if (!st || (st in plan)) return;
        s.shift_type = "garde_24h"; s.poste = st;             // promotion
        plan[st] = s.doctor_id;
        etat.heures[s.doctor_id] += (PL_HEURES.garde_24h - PL_HEURES.garde_nuit);
        if (!plSansContinuite(st)) etat.station[s.doctor_id][cle] = st;
      });
    });
  }

  // ---- PHASE 3 : unités (jour), continuité au mieux ----
  datesTrim.forEach((date) => {
    const jr = plJourSemaine(date);
    if (jr === 6 || jr === 7) return;                 // pas de station le week-end
    if (plEstWeekendOuFerie(date)) return;            // férié : pas de stations
    etat._congresJour = plEstCongres(date, etat.periodes);
    const cle = plLundiDe(date);
    const postes = plPostesOuverts(date, etat.periodes);
    const plan = {};
    sortie.filter((s) => s.date === date && s.shift_type === "jour" && s.poste).forEach((s) => { plan[s.poste] = s.doctor_id; });
    const libres = medecins.filter((m) => plDispo(m, date, etat) && !plEstNouvelEngage(m, date, etat.debutPeriode));
    // Continuité : d'abord ceux qui ont une station de la semaine encore libre.
    const ordered = libres.sort((a, b) => {
      const pa = etat.station[a.id][cle] ? 0 : 1, pb = etat.station[b.id][cle] ? 0 : 1;
      return pa - pb || (etat.heures[a.id] - etat.heures[b.id]);
    });
    ordered.forEach((m) => {
      const restantes = postes.filter((c) => !(c in plan));
      if (!restantes.length) return;
      const st = plChoisirStation(m, postes, plan, etat, cle);
      if (st && !(st in plan)) {
        plan[st] = m.id;
        plAffecter(sortie, etat, date, "jour", m.id, st);
        if (!plSansContinuite(st)) etat.station[m.id][cle] = st;
      }
    });
    const vide = postes.filter((c) => !(c in plan));
    if (vide.length) conflits.push({ date, message: "Stations vides : " + vide.join(",") });
  });

  // ---- Repos de garde + repos couplés (lendemain, lundi/mardi) ----
  const bDeb = plBornesMois(annee, moisTrim[0]).debut, bFin = plBornesMois(annee, moisTrim[2]).fin;
  const dansTrim = (d) => d >= bDeb && d <= bFin;
  materialiserRepos(sortie, dansTrim).forEach((r) => sortie.push(r));
  materialiserReposCouples(sortie, dansTrim).forEach((r) => sortie.push(r));

  // ---- Passes d'équité finales (réutilisées) ----
  plReequilibrerGardes(sortie, medecins, etat);

  // ---- PHASE 4 : off-clinic, plancher heures (doublures), équité tours/heures ----
  moisTrim.forEach((mois) => {
    const offs = genererOffClinic({ annee, mois, medecins, shifts: sortie, preferences });
    offs.forEach((o) => { sortie.push(o); etat.heures[o.doctor_id] += PL_HEURES_OFFCLINIC; });
  });
  plResorberOff24h(sortie, medecins, etat);
  plCompleterMinimumHeures(sortie, medecins, etat, datesTrim);  // plancher 40h/sem (doublures)
  plEquilibrerTours(sortie, medecins, etat);
  plReequilibrerHeures(sortie, medecins, etat);                // resserre l'écart d'heures
  plEmettreCongesFerie(sortie, etat, datesTrim);
  plEmettreRecupsWeekend(sortie, medecins, etat, datesTrim, false);  // récups conservatrices (jour libre) — dial agressif = +récups mais casse heures

  return { shifts: sortie, conflits, etat, medecins, datesTrim, within, moisTrim, annee, recupsNonPosees: etat.recupsNonPosees || [] };
}
function plNormGardeCpl(id, etat) { return etat.poidsGarde ? etat.nbGardes[id] / Math.max(etat.poidsGarde[id] || 0, PL_EPS) : etat.nbGardes[id]; }
