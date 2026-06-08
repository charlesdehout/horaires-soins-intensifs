/* =====================================================================
   Planning Soins Intensifs — Module 5 : génération du planning (v1)
   ---------------------------------------------------------------------
   Fonction PURE : prend des données simples (médecins + préférences),
   renvoie une liste de shifts + la liste des conflits non résolus.
   Aucune dépendance au DOM ni à Supabase → testable sous Node.

   Stratégie v1 : parcours du mois entier, jour par jour, avec choix
   « greedy » équilibrés (le moins de gardes / le moins d'heures d'abord)
   et retour-arrière intra-jour sur les contraintes DURES. L'optimisation
   fine de l'équité trimestrielle est le Module 7.

   Contraintes DURES gérées :
     - Semaine : 7 stations de jour pourvues ; nuit ≥2 dont ≥1 résident.
     - Week-end / férié : 3 au TWE dont 2 en garde 24h (≥1 résident).
     - Repos 12 h après toute garde (lendemain non planifiable).
     - Récup : garde de week-end samedi → lundi off ; dimanche → lundi+mardi.
     - Congés / indispo / off-clinic / récup → non planifiable.
     - Hors contrat → non planifiable. Jours travaillables respectés.
     - Continuité clinique : même station toute la semaine.

   Chargé après regles.js, avant app.js.
   ===================================================================== */


/* ---- Dépendances (require sous Node, variables globales en navigateur) ---- */
const _PL_REGLES = (typeof require !== "undefined")
  ? (function () { try { return require("./regles.js"); } catch (e) { return null; } })()
  : null;
function plFeries(annee) { return (_PL_REGLES ? _PL_REGLES.joursFeriesBE : joursFeriesBE)(annee); }
function plPostes()      { return _PL_REGLES ? _PL_REGLES.POSTES_JOUR     : POSTES_JOUR; }
function plCouv()        { return _PL_REGLES ? _PL_REGLES.COUVERTURE       : COUVERTURE; }
function plBloq()        { return _PL_REGLES ? _PL_REGLES.PREF_BLOQUANTES  : PREF_BLOQUANTES; }

/* Durées réelles (h) par type de shift — doivent coller à SHIFT_CONFIG (app.js). */
const PL_HEURES = { jour: 10.5, twe: 6, garde_nuit: 15, garde_24h: 24 };

/* Types d'« absence / repos » posables manuellement (0 h, sans station).
   Doivent coller aux types absence de SHIFT_CONFIG (app.js). */
const PL_ABSENCES = ["recup", "off", "conge_annuel", "conge_scientifique", "conge_extralegal"];
function plEstAbsence(type) { return PL_ABSENCES.indexOf(type) !== -1; }


/* ---------------------- Utilitaires de dates (UTC) ---------------------- */
function plIso(d) { return d.toISOString().slice(0, 10); }
function plParse(s) { return new Date(s + "T00:00:00Z"); }
function plAdd(s, n) { const d = plParse(s); d.setUTCDate(d.getUTCDate() + n); return plIso(d); }
/* 1 = lundi … 7 = dimanche */
function plJourSemaine(s) { const j = plParse(s).getUTCDay(); return j === 0 ? 7 : j; }
function plEstWeekendOuFerie(s) {
  const j = plJourSemaine(s);
  if (j === 6 || j === 7) return true;
  return plFeries(plParse(s).getUTCFullYear()).has(s);
}
/* Lundi de la semaine contenant s — clé de continuité hebdomadaire. */
function plLundiDe(s) { return plAdd(s, -(plJourSemaine(s) - 1)); }


/* --------------------------- État mutable ------------------------------ */
function plNouvelEtat(medecins) {
  const e = {
    indispo: {}, souhait: {}, bloque: {}, assigneJour: {},
    nbGardes: {}, nbWeekend: {}, heures: {}, station: {},
    // Poids d'équité (Module 7) : remplis seulement en mode trimestriel.
    // null => plTrier reste en mode mensuel (compte brut). Sinon =>
    // tri par déficit relatif : compte / poids (proportionnel à la dispo).
    poidsGarde: null, poidsWeekend: null,
  };
  medecins.forEach((m) => {
    e.indispo[m.id] = new Set();
    e.souhait[m.id] = new Set();
    e.bloque[m.id] = new Set();
    e.nbGardes[m.id] = 0;
    e.nbWeekend[m.id] = 0;
    e.heures[m.id] = 0;
    e.station[m.id] = {}; // { lundiISO: codeStation }
  });
  return e;
}

/* Étend les préférences en ensembles de dates par médecin. */
function plIndexerPreferences(preferences, etat) {
  const bloquantes = plBloq();
  (preferences || []).forEach((p) => {
    if (!etat.indispo[p.doctor_id]) return; // médecin hors équipe
    const estBloquant = bloquantes.includes(p.pref_type);
    const estSouhait = p.pref_type === "souhait";
    let d = p.start_date;
    while (d <= p.end_date) {
      if (estBloquant) etat.indispo[p.doctor_id].add(d);
      if (estSouhait) etat.souhait[p.doctor_id].add(d);
      d = plAdd(d, 1);
    }
  });
}

/* Médecin planifiable ce jour-là ? (disponibilité — contraintes dures). */
function plDispo(m, date, etat) {
  if (m.contract_start && date < m.contract_start) return false;
  if (m.contract_end && date > m.contract_end) return false;
  const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
  if (!jt.includes(plJourSemaine(date))) return false;
  if (etat.indispo[m.id].has(date)) return false;
  if (etat.bloque[m.id].has(date)) return false;
  if (etat.assigneJour[date] && etat.assigneJour[date].has(m.id)) return false;
  return true;
}

/* Trie les médecins du plus « prioritaire à servir » au moins prioritaire.
   critere : 'garde' = le moins de gardes d'abord ; 'weekend' = le moins de
   week-ends ; sinon on départage par charge horaire relative à la cible.

   Module 7 — équité trimestrielle : si les poids de disponibilité sont
   présents dans l'état (mode trimestriel), on trie par DÉFICIT RELATIF
   (compte / poids) au lieu du compte brut. Le poids = fte × jours de
   présence sur le trimestre → la distribution devient proportionnelle à
   la disponibilité de chacun. Sans poids (mode mensuel), comportement
   inchangé (compte brut). */
function plTrier(liste, critere, etat) {
  const EPS = 1e-9;
  function scoreGarde(id) {
    if (etat.poidsGarde) return etat.nbGardes[id] / Math.max(etat.poidsGarde[id] || 0, EPS);
    return etat.nbGardes[id];
  }
  function scoreWeekend(id) {
    if (etat.poidsWeekend) return etat.nbWeekend[id] / Math.max(etat.poidsWeekend[id] || 0, EPS);
    return etat.nbWeekend[id];
  }
  return liste.slice().sort((a, b) => {
    if (critere === "garde") {
      const sa = scoreGarde(a.id), sb = scoreGarde(b.id);
      if (sa !== sb) return sa - sb;
    }
    if (critere === "weekend") {
      const sa = scoreWeekend(a.id), sb = scoreWeekend(b.id);
      if (sa !== sb) return sa - sb;
    }
    const ra = etat.heures[a.id] / (a.weekly_hours_target || 52);
    const rb = etat.heures[b.id] / (b.weekly_hours_target || 52);
    if (ra !== rb) return ra - rb;
    return String(a.id).localeCompare(String(b.id)); // déterministe
  });
}

function plMarquerAssigne(date, id, etat) {
  if (!etat.assigneJour[date]) etat.assigneJour[date] = new Set();
  etat.assigneJour[date].add(id);
}

/* Enregistre un shift et met à jour l'état (heures, gardes, repos 12 h). */
function plAffecter(sortie, etat, date, type, doctorId, poste) {
  sortie.push({ date, shift_type: type, poste: poste || null, doctor_id: doctorId });
  plMarquerAssigne(date, doctorId, etat);
  etat.heures[doctorId] += PL_HEURES[type];
  if (type === "garde_nuit" || type === "garde_24h") {
    etat.nbGardes[doctorId]++;
    etat.bloque[doctorId].add(plAdd(date, 1)); // repos 12 h → lendemain off
  }
}

/* Choisit la station d'un médecin : sa station de la semaine si encore
   libre (continuité), sinon la première station libre. */
function plChoisirStation(med, postes, plan, etat, cle) {
  const pref = etat.station[med.id][cle];
  if (pref && !(pref in plan)) return pref;
  return postes.find((c) => !(c in plan)) || postes[0];
}


/* ------------------------- Jour de SEMAINE ----------------------------- */
function plGenererSemaine(date, medecins, etat, sortie, conflits) {
  const cle = plLundiDe(date);
  const postes = plPostes().map((p) => p.code);
  const libres = medecins.filter((m) => plDispo(m, date, etat));
  const residents = libres.filter((m) => m.grade === "resident");

  // 1) NUIT : ≥2 dont ≥1 résident. Le résident démarre à 17 h (garde_nuit),
  //    le 2e (AS de préférence) fait une garde 24 h qui occupe une station.
  let resNuit = null, second = null;
  if (residents.length > 0) {
    resNuit = plTrier(residents, "garde", etat)[0];
    const reste = libres.filter((m) => m.id !== resNuit.id);
    const as = reste.filter((m) => m.grade === "assistant_specialiste");
    second = (as.length ? plTrier(as, "garde", etat) : plTrier(reste, "garde", etat))[0] || null;
  } else {
    conflits.push({ date, message: "Nuit : aucun résident disponible (≥1 obligatoire)." });
  }

  const pris = new Set();
  if (resNuit) pris.add(resNuit.id);
  if (second) pris.add(second.id);

  // 2) JOUR : pourvoir les stations (continuité clinique d'abord).
  const plan = {}; // codeStation -> doctorId
  if (second) {
    const st = plChoisirStation(second, postes, plan, etat, cle);
    plan[st] = second.id;
    etat.station[second.id][cle] = st;
  }
  const pool = plTrier(libres.filter((m) => !pris.has(m.id)), "jour", etat);
  // 2a) Continuité : on replace chacun sur sa station de la semaine si libre.
  pool.forEach((m) => {
    if (Object.values(plan).includes(m.id)) return;
    const st = etat.station[m.id][cle];
    if (st && !(st in plan)) plan[st] = m.id;
  });
  // 2b) On comble les stations encore vides.
  postes.forEach((code) => {
    if (code in plan) return;
    const cand = pool.find((m) => !Object.values(plan).includes(m.id));
    if (cand) { plan[code] = cand.id; etat.station[cand.id][cle] = code; }
  });

  // Détection des conflits de couverture (contraintes dures non satisfaites).
  if (resNuit && !second) {
    conflits.push({ date, message: "Nuit : 2e médecin de garde indisponible (≥2 requis)." });
  }
  const remplies = postes.filter((c) => c in plan).length;
  if (remplies < postes.length) {
    conflits.push({ date, message: `Jour : ${remplies}/${postes.length} postes pourvus (effectif insuffisant).` });
  }

  // 3) Affectations effectives.
  if (resNuit) plAffecter(sortie, etat, date, "garde_nuit", resNuit.id, null);
  if (second) {
    const st = Object.keys(plan).find((c) => plan[c] === second.id);
    plAffecter(sortie, etat, date, "garde_24h", second.id, st || null);
  }
  Object.keys(plan).forEach((code) => {
    const id = plan[code];
    if (second && id === second.id) return; // déjà affecté en garde 24 h
    plAffecter(sortie, etat, date, "jour", id, code);
  });
}


/* --------------------- Jour de WEEK-END / FÉRIÉ ------------------------ */
function plGenererWeekend(date, medecins, etat, sortie, conflits) {
  const couv = plCouv();
  const libres = medecins.filter((m) => plDispo(m, date, etat));
  const residents = libres.filter((m) => m.grade === "resident");

  if (libres.length < couv.twe_weekend) {
    conflits.push({ date, message: `Week-end : ${libres.length} médecin(s) dispo (${couv.twe_weekend} requis).` });
  }

  // 2 gardes 24 h dont ≥1 résident.
  let g1 = null, g2 = null;
  if (residents.length > 0) {
    g1 = plTrier(residents, "weekend", etat)[0];
    const reste = libres.filter((m) => m.id !== g1.id);
    const as = reste.filter((m) => m.grade === "assistant_specialiste");
    g2 = (as.length ? plTrier(as, "weekend", etat) : plTrier(reste, "weekend", etat))[0] || null;
  } else {
    conflits.push({ date, message: "Week-end nuit : aucun résident disponible (≥1 obligatoire)." });
  }

  // 1 médecin au TWE seul.
  const pris = new Set([g1 && g1.id, g2 && g2.id].filter(Boolean));
  const t1 = plTrier(libres.filter((m) => !pris.has(m.id)), "weekend", etat)[0] || null;

  if (g1 && !g2) conflits.push({ date, message: "Week-end : 2e garde 24 h indisponible." });
  if (!t1) conflits.push({ date, message: "Week-end : médecin du tour (TWE) manquant." });

  // Affectations + récupération après garde de week-end.
  const j = plJourSemaine(date);
  [g1, g2].forEach((g) => {
    if (!g) return;
    plAffecter(sortie, etat, date, "garde_24h", g.id, null);
    etat.nbWeekend[g.id]++;
    if (j === 6) {
      etat.bloque[g.id].add(plAdd(date, 2)); // samedi → lundi off (dimanche déjà repos 12 h)
    } else if (j === 7) {
      etat.bloque[g.id].add(plAdd(date, 1)); // dimanche → lundi
      etat.bloque[g.id].add(plAdd(date, 2)); //          → mardi
    }
  });
  if (t1) { plAffecter(sortie, etat, date, "twe", t1.id, null); etat.nbWeekend[t1.id]++; }
}


/* --------------------------- Point d'entrée ---------------------------- */
/* opts = { annee, mois (1-12), medecins:[...], preferences:[...] }
   Renvoie { shifts, conflits, stats }. */
function genererPlanning(opts) {
  const annee = opts.annee;
  const mois = opts.mois;
  const medecins = opts.medecins || [];
  const preferences = opts.preferences || [];

  const etat = plNouvelEtat(medecins);
  plIndexerPreferences(preferences, etat);

  const sortie = [];
  const conflits = [];
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();

  for (let j = 1; j <= nbJours; j++) {
    const date = annee + "-" + String(mois).padStart(2, "0") + "-" + String(j).padStart(2, "0");
    if (plEstWeekendOuFerie(date)) plGenererWeekend(date, medecins, etat, sortie, conflits);
    else plGenererSemaine(date, medecins, etat, sortie, conflits);
  }

  const stats = medecins.map((m) => ({
    id: m.id,
    heures: Math.round(etat.heures[m.id] * 10) / 10,
    gardes: etat.nbGardes[m.id],
    weekends: etat.nbWeekend[m.id],
  }));

  return { shifts: sortie, conflits, stats };
}


/* =====================================================================
   MODULE 7 — Génération trimestrielle (algorithme v2)
   ---------------------------------------------------------------------
   Génère les 3 mois d'un trimestre civil EN UNE PASSE, avec un état
   PARTAGÉ : les compteurs de gardes / week-ends s'accumulent sur tout le
   trimestre. L'équité devient proportionnelle à la disponibilité de
   chacun grâce aux POIDS calculés ici, puis exploités par plTrier
   (déficit relatif = compte / poids).

   Poids (par médecin, sur le trimestre) :
     - poidsGarde   = fte × (nb de jours où le médecin est planifiable)
     - poidsWeekend = fte × (nb de jours de WEEK-END/férié planifiables)
   « planifiable » ici = sous contrat, jour travaillable, hors préférence
   bloquante (congé / indispo / off-clinic / récup). C'est la définition
   « jours de présence » des SPÉCIFICATIONS.

   Fonction PURE. opts = { annee, trimestre (1-4), medecins, preferences }.
   Renvoie { shifts, conflits, stats, mois:[m1,m2,m3] }.
   ===================================================================== */

/* Disponibilité STATIQUE d'un médecin un jour donné : ne dépend que du
   contrat, des jours travaillables et des préférences bloquantes (pas de
   l'état dynamique). Sert à calculer les poids d'équité. */
function plDispoStatique(m, date, indispoSet) {
  if (m.contract_start && date < m.contract_start) return false;
  if (m.contract_end && date > m.contract_end) return false;
  const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
  if (!jt.includes(plJourSemaine(date))) return false;
  if (indispoSet && indispoSet.has(date)) return false;
  return true;
}

/* Liste des dates ISO d'un mois (1-12). */
function plDatesDuMois(annee, mois) {
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const dates = [];
  for (let j = 1; j <= nbJours; j++) {
    dates.push(annee + "-" + String(mois).padStart(2, "0") + "-" + String(j).padStart(2, "0"));
  }
  return dates;
}

function genererTrimestre(opts) {
  const annee = opts.annee;
  const trimestre = opts.trimestre;                 // 1-4
  const medecins = opts.medecins || [];
  const preferences = opts.preferences || [];
  const moisTrim = [0, 1, 2].map((k) => (trimestre - 1) * 3 + 1 + k); // ex. T2 -> [4,5,6]

  // État PARTAGÉ sur les 3 mois (les compteurs ne se réinitialisent pas).
  const etat = plNouvelEtat(medecins);
  plIndexerPreferences(preferences, etat);

  // --- Poids d'équité : jours de présence sur le trimestre entier ---
  etat.poidsGarde = {};
  etat.poidsWeekend = {};
  medecins.forEach((m) => {
    let dispoTotal = 0, dispoWeekend = 0;
    const indispoSet = etat.indispo[m.id];
    moisTrim.forEach((mois) => {
      plDatesDuMois(annee, mois).forEach((date) => {
        if (!plDispoStatique(m, date, indispoSet)) return;
        dispoTotal++;
        if (plEstWeekendOuFerie(date)) dispoWeekend++;
      });
    });
    const fte = (typeof m.fte === "number" && m.fte > 0) ? m.fte : 1;
    etat.poidsGarde[m.id] = fte * dispoTotal;
    etat.poidsWeekend[m.id] = fte * dispoWeekend;
  });

  // --- Génération jour par jour sur les 3 mois, état partagé ---
  const sortie = [];
  const conflits = [];
  moisTrim.forEach((mois) => {
    plDatesDuMois(annee, mois).forEach((date) => {
      if (plEstWeekendOuFerie(date)) plGenererWeekend(date, medecins, etat, sortie, conflits);
      else plGenererSemaine(date, medecins, etat, sortie, conflits);
    });
  });

  const stats = medecins.map((m) => ({
    id: m.id,
    heures: Math.round(etat.heures[m.id] * 10) / 10,
    gardes: etat.nbGardes[m.id],
    weekends: etat.nbWeekend[m.id],
    poidsGarde: etat.poidsGarde[m.id],
    poidsWeekend: etat.poidsWeekend[m.id],
  }));

  return { shifts: sortie, conflits, stats, mois: moisTrim };
}


/* ===================================================================== */
/* MODULE 6 — Vérification d'un planning (fonction PURE)                  */
/* --------------------------------------------------------------------- */
/* Contrôle un ensemble de shifts (généré OU ajusté manuellement) au      */
/* regard des contraintes DURES, et renvoie la liste des conflits. Sert   */
/* à : (1) revalider après une retouche manuelle, (2) afficher le panneau */
/* « conflits » de l'admin. Aucune dépendance DOM/Supabase.               */
/*                                                                        */
/* opts = { annee, mois (1-12), shifts:[{date,shift_type,doctor_id,poste}],*/
/*          medecins:[...], preferences:[...] (optionnel) }               */
/* Renvoie un tableau de conflits : [{ date, message }].                  */
/* ===================================================================== */
function validerPlanning(opts) {
  const annee = opts.annee;
  const mois = opts.mois;
  const shifts = opts.shifts || [];
  const medecins = opts.medecins || [];
  const conflits = [];

  const postesCodes = plPostes().map((p) => p.code);
  const couv = plCouv();
  const bloquantes = plBloq();

  // Index médecins par id.
  const medById = {};
  medecins.forEach((m) => { medById[m.id] = m; });

  // Index des dates bloquées par préférence (congé / indispo / off / récup).
  const indispo = {};
  (opts.preferences || []).forEach((p) => {
    if (!bloquantes.includes(p.pref_type)) return;
    if (!indispo[p.doctor_id]) indispo[p.doctor_id] = new Set();
    let d = p.start_date;
    while (d <= p.end_date) { indispo[p.doctor_id].add(d); d = plAdd(d, 1); }
  });

  // Regroupements.
  const parDate = {};          // date -> [shift]
  const datesParMed = {};      // doctorId -> { date -> [shift] }
  shifts.forEach((s) => {
    (parDate[s.date] = parDate[s.date] || []).push(s);
    const dm = (datesParMed[s.doctor_id] = datesParMed[s.doctor_id] || {});
    (dm[s.date] = dm[s.date] || []).push(s);
  });

  const estResident = (id) => medById[id] && medById[id].grade === "resident";
  const nom = (id) => (medById[id] && medById[id].name) ? medById[id].name : "?";

  // ---- 1) Couverture jour par jour (sur tout le mois) ----
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  for (let j = 1; j <= nbJours; j++) {
    const date = annee + "-" + String(mois).padStart(2, "0") + "-" + String(j).padStart(2, "0");
    const duJour = parDate[date] || [];
    const gardes = duJour.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h");
    const auMoinsUnResident = gardes.some((s) => estResident(s.doctor_id));

    if (plEstWeekendOuFerie(date)) {
      const g24 = duJour.filter((s) => s.shift_type === "garde_24h");
      const twe = duJour.filter((s) => s.shift_type === "twe");
      const auTour = g24.length + twe.length;
      if (auTour < couv.twe_weekend) {
        conflits.push({ date, message: `Week-end : ${auTour}/${couv.twe_weekend} médecin(s) au tour (TWE).` });
      }
      if (g24.length < couv.gardes_weekend) {
        conflits.push({ date, message: `Week-end : ${g24.length}/${couv.gardes_weekend} garde(s) 24h.` });
      }
      if (g24.length > 0 && !g24.some((s) => estResident(s.doctor_id))) {
        conflits.push({ date, message: "Week-end : aucun résident en garde 24h (≥1 requis)." });
      }
      duJour.filter((s) => s.shift_type === "jour").forEach((s) => {
        conflits.push({ date, message: `Week-end : ${nom(s.doctor_id)} a un shift de jour (incohérent).` });
      });
    } else {
      // Jour de semaine : 7 stations + nuit ≥2 dont ≥1 résident.
      const occupants = {}; // code station -> [doctorId]
      duJour.forEach((s) => {
        if (s.poste) (occupants[s.poste] = occupants[s.poste] || []).push(s.doctor_id);
      });
      const pourvues = postesCodes.filter((c) => occupants[c] && occupants[c].length >= 1);
      if (pourvues.length < postesCodes.length) {
        conflits.push({ date, message: `Jour : ${pourvues.length}/${postesCodes.length} stations pourvues.` });
      }
      postesCodes.forEach((c) => {
        if (occupants[c] && occupants[c].length > 1) {
          conflits.push({ date, message: `Jour : station ${c} affectée à ${occupants[c].length} médecins.` });
        }
      });
      if (gardes.length < couv.min_nuit) {
        conflits.push({ date, message: `Nuit : ${gardes.length}/${couv.min_nuit} médecin(s) de garde.` });
      }
      if (gardes.length > 0 && !auMoinsUnResident) {
        conflits.push({ date, message: "Nuit : aucun résident de garde (≥1 requis)." });
      }
    }
  }

  // ---- 2) Contrôles par médecin ----
  Object.keys(datesParMed).forEach((id) => {
    const dm = datesParMed[id];
    const med = medById[id];
    const estGarde = (s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h";

    Object.keys(dm).forEach((date) => {
      const duJour = dm[date];
      // Shifts de TRAVAIL du jour (on exclut les absences/repos posés).
      const travail = duJour.filter((s) => !plEstAbsence(s.shift_type));
      const aTravail = travail.length > 0;

      // 2a) Double affectation le même jour (toutes catégories confondues).
      if (duJour.length > 1) {
        conflits.push({ date, message: `${nom(id)} : ${duJour.length} entrées le même jour (double affectation).` });
      }

      // Les contrôles suivants ne concernent que les shifts de TRAVAIL :
      // une absence (récup/off/congé) est précisément ce qui rend libre.
      if (!aTravail) return;

      // 2b) Disponibilité (contrat / jours travaillables / préférence bloquante).
      if (med) {
        if (med.contract_start && date < med.contract_start) {
          conflits.push({ date, message: `${nom(id)} : affecté hors contrat (avant le début).` });
        }
        if (med.contract_end && date > med.contract_end) {
          conflits.push({ date, message: `${nom(id)} : affecté hors contrat (après la fin).` });
        }
        const jt = (med.jours_travailles && med.jours_travailles.length) ? med.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
        if (!jt.includes(plJourSemaine(date))) {
          conflits.push({ date, message: `${nom(id)} : affecté un jour non travaillable.` });
        }
      }
      if (indispo[id] && indispo[id].has(date)) {
        conflits.push({ date, message: `${nom(id)} : affecté pendant un congé / une indisponibilité.` });
      }

      // 2c) Repos 12h : aucune garde la veille d'un shift de travail.
      const veille = plAdd(date, -1);
      if (dm[veille] && dm[veille].some(estGarde)) {
        conflits.push({ date, message: `${nom(id)} : repos 12h non respecté (travail au lendemain d'une garde).` });
      }

      // 2d) Récup week-end : garde 24h le samedi → lundi off ;
      //     le dimanche → lundi + mardi off.
      const sam = plAdd(date, -2);
      if (dm[sam] && plJourSemaine(sam) === 6 &&
          dm[sam].some((s) => s.shift_type === "garde_24h") && plJourSemaine(date) === 1) {
        conflits.push({ date, message: `${nom(id)} : récup non respectée (travail le lundi après garde du samedi).` });
      }
      const dim1 = plAdd(date, -1);
      const dim2 = plAdd(date, -2);
      if (dm[dim1] && plJourSemaine(dim1) === 7 && dm[dim1].some((s) => s.shift_type === "garde_24h")) {
        conflits.push({ date, message: `${nom(id)} : récup non respectée (travail le lundi après garde du dimanche).` });
      }
      if (dm[dim2] && plJourSemaine(dim2) === 7 && dm[dim2].some((s) => s.shift_type === "garde_24h") && plJourSemaine(date) === 2) {
        conflits.push({ date, message: `${nom(id)} : récup non respectée (travail le mardi après garde du dimanche).` });
      }
    });
  });

  // Tri par date pour un affichage lisible.
  conflits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return conflits;
}


/* Compteurs par médecin (heures / gardes / week-ends) à partir d'une
   liste de shifts. Pur, réutilisé par le panneau admin (Module 6). */
function compterParMedecin(shifts) {
  const stats = {}; // doctorId -> { heures, gardes, weekends }
  (shifts || []).forEach((s) => {
    const st = stats[s.doctor_id] || (stats[s.doctor_id] = { heures: 0, gardes: 0, weekends: 0 });
    st.heures += PL_HEURES[s.shift_type] || 0;
    if (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") st.gardes++;
    if (plEstWeekendOuFerie(s.date) && (s.shift_type === "garde_24h" || s.shift_type === "twe")) st.weekends++;
  });
  Object.keys(stats).forEach((id) => { stats[id].heures = Math.round(stats[id].heures * 10) / 10; });
  return stats;
}


/* ------------- Export pour Node (tests). Sans effet en navigateur. ------ */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { genererPlanning, genererTrimestre, validerPlanning, compterParMedecin };
}
