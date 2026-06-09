/* Copie de test (générée pour exécution Node isolée) — miroir de planning.js. */
const _PL_REGLES = (typeof require !== "undefined")
  ? (function () { try { return require("./regles.js"); } catch (e) { return null; } })()
  : null;
function plFeries(annee) { return (_PL_REGLES ? _PL_REGLES.joursFeriesBE : joursFeriesBE)(annee); }
function plPostes()      { return _PL_REGLES ? _PL_REGLES.POSTES_JOUR     : POSTES_JOUR; }
function plCouv()        { return _PL_REGLES ? _PL_REGLES.COUVERTURE       : COUVERTURE; }
function plBloq()        { return _PL_REGLES ? _PL_REGLES.PREF_BLOQUANTES  : PREF_BLOQUANTES; }
const PL_EQUITE_DEFAUT = { plafond_hebdo: 60, plancher_ratio: 0.85 };
function plEquite() {
  const e = _PL_REGLES ? _PL_REGLES.EQUITE : (typeof EQUITE !== "undefined" ? EQUITE : null);
  return e || PL_EQUITE_DEFAUT;
}
const PL_HEURES = { jour: 10.5, twe: 6, garde_nuit: 15, garde_24h: 24 };
const PL_HEURES_OFFCLINIC = 10.5;
const PL_ABSENCES = ["recup", "repos_garde", "off", "conge_annuel", "conge_scientifique", "conge_extralegal"];
function plEstAbsence(type) { return PL_ABSENCES.indexOf(type) !== -1; }

function plIso(d) { return d.toISOString().slice(0, 10); }
function plParse(s) { return new Date(s + "T00:00:00Z"); }
function plAdd(s, n) { const d = plParse(s); d.setUTCDate(d.getUTCDate() + n); return plIso(d); }
function plJourSemaine(s) { const j = plParse(s).getUTCDay(); return j === 0 ? 7 : j; }
function plEstWeekendOuFerie(s) {
  const j = plJourSemaine(s);
  if (j === 6 || j === 7) return true;
  return plFeries(plParse(s).getUTCFullYear()).has(s);
}
function plLundiDe(s) { return plAdd(s, -(plJourSemaine(s) - 1)); }

function plNouvelEtat(medecins) {
  const e = {
    indispo: {}, souhait: {}, bloque: {}, assigneJour: {},
    nbGardes: {}, nbWeekend: {}, heures: {}, station: {},
    heuresSemaine: {}, gardesSemaine: {}, weekendsTravailles: {},
    dispoDeclaree: {}, tweForce: {},
    poidsGarde: null, poidsWeekend: null,
    derniereGarde: {},
  };
  medecins.forEach((m) => {
    e.indispo[m.id] = new Set();
    e.souhait[m.id] = new Set();
    e.bloque[m.id] = new Set();
    e.nbGardes[m.id] = 0;
    e.nbWeekend[m.id] = 0;
    e.heures[m.id] = 0;
    e.gardesSemaine[m.id] = {};
    e.heuresSemaine[m.id] = {};
    e.weekendsTravailles[m.id] = new Set();
    e.dispoDeclaree[m.id] = new Set();
    e.station[m.id] = {};
    e.derniereGarde[m.id] = null;
  });
  const eq = plEquite();
  e.plafondHebdo = eq.plafond_hebdo;
  e.plancherRatio = eq.plancher_ratio;
  e.concentrationNuits = eq.concentration_nuits !== false && eq.concentration_coeff > 0;
  e.concentrationCoeff = (typeof eq.concentration_coeff === "number") ? eq.concentration_coeff : 0;
  e.fenetreNuits = (typeof eq.fenetre_nuits === "number" && eq.fenetre_nuits > 0) ? eq.fenetre_nuits : 14;
  return e;
}

function plIndexerPreferences(preferences, etat) {
  const bloquantes = plBloq();
  (preferences || []).forEach((p) => {
    if (!etat.indispo[p.doctor_id]) return;
    const estBloquant = bloquantes.includes(p.pref_type);
    const estSouhait = p.pref_type === "souhait";
    const estDispo = p.pref_type === "dispo";
    let d = p.start_date;
    while (d <= p.end_date) {
      if (estBloquant) etat.indispo[p.doctor_id].add(d);
      if (estSouhait) etat.souhait[p.doctor_id].add(d);
      if (estDispo) etat.dispoDeclaree[p.doctor_id].add(d);
      d = plAdd(d, 1);
    }
  });
}

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
function plDispoIndependant(m, date, dispoSet) {
  if (m.statut !== "independant") return true;
  return !!(dispoSet && dispoSet.has(date));
}
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

const PL_EPS = 1e-9;
function plScoreGarde(id, etat) {
  if (etat.poidsGarde) return etat.nbGardes[id] / Math.max(etat.poidsGarde[id] || 0, PL_EPS);
  return etat.nbGardes[id];
}
function plScoreWeekend(id, etat) {
  if (etat.poidsWeekend) return etat.nbWeekend[id] / Math.max(etat.poidsWeekend[id] || 0, PL_EPS);
  return etat.nbWeekend[id];
}
function plTrier(liste, critere, etat) {
  return liste.slice().sort((a, b) => {
    if (critere === "garde") {
      const sa = plScoreGarde(a.id, etat), sb = plScoreGarde(b.id, etat);
      if (sa !== sb) return sa - sb;
    }
    if (critere === "weekend") {
      const sa = plScoreWeekend(a.id, etat), sb = plScoreWeekend(b.id, etat);
      if (sa !== sb) return sa - sb;
    }
    const ra = etat.heures[a.id] / (a.weekly_hours_target || 52);
    const rb = etat.heures[b.id] / (b.weekly_hours_target || 52);
    if (ra !== rb) return ra - rb;
    return String(a.id).localeCompare(String(b.id));
  });
}

function plDiffJours(a, b) { return (plParse(a) - plParse(b)) / 86400000; }
function plRecenceGarde(id, date, etat) {
  if (!etat.concentrationNuits) return 0;
  const last = etat.derniereGarde[id];
  if (!last) return 0;
  const gap = plDiffJours(date, last);
  if (gap <= 0 || gap > etat.fenetreNuits) return 0;
  return etat.concentrationCoeff * (etat.fenetreNuits - gap) / etat.fenetreNuits;
}
function plTrierGardeNuit(liste, date, etat) {
  return liste.slice().sort((a, b) => {
    const sa = plScoreGarde(a.id, etat), sb = plScoreGarde(b.id, etat);
    if (Math.abs(sa - sb) > PL_EPS) return sa - sb;
    const ra = plRecenceGarde(a.id, date, etat), rb = plRecenceGarde(b.id, date, etat);
    if (ra !== rb) return rb - ra;
    const ha = etat.heures[a.id] / (a.weekly_hours_target || 52);
    const hb = etat.heures[b.id] / (b.weekly_hours_target || 52);
    if (ha !== hb) return ha - hb;
    return String(a.id).localeCompare(String(b.id));
  });
}

function plMarquerAssigne(date, id, etat) {
  if (!etat.assigneJour[date]) etat.assigneJour[date] = new Set();
  etat.assigneJour[date].add(id);
}
const PL_MAX_GARDES_SEMAINE = 3;
function plGardesSemaine(id, date, etat) {
  const lk = plLundiDe(date);
  return (etat.gardesSemaine[id] && etat.gardesSemaine[id][lk]) || 0;
}
function plHeuresSemaine(id, date, etat) {
  const lk = plLundiDe(date);
  return (etat.heuresSemaine[id] && etat.heuresSemaine[id][lk]) || 0;
}
function plFiltrerPlafond(liste, date, etat, ajout) {
  const plaf = etat.plafondHebdo || PL_EQUITE_DEFAUT.plafond_hebdo;
  const ok = liste.filter((m) => plHeuresSemaine(m.id, date, etat) + ajout <= plaf);
  return ok.length ? ok : liste;
}
const PL_MAX_WEEKENDS_MOIS = 2;
function plWeekendKey(date) {
  const j = plJourSemaine(date);
  if (j === 6) return date;
  if (j === 7) return plAdd(date, -1);
  return null;
}
function plPeutWeekend(id, date, etat) {
  const key = plWeekendKey(date);
  if (!key) return true;
  const set = etat.weekendsTravailles[id];
  if (set.has(key)) return true;
  const mois = date.slice(0, 7);
  let n = 0;
  set.forEach((k) => { if (k.slice(0, 7) === mois) n++; });
  return n < PL_MAX_WEEKENDS_MOIS;
}
function plChoisirWE(liste, date, etat) {
  const ok = liste.filter((m) => plPeutWeekend(m.id, date, etat));
  return plTrier(ok.length ? ok : liste, "weekend", etat)[0] || null;
}
function plAffecter(sortie, etat, date, type, doctorId, poste) {
  sortie.push({ date, shift_type: type, poste: poste || null, doctor_id: doctorId });
  plMarquerAssigne(date, doctorId, etat);
  etat.heures[doctorId] += PL_HEURES[type];
  const lkH = plLundiDe(date);
  etat.heuresSemaine[doctorId][lkH] = (etat.heuresSemaine[doctorId][lkH] || 0) + PL_HEURES[type];
  if (type === "garde_nuit" || type === "garde_24h") {
    etat.nbGardes[doctorId]++;
    const lk = plLundiDe(date);
    etat.gardesSemaine[doctorId][lk] = (etat.gardesSemaine[doctorId][lk] || 0) + 1;
    etat.bloque[doctorId].add(plAdd(date, 1));
    etat.derniereGarde[doctorId] = date;
  }
}
function plChoisirStation(med, postes, plan, etat, cle) {
  const pref = etat.station[med.id][cle];
  if (pref && !(pref in plan)) return pref;
  return postes.find((c) => !(c in plan)) || postes[0];
}

function plGenererSemaine(date, medecins, etat, sortie, conflits) {
  const cle = plLundiDe(date);
  const postes = plPostes().map((p) => p.code);
  const libres = medecins.filter((m) => plDispo(m, date, etat));
  const libresG = libres.filter((m) => plGardesSemaine(m.id, date, etat) < PL_MAX_GARDES_SEMAINE);
  const residents = libresG.filter((m) => m.grade === "resident");

  let resNuit = null, second = null;
  if (residents.length > 0) {
    const resPool = plFiltrerPlafond(residents, date, etat, PL_HEURES.garde_nuit);
    resNuit = plTrierGardeNuit(resPool, date, etat)[0];
    const reste = plFiltrerPlafond(libresG.filter((m) => m.id !== resNuit.id), date, etat, PL_HEURES.garde_24h);
    second = plTrierGardeNuit(reste, date, etat)[0] || null;
  } else {
    conflits.push({ date, message: "Nuit : aucun résident disponible (≥1 obligatoire)." });
  }

  const pris = new Set();
  if (resNuit) pris.add(resNuit.id);
  if (second) pris.add(second.id);

  const plan = {};
  if (second) {
    const st = plChoisirStation(second, postes, plan, etat, cle);
    plan[st] = second.id;
    etat.station[second.id][cle] = st;
  }
  const pool = plTrier(libres.filter((m) => !pris.has(m.id)), "jour", etat);
  pool.forEach((m) => {
    if (Object.values(plan).includes(m.id)) return;
    const st = etat.station[m.id][cle];
    if (st && !(st in plan)) plan[st] = m.id;
  });
  postes.forEach((code) => {
    if (code in plan) return;
    const cand = pool.find((m) => !Object.values(plan).includes(m.id));
    if (cand) { plan[code] = cand.id; etat.station[cand.id][cle] = code; }
  });

  if (resNuit && !second) {
    conflits.push({ date, message: "Nuit : 2e médecin de garde indisponible (≥2 requis)." });
  }
  const remplies = postes.filter((c) => c in plan).length;
  if (remplies < postes.length) {
    conflits.push({ date, message: `Jour : ${remplies}/${postes.length} postes pourvus (effectif insuffisant).` });
  }

  if (resNuit) plAffecter(sortie, etat, date, "garde_nuit", resNuit.id, null);
  if (second) {
    const st = Object.keys(plan).find((c) => plan[c] === second.id);
    plAffecter(sortie, etat, date, "garde_24h", second.id, st || null);
  }
  Object.keys(plan).forEach((code) => {
    const id = plan[code];
    if (second && id === second.id) return;
    plAffecter(sortie, etat, date, "jour", id, code);
  });
}

function plGenererWeekend(date, medecins, etat, sortie, conflits) {
  const couv = plCouv();
  const j = plJourSemaine(date);
  const libres = medecins.filter((m) => plDispo(m, date, etat));
  if (libres.length < couv.twe_weekend) {
    conflits.push({ date, message: `Week-end : ${libres.length} médecin(s) dispo (${couv.twe_weekend} requis).` });
  }
  let t1 = null;
  const forceId = etat.tweForce[date];
  if (forceId) {
    t1 = libres.find((m) => m.id === forceId) || null;
    if (!t1) conflits.push({ date, message: "Week-end : médecin du TWE de samedi indisponible le dimanche (règle binôme)." });
  }
  const libresGarde = (t1 ? libres.filter((m) => m.id !== t1.id) : libres)
    .filter((m) => plGardesSemaine(m.id, date, etat) < PL_MAX_GARDES_SEMAINE);
  const residentsG = libresGarde.filter((m) => m.grade === "resident");
  let g1 = null, g2 = null;
  if (residentsG.length > 0) {
    g1 = plChoisirWE(plFiltrerPlafond(residentsG, date, etat, PL_HEURES.garde_24h), date, etat);
    const reste = plFiltrerPlafond(libresGarde.filter((m) => m.id !== g1.id), date, etat, PL_HEURES.garde_24h);
    g2 = plChoisirWE(reste, date, etat);
  } else {
    conflits.push({ date, message: "Week-end nuit : aucun résident disponible (≥1 obligatoire)." });
  }
  const pris = new Set([g1 && g1.id, g2 && g2.id, t1 && t1.id].filter(Boolean));
  if (!t1) t1 = plChoisirWE(plFiltrerPlafond(libres.filter((m) => !pris.has(m.id)), date, etat, PL_HEURES.twe), date, etat);
  if (j === 6 && t1) etat.tweForce[plAdd(date, 1)] = t1.id;
  if (g1 && !g2) conflits.push({ date, message: "Week-end : 2e garde 24 h indisponible." });
  if (!t1) conflits.push({ date, message: "Week-end : médecin du tour (TWE) manquant." });
  const estVraiWeekend = (j === 6 || j === 7);
  const wkey = plWeekendKey(date);
  [g1, g2].forEach((g) => {
    if (!g) return;
    plAffecter(sortie, etat, date, "garde_24h", g.id, null);
    if (estVraiWeekend) { etat.nbWeekend[g.id]++; if (wkey) etat.weekendsTravailles[g.id].add(wkey); }
    if (j === 6) {
      etat.bloque[g.id].add(plAdd(date, 2));
    } else if (j === 7) {
      etat.bloque[g.id].add(plAdd(date, 1));
      etat.bloque[g.id].add(plAdd(date, 2));
    }
  });
  if (t1) {
    plAffecter(sortie, etat, date, "twe", t1.id, null);
    if (estVraiWeekend) { etat.nbWeekend[t1.id]++; if (wkey) etat.weekendsTravailles[t1.id].add(wkey); }
  }
}

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
  const bM = plBornesMois(annee, mois);
  const dansMois = (d) => d >= bM.debut && d <= bM.fin;
  materialiserRepos(sortie, dansMois).forEach((r) => sortie.push(r));
  materialiserReposCouples(sortie, dansMois).forEach((r) => sortie.push(r));
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

function plDispoStatique(m, date, indispoSet, dispoSet) {
  if (!plSousContrat(m, date)) return false;
  if (!plDispoIndependant(m, date, dispoSet)) return false;
  const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
  if (!jt.includes(plJourSemaine(date))) return false;
  if (indispoSet && indispoSet.has(date)) return false;
  return true;
}
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
  const trimestre = opts.trimestre;
  const medecins = opts.medecins || [];
  const preferences = opts.preferences || [];
  const moisTrim = [0, 1, 2].map((k) => (trimestre - 1) * 3 + 1 + k);
  const etat = plNouvelEtat(medecins);
  plIndexerPreferences(preferences, etat);
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
        const jr = plJourSemaine(date);
        if (jr === 6 || jr === 7) dispoWeekend++;
      });
    });
    const fte = (typeof m.fte === "number" && m.fte > 0) ? m.fte : 1;
    etat.poidsGarde[m.id] = fte * dispoTotal;
    etat.poidsWeekend[m.id] = fte * dispoWeekend;
  });
  const sortie = [];
  const conflits = [];
  moisTrim.forEach((mois) => {
    plDatesDuMois(annee, mois).forEach((date) => {
      if (plEstWeekendOuFerie(date)) plGenererWeekend(date, medecins, etat, sortie, conflits);
      else plGenererSemaine(date, medecins, etat, sortie, conflits);
    });
  });
  const bDeb = plBornesMois(annee, moisTrim[0]).debut;
  const bFin = plBornesMois(annee, moisTrim[2]).fin;
  const dansTrim = (d) => d >= bDeb && d <= bFin;
  materialiserRepos(sortie, dansTrim).forEach((r) => sortie.push(r));
  materialiserReposCouples(sortie, dansTrim).forEach((r) => sortie.push(r));
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

function genererOffClinic(opts) {
  const annee = opts.annee, mois = opts.mois;
  const medecins = opts.medecins || [];
  const shifts = opts.shifts || [];
  const bloquantes = plBloq();
  const byMed = {};
  shifts.forEach((s) => {
    const m = (byMed[s.doctor_id] = byMed[s.doctor_id] || {});
    (m[s.date] = m[s.date] || []).push(s);
  });
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
    if (m.grade !== "resident" || m.statut === "independant") return;
    const absSet = new Set();
    dates.forEach((d) => {
      const aAbsence = shiftsDe(m.id, d).some((x) => plEstAbsence(x.shift_type) && x.shift_type !== "off");
      if (aAbsence || estBloque(m.id, d)) absSet.add(d);
    });
    const abs = absSet.size;
    const droit = abs <= 4 ? 2 : abs <= 9 ? 1 : 0;
    if (droit === 0) return;
    let poses = 0;
    for (const d of dates) {
      if (poses >= droit) break;
      const j = plJourSemaine(d);
      if (j === 6 || j === 7) continue;
      if (plEstWeekendOuFerie(d)) continue;
      if (!plSousContrat(m, d)) continue;
      const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
      if (!jt.includes(j)) continue;
      if (shiftsDe(m.id, d).length > 0) continue;
      if (estBloque(m.id, d)) continue;
      if (aGarde(m.id, d)) continue;
      if (aGarde(m.id, plAdd(d, -1))) continue;
      if (aGarde(m.id, plAdd(d, 1))) continue;
      out.push({ date: d, shift_type: "off", poste: null, doctor_id: m.id });
      poses++;
    }
  });
  return out;
}

function materialiserRepos(shifts, dansPeriode) {
  const occupe = new Set(shifts.map((s) => s.doctor_id + "|" + s.date));
  const ajoutes = new Set();
  const out = [];
  shifts.forEach((s) => {
    if (s.shift_type !== "garde_nuit" && s.shift_type !== "garde_24h") return;
    const j = plJourSemaine(s.date);
    const jours = [plAdd(s.date, 1)];
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
function materialiserReposCouples(shifts, dansPeriode) {
  const estGarde = (t) => t === "garde_nuit" || t === "garde_24h";
  const gardeJour = {};
  shifts.forEach((s) => {
    if (!estGarde(s.shift_type)) return;
    (gardeJour[s.doctor_id] = gardeJour[s.doctor_id] || new Set()).add(s.date);
  });
  const occupe = new Set(shifts.map((s) => s.doctor_id + "|" + s.date));
  const ajoutes = new Set();
  const out = [];
  Object.keys(gardeJour).forEach((id) => {
    gardeJour[id].forEach((d) => {
      const j = plJourSemaine(d);
      if ((j !== 4 && j !== 5) || !gardeJour[id].has(plAdd(d, 2))) return;
      const reposJour = plAdd(d, 4);
      if (dansPeriode && !dansPeriode(reposJour)) return;
      const cle = id + "|" + reposJour;
      if (occupe.has(cle) || ajoutes.has(cle)) return;
      ajoutes.add(cle);
      out.push({ date: reposJour, shift_type: "repos_garde", poste: null, doctor_id: id });
    });
  });
  return out;
}
function plBornesMois(annee, mois) {
  const ms = String(mois).padStart(2, "0");
  const fin = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return { debut: annee + "-" + ms + "-01", fin: annee + "-" + ms + "-" + String(fin).padStart(2, "0") };
}

function validerPlanning(opts) {
  const annee = opts.annee;
  const mois = opts.mois;
  const shifts = opts.shifts || [];
  const medecins = opts.medecins || [];
  const conflits = [];
  const postesCodes = plPostes().map((p) => p.code);
  const couv = plCouv();
  const bloquantes = plBloq();
  const medById = {};
  medecins.forEach((m) => { medById[m.id] = m; });
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
  const parDate = {};
  const datesParMed = {};
  shifts.forEach((s) => {
    (parDate[s.date] = parDate[s.date] || []).push(s);
    const dm = (datesParMed[s.doctor_id] = datesParMed[s.doctor_id] || {});
    (dm[s.date] = dm[s.date] || []).push(s);
  });
  const estResident = (id) => medById[id] && medById[id].grade === "resident";
  const estAS = (id) => medById[id] && medById[id].grade === "assistant_specialiste";
  const nom = (id) => (medById[id] && medById[id].name) ? medById[id].name : "?";
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  for (let j = 1; j <= nbJours; j++) {
    const date = annee + "-" + String(mois).padStart(2, "0") + "-" + String(j).padStart(2, "0");
    const duJour = parDate[date] || [];
    const gardes = duJour.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h");
    const auMoinsUnResident = gardes.some((s) => estResident(s.doctor_id));
    const nbASgarde = gardes.filter((s) => estAS(s.doctor_id)).length;
    if (nbASgarde >= 2) conflits.push({ date, message: "Garde : 2 A/S ensemble (interdit)." });
    if (plEstWeekendOuFerie(date)) {
      const g24 = duJour.filter((s) => s.shift_type === "garde_24h");
      const twe = duJour.filter((s) => s.shift_type === "twe");
      const auTour = g24.length + twe.length;
      if (auTour < couv.twe_weekend) conflits.push({ date, message: `Week-end : ${auTour}/${couv.twe_weekend} médecin(s) au tour (TWE).` });
      if (g24.length < couv.gardes_weekend) conflits.push({ date, message: `Week-end : ${g24.length}/${couv.gardes_weekend} garde(s) 24h.` });
      if (g24.length > 0 && !g24.some((s) => estResident(s.doctor_id))) conflits.push({ date, message: "Week-end : aucun résident en garde 24h (≥1 requis)." });
      duJour.filter((s) => s.shift_type === "jour").forEach((s) => {
        conflits.push({ date, message: `Week-end : ${nom(s.doctor_id)} a un shift de jour (incohérent).` });
      });
    } else {
      const occupants = {};
      duJour.forEach((s) => { if (s.poste) (occupants[s.poste] = occupants[s.poste] || []).push(s.doctor_id); });
      const pourvues = postesCodes.filter((c) => occupants[c] && occupants[c].length >= 1);
      if (pourvues.length < postesCodes.length) conflits.push({ date, message: `Jour : ${pourvues.length}/${postesCodes.length} stations pourvues.` });
      postesCodes.forEach((c) => {
        if (occupants[c] && occupants[c].length > 1) conflits.push({ date, message: `Jour : station ${c} affectée à ${occupants[c].length} médecins.` });
      });
      if (gardes.length < couv.min_nuit) conflits.push({ date, message: `Nuit : ${gardes.length}/${couv.min_nuit} médecin(s) de garde.` });
      if (gardes.length > 0 && !auMoinsUnResident) conflits.push({ date, message: "Nuit : aucun résident de garde (≥1 requis)." });
    }
  }
  Object.keys(datesParMed).forEach((id) => {
    const dm = datesParMed[id];
    const med = medById[id];
    const estGarde = (s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h";
    Object.keys(dm).forEach((date) => {
      const duJour = dm[date];
      const travail = duJour.filter((s) => !plEstAbsence(s.shift_type));
      const aTravail = travail.length > 0;
      if (duJour.length > 1) conflits.push({ date, message: `${nom(id)} : ${duJour.length} entrées le même jour (double affectation).` });
      if (!aTravail) return;
      if (med) {
        if (!plSousContrat(med, date)) conflits.push({ date, message: `${nom(id)} : affecté hors période contractuelle.` });
        const jt = (med.jours_travailles && med.jours_travailles.length) ? med.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
        if (!jt.includes(plJourSemaine(date))) conflits.push({ date, message: `${nom(id)} : affecté un jour non travaillable.` });
        if (med.statut === "independant" && !(dispo[id] && dispo[id].has(date))) conflits.push({ date, message: `${nom(id)} (indépendant) : affecté hors fenêtre déclarée disponible.` });
      }
      if (indispo[id] && indispo[id].has(date)) conflits.push({ date, message: `${nom(id)} : affecté pendant un congé / une indisponibilité.` });
      const veille = plAdd(date, -1);
      if (dm[veille] && dm[veille].some(estGarde)) conflits.push({ date, message: `${nom(id)} : repos 12h non respecté (travail au lendemain d'une garde).` });
      const sam = plAdd(date, -2);
      if (dm[sam] && plJourSemaine(sam) === 6 && dm[sam].some((s) => s.shift_type === "garde_24h") && plJourSemaine(date) === 1) {
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
  const gardesParSemaine = {};
  shifts.forEach((s) => {
    if (s.shift_type !== "garde_nuit" && s.shift_type !== "garde_24h") return;
    const lk = plLundiDe(s.date);
    const m = (gardesParSemaine[s.doctor_id] = gardesParSemaine[s.doctor_id] || {});
    m[lk] = (m[lk] || 0) + 1;
  });
  Object.keys(gardesParSemaine).forEach((id) => {
    Object.keys(gardesParSemaine[id]).forEach((lk) => {
      const n = gardesParSemaine[id][lk];
      if (n > 3) conflits.push({ date: lk, message: `${nom(id)} : ${n} gardes dans la semaine du ${lk} (max 3).` });
    });
  });
  const weekendsParMois = {};
  shifts.forEach((s) => {
    if (s.shift_type !== "garde_24h" && s.shift_type !== "twe") return;
    const jr = plJourSemaine(s.date);
    if (jr !== 6 && jr !== 7) return;
    const key = jr === 6 ? s.date : plAdd(s.date, -1);
    const mois = s.date.slice(0, 7);
    const parMois = (weekendsParMois[s.doctor_id] = weekendsParMois[s.doctor_id] || {});
    (parMois[mois] = parMois[mois] || new Set()).add(key);
  });
  Object.keys(weekendsParMois).forEach((id) => {
    Object.keys(weekendsParMois[id]).forEach((mois) => {
      const n = weekendsParMois[id][mois].size;
      if (n > 2) conflits.push({ date: mois + "-01", message: `${nom(id)} : ${n} week-ends travaillés en ${mois} (max 2, N2).` });
    });
  });
  const eqV = plEquite();
  const heuresParSemaine = {};
  shifts.forEach((s) => {
    let h = PL_HEURES[s.shift_type] || 0;
    if (s.shift_type === "off") h = PL_HEURES_OFFCLINIC;
    if (h <= 0) return;
    const lk = plLundiDe(s.date);
    const m = (heuresParSemaine[s.doctor_id] = heuresParSemaine[s.doctor_id] || {});
    m[lk] = (m[lk] || 0) + h;
  });
  Object.keys(heuresParSemaine).forEach((id) => {
    Object.keys(heuresParSemaine[id]).forEach((lk) => {
      const h = Math.round(heuresParSemaine[id][lk] * 10) / 10;
      if (h > eqV.plafond_hebdo) conflits.push({ date: lk, message: `${nom(id)} : ${h} h la semaine du ${lk} (> ${eqV.plafond_hebdo} h — N2 indicatif, compensable la semaine suivante).` });
    });
  });
  conflits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return conflits;
}

function validerEquite(shifts, medecins) {
  const eq = plEquite();
  const conflits = [];
  const medById = {};
  (medecins || []).forEach((m) => { medById[m.id] = m; });
  const nom = (id) => (medById[id] && medById[id].name) ? medById[id].name : "?";
  const fteDe = (id) => { const m = medById[id]; return (m && typeof m.fte === "number" && m.fte > 0) ? m.fte : 1; };
  let dateAncre = null;
  shifts.forEach((s) => { if (!dateAncre || s.date < dateAncre) dateAncre = s.date; });
  dateAncre = dateAncre || "";
  const heuresTotales = {};
  const gardes = {};
  shifts.forEach((s) => {
    let h = PL_HEURES[s.shift_type] || 0;
    if (s.shift_type === "off") h = PL_HEURES_OFFCLINIC;
    if (h > 0) heuresTotales[s.doctor_id] = (heuresTotales[s.doctor_id] || 0) + h;
    if (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") gardes[s.doctor_id] = (gardes[s.doctor_id] || 0) + 1;
  });
  const charges = Object.keys(heuresTotales).map((id) => {
    const cible = (medById[id] && medById[id].weekly_hours_target) ? medById[id].weekly_hours_target : 52;
    return { id, charge: heuresTotales[id] / cible, heures: heuresTotales[id] };
  });
  if (charges.length >= 2) {
    const moyenne = charges.reduce((a, c) => a + c.charge, 0) / charges.length;
    const seuil = eq.plancher_ratio * moyenne;
    charges.forEach((c) => {
      if (moyenne > 0 && c.charge < seuil) {
        const pct = Math.round((c.charge / moyenne) * 100);
        conflits.push({ date: dateAncre, message: `${nom(c.id)} : sous le plancher d'équilibre du trimestre (${Math.round(c.heures * 10) / 10} h, ~${pct} % de la charge moyenne).` });
      }
    });
  }
  const actifsG = Object.keys(gardes);
  if (actifsG.length >= 2) {
    let totalG = 0, totalFte = 0;
    actifsG.forEach((id) => { totalG += gardes[id]; totalFte += fteDe(id); });
    actifsG.forEach((id) => {
      const attendu = totalFte > 0 ? totalG * fteDe(id) / totalFte : 0;
      const ecart = gardes[id] - attendu;
      if (ecart > 1) conflits.push({ date: dateAncre, message: `${nom(id)} : ${gardes[id]} gardes (écart > 1).` });
      else if (ecart < -1) conflits.push({ date: dateAncre, message: `${nom(id)} : ${gardes[id]} gardes (déficit > 1).` });
    });
  }
  conflits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return conflits;
}

function compterParMedecin(shifts) {
  const stats = {};
  (shifts || []).forEach((s) => {
    const st = stats[s.doctor_id] || (stats[s.doctor_id] = { heures: 0, gardes: 0, weekends: 0, tours: 0, offs: 0, repos: 0 });
    st.heures += PL_HEURES[s.shift_type] || 0;
    if (s.shift_type === "off") { st.heures += PL_HEURES_OFFCLINIC; st.offs++; }
    if (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") st.gardes++;
    if (s.shift_type === "twe") st.tours++;
    if (s.shift_type === "recup") st.repos++;
    const jr = plJourSemaine(s.date);
    if ((jr === 6 || jr === 7) && (s.shift_type === "garde_24h" || s.shift_type === "twe")) st.weekends++;
  });
  Object.keys(stats).forEach((id) => { stats[id].heures = Math.round(stats[id].heures * 10) / 10; });
  return stats;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { genererPlanning, genererTrimestre, genererOffClinic, validerPlanning, validerEquite, compterParMedecin, plParse, plJourSemaine };
}
