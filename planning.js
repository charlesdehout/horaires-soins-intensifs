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
   week-ends ; sinon on départage par charge horaire relative à la cible. */
function plTrier(liste, critere, etat) {
  return liste.slice().sort((a, b) => {
    if (critere === "garde" && etat.nbGardes[a.id] !== etat.nbGardes[b.id]) {
      return etat.nbGardes[a.id] - etat.nbGardes[b.id];
    }
    if (critere === "weekend" && etat.nbWeekend[a.id] !== etat.nbWeekend[b.id]) {
      return etat.nbWeekend[a.id] - etat.nbWeekend[b.id];
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


/* ------------- Export pour Node (tests). Sans effet en navigateur. ------ */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { genererPlanning };
}
