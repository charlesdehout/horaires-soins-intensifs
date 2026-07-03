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
/* Statut spécial (ex. « CAP fromager ») : un médecin peut être interdit de GARDE
   certains jours de semaine (m.jours_sans_garde = [n° ISO]), tout en pouvant faire
   les TOURS et stations. (Les jours NON travaillés sont gérés par jours_travailles.) */
function plPeutGarde(m, date) {
  if (!m) return true;
  const jr = plJourSemaine(date);
  if (m.cap_fromager && jr === 7) return false;          // CAP fromager : jamais de garde le dimanche
  const jsg = m.jours_sans_garde;
  return !(Array.isArray(jsg) && jsg.indexOf(jr) !== -1);
}

/* ÉQUILIBRAGE DES GARDES *PAR MOIS* (Dr Dehout 2026-06-18) : le déséquilibre des
   HEURES mensuelles vient des GARDES. On lisse les HEURES-DE-GARDE par mois,
   intra-grade : on déplace une garde de NUIT de semaine (lun→ven, jamais épinglée)
   d'un médecin trop chargé en gardes CE MOIS vers un moins chargé CE MOIS (libre J
   et J+1, pas de garde la veille, ≤3/sem, dispo). À appeler AVANT materialiserRepos. */
function plEquilibrerGardesMois(sortie, medecins, etat, annee, mois) {
  const estG = (x) => x === "garde_nuit" || x === "garde_24h";
  const GH = { garde_nuit: PL_HEURES.garde_nuit, garde_24h: PL_HEURES.garde_24h };
  const dm = new Set(plDatesDuMois(annee, mois));
  const fteG = {}; medecins.forEach((m) => { fteG[m.id] = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1; });
  const parDoc = {}, gardesDates = {};
  medecins.forEach((m) => { parDoc[m.id] = new Set(); gardesDates[m.id] = new Set(); });
  sortie.forEach((s) => { if (!parDoc[s.doctor_id]) return; parDoc[s.doctor_id].add(s.date); if (estG(s.shift_type)) gardesDates[s.doctor_id].add(s.date); });
  const ghMois = () => { const h = {}; medecins.forEach((m) => h[m.id] = 0); sortie.forEach((s) => { if (dm.has(s.date) && GH[s.shift_type]) h[s.doctor_id] += GH[s.shift_type]; }); return h; };
  const peutRecevoir = (m, d) => {
    if (!dm.has(d)) return false;
    if (!plSousContrat(m, d)) return false;
    if (!plPeutGarde(m, d)) return false;
    const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
    if (!jt.includes(plJourSemaine(d))) return false;
    if (etat.bloque[m.id] && (etat.bloque[m.id].has(d) || etat.bloque[m.id].has(plAdd(d, 1)))) return false;
    if (etat.indispo[m.id] && etat.indispo[m.id].has(d)) return false;
    if (!plDispoIndependant(m, d, etat.dispoDeclaree[m.id])) return false;
    if (parDoc[m.id].has(d) || parDoc[m.id].has(plAdd(d, 1))) return false;
    if (gardesDates[m.id].has(plAdd(d, -1))) return false;
    const lk = plLundiDe(d); let n = 0; gardesDates[m.id].forEach((g) => { if (plLundiDe(g) === lk) n++; });
    return n < PL_MAX_GARDES_SEMAINE;
  };
  const grades = ["resident", "assistant_specialiste"];
  for (let iter = 0; iter < 120; iter++) {
    let bouge = false;
    const gh = ghMois();
    const norm = (id) => gh[id] / fteG[id];
    for (const grade of grades) {
      const pool = medecins.filter((m) => m.grade === grade);
      if (pool.length < 2) continue;
      const tri = pool.slice().sort((a, b) => norm(b.id) - norm(a.id));
      let haut = null, bas = null, cand = null;
      for (let hi = 0; hi < tri.length && !cand; hi++) {
        for (let bi = tri.length - 1; bi > hi && !cand; bi--) {
          if (norm(tri[hi].id) - norm(tri[bi].id) <= PL_HEURES.garde_nuit + PL_EPS) break;
          // Seulement lun/mar/mer (jr 1–3) : on ne touche JAMAIS au jeudi (long
          // week-end) ni au vendredi (consolidation ven→dim) pour préserver les couplages.
          const cands = sortie.filter((s) => s.doctor_id === tri[hi].id && s.shift_type === "garde_nuit" && dm.has(s.date) && plJourSemaine(s.date) <= 3 && !s.epingle);
          for (const c of cands) { if (peutRecevoir(tri[bi], c.date)) { haut = tri[hi]; bas = tri[bi]; cand = c; break; } }
        }
      }
      if (!cand) continue;
      parDoc[haut.id].delete(cand.date); gardesDates[haut.id].delete(cand.date);
      parDoc[bas.id].add(cand.date); gardesDates[bas.id].add(cand.date);
      cand.doctor_id = bas.id;
      // SYNC OCCUPATION (corrige les « doubles affectations ») : le receveur est
      // désormais OCCUPÉ ce jour (sinon la Phase 3 lui poserait une STATION
      // par-dessus la garde) + repos le lendemain ; le donneur est LIBÉRÉ de ce
      // jour et de son repos (sinon il resterait inutilement non planifié).
      plMarquerAssigne(cand.date, bas.id, etat);
      if (!etat.bloque[bas.id]) etat.bloque[bas.id] = new Set();
      etat.bloque[bas.id].add(plAdd(cand.date, 1));
      if (etat.assigneJour[cand.date]) etat.assigneJour[cand.date].delete(haut.id);
      if (etat.bloque[haut.id]) etat.bloque[haut.id].delete(plAdd(cand.date, 1));
      etat.heures[haut.id] -= PL_HEURES.garde_nuit; etat.heures[bas.id] += PL_HEURES.garde_nuit;
      etat.nbGardesTotal[haut.id]--; etat.nbGardesTotal[bas.id]++;
      const lk = plLundiDe(cand.date);
      etat.heuresSemaine[haut.id][lk] = (etat.heuresSemaine[haut.id][lk] || 0) - PL_HEURES.garde_nuit;
      etat.heuresSemaine[bas.id][lk] = (etat.heuresSemaine[bas.id][lk] || 0) + PL_HEURES.garde_nuit;
      etat.gardesSemaine[haut.id][lk] = (etat.gardesSemaine[haut.id][lk] || 1) - 1;
      etat.gardesSemaine[bas.id][lk] = (etat.gardesSemaine[bas.id][lk] || 0) + 1;
      bouge = true;
    }
    if (!bouge) break;
  }
}

/* ÉQUILIBRAGE DES HEURES *PAR MOIS* (Dr Dehout 2026-06-19) : le trimestre est déjà
   équilibré (plReequilibrerHeures), mais un mois peut rester lourd et le suivant léger.
   On lisse les HEURES MENSUELLES en transférant des journées de STATION (jour) d'un
   médecin AU-DESSUS de sa cible CE MOIS vers un médecin EN DESSOUS CE MOIS.
   STRICTEMENT SANS RÉGRESSION : un transfert n'est appliqué que s'il RÉDUIT l'écart
   MENSUEL ET n'aggrave PAS l'écart TRIMESTRIEL (préserve l'équité trimestre + ses tests).
   Mêmes garde-fous que plReequilibrerHeures : receveur libre ce jour, continuité clinique,
   plafond mi-temps, jamais d'épinglé/doublure. Appelé une fois par mois après
   plReequilibrerHeures. Dans le pire cas (continuité bloquante) : aucun transfert. */
function plEquilibrerHeuresMois(sortie, medecins, etat, annee, mois) {
  const eq = plEquite();
  const seuil = (typeof eq.ecart_heures_max === "number") ? eq.ecart_heures_max : 12;
  if (!seuil) return;
  const H = (t) => (t === "off" ? PL_HEURES_OFFCLINIC : (PL_HEURES[t] || 0));
  const fteR = {}; medecins.forEach((m) => { fteR[m.id] = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1; });
  const cibleHebdoDe = (m) => (typeof m.weekly_hours_target === "number" && m.weekly_hours_target > 0) ? m.weekly_hours_target : (PL_REF_HEBDO * fteR[m.id]);
  const jtSemDe = (m) => (((m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1,2,3,4,5,6,7]).filter((j) => j >= 1 && j <= 5).length || 5);
  // ---- Cibles + heures TRIMESTRE (garde-fou anti-régression trimestre) ----
  let _mn = null, _mx = null;
  sortie.forEach((s) => { if (_mn === null || s.date < _mn) _mn = s.date; if (_mx === null || s.date > _mx) _mx = s.date; });
  const semTrim = _mn ? ((Date.parse(_mx) - Date.parse(_mn)) / 86400000 / 7 + 1/7) : 13;
  const cibleTrim = {}, hTrim = {};
  medecins.forEach((m) => {
    const jtLen = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles.length : 7;
    const jConge = ((etat.heuresEquite && etat.heuresEquite[m.id]) || 0) / PL_HEURES.jour;
    const sEff = Math.max(semTrim - jConge / jtLen, 0.2);
    cibleTrim[m.id] = cibleHebdoDe(m) * sEff;
    hTrim[m.id] = 0;
  });
  sortie.forEach((s) => { if (hTrim[s.doctor_id] !== undefined) hTrim[s.doctor_id] += H(s.shift_type); });
  const hNormTrim = (id) => hTrim[id] - (cibleTrim[id] || 0);
  const ecartTrim = () => { let mx=-Infinity, mn=Infinity; medecins.forEach((m)=>{const v=hNormTrim(m.id); if(v>mx)mx=v; if(v<mn)mn=v;}); return mx-mn; };
  // Dérive trimestre autorisée (EQUITE.derive_trimestre_h, révision 2026-07-03) :
  // on accepte que le trimestre s'écarte jusqu'à ce plafond pour resserrer le mois.
  const derive = (typeof eq.derive_trimestre_h === "number" && eq.derive_trimestre_h > 0) ? eq.derive_trimestre_h : seuil;
  let plafondTrim = Math.max(ecartTrim(), seuil, derive); // le trimestre ne dépassera jamais ce plafond
  // ---- Cibles + heures du MOIS ----
  const datesMois = plDatesDuMois(annee, mois);
  const dm = new Set(datesMois);
  const jOuvres = datesMois.filter((d) => !plEstWeekendOuFerie(d));
  const cibleMois = {}, hMois = {}, occupe = {}, unitesSem = {}, hSem = {};
  medecins.forEach((m) => {
    hMois[m.id] = 0; occupe[m.id] = new Set(); unitesSem[m.id] = {}; hSem[m.id] = {};
    let present = 0;
    jOuvres.forEach((d) => { if (plDispoStatique(m, d, etat.indispo[m.id], etat.dispoDeclaree[m.id]) && !(etat.bloque[m.id] && etat.bloque[m.id].has(d))) present++; });
    cibleMois[m.id] = cibleHebdoDe(m) * (present / jtSemDe(m));
  });
  sortie.forEach((s) => {
    if (hMois[s.doctor_id] === undefined || !dm.has(s.date)) return;
    hMois[s.doctor_id] += H(s.shift_type);
    occupe[s.doctor_id].add(s.date);
    const lk = plLundiDe(s.date);
    hSem[s.doctor_id][lk] = (hSem[s.doctor_id][lk] || 0) + H(s.shift_type);
    if (s.shift_type === "jour" && s.poste) (unitesSem[s.doctor_id][lk] = unitesSem[s.doctor_id][lk] || new Set()).add(s.poste);
  });
  const hNormMois = (id) => hMois[id] - (cibleMois[id] || 0);
  const ecartMois = () => { let mx=-Infinity, mn=Infinity; medecins.forEach((m)=>{const v=hNormMois(m.id); if(v>mx)mx=v; if(v<mn)mn=v;}); return mx-mn; };
  const peutRecevoir = (m, s, relax) => {
    const d = s.date;
    if (!dm.has(d) || plEstWeekendOuFerie(d)) return false;
    if (etat.periodes && plEstCongres(d, etat.periodes)) return false;
    if (!plSousContrat(m, d)) return false;
    const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1,2,3,4,5,6,7];
    if (!jt.includes(plJourSemaine(d))) return false;
    if (occupe[m.id].has(d)) return false;
    if (etat.bloque[m.id] && etat.bloque[m.id].has(d)) return false;
    if (etat.indispo[m.id] && etat.indispo[m.id].has(d)) return false;
    if (!plDispoIndependant(m, d, etat.dispoDeclaree[m.id])) return false;
    if (plEstNouvelEngage(m, d, etat.debutPeriode)) return false;
    const cap = plPlafondStation(m);
    if (cap !== Infinity) { const cur = (hSem[m.id][plLundiDe(d)] || 0); if (cur + PL_HEURES.jour > cap + PL_EPS) return false; }
    if (!plSansContinuite(s.poste)) {
      const u = unitesSem[m.id][plLundiDe(d)];
      if (u && u.size && !u.has(s.poste)) return false;
      if (!relax && !(u && u.has(s.poste))) return false; // strict : déjà sur l'unité
    }
    return true;
  };
  const passe = (relax) => {
    for (let iter = 0; iter < 120; iter++) {
      const avant = ecartMois();
      if (avant <= seuil) return;
      const tri = medecins.slice().sort((a, b) => hNormMois(b.id) - hNormMois(a.id));
      let bouge = false;
      for (let hi = 0; hi < tri.length && !bouge; hi++) {
        for (let bi = tri.length - 1; bi > hi && !bouge; bi--) {
          const haut = tri[hi], bas = tri[bi];
          if (hNormMois(haut.id) - hNormMois(bas.id) <= seuil) break;
          for (const s of sortie) {
            if (s.doctor_id !== haut.id || s.shift_type !== "jour" || !dm.has(s.date)) continue;
            if (s.epingle || s.doublure) continue;
            if (!peutRecevoir(bas, s, relax)) continue;
            // Simulation : applique au mois ET au trimestre, on vérifie les 2 critères.
            hMois[haut.id] -= PL_HEURES.jour; hMois[bas.id] += PL_HEURES.jour;
            hTrim[haut.id] -= PL_HEURES.jour; hTrim[bas.id] += PL_HEURES.jour;
            const okMois = ecartMois() < avant;          // l'écart MENSUEL diminue
            const okTrim = ecartTrim() <= plafondTrim + PL_EPS; // le trimestre ne dépasse pas son plafond
            if (!okMois || !okTrim) {                    // annule la simulation
              hMois[haut.id] += PL_HEURES.jour; hMois[bas.id] -= PL_HEURES.jour;
              hTrim[haut.id] += PL_HEURES.jour; hTrim[bas.id] -= PL_HEURES.jour;
              continue;
            }
            // Applique réellement le transfert.
            const lk = plLundiDe(s.date);
            occupe[haut.id].delete(s.date); occupe[bas.id].add(s.date);
            hSem[haut.id][lk] = (hSem[haut.id][lk] || 0) - PL_HEURES.jour;
            hSem[bas.id][lk] = (hSem[bas.id][lk] || 0) + PL_HEURES.jour;
            if (s.poste) { const uh = unitesSem[haut.id][lk]; if (uh) uh.delete(s.poste); (unitesSem[bas.id][lk] = unitesSem[bas.id][lk] || new Set()).add(s.poste); }
            etat.heures[haut.id] -= PL_HEURES.jour; etat.heures[bas.id] += PL_HEURES.jour;
            s.doctor_id = bas.id;
            bouge = true; break;
          }
        }
      }
      if (!bouge) return;
    }
  };
  passe(false);  // continuité STRICTE d'abord (transfert vers qui tient déjà l'unité)
  passe(true);   // continuité assouplie ensuite (toujours gardé par les 2 critères)
}

/* FILET ANTI « DOUBLE AFFECTATION » (Dr Dehout 2026-06-21) : en fin de génération,
   un médecin ne doit jamais avoir 2 shifts de TRAVAIL le même jour. Résolution :
   - station de jour + garde de NUIT le même jour = de fait une garde de 24h →
     on FUSIONNE (la garde de nuit devient une garde 24h qui tient la station) →
     c'est désormais COMPTÉ comme une 24h, plus comme deux entrées ;
   - garde 24h (ou tour) déjà présents + station(s) de jour → on retire la/les
     stations de jour en trop (la garde 24h tient déjà une unité) ;
   - plusieurs stations de jour → on n'en garde qu'UNE (on retire d'abord celles
     sur une unité déjà doublée, pour ne pas vider une unité). */
function plResoudreDoublesAffectations(sortie, etat) {
  const estTrav = (t) => t === "jour" || t === "garde_nuit" || t === "garde_24h" || t === "twe";
  const occ = {}; // occ[date][poste] = nb d'unités tenues (jour + 24h)
  sortie.forEach((s) => {
    if ((s.shift_type === "jour" || s.shift_type === "garde_24h") && s.poste) {
      (occ[s.date] = occ[s.date] || {}); occ[s.date][s.poste] = (occ[s.date][s.poste] || 0) + 1;
    }
  });
  const occVal = (s) => (occ[s.date] && occ[s.date][s.poste]) || 1;
  const retirer = (s) => {
    const i = sortie.indexOf(s); if (i < 0) return;
    sortie.splice(i, 1);
    etat.heures[s.doctor_id] = (etat.heures[s.doctor_id] || 0) - (PL_HEURES[s.shift_type] || 0);
    if (s.poste && occ[s.date] && occ[s.date][s.poste]) occ[s.date][s.poste]--;
  };
  const parCle = {};
  sortie.forEach((s) => { if (estTrav(s.shift_type)) { const k = s.doctor_id + "|" + s.date; (parCle[k] = parCle[k] || []).push(s); } });
  Object.keys(parCle).forEach((k) => {
    const arr = parCle[k].filter((s) => sortie.indexOf(s) >= 0);
    if (arr.length < 2) return;
    const g24 = arr.find((s) => s.shift_type === "garde_24h");
    const twe = arr.find((s) => s.shift_type === "twe");
    const gn = arr.find((s) => s.shift_type === "garde_nuit");
    let jours = arr.filter((s) => s.shift_type === "jour");
    if ((g24 || twe) && jours.length) { jours.forEach(retirer); return; } // la 24h/le tour tient déjà la duty
    if (gn && jours.length) {                                             // jour + nuit = 24h → FUSION
      gn.shift_type = "garde_24h"; gn.poste = jours[0].poste;
      etat.heures[gn.doctor_id] = (etat.heures[gn.doctor_id] || 0) + (PL_HEURES.garde_24h - PL_HEURES.garde_nuit);
      jours.forEach(retirer);
      return;
    }
    if (jours.length > 1) {                                               // plusieurs stations → en garder une
      jours = jours.sort((a, b) => occVal(a) - occVal(b));               // garde la moins doublée (occ la plus basse)
      for (let i = 1; i < jours.length; i++) retirer(jours[i]);
    }
  });
}

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
  // CAP fromager : on retire le LUNDI de jours_travailles (clone, sans muter l'entrée)
  // → tous les contrôles (plDispo, rééquilibrage, plancher…) le respectent uniformément.
  const medecins = (opts.medecins || []).filter((m) => m.grade !== "pg").map((m) =>
    m.cap_fromager ? Object.assign({}, m, { jours_travailles: ((m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1,2,3,4,5,6,7]).filter((j) => j !== 1) }) : m);
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
        within.has(weDay) && plDispo(m, weDay, etat) && plPeutGarde(m, weDay) &&
        plGardesSemaine(m.id, weDay, etat) < PL_MAX_GARDES_SEMAINE &&
        !plEstNouvelEngage(m, weDay, etat.debutPeriode));
      let pool = base.filter((m) => plPeutWeekend(m.id, sat, etat));
      if (pool.length < couv.gardes_weekend) {  // FILET : mois à 5 WE → on dépasse le plafond 2 WE/mois plutôt qu'un trou
        if (base.length > pool.length) conflits.push({ date: weDay, message: "Plafond 2 week-ends/mois dépassé (mois saturé, repli couverture)." });
        pool = base;
      }
      // Couplables (dispo aussi la nuit couplée) = PRÉFÉRENCE, pas filtre dur.
      const coupkable = (m) => nightDay && within.has(nightDay) && !plEstWeekendOuFerie(nightDay) && plDispo(m, nightDay, etat) &&
        plPeutGarde(m, nightDay) && plGardesSemaine(m.id, nightDay, etat) < PL_MAX_GARDES_SEMAINE;
      let filtre = plFiltrerPlafond(pool, weDay, etat, PL_HEURES.garde_24h);
      // CONSOLIDATION ven→dim à 100% : si la nuit couplée est demandée et qu'il y a assez
      // de couplables (dont ≥1 résident), on ne retient QUE des couplables → tous
      // reprennent la nuit couplée (repli sur le pool complet sinon).
      if (nightDay) {
        const coup = filtre.filter(coupkable);
        if (coup.length >= couv.gardes_weekend && coup.some((m) => m.grade === "resident")) filtre = coup;
      }
      // Tri : couplables d'abord, puis équité week-end → ≥1 résident garanti sur TOUT le pool.
      const triEq = plTrier(filtre.slice(), "weekend", etat, weDay, null);
      let ordre = triEq.slice().sort((a, b) => (coupkable(b) ? 1 : 0) - (coupkable(a) ? 1 : 0));
      // FAVORI SAMEDI (statut spécial) : prioritaire pour la garde 24h du samedi
      // (compense l'impossibilité de garde le dimanche → garde le même nb de gardes).
      // FAVORI SAMEDI : le drapeau explicite favori_garde_samedi, ET le CAP fromager
      // EN RATTRAPAGE SEULEMENT (priorité samedi tant que SON nb de week-ends est
      // SOUS la moyenne d'équipe) → il atteint le MÊME nombre de week-ends que les
      // autres sans dépasser (il ne peut les faire que le samedi, pas le dimanche).
      if (plJourSemaine(weDay) === 6) {
        let avgW = 0; medecins.forEach((m) => { avgW += (etat.nbWeekend[m.id] || 0); }); avgW /= Math.max(medecins.length, 1);
        const boost = (m) => (m.favori_garde_samedi || (m.cap_fromager && (etat.nbWeekend[m.id] || 0) < avgW - PL_EPS)) ? 1 : 0;
        ordre.sort((a, b) => boost(b) - boost(a));
      }
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
    poserWE(sat, null);  // samedi NON couplé au jeudi (long week-end : le jeudi libère le WE)
    poserWE(sun, fri);   // dimanche couplé vendredi

    // Tour : les 2 gardes 24h font DÉJÀ le tour (présentes). On ne fixe donc que
    // les tours SUPPLÉMENTAIRES = twe_weekend - gardes_weekend (1 par défaut),
    // binôme sam+dim, hors gardes du week-end.
    const tourBase = medecins.filter((m) =>
      plDispo(m, sat, etat) && plDispo(m, sun, etat) &&
      !plEstNouvelEngage(m, sat, etat.debutPeriode));
    let tourPool = tourBase.filter((m) => plPeutWeekend(m.id, sat, etat));
    if (tourPool.length < couv.twe_weekend) tourPool = tourBase;
    const triT = tourPool.sort((a, b) => (etat._nbTours[a.id] - etat._nbTours[b.id]) || (plNormGardeCpl(a.id, etat) - plNormGardeCpl(b.id, etat)));
    const nbTourSeul = Math.max(0, couv.twe_weekend - couv.gardes_weekend);
    const tw = triT.slice(0, nbTourSeul);
    tw.forEach((m) => {
      plAffecter(sortie, etat, sat, "twe", m.id, null);
      plAffecter(sortie, etat, sun, "twe", m.id, null);
      marquerWeekend(m.id, sat);
      etat._nbTours[m.id] += 1; // 1 week-end de tour (binôme = 1)
    });
    if (tw.length < nbTourSeul) conflits.push({ date: sat, message: "Tour : " + tw.length + "/" + nbTourSeul + " (en plus des 2 gardes 24h qui font le tour)." });
  });


  // ---- PHASE 1b : FÉRIÉS en semaine = jours « type WEEK-END » : 2 gardes 24h
  //     + 1 tour, PAS de station. Les gardes 24h FONT le tour (comme le week-end). ----
  const couvF = plCouv();
  // Un médecin déjà de garde la VEILLE ou le LENDEMAIN ne peut pas enchaîner une
  // 2e garde 24h (repos obligatoire). Corrige le « 2 gardes 24h consécutives »
  // quand un FÉRIÉ jouxte un WEEK-END (ex. 1er janvier tombant un vendredi → samedi).
  const plAGardeLe = (id, d) => sortie.some((s) => s.doctor_id === id && s.date === d && (s.shift_type === "garde_24h" || s.shift_type === "garde_nuit"));
  datesTrim.filter((d) => plJourSemaine(d) <= 5 && plEstWeekendOuFerie(d)).forEach((ferie) => {
    plCrediterAbsences(ferie, medecins, etat);
    const poolG = plFiltrerPlafond(medecins.filter((m) =>
      plDispo(m, ferie, etat) && plPeutGarde(m, ferie) &&
      plGardesSemaine(m.id, ferie, etat) < PL_MAX_GARDES_SEMAINE &&
      !plAGardeLe(m.id, plAdd(ferie, -1)) && !plAGardeLe(m.id, plAdd(ferie, 1)) && // pas 2 gardes 24h d'affilée (férié ↔ week-end)
      !plEstNouvelEngage(m, ferie, etat.debutPeriode)), ferie, etat, PL_HEURES.garde_24h);
    const triG = plTrier(poolG.slice(), "weekend", etat, ferie, null);
    const gardes = plCoupleChoisir(triG, etat, ferie, couvF.gardes_weekend, true, true);
    if (gardes.length < couvF.gardes_weekend) {            // filet couverture
      for (const m of triG) { if (gardes.length >= couvF.gardes_weekend) break; if (!gardes.includes(m)) gardes.push(m); }
    }
    gardes.forEach((m) => plAffecter(sortie, etat, ferie, "garde_24h", m.id, null)); // 24h (tient une station + nuit)
    if (gardes.length < couvF.gardes_weekend) conflits.push({ date: ferie, message: "Férié : " + gardes.length + "/" + couvF.gardes_weekend + " gardes 24h (effectif insuffisant)." });
    else if (!gardes.some((m) => m.grade === "resident")) conflits.push({ date: ferie, message: "Férié : aucun résident de garde (≥1 obligatoire, à arbitrer)." });
    // 1 tour seul (en plus des 2 gardes qui font déjà le tour).
    const nbTourF = Math.max(0, couvF.twe_weekend - couvF.gardes_weekend);
    const poolT = medecins.filter((m) => plDispo(m, ferie, etat) && !plEstNouvelEngage(m, ferie, etat.debutPeriode));
    const twF = poolT.sort((a, b) => (etat._nbTours[a.id] - etat._nbTours[b.id])).slice(0, nbTourF);
    twF.forEach((m) => { plAffecter(sortie, etat, ferie, "twe", m.id, null); etat._nbTours[m.id] += 1; });
    if (twF.length < nbTourF) conflits.push({ date: ferie, message: "Férié : tour manquant (effectif insuffisant)." });
  });

  // ---- PHASE 2 : autres gardes de nuit (lun/mar/mer + JEUDI/vendredi) ----
  // Compléter CHAQUE nuit de semaine à min_nuit gardes, ≥1 résident, jamais 2 A/S.
  const minNuit = plCouv().min_nuit;
  // LONG WEEK-END (étape 5) : une garde le JEUDI libère le week-end → pour le jeudi,
  // on DÉPRIORISE les médecins déjà de garde/tour CE week-end (sam+dim suivants), et
  // COUPLAGE TEMPOREL : qui a fait plus de samedis que de jeudis prend le jeudi
  // (mêmes personnes sur jeudis ET samedis, mais à des semaines différentes).
  const weWorkers = {};
  samedis.forEach((sat) => {
    const sun = plAdd(sat, 1); const set = new Set();
    sortie.forEach((s) => { if ((s.date === sat || s.date === sun) && (s.shift_type === "garde_24h" || s.shift_type === "twe")) set.add(s.doctor_id); });
    weWorkers[sat] = set;
  });
  const estWeWorker = (id, jeudi) => { const set = weWorkers[plAdd(jeudi, 2)]; return !!(set && set.has(id)); };
  const choisirNuit = (pool, date) => {
    if (plJourSemaine(date) !== 4) return plTrierGardeNuit(pool, date, etat)[0] || null;
    const base = plTrierGardeNuit(pool, date, etat);
    return base.slice().sort((a, b) => {
      const wa = estWeWorker(a.id, date) ? 1 : 0, wb = estWeWorker(b.id, date) ? 1 : 0;
      if (wa !== wb) return wa - wb;                                       // long week-end : non-travailleurs du WE d'abord
      const ta = (etat.nbSamedi[a.id] || 0) - (etat.nbJeudi[a.id] || 0);
      const tb = (etat.nbSamedi[b.id] || 0) - (etat.nbJeudi[b.id] || 0);
      if (tb !== ta) return tb - ta;                                      // couplage temporel : doit un jeudi → prioritaire
      return base.indexOf(a) - base.indexOf(b);                           // sinon équité
    })[0] || null;
  };
  datesTrim.forEach((date) => {
    const jr = plJourSemaine(date);
    if (jr === 6 || jr === 7 || plEstWeekendOuFerie(date)) return; // week-end/férié traité en Phase 1/1b
    plCrediterAbsences(date, medecins, etat);
    const dejaG = sortie.filter((s) => s.date === date && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h"));
    let manque = minNuit - dejaG.length;
    if (manque <= 0) return;
    const dejaResident = dejaG.some((s) => { const m = medecins.find((x) => x.id === s.doctor_id); return m && m.grade === "resident"; });
    const dejaAS = dejaG.filter((s) => { const m = medecins.find((x) => x.id === s.doctor_id); return m && m.grade === "assistant_specialiste"; }).length;
    const libres = medecins.filter((m) => plDispo(m, date, etat) && plPeutGarde(m, date) &&
      plGardesSemaine(m.id, date, etat) < PL_MAX_GARDES_SEMAINE &&
      !plAGardeLe(m.id, plAdd(date, 1)) &&  // pas de garde le LENDEMAIN (ex. veille d'un férié déjà posé) → évite 2 gardes 24h consécutives
      !plEstNouvelEngage(m, date, etat.debutPeriode));
    // ≥1 résident d'abord si aucun encore.
    if (!dejaResident) {
      const res = choisirNuit(plFiltrerPlafond(libres.filter((m) => m.grade === "resident"), date, etat, PL_HEURES.garde_nuit), date);
      if (res) { plAffecter(sortie, etat, date, "garde_nuit", res.id, null); manque--; }
      else conflits.push({ date, message: "Nuit : aucun résident dispo (≥1 obligatoire)." });
    }
    // compléter, jamais 2 A/S.
    let pris = new Set(sortie.filter((s) => s.date === date && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")).map((s) => s.doctor_id));
    let nAS = sortie.filter((s) => s.date === date && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")).filter((s) => { const m = medecins.find((x) => x.id === s.doctor_id); return m && m.grade === "assistant_specialiste"; }).length;
    while (manque > 0) {
      let pool = plFiltrerPlafond(libres.filter((m) => !pris.has(m.id)), date, etat, PL_HEURES.garde_nuit);
      if (nAS >= 1) pool = pool.filter((m) => m.grade !== "assistant_specialiste"); // jamais 2 A/S
      const pick = choisirNuit(pool, date);
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
  //     DÉSACTIVÉE PAR DÉFAUT (révision 2026-06-30) : cette promotion forçait des
  //     gardes 24h en semaine (médecin de jour + nuit) ALORS QUE des médecins
  //     étaient libres et auraient pu tenir la station en journée. Contraire à
  //     « travailler le moins possible ». La couverture 7/7 reste garantie par la
  //     PHASE 3 (vivier de jour, puis promotion 24h en TOUT DERNIER recours si une
  //     station resterait vide). Réactivable via GARDES.promotion_24h_souscharge.
  if (plGardes().promotion_24h_souscharge) {
    const _mb = {}; medecins.forEach((m) => { _mb[m.id] = m; });
    const fteOf = (id) => { const m = _mb[id]; return (m && typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1; };
    // Charge NORMALISÉE par l'ETP (heures/fte) : un mi-temps n'est pas "sous-chargé"
    // juste parce que ses heures absolues sont basses → pas de sur-promotion 24h.
    const moy = () => { let s=0,n=0; medecins.forEach((m)=>{s+=etat.heures[m.id]/fteOf(m.id);n++;}); return n?s/n:0; };
    datesTrim.forEach((date) => {
      const jr = plJourSemaine(date);
      if (jr === 6 || jr === 7 || plEstWeekendOuFerie(date)) return;
      const postes = plPostesOuverts(date, etat.periodes);
      const plan = {};
      sortie.filter((s)=>s.date===date && (s.shift_type==="jour"||s.shift_type==="garde_24h") && s.poste).forEach((s)=>{plan[s.poste]=s.doctor_id;});
      const cle = plLundiDe(date);
      const m0 = moy();
      if (jr === 5) return; // VENDREDI = nuit de consolidation (ven→dim) : ne JAMAIS promouvoir en 24h (sinon la personne travaille ven jour+nuit + dim 24h)
      sortie.filter((s)=>s.date===date && s.shift_type==="garde_nuit").forEach((s)=>{
        if (etat.heures[s.doctor_id] / fteOf(s.doctor_id) >= m0 - 10) return;  // sous-chargés (déficit normalisé ETP)
        // jamais 2 gardes 24h la même semaine ISO (évite les semaines à 70-90 h)
        if (sortie.some((x)=>x.doctor_id===s.doctor_id && x.shift_type==="garde_24h" && plLundiDe(x.date)===cle)) return;
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

  // ---- Équité des gardes AVANT repos / récups / stations (tout ce qui suit doit
  //      suivre les gardes FINALES — y compris le repos couplé ven→dim). ----
  plReequilibrerGardes(sortie, medecins, etat);
  // Équilibrage des heures-de-garde PAR MOIS (lisse les gardes mois par mois).
  moisTrim.forEach((mois) => plEquilibrerGardesMois(sortie, medecins, etat, annee, mois));

  // ---- Repos de garde + repos couplés (lendemain, lundi/mardi) ----
  // Posés AVANT la Phase 3 : on les MARQUE assignés (plMarquerAssigne) pour que le
  // staffing des stations ne pose rien par-dessus (plDispo lit etat.assigneJour).
  const bDeb = plBornesMois(annee, moisTrim[0]).debut, bFin = plBornesMois(annee, moisTrim[2]).fin;
  const dansTrim = (d) => d >= bDeb && d <= bFin;
  materialiserRepos(sortie, dansTrim).forEach((r) => { sortie.push(r); plMarquerAssigne(r.date, r.doctor_id, etat); });
  materialiserReposCouples(sortie, dansTrim).forEach((r) => { sortie.push(r); plMarquerAssigne(r.date, r.doctor_id, etat); });

  // ---- RÉCUPS D'OFFICE (AVANT le staffing des stations) ----
  // Cause du bug « la récup V/D saute » : les récups tournaient en DERNIER, quand la
  // semaine était déjà saturée (plus de jour libre). On les pose ICI, d'office, juste
  // après les repos, puis on BLOQUE leurs jours (plMarquerAssigne) → la Phase 3 ne
  // staffe plus par-dessus. La récup V/D tombe typiquement le mardi (repos couplé ven→dim).
  plEmettreCongesFerie(sortie, etat, datesTrim);
  plEmettreRecupsWeekend(sortie, medecins, etat, datesTrim);
  sortie.forEach((s) => { if (s.shift_type === "recup" || s.shift_type === "conge_ferie") plMarquerAssigne(s.date, s.doctor_id, etat); });

  // ---- PHASE 3 : unités (jour), continuité au mieux — APRÈS repos/récups (ne vole
  //      plus les jours de récup : plDispo respecte etat.assigneJour & etat.bloque).
  //      CONGRÈS (M17) restauré — règles perdues lors du passage au moteur couplé :
  //        (a) ÉQUIPE MINIMALE : les 2 gardes de nuit du jour sont forcées en 24h
  //            (elles tiennent une station + la nuit) → libère 2 médecins de plus
  //            pour le congrès. SAUF le vendredi (consolidation ven→dim) ;
  //        (b) CONTINUITÉ SUSPENDUE : on ne ré-ancre pas la station de la semaine,
  //            on fait TOURNER les gens (tri par équité des jours de congrès) ;
  //        (c) TOLÉRANCE : jusqu'à `congres_postes_vides` stations peuvent rester
  //            vides sans que ce soit signalé comme un conflit (§3.2). ----
  datesTrim.forEach((date) => {
    const jr = plJourSemaine(date);
    if (jr === 6 || jr === 7) return;                 // pas de station le week-end
    if (plEstWeekendOuFerie(date)) return;            // férié : pas de stations
    const congresJour = plEstCongres(date, etat.periodes);
    etat._congresJour = congresJour;                  // équité congrès (plAffecter / plTrier)
    const cle = plLundiDe(date);
    const postes = plPostesOuverts(date, etat.periodes);
    const plan = {};
    // Réserve les stations DÉJÀ tenues ce jour — y compris par une garde 24h
    // (promotion Phase 2b/congrès) — pour ne JAMAIS réattribuer une station occupée.
    sortie.filter((s) => s.date === date && (s.shift_type === "jour" || s.shift_type === "garde_24h") && s.poste)
      .forEach((s) => { plan[s.poste] = s.doctor_id; });

    // (a) CONGRÈS — ÉQUIPE MINIMALE : les DEUX gardes de nuit du jour passent en 24h
    //     (chacune tient une station + la nuit) → personne ne « vient à 17h », ce qui
    //     libère 2 médecins de plus pour le congrès. Appliqué AUSSI le vendredi : la
    //     garde reste posée le vendredi (toujours couplée au dimanche → consolidation
    //     ven→dim préservée). Le garde-fou « pas 2e 24h/semaine » est LEVÉ en congrès.
    if (congresJour) {
      sortie.filter((s) => s.date === date && s.shift_type === "garde_nuit").forEach((g) => {
        const med = medecins.find((x) => x.id === g.doctor_id); if (!med) return;
        const st = plChoisirStation(med, postes, plan, etat, cle);
        if (st && !(st in plan)) {
          g.shift_type = "garde_24h"; g.poste = st;
          plan[st] = g.doctor_id;
          etat.heures[g.doctor_id] += (PL_HEURES.garde_24h - PL_HEURES.garde_nuit);
          etat.joursCongres[g.doctor_id] = (etat.joursCongres[g.doctor_id] || 0) + 1;
          // pas d'ancrage de continuité en congrès (rotation quotidienne voulue).
        }
      });
    }

    const libres = medecins.filter((m) => plDispo(m, date, etat) && !plEstNouvelEngage(m, date, etat.debutPeriode));
    // (b) Tri : hors congrès = continuité (station de la semaine) puis heures ;
    //     en congrès = équité des jours de congrès d'abord (plTrier "jour"), rotation.
    const ordered = congresJour
      ? plTrier(libres.slice(), "jour", etat, date)
      : libres.sort((a, b) => {
          const pa = etat.station[a.id][cle] ? 0 : 1, pb = etat.station[b.id][cle] ? 0 : 1;
          return pa - pb || (etat.heures[a.id] - etat.heures[b.id]);
        });
    ordered.forEach((m) => {
      const restantes = postes.filter((c) => !(c in plan));
      if (!restantes.length) return;
      // PLAFOND MI-TEMPS : ne pas sur-stationner un mi-temps au-delà de son quota
      // hebdo (gardes comprises). Sans effet sur les pleins temps (cap = Infinity).
      // On préfère laisser une station en sous-effectif (signalée) que de surcharger
      // un mi-temps bien au-dessus de sa cible.
      if (plStationPlafonnee(m, date, etat)) return;
      const st = plChoisirStation(m, postes, plan, etat, cle);
      if (st && !(st in plan)) {
        plan[st] = m.id;
        plAffecter(sortie, etat, date, "jour", m.id, st);
        // Pas d'ancrage de continuité en congrès (les stations doivent tourner).
        if (!congresJour && !plSansContinuite(st)) etat.station[m.id][cle] = st;
      }
    });
    // GARANTIE DE COUVERTURE (jour de semaine ORDINAIRE — hors congrès) : 7/7
    // stations est une règle DURE, on ne laisse JAMAIS une station vide. Leviers,
    // dans l'ordre : (1) promouvoir une garde de nuit en 24h (elle tient la station
    // + la nuit) ; (2) reprendre une personne en RÉCUP ce jour et DÉPLACER sa récup
    // vers un jour ouvré libre (la récup est déplaçable, l'unité doit être tenue).
    if (!congresJour) {
      let vides = postes.filter((c) => !(c in plan));
      if (vides.length) {                                   // (1) garde de nuit → 24h (vendredi inclus en dernier recours : couverture > consolidation)
        sortie.filter((s) => s.date === date && s.shift_type === "garde_nuit").forEach((g) => {
          if (!vides.length) return;
          if (sortie.some((x) => x.doctor_id === g.doctor_id && x.shift_type === "garde_24h" && plLundiDe(x.date) === cle)) return;
          const med = medecins.find((x) => x.id === g.doctor_id); if (!med) return;
          const st = plChoisirStation(med, vides, plan, etat, cle);
          if (st && !(st in plan)) {
            g.shift_type = "garde_24h"; g.poste = st; plan[st] = g.doctor_id;
            etat.heures[g.doctor_id] += (PL_HEURES.garde_24h - PL_HEURES.garde_nuit);
            vides = postes.filter((c) => !(c in plan));
          }
        });
      }
      if (vides.length) {                                   // (2) reprise d'une récup (récup déplacée)
        const recups = sortie.filter((s) => s.date === date && s.shift_type === "recup");
        for (const r of recups) {
          if (!vides.length) break;
          if (sortie.some((x) => x !== r && x.date === date && x.doctor_id === r.doctor_id)) continue; // déjà occupé ce jour
          const med = medecins.find((x) => x.id === r.doctor_id); if (!med) continue;
          const st = plChoisirStation(med, vides, plan, etat, cle);
          if (!st || (st in plan)) continue;
          // jour ouvré libre suivant pour reposer la récup déplacée (best-effort).
          let dRecup = null, d2 = plAdd(date, 1);
          for (let k = 0; k < 21; k++) {
            if (within.has(d2) && plJourSemaine(d2) <= 5 && !plEstWeekendOuFerie(d2) && !sortie.some((s) => s.doctor_id === r.doctor_id && s.date === d2)) { dRecup = d2; break; }
            d2 = plAdd(d2, 1);
          }
          const note = r.note;
          r.shift_type = "jour"; r.poste = st; if ("note" in r) delete r.note;
          etat.heures[r.doctor_id] += PL_HEURES.jour;        // récup (0 h) → station (10,5 h)
          plan[st] = r.doctor_id;
          if (!plSansContinuite(st)) etat.station[r.doctor_id][cle] = st;
          if (dRecup) { sortie.push({ date: dRecup, shift_type: "recup", poste: null, doctor_id: r.doctor_id, note: note }); plMarquerAssigne(dRecup, r.doctor_id, etat); }
          vides = postes.filter((c) => !(c in plan));
        }
      }
    }
    // (c) TOLÉRANCE congrès : on ne signale un conflit que SOUS le minimum assoupli.
    const vide = postes.filter((c) => !(c in plan));
    const toleres = congresJour ? plToleranceVides(date, etat.periodes) : 0;
    if (vide.length > toleres) conflits.push({ date, message: "Stations vides : " + vide.join(",") });
  });

  // ---- PHASE 4 : off-clinic, équité tours/heures, doublures CIBLÉES en dernier ----
  moisTrim.forEach((mois) => {
    const offs = genererOffClinic({ annee, mois, medecins, shifts: sortie, preferences })
      .filter((o) => { const m = medecins.find((x) => x.id === o.doctor_id); return !(m && (m.sans_off || m.cap_fromager)); }); // statut spécial / CAP fromager : pas d'off
    offs.forEach((o) => { sortie.push(o); etat.heures[o.doctor_id] += PL_HEURES_OFFCLINIC; });
  });
  plResorberOff24h(sortie, medecins, etat);
  plEquilibrerTours(sortie, medecins, etat);
  plReequilibrerHeures(sortie, medecins, etat);                // resserre l'écart d'heures (trimestre) — TRANSFERT
  // Lissage des heures PAR MOIS (sans régresser l'équité trimestre — voir fonction).
  moisTrim.forEach((mois) => plEquilibrerHeuresMois(sortie, medecins, etat, annee, mois));
  // Doublures CIBLÉES (gros déficit relatif + plancher ETP) — APRÈS tous les
  // transferts, dernier recours. Remplace l'ancien plancher 40 h/sem.
  plDoubluresCiblees(sortie, medecins, etat, datesTrim);
  // ALLÈGEMENT DES SUR-CHARGÉS (Dr Dehout) : quand la couverture est assurée, on évite
  // les journées surchargées. Une DOUBLURE (2e personne sur une unité) est surnuméraire :
  // on la retire au médecin le plus chargé tant qu'il dépasse ~45 h/SEMAINE → il passe en
  // NON-PLANIFIÉ, sans trou (l'unité garde son titulaire).
  {
    const Hh = (t) => (t === "off" ? PL_HEURES_OFFCLINIC : (PL_HEURES[t] || 0));
    const SEUIL_HEBDO = 45;
    let guard = 0;
    while (guard++ < 600) {
      const hSem = {};
      sortie.forEach((s) => { if (Hh(s.shift_type)) { const k = s.doctor_id + "|" + plLundiDe(s.date); hSem[k] = (hSem[k] || 0) + Hh(s.shift_type); } });
      // on ne retire une doublure que si la personne RESTE ≥ 40 h cette semaine
      // (cap autour de 40–45 h, pas de chute brutale qui creuserait l'écart).
      const cands = sortie.filter((s) => {
        const hw = hSem[s.doctor_id + "|" + plLundiDe(s.date)] || 0;
        return s.doublure && hw > SEUIL_HEBDO + PL_EPS && (hw - Hh(s.shift_type)) >= 40 - PL_EPS;
      });
      if (!cands.length) break;
      cands.sort((a, b) => (hSem[b.doctor_id + "|" + plLundiDe(b.date)] || 0) - (hSem[a.doctor_id + "|" + plLundiDe(a.date)] || 0));
      const sh = cands[0];
      etat.heures[sh.doctor_id] -= Hh(sh.shift_type);
      sortie.splice(sortie.indexOf(sh), 1);                       // retire la doublure → non-planifié
    }
  }
  // (Récups/congés fériés déjà émis AVANT la Phase 3 — voir « RÉCUPS D'OFFICE » plus haut.)

  // FILET final : résout toute « double affectation » résiduelle (jour + garde le
  // même jour → fusion en 24h ; stations en double → on en garde une).
  plResoudreDoublesAffectations(sortie, etat);

  return { shifts: sortie, conflits, etat, medecins, datesTrim, within, moisTrim, annee, recupsNonPosees: etat.recupsNonPosees || [] };
}
function plNormGardeCpl(id, etat) { return etat.poidsGarde ? etat.nbGardes[id] / Math.max(etat.poidsGarde[id] || 0, PL_EPS) : etat.nbGardes[id]; }
