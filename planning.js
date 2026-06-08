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

/* Off-clinic (§9) : journée de recherche CRÉDITÉE comme heures de travail
   (équivalent d'une journée), mais sans station ni repos généré. */
const PL_HEURES_OFFCLINIC = 10.5;

/* Types d'« absence / repos » (0 h, sans station). Doivent coller aux types
   absence de SHIFT_CONFIG (app.js).
   - 'repos_garde' : repos OBLIGATOIRE post-garde, matérialisé automatiquement,
     affiché dans le planning mais NON comptabilisé dans les totaux.
   - 'recup'       : repos / récupération posé manuellement, COMPTABILISÉ. */
const PL_ABSENCES = ["recup", "repos_garde", "off", "conge_annuel", "conge_scientifique", "conge_extralegal"];
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
    // Gardes par semaine ISO (lundi) et par médecin : { id: { lundiISO: n } }.
    // Sert à la contrainte DURE « max 3 gardes/semaine » (spec §6 N1).
    gardesSemaine: {},
    // Week-ends travaillés : { id: Set(clé week-end = samedi ISO) }. Un week-end
    // compte une seule fois même si le médecin fait samedi ET dimanche (§7).
    // Sert à la priorité N2 « max 2 week-ends/mois ».
    weekendsTravailles: {},
    // Jours déclarés disponibles par médecin (Résidents indépendants, §2.2).
    dispoDeclaree: {},
    // Binôme TWE de week-end : date du dimanche -> id du médecin imposé
    // (celui qui a fait le TWE-seul du samedi doit refaire celui du dimanche).
    tweForce: {},
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
    e.gardesSemaine[m.id] = {};
    e.weekendsTravailles[m.id] = new Set();
    e.dispoDeclaree[m.id] = new Set(); // jours déclarés dispo (résidents indépendants)
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
    const estDispo = p.pref_type === "dispo"; // fenêtre déclarée (indépendants)
    let d = p.start_date;
    while (d <= p.end_date) {
      if (estBloquant) etat.indispo[p.doctor_id].add(d);
      if (estSouhait) etat.souhait[p.doctor_id].add(d);
      if (estDispo) etat.dispoDeclaree[p.doctor_id].add(d);
      d = plAdd(d, 1);
    }
  });
}

/* Le médecin est-il sous contrat ce jour-là ? Gère les périodes multiples
   (contract_periods : [{start,end}]) si présentes, sinon contract_start/end. */
function plSousContrat(m, date) {
  const periodes = m.contract_periods;
  if (Array.isArray(periodes) && periodes.length) {
    return periodes.some((p) =>
      (!p.start || date >= p.start) && (!p.end || date <= p.end));
  }
  if (m.contract_start && date < m.contract_start) return false;
  if (m.contract_end && date > m.contract_end) return false;
  return true;
}

/* Résident indépendant : planifiable UNIQUEMENT sur ses jours déclarés
   disponibles (§2.2, contrainte absolue). Les autres médecins : présumés
   disponibles. dispoSet = ensemble des dates déclarées (peut être absent). */
function plDispoIndependant(m, date, dispoSet) {
  if (m.statut !== "independant") return true;          // logique normale
  return !!(dispoSet && dispoSet.has(date));            // sinon : jours déclarés
}

/* Médecin planifiable ce jour-là ? (disponibilité — contraintes dures). */
function plDispo(m, date, etat) {
  if (!plSousContrat(m, date)) return false;
  if (!plDispoIndependant(m, date, etat.dispoDeclaree[m.id])) return false;
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

/* Contrainte DURE : maximum de gardes par semaine et par personne (spec §6 N1). */
const PL_MAX_GARDES_SEMAINE = 3;

/* Nombre de gardes déjà posées au médecin durant la semaine (lundi) de `date`. */
function plGardesSemaine(id, date, etat) {
  const lk = plLundiDe(date);
  return (etat.gardesSemaine[id] && etat.gardesSemaine[id][lk]) || 0;
}

/* Plafond N2 : max 2 week-ends travaillés par mois et par personne (§6 N2). */
const PL_MAX_WEEKENDS_MOIS = 2;

/* Clé d'un week-end = samedi ISO. Samedi -> lui-même ; dimanche -> la veille.
   Un jour de semaine (férié isolé) ne définit pas de clé (return null). */
function plWeekendKey(date) {
  const j = plJourSemaine(date);
  if (j === 6) return date;
  if (j === 7) return plAdd(date, -1);
  return null;
}

/* Le médecin peut-il prendre CE week-end sans dépasser le plafond mensuel ?
   Vrai s'il y travaille déjà (même clé) ou s'il a < 2 week-ends ce mois-ci. */
function plPeutWeekend(id, date, etat) {
  const key = plWeekendKey(date);
  if (!key) return true;                 // férié en semaine : hors plafond week-end
  const set = etat.weekendsTravailles[id];
  if (set.has(key)) return true;         // déjà engagé sur ce week-end → pas un nouveau
  const mois = date.slice(0, 7);
  let n = 0;
  set.forEach((k) => { if (k.slice(0, 7) === mois) n++; });
  return n < PL_MAX_WEEKENDS_MOIS;
}

/* Choisit le meilleur candidat (critère 'weekend') en privilégiant ceux qui
   respectent le plafond de 2 week-ends/mois ; repli sur toute la liste si
   aucun ne le respecte (la règle N2 est violable en dernier recours). */
function plChoisirWE(liste, date, etat) {
  const ok = liste.filter((m) => plPeutWeekend(m.id, date, etat));
  return plTrier(ok.length ? ok : liste, "weekend", etat)[0] || null;
}

/* Enregistre un shift et met à jour l'état (heures, gardes, repos 12 h). */
function plAffecter(sortie, etat, date, type, doctorId, poste) {
  sortie.push({ date, shift_type: type, poste: poste || null, doctor_id: doctorId });
  plMarquerAssigne(date, doctorId, etat);
  etat.heures[doctorId] += PL_HEURES[type];
  if (type === "garde_nuit" || type === "garde_24h") {
    etat.nbGardes[doctorId]++;
    const lk = plLundiDe(date);
    etat.gardesSemaine[doctorId][lk] = (etat.gardesSemaine[doctorId][lk] || 0) + 1;
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
  // Vivier pour les GARDES : on retire ceux qui ont déjà atteint le max
  // hebdomadaire (contrainte DURE, spec §6 N1).
  const libresG = libres.filter((m) => plGardesSemaine(m.id, date, etat) < PL_MAX_GARDES_SEMAINE);
  const residents = libresG.filter((m) => m.grade === "resident");

  // 1) NUIT : ≥2 dont ≥1 résident, JAMAIS 2 A/S. Le résident démarre à 17 h
  //    (garde_nuit), le 2e (A/S de préférence) fait une garde 24 h qui occupe
  //    une station. Comme l'un des deux est toujours un résident, la règle
  //    « jamais 2 A/S ensemble » est structurellement garantie.
  let resNuit = null, second = null;
  if (residents.length > 0) {
    resNuit = plTrier(residents, "garde", etat)[0];
    const reste = libresG.filter((m) => m.id !== resNuit.id);
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
  const j = plJourSemaine(date);
  const libres = medecins.filter((m) => plDispo(m, date, etat));

  if (libres.length < couv.twe_weekend) {
    conflits.push({ date, message: `Week-end : ${libres.length} médecin(s) dispo (${couv.twe_weekend} requis).` });
  }

  // RÈGLE BINÔME TWE : le médecin du TWE-seul du samedi doit refaire le TWE
  // du dimanche, SANS garde (pour limiter le nombre de week-ends différents
  // amenés à l'hôpital). S'il est dispo, on le réserve d'emblée au TWE et on
  // l'exclut de la sélection des gardes 24 h.
  let t1 = null;
  const forceId = etat.tweForce[date];
  if (forceId) {
    t1 = libres.find((m) => m.id === forceId) || null;
    if (!t1) conflits.push({ date, message: "Week-end : médecin du TWE de samedi indisponible le dimanche (règle binôme)." });
  }

  // Vivier pour les gardes : tout le monde sauf le TWE imposé (sans garde),
  // et hors max hebdomadaire de gardes (contrainte DURE, spec §6 N1).
  const libresGarde = (t1 ? libres.filter((m) => m.id !== t1.id) : libres)
    .filter((m) => plGardesSemaine(m.id, date, etat) < PL_MAX_GARDES_SEMAINE);
  const residentsG = libresGarde.filter((m) => m.grade === "resident");

  // 2 gardes 24 h dont ≥1 résident. On privilégie ceux qui n'ont pas encore
  // 2 week-ends ce mois-ci (priorité N2 « max 2 week-ends/mois »).
  let g1 = null, g2 = null;
  if (residentsG.length > 0) {
    g1 = plChoisirWE(residentsG, date, etat);
    const reste = libresGarde.filter((m) => m.id !== g1.id);
    const as = reste.filter((m) => m.grade === "assistant_specialiste");
    g2 = plChoisirWE(as.length ? as : reste, date, etat);
  } else {
    conflits.push({ date, message: "Week-end nuit : aucun résident disponible (≥1 obligatoire)." });
  }

  // TWE-seul : l'imposé (binôme) sinon le plus prioritaire restant (même priorité N2).
  const pris = new Set([g1 && g1.id, g2 && g2.id, t1 && t1.id].filter(Boolean));
  if (!t1) t1 = plChoisirWE(libres.filter((m) => !pris.has(m.id)), date, etat);

  // Samedi : on mémorise le binôme à imposer le dimanche.
  if (j === 6 && t1) etat.tweForce[plAdd(date, 1)] = t1.id;

  if (g1 && !g2) conflits.push({ date, message: "Week-end : 2e garde 24 h indisponible." });
  if (!t1) conflits.push({ date, message: "Week-end : médecin du tour (TWE) manquant." });

  // Un FÉRIÉ en semaine suit les règles de couverture du week-end mais NE
  // compte PAS comme « week-end travaillé » (spec §7). Seuls les vrais
  // samedis/dimanches incrémentent le compteur d'équité week-end.
  const estVraiWeekend = (j === 6 || j === 7);

  const wkey = plWeekendKey(date); // clé week-end (samedi) ou null si férié en semaine

  // Affectations + récupération après garde de week-end.
  [g1, g2].forEach((g) => {
    if (!g) return;
    plAffecter(sortie, etat, date, "garde_24h", g.id, null);
    if (estVraiWeekend) { etat.nbWeekend[g.id]++; if (wkey) etat.weekendsTravailles[g.id].add(wkey); }
    if (j === 6) {
      etat.bloque[g.id].add(plAdd(date, 2)); // samedi → lundi off (dimanche déjà repos 12 h)
    } else if (j === 7) {
      etat.bloque[g.id].add(plAdd(date, 1)); // dimanche → lundi
      etat.bloque[g.id].add(plAdd(date, 2)); //          → mardi
    }
  });
  if (t1) {
    plAffecter(sortie, etat, date, "twe", t1.id, null);
    if (estVraiWeekend) { etat.nbWeekend[t1.id]++; if (wkey) etat.weekendsTravailles[t1.id].add(wkey); }
  }
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

  // Matérialise les repos de garde (visibles, non comptabilisés).
  const bM = plBornesMois(annee, mois);
  materialiserRepos(sortie, (d) => d >= bM.debut && d <= bM.fin).forEach((r) => sortie.push(r));

  // Placement automatique des off-clinic (§9), une fois le planning posé.
  const offs = genererOffClinic({ annee, mois, medecins, shifts: sortie, preferences });
  offs.forEach((o) => { sortie.push(o); etat.heures[o.doctor_id] += PL_HEURES_OFFCLINIC; });

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
function plDispoStatique(m, date, indispoSet, dispoSet) {
  if (!plSousContrat(m, date)) return false;
  if (!plDispoIndependant(m, date, dispoSet)) return false;
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
    const dispoSet = etat.dispoDeclaree[m.id];
    moisTrim.forEach((mois) => {
      plDatesDuMois(annee, mois).forEach((date) => {
        if (!plDispoStatique(m, date, indispoSet, dispoSet)) return;
        dispoTotal++;
        // Poids week-end aligné sur le comptage (§7) : samedis/dimanches réels.
        const jr = plJourSemaine(date);
        if (jr === 6 || jr === 7) dispoWeekend++;
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

  // Repos de garde matérialisés sur tout le trimestre (avant l'off-clinic).
  const bDeb = plBornesMois(annee, moisTrim[0]).debut;
  const bFin = plBornesMois(annee, moisTrim[2]).fin;
  materialiserRepos(sortie, (d) => d >= bDeb && d <= bFin).forEach((r) => sortie.push(r));

  // Off-clinic (§9) : droit calculé par MOIS, posé après la génération.
  moisTrim.forEach((mois) => {
    const offs = genererOffClinic({ annee, mois, medecins, shifts: sortie, preferences });
    offs.forEach((o) => { sortie.push(o); etat.heures[o.doctor_id] += PL_HEURES_OFFCLINIC; });
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


/* =====================================================================
   MODULE 11 — Placement automatique des jours OFF-CLINIC (spec §9)
   ---------------------------------------------------------------------
   Jours de recherche pour les Résidents DÉPENDANTS uniquement. Droit
   mensuel selon le total de jours d'absence du mois :
       0 à 4 absences -> 2 off-clinic ; 5 à 9 -> 1 ; 10+ -> 0.
   Placement : jours ouvrables ordinaires (lun-ven hors férié) où le
   médecin est libre, JAMAIS le jour d'une garde, ni le lendemain d'une
   garde (post-garde/repos), ni la veille d'une garde (« ne peut précéder
   une garde »). Off-clinic = 0 station, pas de repos généré ; crédité en
   heures par compterParMedecin.

   Fonction PURE. opts = { annee, mois (1-12), medecins, shifts, preferences }.
   Renvoie les shifts off-clinic à AJOUTER (type "off").
   ===================================================================== */
function genererOffClinic(opts) {
  const annee = opts.annee, mois = opts.mois;
  const medecins = opts.medecins || [];
  const shifts = opts.shifts || [];
  const bloquantes = plBloq();

  // Index des shifts par médecin et par date.
  const byMed = {};
  shifts.forEach((s) => {
    const m = (byMed[s.doctor_id] = byMed[s.doctor_id] || {});
    (m[s.date] = m[s.date] || []).push(s);
  });

  // Index des dates bloquées par préférence (congé / indispo / récup / off_clinic).
  const prefBloq = {};
  (opts.preferences || []).forEach((p) => {
    if (!bloquantes.includes(p.pref_type)) return;
    const set = (prefBloq[p.doctor_id] = prefBloq[p.doctor_id] || new Set());
    let d = p.start_date;
    while (d <= p.end_date) { set.add(d); d = plAdd(d, 1); }
  });
  const estBloque = (id, d) => !!(prefBloq[id] && prefBloq[id].has(d));
  const shiftsDe = (id, d) => (byMed[id] && byMed[id][d]) || [];
  const aGarde = (id, d) => shiftsDe(id, d).some((x) => x.shift_type === "garde_nuit" || x.shift_type === "garde_24h");

  const dates = plDatesDuMois(annee, mois);
  const out = [];

  medecins.forEach((m) => {
    // Éligibilité : Résident dépendant uniquement (§9).
    if (m.grade !== "resident" || m.statut === "independant") return;

    // Total de jours d'absence du mois (tous types sauf l'off-clinic lui-même).
    const absSet = new Set();
    dates.forEach((d) => {
      const aAbsence = shiftsDe(m.id, d).some((x) => plEstAbsence(x.shift_type) && x.shift_type !== "off");
      if (aAbsence || estBloque(m.id, d)) absSet.add(d);
    });
    const abs = absSet.size;
    const droit = abs <= 4 ? 2 : abs <= 9 ? 1 : 0;
    if (droit === 0) return;

    // Placement sur les premiers jours ouvrables éligibles.
    let poses = 0;
    for (const d of dates) {
      if (poses >= droit) break;
      const j = plJourSemaine(d);
      if (j === 6 || j === 7) continue;            // pas le week-end
      if (plEstWeekendOuFerie(d)) continue;        // pas un férié (règles week-end)
      if (!plSousContrat(m, d)) continue;
      const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
      if (!jt.includes(j)) continue;
      if (shiftsDe(m.id, d).length > 0) continue;  // déjà un shift / une absence
      if (estBloque(m.id, d)) continue;            // congé / indispo
      if (aGarde(m.id, d)) continue;               // jamais le jour d'une garde
      if (aGarde(m.id, plAdd(d, -1))) continue;    // pas en post-garde (repos)
      if (aGarde(m.id, plAdd(d, 1))) continue;     // ne peut précéder une garde
      out.push({ date: d, shift_type: "off", poste: null, doctor_id: m.id });
      poses++;
    }
  });

  return out;
}


/* Matérialise les REPOS DE GARDE comme shifts « repos_garde » pour qu'ils
   apparaissent au calendrier / dans la grille / à l'export, SANS être
   comptabilisés (distinct du repos manuel « recup »). Repos = lendemain
   de toute garde (+ lundi/mardi selon la garde 24h de week-end). On ne pose
   un repos que dans la période et si le médecin n'a pas déjà un shift ce jour.
   dansPeriode(date) -> bool. Renvoie les shifts repos à AJOUTER. */
function materialiserRepos(shifts, dansPeriode) {
  const occupe = new Set(shifts.map((s) => s.doctor_id + "|" + s.date));
  const ajoutes = new Set();
  const out = [];
  shifts.forEach((s) => {
    if (s.shift_type !== "garde_nuit" && s.shift_type !== "garde_24h") return;
    const j = plJourSemaine(s.date);
    const jours = [plAdd(s.date, 1)]; // repos 12 h le lendemain
    if (s.shift_type === "garde_24h" && (j === 6 || j === 7)) jours.push(plAdd(s.date, 2));
    jours.forEach((d) => {
      if (dansPeriode && !dansPeriode(d)) return;
      const cle = s.doctor_id + "|" + d;
      if (occupe.has(cle) || ajoutes.has(cle)) return;
      ajoutes.add(cle);
      out.push({ date: d, shift_type: "repos_garde", poste: null, doctor_id: s.doctor_id });
    });
  });
  return out;
}

/* Bornes ISO (début, fin) d'un mois (1-12). */
function plBornesMois(annee, mois) {
  const ms = String(mois).padStart(2, "0");
  const fin = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return { debut: annee + "-" + ms + "-01", fin: annee + "-" + ms + "-" + String(fin).padStart(2, "0") };
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

  // Index des dates bloquées par préférence (congé / indispo / off / récup)
  // et des fenêtres déclarées disponibles (résidents indépendants).
  const indispo = {};
  const dispo = {};
  (opts.preferences || []).forEach((p) => {
    if (p.pref_type === "dispo") {
      if (!dispo[p.doctor_id]) dispo[p.doctor_id] = new Set();
      let d = p.start_date;
      while (d <= p.end_date) { dispo[p.doctor_id].add(d); d = plAdd(d, 1); }
      return;
    }
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
  const estAS = (id) => medById[id] && medById[id].grade === "assistant_specialiste";
  const nom = (id) => (medById[id] && medById[id].name) ? medById[id].name : "?";

  // ---- 1) Couverture jour par jour (sur tout le mois) ----
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  for (let j = 1; j <= nbJours; j++) {
    const date = annee + "-" + String(mois).padStart(2, "0") + "-" + String(j).padStart(2, "0");
    const duJour = parDate[date] || [];
    const gardes = duJour.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h");
    const auMoinsUnResident = gardes.some((s) => estResident(s.doctor_id));

    // Contrainte DURE (spec §6 N1) : jamais 2 A/S ensemble en garde.
    const nbASgarde = gardes.filter((s) => estAS(s.doctor_id)).length;
    if (nbASgarde >= 2) {
      conflits.push({ date, message: "Garde : 2 A/S ensemble (interdit)." });
    }

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
        if (!plSousContrat(med, date)) {
          conflits.push({ date, message: `${nom(id)} : affecté hors période contractuelle.` });
        }
        const jt = (med.jours_travailles && med.jours_travailles.length) ? med.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
        if (!jt.includes(plJourSemaine(date))) {
          conflits.push({ date, message: `${nom(id)} : affecté un jour non travaillable.` });
        }
        // Résident indépendant : seulement sur jours déclarés disponibles (§2.2).
        if (med.statut === "independant" && !(dispo[id] && dispo[id].has(date))) {
          conflits.push({ date, message: `${nom(id)} (indépendant) : affecté hors fenêtre déclarée disponible.` });
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

  // ---- 3) Max 3 gardes par semaine (lundi→dimanche) et par médecin (§6 N1) ----
  const gardesParSemaine = {}; // id -> { lundiISO -> n }
  shifts.forEach((s) => {
    if (s.shift_type !== "garde_nuit" && s.shift_type !== "garde_24h") return;
    const lk = plLundiDe(s.date);
    const m = (gardesParSemaine[s.doctor_id] = gardesParSemaine[s.doctor_id] || {});
    m[lk] = (m[lk] || 0) + 1;
  });
  Object.keys(gardesParSemaine).forEach((id) => {
    Object.keys(gardesParSemaine[id]).forEach((lk) => {
      const n = gardesParSemaine[id][lk];
      if (n > 3) {
        conflits.push({ date: lk, message: `${nom(id)} : ${n} gardes dans la semaine du ${lk} (max 3).` });
      }
    });
  });

  // ---- 4) Max 2 week-ends travaillés par mois et par médecin (§6 N2) ----
  // Un week-end = clé samedi ISO ; sam OU dim travaillé en garde 24h/tour le compte.
  const weekendsParMois = {}; // id -> { "YYYY-MM": Set(clé samedi) }
  shifts.forEach((s) => {
    if (s.shift_type !== "garde_24h" && s.shift_type !== "twe") return;
    const jr = plJourSemaine(s.date);
    if (jr !== 6 && jr !== 7) return; // férié en semaine : ne compte pas (§7)
    const key = jr === 6 ? s.date : plAdd(s.date, -1);
    const mois = s.date.slice(0, 7);
    const parMois = (weekendsParMois[s.doctor_id] = weekendsParMois[s.doctor_id] || {});
    (parMois[mois] = parMois[mois] || new Set()).add(key);
  });
  Object.keys(weekendsParMois).forEach((id) => {
    Object.keys(weekendsParMois[id]).forEach((mois) => {
      const n = weekendsParMois[id][mois].size;
      if (n > 2) {
        conflits.push({ date: mois + "-01", message: `${nom(id)} : ${n} week-ends travaillés en ${mois} (max 2, N2).` });
      }
    });
  });

  // Tri par date pour un affichage lisible.
  conflits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return conflits;
}


/* Compteurs par médecin (heures / gardes / week-ends / tours / off) à partir
   d'une liste de shifts. Pur, réutilisé par le panneau admin (Module 6). */
function compterParMedecin(shifts) {
  const stats = {}; // doctorId -> { heures, gardes, weekends, tours, offs }
  (shifts || []).forEach((s) => {
    const st = stats[s.doctor_id] ||
      (stats[s.doctor_id] = { heures: 0, gardes: 0, weekends: 0, tours: 0, offs: 0, repos: 0 });
    st.heures += PL_HEURES[s.shift_type] || 0;
    // Off-clinic crédité comme heures de travail (§9).
    if (s.shift_type === "off") { st.heures += PL_HEURES_OFFCLINIC; st.offs++; }
    if (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") st.gardes++;
    // Tour de week-end (TWE) : on en compte le total.
    if (s.shift_type === "twe") st.tours++;
    // Repos / récupération posé manuellement (comptabilisé). Le repos de garde
    // automatique ('repos_garde') est volontairement EXCLU des totaux : il est
    // seulement affiché dans le planning.
    if (s.shift_type === "recup") st.repos++;
    // Week-end travaillé = garde 24h ou tour un SAMEDI/DIMANCHE (spec §7).
    // Un férié en semaine ne compte pas.
    const jr = plJourSemaine(s.date);
    if ((jr === 6 || jr === 7) && (s.shift_type === "garde_24h" || s.shift_type === "twe")) st.weekends++;
  });
  Object.keys(stats).forEach((id) => { stats[id].heures = Math.round(stats[id].heures * 10) / 10; });
  return stats;
}


/* ------------- Export pour Node (tests). Sans effet en navigateur. ------ */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { genererPlanning, genererTrimestre, genererOffClinic, validerPlanning, compterParMedecin };
}
