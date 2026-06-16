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
/* M26 — applique les surcharges admin de fériés (ajouts/retraits) au moteur de
   règles, sous Node comme en navigateur. */
function plDefinirFeriesAdmin(ajouts, retraits) {
  const fn = _PL_REGLES ? _PL_REGLES.definirFeriesAdmin
    : (typeof definirFeriesAdmin !== "undefined" ? definirFeriesAdmin : null);
  if (fn) fn(ajouts, retraits);
}
function plPostes()      { return _PL_REGLES ? _PL_REGLES.POSTES_JOUR     : POSTES_JOUR; }
function plCouv()        { return _PL_REGLES ? _PL_REGLES.COUVERTURE       : COUVERTURE; }
function plBloq()        { return _PL_REGLES ? _PL_REGLES.PREF_BLOQUANTES  : PREF_BLOQUANTES; }
/* Paramètres d'équité (Module 12). Repli sur des valeurs par défaut si la
   config n'expose pas EQUITE (compatibilité ascendante). */
const PL_EQUITE_DEFAUT = { plafond_hebdo: 60, plancher_ratio: 0.90 };
function plEquite() {
  const e = _PL_REGLES ? _PL_REGLES.EQUITE : (typeof EQUITE !== "undefined" ? EQUITE : null);
  return e || PL_EQUITE_DEFAUT;
}
/* Paramètres OFF-CLINIC (§9, Module 11b). Repli souple si la config ne les
   expose pas (compatibilité ascendante). */
const PL_OFFCLINIC_DEFAUT = { max_absences_jour: 5, min_residents_dispo: 1 };
function plOffclinic() {
  const o = _PL_REGLES ? _PL_REGLES.OFFCLINIC : (typeof OFFCLINIC !== "undefined" ? OFFCLINIC : null);
  return o || PL_OFFCLINIC_DEFAUT;
}
/* Paramètres GARDES de nuit semaine (format 17h–9h vs 24 h). Repli souple
   (compatibilité ascendante : par défaut 24 h non imposée). */
const PL_GARDES_DEFAUT = { garde24h_obligatoire: false, pref_as_24h: true, eviter_24h_a_3_gardes: true };
function plGardes() {
  const g = _PL_REGLES ? _PL_REGLES.GARDES : (typeof GARDES !== "undefined" ? GARDES : null);
  return g || PL_GARDES_DEFAUT;
}
/* Stations SANS continuité hebdomadaire ni ancrage trimestriel : le Labo de choc
   tourne LIBREMENT (on ne fixe pas un médecin dessus toute la semaine, et ce
   n'est pas une « unité maison » de trimestre). Les autres unités gardent la
   continuité de soins. */
const PL_STATIONS_SANS_CONTINUITE = ["labo_choc"];
function plSansContinuite(code) { return PL_STATIONS_SANS_CONTINUITE.indexOf(code) !== -1; }

/* VERSION de l'algorithme — affichée dans le message de génération pour
   vérifier que le navigateur exécute bien le code déployé (cache !). */
const PL_VERSION = "v2026.06.16-4";

/* Durées réelles (h) par type de shift — doivent coller à SHIFT_CONFIG (app.js). */
const PL_HEURES = { jour: 10.5, twe: 6, garde_nuit: 15, garde_24h: 24, pg_jour: 8.5, pg_twe: 6, garde_pg: 24 };

/* Off-clinic (§9) : journée de recherche CRÉDITÉE comme heures de travail
   (équivalent d'une journée), mais sans station ni repos généré. */
const PL_HEURES_OFFCLINIC = 10.5;

/* Types d'« absence / repos » (0 h, sans station). Doivent coller aux types
   absence de SHIFT_CONFIG (app.js).
   - 'repos_garde' : repos OBLIGATOIRE post-garde, matérialisé automatiquement,
     affiché dans le planning mais NON comptabilisé dans les totaux.
   - 'recup'       : repos / récupération posé manuellement, COMPTABILISÉ. */
const PL_ABSENCES = ["recup", "repos_garde", "off", "conge_annuel", "conge_scientifique", "conge_extralegal", "conge_ferie"];
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


/* ------- Module 17 — Périodes spéciales (congrès / fermetures) --------- */
/* Étend les périodes saisies par l'admin en index par date :
     - congres : Set des dates de congrès (ISICEM / ISICARE…).
     - fermees : { dateISO -> Set(codes de stations fermées ce jour) }.
   periodes = [{ type:'congres'|'fermeture', unite, start_date, end_date }]. */
function plIndexerPeriodes(periodes) {
  const idx = { congres: new Set(), fermees: {} };
  (periodes || []).forEach((p) => {
    let d = p.start_date;
    while (d <= p.end_date) {
      if (p.type === "congres") idx.congres.add(d);
      if (p.type === "fermeture" && p.unite) {
        (idx.fermees[d] = idx.fermees[d] || new Set()).add(p.unite);
      }
      d = plAdd(d, 1);
    }
  });
  return idx;
}

/* Stations OUVERTES un jour donné = toutes les stations moins celles d'une
   fermeture d'unité couvrant la date (le poste fermé n'est ni pourvu ni exigé). */
function plPostesOuverts(date, idx) {
  const tous = plPostes().map((p) => p.code);
  if (!idx || !idx.fermees[date]) return tous;
  return tous.filter((c) => !idx.fermees[date].has(c));
}

/* Vrai si la date tombe pendant un congrès saisi par l'admin. */
function plEstCongres(date, idx) {
  return !!(idx && idx.congres.has(date));
}

/* Tolérance de stations vides un jour de SEMAINE : pendant un congrès,
   jusqu'à `congres_postes_vides` stations peuvent rester vides (spec §3.2). */
function plToleranceVides(date, idx) {
  if (!plEstCongres(date, idx)) return 0;
  const c = plCouv();
  return (typeof c.congres_postes_vides === "number") ? c.congres_postes_vides : 2;
}


/* --------------------------- État mutable ------------------------------ */
function plNouvelEtat(medecins) {
  const e = {
    indispo: {}, souhait: {}, eviterGarde: {}, bloque: {}, assigneJour: {},
    // nbGardes / nbWeekend = compteurs de SÉLECTION : en mode trimestriel ils
    // sont REMIS À ZÉRO à chaque mois (équilibrage MENSUEL des gardes, demandé
    // par la révision). Les cumuls pour les statistiques sont *Total ci-dessous.
    nbGardes: {}, nbWeekend: {}, nbGardesTotal: {}, nbWeekendTotal: {},
    heures: {}, station: {},
    // CRÉDIT D'ÉQUITÉ pour les jours de CONGÉ (préférences bloquantes) : un
    // jour ouvré de congé est crédité PL_HEURES.jour dans ce compteur, utilisé
    // UNIQUEMENT par le tri d'équité (jamais dans les stats ni les plafonds).
    // Sans lui, un médecin en congé paraissait « en déficit d'heures » et
    // l'algorithme le surchargeait à son retour (dépassements horaires) alors
    // que des collègues sans congé faisaient moins d'heures.
    heuresEquite: {},
    // MINIMUM CUMULÉ ATTENDU (révision) : à chaque jour ouvré disponible, on
    // ajoute la part quotidienne du minimum hebdo (minimum_hebdo_h × fte ÷
    // jours ouvrés travaillables). Sert à PROMOUVOIR en 24 h la garde de
    // semaine d'un médecin resté sous son minimum (compensation).
    attenduMin: {},
    // Heures par semaine ISO (lundi) et par médecin : { id: { lundiISO: h } }.
    // Sert au PLAFOND 60 h/semaine souple (Module 12, priorité N2).
    heuresSemaine: {},
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
    // Module 12c : dernière date de GARDE (toutes gardes) par médecin, pour le
    // biais de concentration des gardes de nuit de semaine.
    derniereGarde: {},
    // Module 17 : index des périodes spéciales (congrès / fermetures d'unités),
    // rempli par genererPlanning / genererTrimestre via plIndexerPeriodes.
    periodes: null,
    // ÉQUITÉ CONGRÈS (prioritaire) : nb de jours de congrès TRAVAILLÉS par médecin
    // → pendant un congrès, on sert d'abord ceux qui en ont le moins, pour que
    // tout le monde ait le même nombre de jours libres au congrès.
    joursCongres: {},
    // PRIORITÉ FÉRIÉ (M26) : date "AAAA-MM-JJ" -> Set(doctor_id) ayant demandé à
    // TRAVAILLER ce férié (demande 'travailler_ferie' approuvée). Ces médecins
    // passent en PRIORITÉ à la couverture week-end du férié.
    prioriteFerie: {},
    // M26 — jours de récup (congé férié) à matérialiser en shift visible.
    congesFerie: [],
    _congresJour: false, // vrai pendant la génération d'un jour de congrès (plAffecter)
  };
  medecins.forEach((m) => {
    e.indispo[m.id] = new Set();
    e.souhait[m.id] = new Set();
    e.eviterGarde[m.id] = new Set(); // indispo (garde) : souhait SOUPLE de ne pas garder
    e.joursCongres[m.id] = 0;        // équité congrès
    e.bloque[m.id] = new Set();
    e.nbGardes[m.id] = 0;
    e.nbWeekend[m.id] = 0;
    e.nbGardesTotal[m.id] = 0;
    e.nbWeekendTotal[m.id] = 0;
    e.heures[m.id] = 0;
    e.heuresEquite[m.id] = 0; // crédit congés (équité uniquement)
    e.attenduMin[m.id] = 0;   // minimum cumulé attendu (40 h/sem proratisé)
    e.gardesSemaine[m.id] = {};
    e.heuresSemaine[m.id] = {};
    e.weekendsTravailles[m.id] = new Set();
    e.dispoDeclaree[m.id] = new Set(); // jours déclarés dispo (résidents indépendants)
    e.station[m.id] = {}; // { lundiISO: codeStation }
    e.derniereGarde[m.id] = null; // Module 12c
  });
  // Paramètres d'équité (Module 12), figés à la création de l'état.
  const eq = plEquite();
  e.plafondHebdo = eq.plafond_hebdo;
  e.plancherRatio = eq.plancher_ratio;
  // Paramètres de concentration des gardes de nuit (Module 12c). Repli prudent
  // si la config ne les expose pas (compatibilité ascendante).
  e.concentrationNuits = eq.concentration_nuits !== false && eq.concentration_coeff > 0;
  e.concentrationCoeff = (typeof eq.concentration_coeff === "number") ? eq.concentration_coeff : 0;
  e.fenetreNuits = (typeof eq.fenetre_nuits === "number" && eq.fenetre_nuits > 0) ? eq.fenetre_nuits : 14;
  return e;
}

/* Étend les préférences en ensembles de dates par médecin. */
function plIndexerPreferences(preferences, etat) {
  const bloquantes = plBloq();
  (preferences || []).forEach((p) => {
    if (!etat.indispo[p.doctor_id]) return; // médecin hors équipe
    const estBloquant = bloquantes.includes(p.pref_type);
    const estSouhait = p.pref_type === "souhait";   // souhait (garde) : bias +
    const estIndispo = p.pref_type === "indispo";   // indispo (garde) : bias − (non bloquant)
    const estDispo = p.pref_type === "dispo"; // fenêtre déclarée (indépendants)
    // TRAVAILLER UN FÉRIÉ (M26) : placement PRIORITAIRE sur le férié + jour
    // compensatoire (date_compensation) BLOQUANT, HORS QUOTA (crédité en équité
    // comme un congé, jamais décompté du quota de congés).
    const estFerie = p.pref_type === "travailler_ferie";
    if (estFerie && p.date_compensation) {
      etat.indispo[p.doctor_id].add(p.date_compensation);
      etat.congesFerie.push({ doctor_id: p.doctor_id, date: p.date_compensation });
    }
    let d = p.start_date;
    while (d <= p.end_date) {
      if (estBloquant) etat.indispo[p.doctor_id].add(d);
      if (estSouhait) etat.souhait[p.doctor_id].add(d);
      if (estIndispo) etat.eviterGarde[p.doctor_id].add(d);
      if (estDispo) etat.dispoDeclaree[p.doctor_id].add(d);
      if (estFerie) (etat.prioriteFerie[d] = etat.prioriteFerie[d] || new Set()).add(p.doctor_id);
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

/* NOUVEL ENGAGÉ (révision 2026-06-12) : pendant ses 14 PREMIERS JOURS de
   contrat (à défaut de date de contrat : les 14 premiers jours de la période
   générée), un médecin marqué `nouvel_engage` :
   - ne prend NI garde, NI week-end, NI tour (TWE) ;
   - est présent chaque JOUR OUVRÉ en DOUBLURE d'une unité déjà pourvue
     (unité choisie librement par l'algo, peut varier d'un jour à l'autre).
   Le statut reste sur la fiche jusqu'à suppression par l'admin ; une fenêtre
   entièrement passée est SIGNALÉE en conflit (à retirer avant de générer le
   trimestre suivant). */
function plEstNouvelEngage(m, date, debutPeriode) {
  if (!m || !m.nouvel_engage) return false;
  const debut = m.contract_start || debutPeriode;
  if (!debut) return false;
  return date >= debut && date <= plAdd(debut, 13);
}

/* Conflits « statut périmé » : nouvel engagé dont la fenêtre est entièrement
   antérieure à la période générée → l'admin doit retirer le statut. */
function plControlerNouveauxEngages(medecins, debutPeriode, conflits) {
  (medecins || []).forEach((m) => {
    if (!m.nouvel_engage) return;
    const debut = m.contract_start || debutPeriode;
    if (debut && plAdd(debut, 13) < debutPeriode) {
      conflits.push({ date: debutPeriode, message:
        `${m.name || m.id} : statut « nouvel engagé » PÉRIMÉ (fenêtre terminée le ${plAdd(debut, 13)}) — à retirer de la fiche avant génération.` });
    }
  });
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
const PL_EPS = 1e-9;
/* Score de déficit de GARDES d'un médecin (plus bas = plus prioritaire à servir).
   Mode trimestriel : compte / poids (déficit relatif). Mode mensuel : compte brut. */
function plScoreGarde(id, etat) {
  if (etat.poidsGarde) return etat.nbGardes[id] / Math.max(etat.poidsGarde[id] || 0, PL_EPS);
  return etat.nbGardes[id];
}
/* Score de déficit de WEEK-ENDS (même logique que plScoreGarde). */
function plScoreWeekend(id, etat) {
  if (etat.poidsWeekend) return etat.nbWeekend[id] / Math.max(etat.poidsWeekend[id] || 0, PL_EPS);
  return etat.nbWeekend[id];
}

/* ----- SOUHAITS / INDISPONIBILITÉS de GARDE (préférence SOUPLE) -----
   Désormais, 'souhait' (= souhait de GARDE) et 'indispo' (= souhait de NE PAS
   être de garde) ne concernent QUE les gardes et sont NON BLOQUANTS : ils ne
   servent que de DÉPARTAGE à équité égale dans les tris de gardes (jamais pour
   les journées de station). 'dispo' (disponibilité déclarée des indépendants)
   reste une contrainte dure séparée (plDispoIndependant). */
function plBiaisGarde(m, date, etat) {
  let v = 0;
  if (etat.souhait[m.id] && etat.souhait[m.id].has(date)) v += 1;        // souhait (garde)
  if (etat.eviterGarde[m.id] && etat.eviterGarde[m.id].has(date)) v -= 1; // indispo (garde)
  return v;
}
/* Rang de priorité des DÉSIDÉRATAS selon le niveau admin (spec §8–10) :
   admin principal (3) > admins secondaires (2) > travailleurs (1). Sert UNIQUEMENT
   à départager DEUX médecins qui souhaitent le même jour ; n'écrase pas l'équité. */
function plRangDesiderata(m) {
  if (m && m.admin_level === "principal") return 3;
  if (m && m.admin_level === "secondaire") return 2;
  return 1; // travailleur (admin_level 'aucun' ou absent)
}

/* `date` (optionnel) active la prise en compte des souhaits/indispos de GARDE.
   Les souhaits/indispos n'agissent QUE pour les critères de garde ('garde' /
   'weekend'), jamais pour les journées de station ('jour'). */
/* RATIO D'ÉQUITÉ HORAIRE d'un médecin : heures réelles + crédit congés,
   rapportées à la cible hebdomadaire. Le crédit (plCrediterAbsences) neutralise
   les jours de congé : un médecin en congé n'est plus « rattrapé » au-delà des
   autres à son retour. */
function plRatioHeures(m, etat) {
  const credit = (etat.heuresEquite && etat.heuresEquite[m.id]) || 0; // état minimal toléré (tests)
  return (etat.heures[m.id] + credit) / (m.weekly_hours_target || 52);
}

/* ----- PLAFOND MI-TEMPS sur les JOURNÉES DE STATION (révision 2026-06-14) -----
   La quotité (fte) d'un médecin ne réduit QUE ses journées de station :
     • GARDES : inchangées — un mi-temps fait autant de gardes qu'un plein temps
       (les gardes sont réparties par PRÉSENCE, pas par fte, et n'entrent pas
       dans le plafond ci-dessous).
     • CONGÉS : quota proratisé au fte (géré côté app.js).
     • STATION : plafonnée à `weekly_hours_target` heures par semaine (déjà =
       référence × fte sur la fiche), à défaut référence × fte.
   Plein temps (fte ≥ 1) → aucune borne (Infinity). */
const PL_REF_HEBDO = 52; // référence plein temps (cohérent avec app.js HEURES_BASE)
function plPlafondStation(m) {
  const fte = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1;
  if (fte >= 1) return Infinity;
  return (typeof m.weekly_hours_target === "number" && m.weekly_hours_target > 0)
    ? m.weekly_hours_target : PL_REF_HEBDO * fte;
}
/* Vrai si poser une journée de station de PLUS à ce médecin CETTE semaine
   dépasserait son plafond mi-temps. La comparaison porte sur le TOTAL hebdo
   (gardes COMPRISES) : les gardes « consomment » le budget d'heures, si bien
   qu'un mi-temps qui a gardé fait peu/pas de station cette semaine — ses gardes
   restent pleines (jamais bloquées), seules les STATIONS sont rabotées. Plafond
   STRICT : on préfère laisser la station en sous-effectif (signalée par la
   détection de conflits) plutôt que de surcharger un mi-temps. Sans effet sur
   les pleins temps (cap = Infinity). */
function plStationPlafonnee(m, date, etat) {
  const cap = plPlafondStation(m);
  if (cap === Infinity) return false;
  const lk = plLundiDe(date);
  const dejaH = (etat.heuresSemaine[m.id] && etat.heuresSemaine[m.id][lk]) || 0; // TOTAL semaine (gardes incl.)
  return (dejaH + PL_HEURES.jour) > cap + PL_EPS;
}

/* Crédite, pour un JOUR OUVRÉ donné, les médecins en congé (préférence
   bloquante) d'un équivalent journée (PL_HEURES.jour) dans heuresEquite.
   Conditions : sous contrat, jour travaillable, jour ouvré (les week-ends ont
   leur propre équilibrage). À appeler une fois par date dans les boucles de
   génération. */
function plCrediterAbsences(date, medecins, etat) {
  if (plEstWeekendOuFerie(date)) return;
  const eqM = plEquite();
  const minH = (typeof eqM.minimum_hebdo_h === "number") ? eqM.minimum_hebdo_h : 40;
  medecins.forEach((m) => {
    if (!plSousContrat(m, date)) return;
    const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
    if (!jt.includes(plJourSemaine(date))) return;
    if (etat.indispo[m.id] && etat.indispo[m.id].has(date)) {
      etat.heuresEquite[m.id] += PL_HEURES.jour;
      return; // jour de congé : pas d'attendu minimal ce jour-là
    }
    // Jour ouvré DISPONIBLE (hors repos de garde) → part quotidienne du minimum.
    if (minH && etat.attenduMin && !(etat.bloque[m.id] && etat.bloque[m.id].has(date))) {
      const jtSem = jt.filter((j) => j >= 1 && j <= 5).length || 1;
      const fte = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1;
      etat.attenduMin[m.id] += (minH * fte) / jtSem;
    }
  });
}

/* INDÉPENDANT PRIORITAIRE (révision 2026-06-13) : sur un jour qu'il a
   explicitement déclaré disponible (« je viens travailler »), l'indépendant
   passe DEVANT pour les journées de station ; pour les gardes/week-ends ce
   n'est qu'un départage (l'équité des gardes prime). */
function plPrioIndep(m, date, etat) {
  return (m && m.statut === "independant" && date &&
    etat.dispoDeclaree[m.id] && etat.dispoDeclaree[m.id].has(date)) ? 1 : 0;
}

function plTrier(liste, critere, etat, date, favoriId) {
  const estGarde = (critere === "garde" || critere === "weekend");
  const congres = !!(date && etat._congresJour);
  return liste.slice().sort((a, b) => {
    // ÉQUITÉ CONGRÈS (prioritaire sur tout) : pendant un congrès, on sert d'abord
    // le médecin qui a travaillé le MOINS de jours de congrès → jours libres égaux.
    if (congres) {
      const ca = etat.joursCongres[a.id] || 0, cb = etat.joursCongres[b.id] || 0;
      if (ca !== cb) return ca - cb;
    }
    // PRIORITÉ FÉRIÉ (M26) : qui a demandé à TRAVAILLER ce férié passe DEVANT à
    // la couverture week-end (garde 24 h / tour) — l'algo couvre toujours, la
    // demande ne fait que prioriser le demandeur parmi les éligibles.
    if (critere === "weekend" && date && etat.prioriteFerie && etat.prioriteFerie[date]) {
      const fa = etat.prioriteFerie[date].has(a.id) ? 1 : 0;
      const fb = etat.prioriteFerie[date].has(b.id) ? 1 : 0;
      if (fa !== fb) return fb - fa;
    }
    // Indépendant prioritaire sur ses jours déclarés (JOURNÉES de station).
    if (!estGarde && date) {
      const ia = plPrioIndep(a, date, etat), ib = plPrioIndep(b, date, etat);
      if (ia !== ib) return ib - ia;
    }
    if (critere === "garde") {
      const sa = plScoreGarde(a.id, etat), sb = plScoreGarde(b.id, etat);
      if (sa !== sb) return sa - sb;                            // équité gardes d'abord
    }
    if (critere === "weekend") {
      // Coût MARGINAL en week-ends : qui est DÉJÀ engagé sur CE week-end (ex.
      // garde du vendredi soir, clé samedi) ne « paie » rien à prendre la 24 h
      // du dimanche → le tri pousse la consolidation vendredi+dimanche = UN
      // SEUL week-end travaillé, et diminue le nombre total de week-ends
      // entamés pour tout le monde.
      const wk = date ? plWeekendKey(date) : null;
      const cout = (id) => {
        const deja = wk && etat.weekendsTravailles[id] && etat.weekendsTravailles[id].has(wk);
        const n = etat.nbWeekend[id] + (deja ? 0 : 1);
        return etat.poidsWeekend ? n / Math.max(etat.poidsWeekend[id] || 0, PL_EPS) : n;
      };
      const sa = cout(a.id), sb = cout(b.id);
      if (sa !== sb) return sa - sb;                            // équité week-ends d'abord
    }
    // Souhait(+) / indisponibilité(−) de GARDE — DÉPARTAGE souple (n'écrase pas
    // l'équité ci-dessus) et UNIQUEMENT pour les gardes. À souhait égal positif,
    // priorité admin principal > secondaire > travailleur.
    if (date && estGarde) {
      const pa = plBiaisGarde(a, date, etat), pb = plBiaisGarde(b, date, etat);
      if (pa !== pb) return pb - pa;
      if (pa > 0) { const ra2 = plRangDesiderata(a), rb2 = plRangDesiderata(b); if (ra2 !== rb2) return rb2 - ra2; }
      // Indépendant : départage en sa faveur sur ses jours déclarés.
      const ia = plPrioIndep(a, date, etat), ib = plPrioIndep(b, date, etat);
      if (ia !== ib) return ib - ia;
    }
    const ra = plRatioHeures(a, etat);
    const rb = plRatioHeures(b, etat);
    // Couplage des gardes (Pt 6, révisé) : favoriser le(s) médecin(s) de la
    // garde de nuit de l'avant-veille (jeudi→samedi, vendredi→dimanche) pour
    // la 24 h de week-end, dans une TOLÉRANCE horaire bornée
    // (EQUITE.couplage_tolerance_h, défaut 15 h = une garde de nuit).
    // L'ancien départage « à égalité stricte » ne se déclenchait JAMAIS : la
    // garde du jeudi augmentait les heures du médecin, qui n'était donc plus
    // strictement à égalité le samedi.
    const favs = !favoriId ? [] : (Array.isArray(favoriId) ? favoriId : [favoriId]);
    const aF = favs.indexOf(a.id) !== -1, bF = favs.indexOf(b.id) !== -1;
    if (aF !== bF) {
      const eqC = plEquite();
      // Par défaut (null) : PAS de borne d'heures — on favorise le combo au
      // maximum dès que l'équité week-end (critère du dessus) est égale.
      const tol = ((typeof eqC.couplage_tolerance_h === "number") ? eqC.couplage_tolerance_h : 24) / 52;
      // GARDE-FOU équité gardes : le favori ne double pas quelqu'un s'il est
      // déjà en EXCÉDENT de gardes par rapport à lui (l'équité ±1 garde reste
      // tenue sur le trimestre malgré la maximisation des combos).
      // Double garde-fou : score mensuel (équilibrage gardes du mois) ET cumul
      // trimestriel ±1 (équité ±1 garde mesurée sur le trimestre).
      const ga = plScoreGarde(a.id, etat), gb = plScoreGarde(b.id, etat);
      const ta = (etat.nbGardesTotal && etat.nbGardesTotal[a.id]) || 0;
      const tb = (etat.nbGardesTotal && etat.nbGardesTotal[b.id]) || 0;
      const favOk = aF ? (ga <= gb + PL_EPS && ta <= tb + 1) : (gb <= ga + PL_EPS && tb <= ta + 1);
      if (favOk && Math.abs(ra - rb) <= tol) return aF ? -1 : 1;
    }
    if (ra !== rb) return ra - rb;
    return String(a.id).localeCompare(String(b.id)); // déterministe
  });
}

/* ----- Module 12c : CONCENTRATION des gardes de nuit en semaine (N3) ----- */

/* Écart en JOURS entre deux dates ISO (a - b, positif si a après b). */
function plDiffJours(a, b) { return (plParse(a) - plParse(b)) / 86400000; }

/* Score de « récence » d'un médecin pour la date courante (plus grand = a gardé
   plus récemment). Vaut 0 si la concentration est désactivée, si le médecin n'a
   pas encore gardé, ou si sa dernière garde est plus ancienne que la fenêtre.
   Sert UNIQUEMENT de critère de départage à équité strictement égale. */
function plRecenceGarde(id, date, etat) {
  if (!etat.concentrationNuits) return 0;
  const last = etat.derniereGarde[id];
  if (!last) return 0;
  const gap = plDiffJours(date, last);
  if (gap <= 0 || gap > etat.fenetreNuits) return 0;
  return etat.concentrationCoeff * (etat.fenetreNuits - gap) / etat.fenetreNuits; // ∈ ]0,1[
}

/* Tri des candidats pour une garde de nuit de SEMAINE.
   Module 12c — concentration en DÉPARTAGE STRICT : l'équité (déficit de gardes)
   passe TOUJOURS en premier ; ce n'est qu'entre candidats à déficit STRICTEMENT
   ÉGAL qu'on privilégie celui qui a gardé le plus récemment. Conséquence : la
   DISTRIBUTION des gardes est identique à celle sans concentration (équité
   exactement préservée) ; seul le CHOIX du médecin à déficit égal change, ce qui
   regroupe un peu ses nuits. En mode trimestriel, beaucoup de médecins sont à
   égalité de gardes → l'effet est réel sans coûter d'équité. */
function plTrierGardeNuit(liste, date, etat) {
  const congres = !!(date && etat._congresJour);
  return liste.slice().sort((a, b) => {
    // ÉQUITÉ CONGRÈS prioritaire (cf. plTrier) : moins de jours de congrès d'abord.
    if (congres) {
      const ca = etat.joursCongres[a.id] || 0, cb = etat.joursCongres[b.id] || 0;
      if (ca !== cb) return ca - cb;
    }
    const sa = plScoreGarde(a.id, etat), sb = plScoreGarde(b.id, etat);
    if (Math.abs(sa - sb) > PL_EPS) return sa - sb;            // équité d'abord (stricte)
    // Souhait(+) / indispo(−) de GARDE : départage à équité STRICTEMENT égale
    // (n'écrase jamais l'équité). À souhait égal positif → priorité admin.
    const pa = plBiaisGarde(a, date, etat), pb = plBiaisGarde(b, date, etat);
    if (pa !== pb) return pb - pa;
    if (pa > 0) { const ra2 = plRangDesiderata(a), rb2 = plRangDesiderata(b); if (ra2 !== rb2) return rb2 - ra2; }
    // Indépendant : départage en sa faveur sur ses jours déclarés.
    const iaI = plPrioIndep(a, date, etat), ibI = plPrioIndep(b, date, etat);
    if (iaI !== ibI) return ibI - iaI;
    const ra = plRecenceGarde(a.id, date, etat), rb = plRecenceGarde(b.id, date, etat);
    if (ra !== rb) return rb - ra;                            // ex aequo → garde récente d'abord
    // COMBO jeudi+samedi / vendredi+dimanche préparé EN AMONT : le jeudi et le
    // vendredi, à équité de gardes égale, on préfère le médecin en déficit de
    // week-ends — c'est lui qui prendra la 24 h du week-end (couplage aval).
    if (date) {
      const js = plJourSemaine(date);
      if (js === 4 || js === 5) {
        const wa = plScoreWeekend(a.id, etat), wb = plScoreWeekend(b.id, etat);
        if (wa !== wb) return wa - wb;
      }
    }
    const ha = plRatioHeures(a, etat);
    const hb = plRatioHeures(b, etat);
    if (ha !== hb) return ha - hb;
    return String(a.id).localeCompare(String(b.id)); // déterministe
  });
}

function plMarquerAssigne(date, id, etat) {
  if (!etat.assigneJour[date]) etat.assigneJour[date] = new Set();
  etat.assigneJour[date].add(id);
}

/* Contrainte DURE : maximum de gardes par semaine et par personne (spec §6 N1). */
const PL_MAX_GARDES_SEMAINE = 3;

/* Vrai (1) si le médecin est un A/S — utilisé pour préférer l'A/S à la garde
   24 h de semaine (les résidents restent en 17h–9h). Renvoie 0/1 (tri). */
function plEstAS(m) { return (m && m.grade === "assistant_specialiste") ? 1 : 0; }

/* Nombre de gardes déjà posées au médecin durant la semaine (lundi) de `date`. */
function plGardesSemaine(id, date, etat) {
  const lk = plLundiDe(date);
  return (etat.gardesSemaine[id] && etat.gardesSemaine[id][lk]) || 0;
}

/* Heures déjà posées au médecin durant la semaine ISO (lundi) de `date`. */
function plHeuresSemaine(id, date, etat) {
  const lk = plLundiDe(date);
  return (etat.heuresSemaine[id] && etat.heuresSemaine[id][lk]) || 0;
}

/* PLAFOND 60 h/semaine — SOUPLE (Module 12, N2). Filtre une liste de candidats
   pour ne garder que ceux qui RESTERAIENT sous le plafond après `ajout` heures.
   Si plus personne ne respecte le plafond, on rend la liste entière (le plafond
   est compensable la semaine suivante : violable en dernier recours). */
function plFiltrerPlafond(liste, date, etat, ajout) {
  const plaf = etat.plafondHebdo || PL_EQUITE_DEFAUT.plafond_hebdo;
  const ok = liste.filter((m) => plHeuresSemaine(m.id, date, etat) + ajout <= plaf);
  return ok.length ? ok : liste;
}

/* Plafond N2 : max 2 week-ends travaillés par mois et par personne (§6 N2). */
const PL_MAX_WEEKENDS_MOIS = 2;

/* Clé d'un week-end = samedi ISO. Samedi -> lui-même ; dimanche -> la veille ;
   VENDREDI -> le lendemain (révision : une garde du vendredi soir se termine le
   samedi matin — elle ENTAME le week-end et doit compter comme tel).
   Un autre jour de semaine (férié isolé) ne définit pas de clé (null). */
function plWeekendKey(date) {
  const j = plJourSemaine(date);
  if (j === 5) return plAdd(date, 1); // vendredi soir → samedi
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

/* Choisit le meilleur candidat (critère 'weekend') parmi ceux qui respectent
   le plafond de 2 week-ends/mois — CONTRAINTE DURE (révision) : plus de repli
   silencieux. Le repli sur la liste complète ne subsiste qu'en DERNIER recours
   (sinon la garde resterait vide, et la couverture / le ≥1 résident par nuit
   priment) et il est alors SIGNALÉ par un conflit explicite. */
function plChoisirWE(liste, date, etat, favoriId, conflits) {
  const ok = liste.filter((m) => plPeutWeekend(m.id, date, etat));
  if (ok.length) return plTrier(ok, "weekend", etat, date, favoriId)[0] || null;
  const repli = plTrier(liste, "weekend", etat, date, favoriId)[0] || null;
  if (repli && conflits) {
    conflits.push({ date, message: repli.name || repli.id ?
      `${repli.name || repli.id} : plafond 2 week-ends/mois DÉPASSÉ (effectif insuffisant ce ${date}).` :
      `Plafond 2 week-ends/mois dépassé le ${date} (effectif insuffisant).` });
  }
  return repli;
}

/* Enregistre un shift et met à jour l'état (heures, gardes, repos 12 h). */
function plAffecter(sortie, etat, date, type, doctorId, poste) {
  sortie.push({ date, shift_type: type, poste: poste || null, doctor_id: doctorId });
  plMarquerAssigne(date, doctorId, etat);
  etat.heures[doctorId] += PL_HEURES[type];
  // Heures de la semaine ISO (plafond 60 h souple, Module 12).
  const lkH = plLundiDe(date);
  etat.heuresSemaine[doctorId][lkH] = (etat.heuresSemaine[doctorId][lkH] || 0) + PL_HEURES[type];
  if (type === "garde_nuit" || type === "garde_24h") {
    etat.nbGardes[doctorId]++;
    etat.nbGardesTotal[doctorId]++; // cumul (stats), indépendant des resets mensuels
    const lk = plLundiDe(date);
    etat.gardesSemaine[doctorId][lk] = (etat.gardesSemaine[doctorId][lk] || 0) + 1;
    etat.bloque[doctorId].add(plAdd(date, 1)); // repos 12 h → lendemain off
    // Module 12c : mémorise la dernière garde (jours traités dans l'ordre
    // chronologique → simple écrasement) pour le biais de concentration.
    etat.derniereGarde[doctorId] = date;
  }
  // Équité CONGRÈS : compter un jour de congrès TRAVAILLÉ (shift de travail).
  if (etat._congresJour && (type === "jour" || type === "garde_nuit" || type === "garde_24h" || type === "twe")) {
    etat.joursCongres[doctorId] = (etat.joursCongres[doctorId] || 0) + 1;
  }
}

/* Choisit la station d'un médecin : sa station de la semaine si encore
   libre (continuité), sinon la première station libre. */
function plChoisirStation(med, postes, plan, etat, cle) {
  // Continuité de la semaine, sinon l'UNITÉ DE RÉFÉRENCE du médecin (rotation
  // trimestrielle, Module 20), sinon la première station libre.
  const pref = etat.station[med.id][cle] || med.unite_reference;
  // La station habituelle doit être OUVERTE ce jour (fermetures, M17) et ne pas
  // être une station SANS continuité (Labo de choc → pas d'ancrage).
  if (pref && !plSansContinuite(pref) && postes.includes(pref) && !(pref in plan)) return pref;
  return postes.find((c) => !(c in plan)) || postes[0];
}


/* ------------------------- Jour de SEMAINE ----------------------------- */
/* pp (Module 19) : pré-placements épinglés du jour. Sans pré-placement, le
   comportement est STRICTEMENT identique à l'historique. */
function plGenererSemaine(date, medecins, etat, sortie, conflits, pp) {
  pp = pp || [];
  const cle = plLundiDe(date);
  etat._congresJour = plEstCongres(date, etat.periodes); // équité congrès (plAffecter)
  // Module 17 : seules les stations OUVERTES ce jour sont à pourvoir
  // (une unité fermée par l'admin n'est ni pourvue ni exigée).
  const postes = plPostesOuverts(date, etat.periodes);

  // 0) PRÉ-PLACEMENTS (Module 19) : on les pose tels quels et on construit
  //    AUTOUR. Les médecins pré-placés sont marqués « occupés » → exclus des
  //    sélections (plDispo). Les stations pré-placées pré-remplissent `plan`.
  const ppDocs = new Set();
  const plan = {}; // codeStation -> doctorId (inclut les stations pré-placées)
  pp.forEach((s) => {
    if (PL_HEURES[s.shift_type] !== undefined) {
      plAffecter(sortie, etat, date, s.shift_type, s.doctor_id, s.poste || null);
      if ((s.shift_type === "jour" || s.shift_type === "garde_24h") && s.poste) {
        plan[s.poste] = s.doctor_id;
        // Pas d'ancrage de continuité pour les stations sans continuité (Labo).
        if (!plSansContinuite(s.poste)) etat.station[s.doctor_id][cle] = s.poste;
      }
    } else {
      // Absence / repos épinglé : 0 h, pas de garde ; on marque juste occupé.
      sortie.push({ date, shift_type: s.shift_type, poste: s.poste || null, doctor_id: s.doctor_id });
      plMarquerAssigne(date, s.doctor_id, etat);
    }
    ppDocs.add(s.doctor_id);
  });

  let libres = medecins.filter((m) => plDispo(m, date, etat)); // pré-placés exclus (assignés)
  // NOUVEAUX ENGAGÉS (fenêtre 14 j) : retirés des viviers normaux (pas de
  // garde, pas de station en titulaire) ; posés en DOUBLURE en fin de journée.
  const nouveaux = libres.filter((m) => plEstNouvelEngage(m, date, etat.debutPeriode));
  if (nouveaux.length) libres = libres.filter((m) => !plEstNouvelEngage(m, date, etat.debutPeriode));
  // Vivier pour les GARDES : on retire ceux qui ont déjà atteint le max
  // hebdomadaire (contrainte DURE, spec §6 N1).
  const libresG = libres.filter((m) => plGardesSemaine(m.id, date, etat) < PL_MAX_GARDES_SEMAINE);
  const residents = libresG.filter((m) => m.grade === "resident");

  // 1) NUIT : compléter jusqu'à 2 gardes dont ≥1 résident, JAMAIS 2 A/S, en
  //    tenant compte des gardes déjà ÉPINGLÉES ce jour. Le FORMAT (17h–9h ou
  //    24 h) est décidé plus bas (§2/2c) : par défaut 2 gardes de nuit 17h–9h ;
  //    une 24 h n'est introduite que si nécessaire pour pourvoir une station.
  const ppGardes = pp.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h");
  const residentDejaNuit = ppGardes.some((s) => {
    const m = medecins.find((x) => x.id === s.doctor_id); return m && m.grade === "resident";
  });
  let resNuit = null, second = null;
  let manqueNuit = 2 - ppGardes.length;
  if (manqueNuit > 0) {
    if (residentDejaNuit) {
      // un résident est déjà de garde (pré-placement) → on complète librement
    } else if (residents.length > 0) {
      // VENDREDI : la garde de nuit ENTAME le samedi matin → elle compte comme
      // week-end travaillé et respecte le plafond DUR 2 week-ends/mois (repli
      // en dernier recours, signalé).
      const j5 = plJourSemaine(date) === 5;
      const filtreWE = (pool) => {
        if (!j5 || !pool.length) return pool;
        const ok = pool.filter((m) => plPeutWeekend(m.id, date, etat));
        if (ok.length) return ok;
        conflits.push({ date, message: "Vendredi soir : plafond 2 week-ends/mois dépassé (effectif insuffisant)." });
        return pool;
      };
      const resPool = filtreWE(plFiltrerPlafond(residents, date, etat, PL_HEURES.garde_nuit));
      // Module 12c : tri par déficit + biais (borné) de concentration des nuits.
      resNuit = plTrierGardeNuit(resPool, date, etat)[0];
      manqueNuit--;
    } else {
      conflits.push({ date, message: "Nuit : aucun résident disponible (≥1 obligatoire)." });
      manqueNuit = 0; // pas de garde sans résident (comme l'historique)
    }
    if (manqueNuit > 0) {
      const j5b = plJourSemaine(date) === 5;
      const exclu = resNuit ? resNuit.id : null;
      let reste = plFiltrerPlafond(libresG.filter((m) => m.id !== exclu), date, etat, PL_HEURES.garde_24h);
      if (j5b && reste.length) {
        const ok = reste.filter((m) => plPeutWeekend(m.id, date, etat));
        if (ok.length) reste = ok;
        else conflits.push({ date, message: "Vendredi soir : plafond 2 week-ends/mois dépassé (effectif insuffisant)." });
      }
      second = plTrierGardeNuit(reste, date, etat)[0] || null;
    }
  }

  const pris = new Set();
  if (resNuit) pris.add(resNuit.id);
  if (second) pris.add(second.id);

  // Les 2 médecins de garde de nuit (hors pré-placés). Chacun fera SOIT une
  // garde de nuit 17h–9h (sans station), SOIT une garde 24 h (tient une station).
  const cfgG = plGardes();
  const gardesNuit = [];
  if (resNuit) gardesNuit.push(resNuit);
  if (second) gardesNuit.push(second);
  const mode24 = {};                       // doctorId -> true si garde 24 h
  gardesNuit.forEach((m) => { mode24[m.id] = false; });

  // 2) JOUR — pourvoir les 7 stations.
  // Pendant un CONGRÈS (M17) : ÉQUIPE MINIMALE — on force les 2 gardes de nuit
  // en 24 h (elles tiennent une station + la nuit) pour libérer le maximum de
  // monde au congrès (combiné à la tolérance de stations vides ci-dessous).
  // Hors congrès : selon le drapeau `garde24h_obligatoire`, seul le complément
  // est éventuellement forcé en 24 h.
  const congresJour = etat._congresJour;
  let aForcer24 = [];
  if (congresJour) aForcer24 = gardesNuit.slice();
  else if (cfgG.garde24h_obligatoire && second) aForcer24 = [second];
  // RÈGLE (révision 2026-06-13) : un médecin resté SOUS son minimum cumulé
  // (40 h/sem proratisé) prend sa garde de semaine en 24 H pour compenser
  // (il tient une station + la nuit : +24 h au lieu de +15 h, et libère un
  // médecin du vivier de jour). Seuil = GARDES.promotion_24h_deficit_h
  // (défaut 9 h ≈ le gain d'une promotion ; 0 = désactivé).
  if (!congresJour) {
    const seuilP = (typeof cfgG.promotion_24h_deficit_h === "number") ? cfgG.promotion_24h_deficit_h : 9;
    if (seuilP > 0) gardesNuit.forEach((m) => {
      if (aForcer24.indexOf(m) !== -1) return;
      const attendu = (etat.attenduMin && etat.attenduMin[m.id]) || 0;
      if (attendu - etat.heures[m.id] >= seuilP) aForcer24.push(m);
    });
  }
  aForcer24.forEach((m) => {
    if (mode24[m.id]) return;
    const st = plChoisirStation(m, postes, plan, etat, cle);
    if (st && !(st in plan)) {
      plan[st] = m.id; mode24[m.id] = true;
      // Pendant un congrès on n'ancre PAS la continuité : les stations doivent
      // TOURNER de jour en jour pour égaliser les jours de congrès de chacun.
      if (!congresJour && !plSansContinuite(st)) etat.station[m.id][cle] = st;
    }
  });
  const pool = plTrier(libres.filter((m) => !pris.has(m.id)), "jour", etat, date);
  // 2a) Continuité : on replace chacun sur sa station de la semaine si libre.
  //     SUSPENDUE pendant un CONGRÈS (M17) : l'équité des jours de congrès
  //     prime — sans cela, les mêmes médecins retenaient leur station toute la
  //     semaine et travaillaient TOUS les jours du congrès pendant que les
  //     autres n'en travaillaient aucun (écart constaté : 4-5 jours).
  if (!congresJour) pool.forEach((m) => {
    if (Object.values(plan).includes(m.id)) return;
    if (plStationPlafonnee(m, date, etat)) return; // mi-temps : plafond station atteint
    // Continuité de la semaine, sinon l'unité de référence (rotation, M20).
    const st = etat.station[m.id][cle] || m.unite_reference;
    // Station OUVERTE ce jour (M17) et AVEC continuité (le Labo n'ancre pas).
    if (st && !plSansContinuite(st) && postes.includes(st) && !(st in plan)) plan[st] = m.id;
  });
  // 2b) On comble les stations encore vides avec le vivier de jour.
  postes.forEach((code) => {
    if (code in plan) return;
    const cand = pool.find((m) => !Object.values(plan).includes(m.id) &&
      !plStationPlafonnee(m, date, etat)); // mi-temps : jamais au-delà du plafond (strict)
    if (cand) {
      plan[code] = cand.id;
      // Pas d'ancrage de continuité pour le Labo de choc (rotation libre),
      // ni pendant un congrès (rotation quotidienne voulue, équité congrès).
      if (!congresJour && !plSansContinuite(code)) etat.station[cand.id][cle] = code;
    }
  });

  // 2c) NOUVEAU (N3) — si le vivier de jour ne suffit pas à pourvoir toutes les
  //     stations, on PROMEUT une garde de nuit en garde 24 h pour combler (elle
  //     tient alors une station). PRIORITÉ (révision 2026-06-15) : le médecin le
  //     MOINS chargé par rapport à SA cible (heures ÷ cible) d'abord — évite de
  //     surcharger en 24 h quelqu'un déjà en surplus (typiquement un A/S à cible
  //     basse). La préférence A/S et le « moins de gardes cette semaine » ne
  //     servent plus qu'à DÉPARTAGER à charge égale. La 24 h reste utilisée
  //     QU'EN CAS DE BESOIN (sinon 2 gardes 17h–9h).
  if (!cfgG.garde24h_obligatoire) {
    const candidats = gardesNuit.filter((m) => !mode24[m.id]);
    candidats.sort((a, b) =>
      (plRatioHeures(a, etat) - plRatioHeures(b, etat)) ||                       // le MOINS chargé / sa cible d'abord
      (cfgG.pref_as_24h ? (plEstAS(b) - plEstAS(a)) : 0) ||                      // puis A/S (départage)
      (cfgG.eviter_24h_a_3_gardes                                               // puis moins de gardes cette semaine
        ? (plGardesSemaine(a.id, date, etat) - plGardesSemaine(b.id, date, etat)) : 0) ||
      0);
    for (const m of candidats) {
      const reste = postes.filter((c) => !(c in plan));
      if (reste.length === 0) break;                 // toutes les stations pourvues
      const st = plChoisirStation(m, postes, plan, etat, cle);
      if (st && !(st in plan)) {
        plan[st] = m.id; mode24[m.id] = true;
        if (!congresJour && !plSansContinuite(st)) etat.station[m.id][cle] = st;
      }
    }
  }

  // Détection des conflits de couverture (contraintes dures non satisfaites).
  const totalNuit = ppGardes.length + (resNuit ? 1 : 0) + (second ? 1 : 0);
  if (totalNuit === 1) {
    conflits.push({ date, message: "Nuit : 2e médecin de garde indisponible (≥2 requis)." });
  }
  // Module 17 : pendant un congrès, jusqu'à N stations vides sont TOLÉRÉES
  // (spec §3.2) — on ne signale un conflit que sous le minimum assoupli.
  const remplies = postes.filter((c) => c in plan).length;
  const toleres = plToleranceVides(date, etat.periodes);
  if (remplies < postes.length - toleres) {
    conflits.push({ date, message: `Jour : ${remplies}/${postes.length} postes pourvus ` +
      (toleres ? `(congrès : minimum ${postes.length - toleres}).` : `(effectif insuffisant).`) });
  }

  // 3) Affectations effectives (les pré-placés sont déjà posés à l'étape 0).
  //    Garde de nuit : 24 h (avec station) si promue, sinon 17h–9h (garde_nuit).
  gardesNuit.forEach((m) => {
    if (mode24[m.id]) {
      const st = Object.keys(plan).find((c) => plan[c] === m.id);
      plAffecter(sortie, etat, date, "garde_24h", m.id, st || null);
    } else {
      plAffecter(sortie, etat, date, "garde_nuit", m.id, null);
    }
  });
  // VENDREDI : comptabilise le week-end ENTAMÉ (clé samedi) pour toutes les
  // gardes du soir (épinglées comprises) → équité, plafond 2 WE/mois et
  // consolidation vendredi+dimanche (coût marginal nul le dimanche).
  if (plJourSemaine(date) === 5) {
    const wk = plWeekendKey(date);
    gardesNuit.map((m) => m.id).concat(ppGardes.map((s) => s.doctor_id)).forEach((id) => {
      if (!etat.weekendsTravailles[id] || etat.weekendsTravailles[id].has(wk)) return;
      etat.weekendsTravailles[id].add(wk);
      etat.nbWeekend[id]++; etat.nbWeekendTotal[id]++;
    });
  }
  Object.keys(plan).forEach((code) => {
    const id = plan[code];
    if (pris.has(id)) return;   // garde de nuit (24 h) déjà affectée ci-dessus
    if (ppDocs.has(id)) return; // pré-placement déjà posé (étape 0)
    plAffecter(sortie, etat, date, "jour", id, code);
  });

  // DOUBLURE des nouveaux engagés : un « jour » sur une unité déjà pourvue
  // (répartie au fil des jours pour varier l'unité de doublage).
  // RÈGLES (révision) : JAMAIS le Labo de choc (1 personne max) et MAXIMUM
  // 2 personnes par unité (titulaire + 1 doublure) → unités déjà doublées
  // exclues, et deux nouveaux engagés ne s'empilent pas sur la même unité.
  const dejaDouble = new Set();
  nouveaux.forEach((m, k) => {
    const pourvues = Object.keys(plan)
      .filter((c) => !plSansContinuite(c) && !dejaDouble.has(c));
    if (!pourvues.length) return; // aucune unité doublable ce jour
    const st = pourvues[(parseInt(date.slice(8, 10), 10) + k) % pourvues.length];
    dejaDouble.add(st);
    plAffecter(sortie, etat, date, "jour", m.id, st);
    sortie[sortie.length - 1].doublure = true; // doublure du nouvel engagé
  });
}


/* --------------------- Jour de WEEK-END / FÉRIÉ ------------------------ */
function plGenererWeekend(date, medecins, etat, sortie, conflits, pp) {
  pp = pp || [];
  etat._congresJour = plEstCongres(date, etat.periodes); // équité congrès (plAffecter)
  const couv = plCouv();
  const j = plJourSemaine(date);

  // 0) PRÉ-PLACEMENTS (Module 19) : absences posées et marquées ; gardes 24 h et
  //    tour (TWE) épinglés pris comme DÉJÀ choisis (on complète le reste). Les
  //    médecins pré-placés sont exclus des viviers de sélection.
  const ppDocs = new Set();
  pp.forEach((s) => {
    if (plEstAbsence(s.shift_type)) {
      sortie.push({ date, shift_type: s.shift_type, poste: s.poste || null, doctor_id: s.doctor_id });
      plMarquerAssigne(date, s.doctor_id, etat);
    }
    if (s.shift_type === "garde_24h" || s.shift_type === "twe" || plEstAbsence(s.shift_type)) ppDocs.add(s.doctor_id);
  });
  const gardePinned = pp.filter((s) => s.shift_type === "garde_24h")
    .map((s) => medecins.find((m) => m.id === s.doctor_id)).filter(Boolean);
  const ppTweId = (pp.find((s) => s.shift_type === "twe") || {}).doctor_id || null;

  const libres = medecins.filter((m) => plDispo(m, date, etat) && !ppDocs.has(m.id) &&
    !plEstNouvelEngage(m, date, etat.debutPeriode)); // nouvel engagé : jamais le week-end

  if (libres.length < couv.twe_weekend) {
    conflits.push({ date, message: `Week-end : ${libres.length} médecin(s) dispo (${couv.twe_weekend} requis).` });
  }

  // RÈGLE BINÔME TWE : le médecin du TWE-seul du samedi doit refaire le TWE
  // du dimanche, SANS garde (pour limiter le nombre de week-ends différents
  // amenés à l'hôpital). S'il est dispo, on le réserve d'emblée au TWE et on
  // l'exclut de la sélection des gardes 24 h.
  let t1 = null;
  if (ppTweId) {
    // Tour ÉPINGLÉ : il prime (et impose le binôme du dimanche, cf. plus bas).
    t1 = medecins.find((m) => m.id === ppTweId) || null;
  } else {
    const forceId = etat.tweForce[date];
    if (forceId) {
      t1 = libres.find((m) => m.id === forceId) || null;
      if (!t1) conflits.push({ date, message: "Week-end : médecin du TWE de samedi indisponible le dimanche (règle binôme)." });
    }
  }

  // Vivier pour les gardes : tout le monde sauf le TWE imposé (sans garde),
  // et hors max hebdomadaire de gardes (contrainte DURE, spec §6 N1).
  const libresGarde = (t1 ? libres.filter((m) => m.id !== t1.id) : libres)
    .filter((m) => plGardesSemaine(m.id, date, etat) < PL_MAX_GARDES_SEMAINE);
  const residentsG = libresGarde.filter((m) => m.grade === "resident");

  // 2 gardes 24 h dont ≥1 résident. On privilégie ceux qui n'ont pas encore
  // 2 week-ends ce mois-ci (priorité N2 « max 2 week-ends/mois »).
  // Module 12 — équité entre grades : le 2e créneau n'est plus réservé aux A/S.
  // 1er créneau garanti à un résident (≥1 résident + jamais 2 A/S), 2e créneau
  // choisi par déficit toutes catégories (2 Résidents possibles). Plafond 60 h souple.
  // Pt 6 — COUPLAGE souple : à équité STRICTEMENT égale, on favorise le médecin
  // de la garde de NUIT de l'avant-veille (jeudi → samedi, vendredi → dimanche)
  // pour la garde 24 h, ce qui déclenche le repos compensatoire couplé (lundi /
  // mardi via materialiserReposCouples) sans dégrader l'équité (simple départage,
  // cf. tiebreaker dans plTrier). À défaut d'ex æquo, l'équité prime.
  // (les gardes du jeudi/vendredi d'un médecin couplé sont par construction
  //  des 17h–9h : seuls les shifts garde_nuit alimentent le couplage)
  let coupleId = null;
  if (j === 6 || j === 7) {
    const ids = sortie.filter((s) => s.shift_type === "garde_nuit" && s.date === plAdd(date, -2))
      .map((s) => s.doctor_id);
    if (ids.length) coupleId = ids; // favoris multiples (les 2 gardes de J-2)
  }

  // Gardes 24 h : on complète jusqu'à 2 en tenant compte de celles ÉPINGLÉES,
  // en garantissant ≥1 résident (jamais 2 A/S via le résident garanti).
  let g1 = null, g2 = null;
  const residentDejaGarde = gardePinned.some((m) => m.grade === "resident");
  let manqueG = 2 - gardePinned.length;
  // Les FAVORIS de couplage (garde de nuit de l'avant-veille) restent candidats
  // même au-delà du plafond 60 h SOUPLE : sans cela, jeudi GN + semaine de
  // station + samedi 24 h dépassait presque toujours 60 h et le combo
  // jeudi+samedi / vendredi+dimanche ne se réalisait jamais. Le repos couplé du
  // lundi/mardi compense la semaine suivante.
  const garderFavoris = (pool, source) => {
    if (!coupleId) return pool;
    const favs = Array.isArray(coupleId) ? coupleId : [coupleId];
    const dedans = new Set(pool.map((m) => m.id));
    source.forEach((m) => { if (favs.indexOf(m.id) !== -1 && !dedans.has(m.id)) pool.push(m); });
    return pool;
  };
  if (manqueG > 0) {
    if (residentDejaGarde) {
      // un résident est déjà de garde (pré-placement) → on complète librement
    } else if (residentsG.length > 0) {
      g1 = plChoisirWE(garderFavoris(plFiltrerPlafond(residentsG, date, etat, PL_HEURES.garde_24h), residentsG), date, etat, coupleId, conflits);
      manqueG--;
    } else {
      conflits.push({ date, message: "Week-end nuit : aucun résident disponible (≥1 obligatoire)." });
      manqueG = 0;
    }
    if (manqueG > 0) {
      const exclu = g1 ? g1.id : null;
      const sourceG2 = libresGarde.filter((m) => m.id !== exclu);
      const reste = garderFavoris(plFiltrerPlafond(sourceG2, date, etat, PL_HEURES.garde_24h), sourceG2);
      g2 = plChoisirWE(reste, date, etat, coupleId, conflits);
    }
  }

  // TWE-seul : l'imposé (binôme/épinglé) sinon le plus prioritaire restant.
  const pris = new Set([g1 && g1.id, g2 && g2.id, t1 && t1.id].filter(Boolean));
  if (!t1) t1 = plChoisirWE(plFiltrerPlafond(libres.filter((m) => !pris.has(m.id)), date, etat, PL_HEURES.twe), date, etat, null, conflits);

  // Samedi : on mémorise le binôme à imposer le dimanche.
  if (j === 6 && t1) etat.tweForce[plAdd(date, 1)] = t1.id;

  const totalG = gardePinned.length + (g1 ? 1 : 0) + (g2 ? 1 : 0);
  if (totalG === 1) conflits.push({ date, message: "Week-end : 2e garde 24 h indisponible." });
  if (!t1) conflits.push({ date, message: "Week-end : médecin du tour (TWE) manquant." });

  // Un FÉRIÉ en semaine suit les règles de couverture du week-end mais NE
  // compte PAS comme « week-end travaillé » (spec §7). Seuls les vrais
  // samedis/dimanches incrémentent le compteur d'équité week-end.
  const estVraiWeekend = (j === 6 || j === 7);

  const wkey = plWeekendKey(date); // clé week-end (samedi) ou null si férié en semaine

  // Affectations + récupération après garde de week-end.
  // Équité WEEK-END comptée en WEEK-ENDS DISTINCTS (clé = samedi), pas en jours :
  // faire le samedi ET le dimanche du même week-end ne compte qu'une seule fois.
  // (Sinon un binôme TWE sam+dim « pesait » double, faussant l'équilibrage.)
  const majWE = (id) => {
    if (!estVraiWeekend || !wkey) return;
    if (!etat.weekendsTravailles[id].has(wkey)) {
      etat.nbWeekend[id]++; etat.nbWeekendTotal[id]++; etat.weekendsTravailles[id].add(wkey);
    }
  };
  gardePinned.concat([g1, g2]).forEach((g) => {
    if (!g) return;
    plAffecter(sortie, etat, date, "garde_24h", g.id, null);
    majWE(g.id);
    // Repos de la SEMAINE SUIVANTE (révision) : uniquement pour des gardes
    // COUPLÉES — jeudi+samedi → lundi ; vendredi+dimanche → mardi. Une 24 h
    // de week-end isolée ne donne que le repos du lendemain (déjà bloqué par
    // plAffecter). On détecte le couplage dans la sortie (garde à J-2).
    if (j === 6 || j === 7) {
      const couple = sortie.some((s) =>
        s.doctor_id === g.id && s.date === plAdd(date, -2) &&
        (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h"));
      if (couple) etat.bloque[g.id].add(plAdd(date, 2)); // lundi (sam) / mardi (dim)
    }
  });
  if (t1) {
    plAffecter(sortie, etat, date, "twe", t1.id, null);
    majWE(t1.id);
  }
}


/* Module 19 — Indexe les pré-placements (shifts ÉPINGLÉS par l'admin) par date.
   prePlaces : [{ date, shift_type, doctor_id, poste }]. Ces shifts sont posés
   tels quels et la génération construit AUTOUR (cf. plGenererSemaine/Weekend). */
function plIndexerPrePlaces(prePlaces) {
  const idx = {};
  (prePlaces || []).forEach((s) => { (idx[s.date] = idx[s.date] || []).push(s); });
  return idx;
}

/* --------------------------- Point d'entrée ---------------------------- */
/* opts = { annee, mois (1-12), medecins:[...], preferences:[...],
            periodes:[...] (Module 17 : congrès / fermetures, optionnel),
            prePlaces:[...] (Module 19 : shifts épinglés, optionnel) }
   Renvoie { shifts, conflits, stats }. */
/* M26 — matérialise les jours de RÉCUP (congé férié) en shift visible
   ('conge_ferie', 0 h) sur la date choisie, s'il tombe dans la période générée
   et que le médecin n'y a pas déjà un shift. Rend le jour « pris en compte »
   visible au calendrier et aux compteurs. */
function plEmettreCongesFerie(sortie, etat, dates) {
  if (!etat.congesFerie || !etat.congesFerie.length) return;
  const within = dates ? new Set(dates) : null;
  const dejaPose = new Set(sortie.map((s) => s.date + "|" + s.doctor_id));
  etat.congesFerie.forEach((c) => {
    if (within && !within.has(c.date)) return;             // hors période générée
    if (dejaPose.has(c.date + "|" + c.doctor_id)) return;  // déjà un shift ce jour
    sortie.push({ date: c.date, shift_type: "conge_ferie", poste: null, doctor_id: c.doctor_id });
    dejaPose.add(c.date + "|" + c.doctor_id);
  });
}

function genererPlanning(opts) {
  const annee = opts.annee;
  const mois = opts.mois;
  // Les PG ont leur PROPRE génération (genererTrimestrePG) → exclus du moteur résident.
  const medecins = (opts.medecins || []).filter((m) => m.grade !== "pg");
  const preferences = opts.preferences || [];
  if (opts.feriesAdmin) plDefinirFeriesAdmin(opts.feriesAdmin.ajouts, opts.feriesAdmin.retraits); // M26

  const etat = plNouvelEtat(medecins);
  plIndexerPreferences(preferences, etat);
  etat.periodes = plIndexerPeriodes(opts.periodes); // congrès / fermetures (M17)
  const ppParDate = plIndexerPrePlaces(opts.prePlaces); // Module 19 : pré-placements épinglés

  const sortie = [];
  const conflits = [];
  etat.debutPeriode = plBornesMois(annee, mois).debut; // fenêtre « nouvel engagé »
  plControlerNouveauxEngages(medecins, etat.debutPeriode, conflits);
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();

  for (let j = 1; j <= nbJours; j++) {
    const date = annee + "-" + String(mois).padStart(2, "0") + "-" + String(j).padStart(2, "0");
    const pp = ppParDate[date] || [];
    plCrediterAbsences(date, medecins, etat); // crédit d'équité des congés
    if (plEstWeekendOuFerie(date)) plGenererWeekend(date, medecins, etat, sortie, conflits, pp);
    else plGenererSemaine(date, medecins, etat, sortie, conflits, pp);
  }

  // Matérialise les repos de garde (visibles, non comptabilisés).
  const bM = plBornesMois(annee, mois);
  const dansMois = (d) => d >= bM.debut && d <= bM.fin;
  materialiserRepos(sortie, dansMois).forEach((r) => sortie.push(r));
  // Repos compensatoires couplés (double garde de week-end), après les repos.
  materialiserReposCouples(sortie, dansMois).forEach((r) => sortie.push(r));

  // Placement automatique des off-clinic (§9), une fois le planning posé.
  const offs = genererOffClinic({ annee, mois, medecins, shifts: sortie, preferences });
  offs.forEach((o) => { sortie.push(o); etat.heures[o.doctor_id] += PL_HEURES_OFFCLINIC; });

  // Résorption off-clinic ↔ 24 h de semaine : l'off reprend la station, la 24 h
  // redescend en 17h–9h (évite une 24 h alors qu'un off pourrait être en clinique).
  plResorberOff24h(sortie, medecins, etat);

  // Minimum d'heures hebdomadaire (doublures d'unités si nécessaire).
  plCompleterMinimumHeures(sortie, medecins, etat, plDatesDuMois(annee, mois));
  // Correction finale avant brouillon : écart d'heures resserré au maximum.
  plReequilibrerHeures(sortie, medecins, etat);

  plEmettreCongesFerie(sortie, etat, plDatesDuMois(annee, mois)); // M26 — jours de récup visibles

  // RÈGLE « slack bloque la 24 h de semaine » : alerte si une 24 h coexiste
  // avec de l'off-clinic ou un médecin disponible non posté le même jour.
  plConflits24hSlack({ shifts: sortie, medecins, preferences, periodes: opts.periodes })
    .forEach((c) => conflits.push(c));

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

/* RÉÉQUILIBRAGE FINAL DES GARDES (équité ±1, après maximisation des combos).
   La maximisation des combos jeudi+samedi / vendredi+dimanche peut laisser un
   écart de gardes > 2 intra-grade sur le trimestre. On déplace alors des
   gardes de NUIT de DÉBUT de semaine (lundi→mercredi, jamais jeudi/vendredi
   ni week-end pour PRÉSERVER les combos) d'un médecin EXCÉDENTAIRE vers un
   médecin DÉFICITAIRE du même grade, en respectant : libre ce jour-là et le
   lendemain, pas de garde la veille, max 3 gardes/semaine, congés/contrat/
   dispo déclarée. À appeler AVANT materialiserRepos (les repos suivront).
   Mute `sortie` (doctor_id) et l'état (heures, compteurs). */
function plReequilibrerGardes(sortie, medecins, etat) {
  const estG = (x) => x === "garde_nuit" || x === "garde_24h";
  const parDoc = {}; // id -> Set(dates de shift, tous types)
  const gardesDates = {}; // id -> Set(dates de garde)
  const compte = {}; // id -> nb gardes (trimestre)
  medecins.forEach((m) => { parDoc[m.id] = new Set(); gardesDates[m.id] = new Set(); compte[m.id] = 0; });
  sortie.forEach((s) => {
    if (!parDoc[s.doctor_id]) return;
    parDoc[s.doctor_id].add(s.date);
    if (estG(s.shift_type)) { gardesDates[s.doctor_id].add(s.date); compte[s.doctor_id]++; }
  });
  // ÉQUITÉ DES GARDES NORMALISÉE PAR LE FTE (révision 2026-06-15) : on compare le
  // compte de gardes RAPPORTÉ AU FTE. Un mi-temps (fte 0,5) vise ~la moitié des
  // gardes d'un plein temps ; les pleins temps restent égaux entre eux, quelle
  // que soit leur présence (la cible ne dépend que de la quotité).
  const fteG = {}; medecins.forEach((m) => { fteG[m.id] = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1; });
  const norm = (id) => compte[id] / fteG[id];
  const peutRecevoir = (m, d) => {
    if (!plSousContrat(m, d)) return false;
    const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
    if (!jt.includes(plJourSemaine(d))) return false;
    if (etat.bloque[m.id] && etat.bloque[m.id].has(d)) return false;            // repos/récup (couplée incluse)
    if (etat.bloque[m.id] && etat.bloque[m.id].has(plAdd(d, 1))) return false;  // lendemain déjà repos d'une autre garde
    if (etat.indispo[m.id] && etat.indispo[m.id].has(d)) return false;          // congé
    if (!plDispoIndependant(m, d, etat.dispoDeclaree[m.id])) return false;      // indépendant
    if (parDoc[m.id].has(d) || parDoc[m.id].has(plAdd(d, 1))) return false;     // libre J et J+1
    if (gardesDates[m.id].has(plAdd(d, -1))) return false;                      // pas de garde la veille
    // max 3 gardes / semaine ISO
    const lk = plLundiDe(d);
    let n = 0; gardesDates[m.id].forEach((g) => { if (plLundiDe(g) === lk) n++; });
    return n < PL_MAX_GARDES_SEMAINE;
  };
  const grades = ["resident", "assistant_specialiste"];
  for (let iter = 0; iter < 40; iter++) {
    let bouge = false;
    for (const grade of grades) {
      const pool = medecins.filter((m) => m.grade === grade);
      if (pool.length < 2) continue;
      const tri = pool.slice().sort((a, b) => norm(b.id) - norm(a.id));
      // Recherche PERSÉVÉRANTE : tous les couples (excédentaire, déficitaire)
      // avec écart > 2, et toutes les gardes de début de semaine transférables
      // de l'excédentaire — pas seulement le premier couple/candidat.
      let haut = null, bas = null, cand = null;
      for (let hi = 0; hi < tri.length && !cand; hi++) {
        for (let bi = tri.length - 1; bi > hi && !cand; bi--) {
          if (norm(tri[hi].id) - norm(tri[bi].id) <= 2) break; // écart normalisé (gardes/fte) trop faible → couple suivant
          // Lundi→mercredi d'abord (jamais de combo), puis jeudi/vendredi en
          // dernier recours (le combo suivra le nouveau titulaire).
          const cands = sortie.filter((s) => s.doctor_id === tri[hi].id &&
            s.shift_type === "garde_nuit" && plJourSemaine(s.date) <= 5)
            .sort((a, b) => (plJourSemaine(a.date) <= 3 ? 0 : 1) - (plJourSemaine(b.date) <= 3 ? 0 : 1));
          for (const c of cands) {
            if (peutRecevoir(tri[bi], c.date)) { haut = tri[hi]; bas = tri[bi]; cand = c; break; }
          }
        }
      }
      if (!cand) continue;
      // Transfert : shift + état (heures, compteurs, index locaux).
      parDoc[haut.id].delete(cand.date); gardesDates[haut.id].delete(cand.date); compte[haut.id]--;
      parDoc[bas.id].add(cand.date); gardesDates[bas.id].add(cand.date); compte[bas.id]++;
      cand.doctor_id = bas.id;
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

/* MINIMUM D'HEURES HEBDOMADAIRE (révision 2026-06-12) : chaque médecin doit
   atteindre l'équivalent de `EQUITE.minimum_hebdo_h` (défaut 40 h) par semaine,
   proratisé : minimum × fte × (jours ouvrés DISPONIBLES de la semaine / 5).
   Si le planning normal ne suffit pas, on AJOUTE des journées en DOUBLURE
   d'une unité déjà pourvue (« quitte à doubler les unités »). À appeler en FIN
   de génération (après off-clinic). Mute sortie + état via plAffecter. */
function plCompleterMinimumHeures(sortie, medecins, etat, dates) {
  const eq = plEquite();
  const minH = (typeof eq.minimum_hebdo_h === "number") ? eq.minimum_hebdo_h : 40;
  if (!minH) return;
  // Index par semaine ISO (lundi) : dates ouvrées de la période.
  const semaines = {}; // lundiISO -> [dates ouvrées]
  dates.forEach((d) => {
    if (plEstWeekendOuFerie(d)) return;
    (semaines[plLundiDe(d)] = semaines[plLundiDe(d)] || []).push(d);
  });
  // Heures RÉELLES par médecin et par semaine (depuis la sortie, off compris).
  const heuresSem = {}; // id -> { lundi -> h }
  const aShift = {};    // id -> Set(dates)
  sortie.forEach((s) => {
    (aShift[s.doctor_id] = aShift[s.doctor_id] || new Set()).add(s.date);
    let h = PL_HEURES[s.shift_type] || 0;
    if (s.shift_type === "off") h = PL_HEURES_OFFCLINIC;
    if (h <= 0) return;
    const lk = plLundiDe(s.date);
    const m = (heuresSem[s.doctor_id] = heuresSem[s.doctor_id] || {});
    m[lk] = (m[lk] || 0) + h;
  });
  // Occupation des stations par date : nb de personnes par unité. Une unité
  // n'est DOUBLABLE que si elle a exactement 1 titulaire (max 2 par unité) et
  // n'est pas le Labo de choc (1 personne max, jamais de doublure).
  const occupation = {}; // date -> { poste -> nb }
  const tenuePar24h = new Set(); // "date|poste" : unité tenue par une garde 24 h
  sortie.forEach((s) => {
    if ((s.shift_type === "jour" || s.shift_type === "garde_24h") && s.poste) {
      const o = (occupation[s.date] = occupation[s.date] || {});
      o[s.poste] = (o[s.poste] || 0) + 1;
      if (s.shift_type === "garde_24h") tenuePar24h.add(s.date + "|" + s.poste);
    }
  });
  // RÈGLE (révision) : pas de doublure sur une unité tenue par une GARDE 24 H
  // (le médecin de 24 h couvre déjà jour + nuit ; règle valable pour toutes
  // les doublures SAUF celles du nouvel engagé, posées ailleurs).
  const stationsDoublables = (d) => Object.keys(occupation[d] || {})
    .filter((c) => !plSansContinuite(c) && occupation[d][c] === 1 && !tenuePar24h.has(d + "|" + c));
  // Jours de REPOS DE GARDE par médecin : ce ne sont PAS des jours
  // travaillables → ils sortent du prorata ET des jours doublables.
  const reposDe = {}; // id -> Set(dates)
  sortie.forEach((s) => {
    if (s.shift_type === "repos_garde")
      (reposDe[s.doctor_id] = reposDe[s.doctor_id] || new Set()).add(s.date);
  });
  Object.keys(semaines).sort().forEach((lk) => {
    const joursOuvres = semaines[lk];
    medecins.forEach((m) => {
      if (m.nouvel_engage && joursOuvres.some((d) => plEstNouvelEngage(m, d, etat.debutPeriode))) return; // déjà doublé chaque jour
      // Jours ouvrés DISPONIBLES (statique : contrat, jours travaillés, congés).
      const indispoSet = etat.indispo[m.id];
      const dispoSet = etat.dispoDeclaree[m.id];
      // Jours de PRÉSENCE possibles : disponibles (contrat, jours travaillés,
      // congés) ET non bloqués par un repos de garde (jour non travaillable).
      const joursDispo = joursOuvres.filter((d) =>
        plDispoStatique(m, d, indispoSet, dispoSet) &&
        !etat.bloque[m.id].has(d) &&
        !(reposDe[m.id] && reposDe[m.id].has(d)));
      if (!joursDispo.length) return;
      const fte = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1;
      // Dénominateur = jours OUVRÉS TRAVAILLABLES du médecin (jours_travailles
      // ∩ lun-ven), PAS 5 fixes : un temps plein qui ne travaille pas le lundi
      // (convenance) doit quand même viser ~40 h sur ses 4 jours + week-ends —
      // avec /5 fixe, sa cible tombait à 32 h et il restait sous-employé.
      const jtSemaine = ((m.jours_travailles && m.jours_travailles.length)
        ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7]).filter((j) => j >= 1 && j <= 5).length;
      if (!jtSemaine) return; // ne travaille jamais en semaine → pas de doublure possible
      const cible = minH * fte * Math.min(joursDispo.length / jtSemaine, 1);
      let h = (heuresSem[m.id] && heuresSem[m.id][lk]) || 0;
      for (const d of joursDispo) {
        if (h >= cible) break;
        if (aShift[m.id] && aShift[m.id].has(d)) continue;  // déjà occupé ce jour
        if (etat.bloque[m.id].has(d)) continue;             // repos de garde
        if (plStationPlafonnee(m, d, etat)) continue;       // mi-temps : plafond station (strict)
        const pourvues = stationsDoublables(d);
        if (!pourvues.length) continue; // plus d'unité doublable ce jour
        const st = pourvues[parseInt(d.slice(8, 10), 10) % pourvues.length];
        const occ = (occupation[d] = occupation[d] || {});
        occ[st] = (occ[st] || 0) + 1; // l'unité passe à 2 → plus doublable
        plAffecter(sortie, etat, d, "jour", m.id, st);
        sortie[sortie.length - 1].doublure = true; // marqueur informatif (ignoré en base)
        (aShift[m.id] = aShift[m.id] || new Set()).add(d);
        h += PL_HEURES.jour;
      }
      if (heuresSem[m.id]) heuresSem[m.id][lk] = h;
    });
  });
}

/* RÉÉQUILIBRAGE FINAL DES HEURES (révision 2026-06-13) — correction avant
   brouillon : on TRANSFÈRE des journées de station des médecins les plus
   chargés vers les moins chargés jusqu'à ramener l'écart d'heures cumulées
   sous EQUITE.ecart_heures_max (défaut 12 h ≈ une journée ; 0 = désactivé).
   Garde-fous : le receveur est LIBRE ce jour-là (pas de shift, pas de repos,
   pas de congé, jour travaillable, sous contrat), il ne tient pas une AUTRE
   unité cette semaine-là (continuité clinique préservée), et le donneur reste
   au-dessus de son minimum cumulé. À appeler en FIN de génération (après le
   plancher d'heures), avant les stats. Mute sortie + etat.heures. */
function plReequilibrerHeures(sortie, medecins, etat) {
  const eq = plEquite();
  const seuil = (typeof eq.ecart_heures_max === "number") ? eq.ecart_heures_max : 12;
  if (!seuil) return;
  const H = (t) => (t === "off" ? PL_HEURES_OFFCLINIC : (PL_HEURES[t] || 0));
  const heures = {}; const occupe = {}; const unitesSem = {}; // id -> { lundi -> Set(postes jour) }
  const hSem = {}; // id -> { lundi -> heures TOTALES de la semaine } (plafond mi-temps, local)
  medecins.forEach((m) => { heures[m.id] = 0; occupe[m.id] = new Set(); unitesSem[m.id] = {}; hSem[m.id] = {}; });
  // ÉQUITÉ NORMALISÉE PAR LA QUOTITÉ + CRÉDIT DES CONGÉS (révision 2026-06-16) :
  // on compare les heures RAPPORTÉES AU FTE, EN CRÉDITANT les jours de congé
  // (etat.heuresEquite) — sinon le rééquilibrage ramène tout le monde au même
  // total BRUT, ce qui SURCHARGE ceux qui ont pris des congés (ils « rattrapent »
  // sur leurs semaines présentes → 54 h/sem au lieu de 47). Avec le crédit, un
  // médecin parti en congé est jugé sur sa charge RELATIVE et travaille MOINS en
  // heures brutes (équité réelle), pas autant que ses pairs sans congé.
  const fteR = {}; medecins.forEach((m) => { fteR[m.id] = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1; });
  const credit = (id) => (etat.heuresEquite && etat.heuresEquite[id]) || 0;
  const hNorm = (id) => (heures[id] + credit(id)) / fteR[id];
  sortie.forEach((s) => {
    if (heures[s.doctor_id] === undefined) return;
    heures[s.doctor_id] += H(s.shift_type);
    occupe[s.doctor_id].add(s.date);
    const lk = plLundiDe(s.date);
    hSem[s.doctor_id][lk] = (hSem[s.doctor_id][lk] || 0) + H(s.shift_type); // total hebdo (gardes incl.)
    if (s.shift_type === "jour" && s.poste) {
      (unitesSem[s.doctor_id][lk] = unitesSem[s.doctor_id][lk] || new Set()).add(s.poste);
    }
  });
  const byId = {}; medecins.forEach((m) => { byId[m.id] = m; });
  const peutRecevoirJour = (m, s) => {
    const d = s.date;
    if (plEstWeekendOuFerie(d)) return false;
    // Jours de CONGRÈS exclus : leur équité propre (jours de congrès
    // travaillés) prime et ne doit pas être perturbée par ce rééquilibrage.
    if (etat.periodes && plEstCongres(d, etat.periodes)) return false;
    if (!plSousContrat(m, d)) return false;
    const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
    if (!jt.includes(plJourSemaine(d))) return false;
    if (occupe[m.id].has(d)) return false;
    if (etat.bloque[m.id] && etat.bloque[m.id].has(d)) return false;
    if (etat.indispo[m.id] && etat.indispo[m.id].has(d)) return false;
    if (!plDispoIndependant(m, d, etat.dispoDeclaree[m.id])) return false;
    if (plEstNouvelEngage(m, d, etat.debutPeriode)) return false;
    // PLAFOND MI-TEMPS : le receveur ne dépasse pas son quota hebdo (total, gardes
    // comprises). Sans effet sur les pleins temps (cap = Infinity).
    const cap = plPlafondStation(m);
    if (cap !== Infinity) {
      const cur = (hSem[m.id][plLundiDe(d)] || 0);
      if (cur + PL_HEURES.jour > cap + PL_EPS) return false;
    }
    // Continuité clinique : pas une AUTRE unité cette semaine (Labo exempt).
    if (!plSansContinuite(s.poste)) {
      const u = unitesSem[m.id][plLundiDe(d)];
      if (u && u.size && !u.has(s.poste)) return false;
      // CONTINUITÉ (révision 2026-06-16) : le rééquilibrage horaire ne transfère
      // une journée que vers un médecin tenant DÉJÀ cette unité cette semaine
      // (consolidation) → il n'ajoute plus de « visage » supplémentaire sur l'unité.
      if (!(u && u.has(s.poste))) return false;
    }
    return true;
  };
  const actifs = medecins.filter((m) => heures[m.id] > 0 || occupe[m.id].size > 0 ||
    medecins.length <= 2 || plSousContrat(m, etat.debutPeriode));
  for (let iter = 0; iter < 80; iter++) {
    const tri = actifs.slice().sort((a, b) => hNorm(b.id) - hNorm(a.id));
    let bouge = false;
    for (let hi = 0; hi < tri.length && !bouge; hi++) {
      for (let bi = tri.length - 1; bi > hi && !bouge; bi--) {
        const haut = tri[hi], bas = tri[bi];
        if (hNorm(haut.id) - hNorm(bas.id) <= seuil) break;
        // Journées de station transférables du plus chargé (semaine, hors WE).
        for (const s of sortie) {
          if (s.doctor_id !== haut.id || s.shift_type !== "jour") continue;
          // le donneur doit rester au-dessus de son minimum cumulé
          if (etat.attenduMin && heures[haut.id] - PL_HEURES.jour < (etat.attenduMin[haut.id] || 0)) break;
          if (!peutRecevoirJour(bas, s)) continue;
          // Transfert de la journée.
          occupe[haut.id].delete(s.date); occupe[bas.id].add(s.date);
          const lk = plLundiDe(s.date);
          hSem[haut.id][lk] = (hSem[haut.id][lk] || 0) - PL_HEURES.jour;
          hSem[bas.id][lk] = (hSem[bas.id][lk] || 0) + PL_HEURES.jour;
          if (s.poste) {
            const uh = unitesSem[haut.id][lk]; if (uh) uh.delete(s.poste);
            (unitesSem[bas.id][lk] = unitesSem[bas.id][lk] || new Set()).add(s.poste);
          }
          heures[haut.id] -= PL_HEURES.jour; heures[bas.id] += PL_HEURES.jour;
          etat.heures[haut.id] -= PL_HEURES.jour; etat.heures[bas.id] += PL_HEURES.jour;
          s.doctor_id = bas.id;
          bouge = true; break;
        }
      }
    }
    if (!bouge) break;
  }
}

/* ===================================================================== */
/* RÉSORPTION OFF-CLINIC ↔ 24 h de SEMAINE (révision 2026-06-15)          */
/* --------------------------------------------------------------------- */
/* L'off-clinic compte comme du temps de travail et est CONTOURNABLE :    */
/* plutôt que de laisser une garde 24 h de semaine coexister avec un      */
/* off-clinic le même jour, on « pioche » dans l'off — le médecin en off  */
/* REPREND la station tenue par la 24 h, et la 24 h redescend en garde de */
/* nuit 17h–9h. Net : station couverte à l'identique, l'off repasse en    */
/* clinique (mêmes heures), le titulaire de 24 h perd 9 h (réduit son     */
/* éventuel surplus). EXCLUS : week-ends/fériés, jours de congrès, mode    */
/* garde24h_obligatoire. GARDE-FOU : on ne descend la 24 h que si son      */
/* titulaire reste AU-DESSUS de son minimum cumulé (attenduMin) et que     */
/* l'off est réellement libre de tenir la station. Mute `sortie` + `etat`. */
/* ===================================================================== */
function plResorberOff24h(sortie, medecins, etat) {
  if (plGardes().garde24h_obligatoire) return;
  const byId = {}; (medecins || []).forEach((m) => { byId[m.id] = m; });
  const gain24 = PL_HEURES.garde_24h - PL_HEURES.garde_nuit; // 9 h
  const parDate = {};
  (sortie || []).forEach((s) => { (parDate[s.date] = parDate[s.date] || []).push(s); });
  Object.keys(parDate).forEach((date) => {
    if (plEstWeekendOuFerie(date)) return;
    if (etat.periodes && plEstCongres(date, etat.periodes)) return;
    const duJour = parDate[date];
    const g24s = duJour.filter((s) => s.shift_type === "garde_24h" && s.poste);
    let offs = duJour.filter((s) => s.shift_type === "off");
    if (!g24s.length || !offs.length) return;
    g24s.forEach((g24) => {
      if (!offs.length) return;
      // Garde-fou : le titulaire 24 h doit rester ≥ son minimum cumulé après −9 h.
      const min = (etat.attenduMin && etat.attenduMin[g24.doctor_id]) || 0;
      if (etat.heures[g24.doctor_id] - gain24 < min) return;
      // Un off capable de tenir la station : pas le titulaire lui-même, et sans
      // autre shift de travail ce jour (par nature, l'off n'a que l'off).
      const idx = offs.findIndex((o) => {
        if (o.doctor_id === g24.doctor_id) return false;
        if (!byId[o.doctor_id]) return false;
        return !duJour.some((s) => s !== o && s.doctor_id === o.doctor_id && !plEstAbsence(s.shift_type));
      });
      if (idx === -1) return;
      const off = offs[idx];
      offs = offs.filter((_, i) => i !== idx);
      // 1) L'off prend la station libérée par la 24 h.
      off.shift_type = "jour"; off.poste = g24.poste;
      etat.heures[off.doctor_id] += (PL_HEURES.jour - PL_HEURES_OFFCLINIC); // ≈ 0
      // 2) La 24 h redescend en garde de nuit 17h–9h (perd la station + 9 h).
      g24.shift_type = "garde_nuit"; g24.poste = null;
      etat.heures[g24.doctor_id] -= gain24;
    });
  });
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
  // Les PG ont leur PROPRE génération (genererTrimestrePG) → exclus du moteur résident.
  const medecins = (opts.medecins || []).filter((m) => m.grade !== "pg");
  const preferences = opts.preferences || [];
  if (opts.feriesAdmin) plDefinirFeriesAdmin(opts.feriesAdmin.ajouts, opts.feriesAdmin.retraits); // M26
  const moisTrim = [0, 1, 2].map((k) => (trimestre - 1) * 3 + 1 + k); // ex. T2 -> [4,5,6]

  // État partagé sur les 3 mois pour les HEURES, la continuité de station, etc.
  // Deux horizons d'équilibrage distincts :
  //   - GARDES : pensées au MOIS (révision) → compteurs remis à zéro et poids
  //     recalculés chaque mois (= jours de présence DU MOIS, SANS FTE ; le nombre
  //     de gardes ne dépend plus du temps de travail, seul le quota d'heures s'y
  //     adapte).
  //   - WEEK-ENDS : pensés sur le TRIMESTRE → poids = présence week-end du
  //     trimestre, nbWeekend NON remis à zéro (charge lissée sur les 3 mois) et
  //     comptée en WEEK-ENDS DISTINCTS (cf. plGenererWeekend / majWE).
  // Les cumuls trimestriels restent dans *Total.
  const etat = plNouvelEtat(medecins);
  plIndexerPreferences(preferences, etat);
  etat.periodes = plIndexerPeriodes(opts.periodes); // congrès / fermetures (M17)
  const ppParDate = plIndexerPrePlaces(opts.prePlaces); // Module 19 : pré-placements épinglés

  const sortie = [];
  const conflits = [];
  etat.debutPeriode = plBornesMois(annee, moisTrim[0]).debut; // fenêtre « nouvel engagé »
  plControlerNouveauxEngages(medecins, etat.debutPeriode, conflits);
  // POIDS WEEK-END = présence de week-end sur TOUT le trimestre. Les week-ends
  // sont équilibrés sur le trimestre (pas de reset mensuel de nbWeekend) : la
  // charge week-end est ainsi lissée d'un mois à l'autre. Les GARDES, elles,
  // restent équilibrées au MOIS (révision) → reset mensuel ci-dessous.
  etat.poidsWeekend = {};
  medecins.forEach((m) => {
    let dispoWeekend = 0;
    const indispoSet = etat.indispo[m.id];
    const dispoSet = etat.dispoDeclaree[m.id];
    moisTrim.forEach((mois) => {
      plDatesDuMois(annee, mois).forEach((date) => {
        if (!plDispoStatique(m, date, indispoSet, dispoSet)) return;
        const jr = plJourSemaine(date);
        if (jr === 6 || jr === 7) dispoWeekend++;
      });
    });
    const fteW = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1;
    etat.poidsWeekend[m.id] = dispoWeekend * fteW; // WE proratisés au fte (mi-temps : moins de WE)
  });
  moisTrim.forEach((mois) => {
    // Reset MENSUEL des compteurs de GARDES + poids garde = présence du mois.
    // nbWeekend N'EST PAS remis à zéro (équilibrage week-end trimestriel).
    etat.poidsGarde = {};
    medecins.forEach((m) => {
      etat.nbGardes[m.id] = 0;
      let dispo = 0;
      const indispoSet = etat.indispo[m.id];
      const dispoSet = etat.dispoDeclaree[m.id];
      plDatesDuMois(annee, mois).forEach((date) => {
        if (!plDispoStatique(m, date, indispoSet, dispoSet)) return;
        dispo++;
      });
      const fteG = (typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1;
      etat.poidsGarde[m.id] = dispo * fteG;   // gardes de semaine proratisées au fte
    });
    plDatesDuMois(annee, mois).forEach((date) => {
      const pp = ppParDate[date] || [];
      plCrediterAbsences(date, medecins, etat); // crédit d'équité des congés
      if (plEstWeekendOuFerie(date)) plGenererWeekend(date, medecins, etat, sortie, conflits, pp);
      else plGenererSemaine(date, medecins, etat, sortie, conflits, pp);
    });
  });

  // Rééquilibrage final des gardes (équité ±1 intra-grade) APRÈS la
  // maximisation des combos, AVANT la matérialisation des repos.
  plReequilibrerGardes(sortie, medecins, etat);

  // Repos de garde matérialisés sur tout le trimestre (avant l'off-clinic).
  const bDeb = plBornesMois(annee, moisTrim[0]).debut;
  const bFin = plBornesMois(annee, moisTrim[2]).fin;
  const dansTrim = (d) => d >= bDeb && d <= bFin;
  materialiserRepos(sortie, dansTrim).forEach((r) => sortie.push(r));
  // Repos compensatoires couplés sur tout le trimestre, après les repos.
  materialiserReposCouples(sortie, dansTrim).forEach((r) => sortie.push(r));

  // Off-clinic (§9) : droit calculé par MOIS, posé après la génération.
  moisTrim.forEach((mois) => {
    const offs = genererOffClinic({ annee, mois, medecins, shifts: sortie, preferences });
    offs.forEach((o) => { sortie.push(o); etat.heures[o.doctor_id] += PL_HEURES_OFFCLINIC; });
  });

  // Résorption off-clinic ↔ 24 h de semaine : l'off reprend la station, la 24 h
  // redescend en 17h–9h (évite une 24 h alors qu'un off pourrait être en clinique).
  plResorberOff24h(sortie, medecins, etat);

  // Minimum d'heures hebdomadaire sur tout le trimestre (doublures d'unités).
  {
    let datesTrim = [];
    moisTrim.forEach((mois) => { datesTrim = datesTrim.concat(plDatesDuMois(annee, mois)); });
    plCompleterMinimumHeures(sortie, medecins, etat, datesTrim);
  }
  // Correction finale avant brouillon : écart d'heures resserré au maximum.
  plReequilibrerHeures(sortie, medecins, etat);

  // M26 — jours de récup (congé férié) visibles sur tout le trimestre.
  plEmettreCongesFerie(sortie, etat, moisTrim.reduce((a, mo) => a.concat(plDatesDuMois(annee, mo)), []));

  // RÈGLE « slack bloque la 24 h de semaine » : alerte si une 24 h coexiste
  // avec de l'off-clinic ou un médecin disponible non posté le même jour.
  plConflits24hSlack({ shifts: sortie, medecins, preferences, periodes: opts.periodes })
    .forEach((c) => conflits.push(c));

  const stats = medecins.map((m) => ({
    id: m.id,
    heures: Math.round(etat.heures[m.id] * 10) / 10,
    gardes: etat.nbGardesTotal[m.id],     // cumul trimestriel (les nbGardes sont resetés au mois)
    weekends: etat.nbWeekendTotal[m.id],
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

   MODULE 11b — HIÉRARCHIE DE SUPPRESSION / LIMITATION (préférence N3) :
   - Plafond d'ABSENCES SIMULTANÉES : on n'ajoute pas un off-clinic un jour
     où le nombre d'absents (méthode §14) atteindrait OFFCLINIC.max_absences_jour
     → on REPORTE sur un autre jour ouvrable éligible du mois (le droit est
     préservé tant qu'un jour non saturé existe).
   - MINIMUM de RÉSIDENTS DISPONIBLES : on garde ≥ OFFCLINIC.min_residents_dispo
     résidents non absents ce jour-là (couverture de nuit). Non appliqué si
     l'effectif résident est ≤ ce seuil (contrainte insatisfiable).
   - ARBITRAGE entre résidents : ceux qui ont DÉJÀ le plus de CONGÉS (puis le
     plus d'ABSENCES totales) sont traités EN DERNIER → ils cèdent leur
     off-clinic en PREMIER quand les jours se saturent ; les autres restent
     prioritaires. Départage final : ordre d'origine (stable).
   Comportement INCHANGÉ en l'absence de saturation (faibles absences,
   effectif résident > seuil).

   Fonction PURE. opts = { annee, mois (1-12), medecins, shifts, preferences }.
   Renvoie les shifts off-clinic à AJOUTER (type "off").
   ===================================================================== */
function genererOffClinic(opts) {
  const annee = opts.annee, mois = opts.mois;
  const medecins = opts.medecins || [];
  const shifts = opts.shifts || [];
  const prefs = opts.preferences || [];
  const bloquantes = plBloq();
  const cfg = plOffclinic();
  const MAX_ABS = Number.isFinite(cfg.max_absences_jour) ? cfg.max_absences_jour : 5;
  const MIN_RES = Number.isFinite(cfg.min_residents_dispo) ? cfg.min_residents_dispo : 1;
  const CONGES = ["conge_annuel", "conge_scientifique", "conge_extralegal", "conge"];

  // Index des shifts par médecin et par date.
  const byMed = {};
  shifts.forEach((s) => {
    const m = (byMed[s.doctor_id] = byMed[s.doctor_id] || {});
    (m[s.date] = m[s.date] || []).push(s);
  });

  // Index des dates bloquées par préférence (congé / indispo / récup / off_clinic).
  const prefBloq = {};
  prefs.forEach((p) => {
    if (!bloquantes.includes(p.pref_type)) return;
    const set = (prefBloq[p.doctor_id] = prefBloq[p.doctor_id] || new Set());
    let d = p.start_date;
    while (d <= p.end_date) { set.add(d); d = plAdd(d, 1); }
  });
  const estBloque = (id, d) => !!(prefBloq[id] && prefBloq[id].has(d));
  const shiftsDe = (id, d) => (byMed[id] && byMed[id][d]) || [];
  const aGarde = (id, d) => shiftsDe(id, d).some((x) => x.shift_type === "garde_nuit" || x.shift_type === "garde_24h");

  const dates = plDatesDuMois(annee, mois);

  // --- Décompte d'ABSENTS simultanés par date (méthode §14 : préférences
  //     bloquantes + shifts d'absence, HORS repos de garde automatique).
  //     L'off-clinic posé ICI est ajouté au décompte au fil de l'eau. ---
  const absentParDate = {};
  dates.forEach((d) => { absentParDate[d] = new Set(); });
  prefs.forEach((p) => {
    if (!bloquantes.includes(p.pref_type)) return;
    let d = p.start_date;
    while (d <= p.end_date) { if (absentParDate[d]) absentParDate[d].add(p.doctor_id); d = plAdd(d, 1); }
  });
  shifts.forEach((s) => {
    if (absentParDate[s.date] && plEstAbsence(s.shift_type) && s.shift_type !== "repos_garde")
      absentParDate[s.date].add(s.doctor_id);
  });

  // Effectif résident (pour la garde de min. de résidents disponibles).
  const residentsTeam = medecins.filter((m) => m.grade === "resident");
  const enforceMinRes = residentsTeam.length > MIN_RES;

  // --- Éligibles + métriques d'arbitrage (congés, absences totales) ---
  const elig = [];
  medecins.forEach((m, idx) => {
    if (m.grade !== "resident" || m.statut === "independant") return; // §9

    const absSet = new Set();
    const congeDates = new Set();
    dates.forEach((d) => {
      const sd = shiftsDe(m.id, d);
      if (sd.some((x) => plEstAbsence(x.shift_type) && x.shift_type !== "off") || estBloque(m.id, d)) absSet.add(d);
      if (sd.some((x) => CONGES.includes(x.shift_type))) congeDates.add(d);
    });
    prefs.forEach((p) => {
      if (p.doctor_id !== m.id || !CONGES.includes(p.pref_type)) return;
      let d = p.start_date;
      while (d <= p.end_date) { congeDates.add(d); d = plAdd(d, 1); }
    });

    const abs = absSet.size;
    const droit = abs <= 4 ? 2 : abs <= 9 ? 1 : 0;
    if (droit === 0) return;
    // ÉQUILIBRE TRIMESTRIEL (révision) : offs déjà posés dans les shifts reçus
    // (en génération trimestrielle, ils incluent les mois précédents).
    const nbOffsCum = shifts.reduce((n, s) => n + (s.doctor_id === m.id && s.shift_type === "off" ? 1 : 0), 0);
    elig.push({ m, idx, droit, nbAbs: abs, nbConges: congeDates.size, nbOffsCum });
  });

  // ÉQUILIBRE DES OFFS SUR LE TRIMESTRE d'abord (le moins d'offs cumulés est
  // servi en premier), puis ceux qui ont le PLUS de congés (ensuite d'absences)
  // cèdent EN PREMIER → traités EN DERNIER. Ordre original en départage stable.
  elig.sort((a, b) =>
    (a.nbOffsCum - b.nbOffsCum) ||
    (a.nbConges - b.nbConges) ||
    (a.nbAbs - b.nbAbs) ||
    (a.idx - b.idx));

  const out = [];
  const posesDe = {};     // id -> nb d'off posés CE MOIS
  const joursPris = {};   // id -> Set(dates déjà prises ce mois)
  const cumulTrim = {};   // id -> off déjà cumulés sur le TRIMESTRE (mois précédents)
  elig.forEach((e) => { posesDe[e.m.id] = 0; joursPris[e.m.id] = new Set(); cumulTrim[e.m.id] = e.nbOffsCum; });

  // Tente de poser UN off à `m` : premier jour ouvrable libre respectant TOUTES
  // les contraintes (week-end/férié, contrat, jours travaillés, pas de shift,
  // pas de congé, pas le jour/veille/lendemain d'une garde, plafond d'absents,
  // minimum de résidents). Renvoie true si posé. Mute out / absentParDate / joursPris.
  const poserUnOff = (m) => {
    for (const d of dates) {
      const j = plJourSemaine(d);
      if (j === 6 || j === 7) continue;            // pas le week-end
      if (plEstWeekendOuFerie(d)) continue;        // pas un férié (règles week-end)
      if (!plSousContrat(m, d)) continue;
      const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
      if (!jt.includes(j)) continue;
      if (joursPris[m.id].has(d)) continue;        // déjà un off posé ce jour (ce mois)
      if (shiftsDe(m.id, d).length > 0) continue;  // déjà un shift / une absence
      if (estBloque(m.id, d)) continue;            // congé / indispo
      if (aGarde(m.id, d)) continue;               // jamais le jour d'une garde
      if (aGarde(m.id, plAdd(d, -1))) continue;    // pas en post-garde (repos)
      if (aGarde(m.id, plAdd(d, 1))) continue;     // ne peut précéder une garde

      // N3 — plafond d'absences simultanées (l'off-clinic compte comme absence).
      const absJour = absentParDate[d] ? absentParDate[d].size : 0;
      if (absJour + 1 > MAX_ABS) continue;         // jour saturé → reporter

      // N3 — garder un minimum de résidents disponibles (couverture de nuit).
      if (enforceMinRes) {
        const resDispo = residentsTeam.reduce((n, r) =>
          n + ((absentParDate[d] && absentParDate[d].has(r.id)) ? 0 : 1), 0);
        if (resDispo - 1 < MIN_RES) continue;      // garderait trop peu de résidents
      }

      out.push({ date: d, shift_type: "off", poste: null, doctor_id: m.id });
      if (absentParDate[d]) absentParDate[d].add(m.id);
      joursPris[m.id].add(d);
      return true;
    }
    return false;
  };

  // ÉQUITÉ TRIMESTRIELLE EN ROUND-ROBIN (révision 2026-06-15) : à CHAQUE pose, on
  // sert le résident qui a le MOINS d'off cumulés sur le trimestre (départage :
  // le moins de congés, puis d'absences, puis ordre de fiche), tant qu'il lui
  // reste du droit (règle des absences conservée : 0-4→2, 5-9→1, 10+→0) ET un
  // jour plaçable. Conséquence : tout le monde reçoit 1 off avant que quiconque
  // ait le 2e, et les retards des mois précédents sont rattrapés en priorité →
  // les TOTAUX trimestriels sont aussi proches que possible (selon la place dispo).
  let progres = true;
  while (progres) {
    progres = false;
    const candidats = elig.filter((e) => posesDe[e.m.id] < e.droit).sort((a, b) =>
      ((cumulTrim[a.m.id] + posesDe[a.m.id]) - (cumulTrim[b.m.id] + posesDe[b.m.id])) ||
      (a.nbConges - b.nbConges) || (a.nbAbs - b.nbAbs) || (a.idx - b.idx));
    for (const e of candidats) {
      if (poserUnOff(e.m)) { posesDe[e.m.id]++; progres = true; break; } // re-trier après chaque pose
    }
  }

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
    // RÈGLE (révision) : toute garde donne le repos du LENDEMAIN uniquement.
    // Le jour SUPPLÉMENTAIRE de la semaine suivante (lundi/mardi) n'est dû que
    // pour des gardes COUPLÉES (jeudi+samedi → lundi ; vendredi+dimanche →
    // mardi) — matérialisé par materialiserReposCouples, plus ici.
    const jours = [plAdd(s.date, 1)]; // repos 12 h le lendemain
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

/* REPOS COMPENSATOIRE COUPLÉ (Module 12b, spec N2). Quand un médecin enchaîne
   DEUX gardes sur un même week-end, il a droit à un repos compensatoire en
   début de semaine suivante, EN PLUS du repos post-garde :
     - garde le JEUDI soir + garde le SAMEDI 24 h  → repos le LUNDI suivant.
     - garde le VENDREDI soir + garde le DIMANCHE 24 h → repos le MARDI suivant.
   (jeudi+2 = samedi ; jeudi+4 = lundi · vendredi+2 = dimanche ; vendredi+4 = mardi)
   Produit des shifts « repos_garde » (non comptabilisés), dédupliqués : si le
   jour porte déjà un repos/shift, on n'ajoute rien. À appeler APRÈS
   materialiserRepos (pour la déduplication). dansPeriode(date) -> bool. */
function materialiserReposCouples(shifts, dansPeriode) {
  const estGarde = (t) => t === "garde_nuit" || t === "garde_24h";
  const gardeJour = {}; // id -> Set(dates de garde)
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
      // jeudi (4) ou vendredi (5) couplé à la garde du surlendemain (samedi/dimanche).
      if ((j !== 4 && j !== 5) || !gardeJour[id].has(plAdd(d, 2))) return;
      const reposJour = plAdd(d, 4); // lundi (depuis jeudi) ou mardi (depuis vendredi)
      if (dansPeriode && !dansPeriode(reposJour)) return;
      const cle = id + "|" + reposJour;
      if (occupe.has(cle) || ajoutes.has(cle)) return;
      ajoutes.add(cle);
      out.push({ date: reposJour, shift_type: "repos_garde", poste: null, doctor_id: id });
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
/* RÈGLE « slack bloque la 24 h de semaine » (demandée 2026-06-15)        */
/* --------------------------------------------------------------------- */
/* Une garde 24 h de SEMAINE ne devrait exister que par NÉCESSITÉ de      */
/* couverture. Si, le MÊME JOUR, il reste du « slack » — quelqu'un en     */
/* OFF-CLINIC, OU un médecin DISPONIBLE NON POSTÉ (sous contrat, jour     */
/* travaillable, dispo déclarée si indépendant, pas en congé/indispo/off/ */
/* récup, et SANS aucune affectation ce jour) — alors la 24 h résulte     */
/* d'un déficit/équilibrage et doit être SIGNALÉE comme conflit.          */
/* EXCLUS : les WEEK-ENDS/fériés (2×24 h structurelles), les jours de     */
/* CONGRÈS (équipe minimale forcée en 24 h), et le mode config            */
/* `GARDES.garde24h_obligatoire` (la 24 h est alors voulue partout).      */
/* Fonction PURE : ne lit que le tableau final de shifts + métadonnées.   */
/* opts = { shifts, medecins, preferences? , periodes? }.                 */
/* Renvoie [{ date, message }].                                           */
/* ===================================================================== */
function plConflits24hSlack(opts) {
  const conflits = [];
  if (plGardes().garde24h_obligatoire) return conflits; // 24 h voulue par config → pas d'alerte
  const shifts = opts.shifts || [];
  const medecins = opts.medecins || [];
  const idxP = plIndexerPeriodes(opts.periodes);

  // Préférences bloquantes (congé/indispo/off/récup) + fenêtres « dispo » (indépendants).
  const bloquantes = plBloq();
  const indispo = {}, dispo = {};
  (opts.preferences || []).forEach((p) => {
    if (p.pref_type === "dispo") {
      (dispo[p.doctor_id] = dispo[p.doctor_id] || new Set());
      let d = p.start_date; while (d <= p.end_date) { dispo[p.doctor_id].add(d); d = plAdd(d, 1); }
      return;
    }
    if (!bloquantes.includes(p.pref_type)) return;
    (indispo[p.doctor_id] = indispo[p.doctor_id] || new Set());
    let d = p.start_date; while (d <= p.end_date) { indispo[p.doctor_id].add(d); d = plAdd(d, 1); }
  });

  const medById = {}; medecins.forEach((m) => { medById[m.id] = m; });
  const nom = (id) => (medById[id] && medById[id].name) ? medById[id].name : (id || "?");
  // Seuls les médecins PLANIFIABLES comptent comme « non posté » potentiel.
  const planifiable = (m) => m && (m.grade === "resident" || m.grade === "assistant_specialiste");

  // Index par date + présence (médecins ayant AU MOINS une entrée ce jour).
  const parDate = {}, presence = {};
  shifts.forEach((s) => {
    (parDate[s.date] = parDate[s.date] || []).push(s);
    (presence[s.date] = presence[s.date] || new Set()).add(s.doctor_id);
  });

  Object.keys(parDate).sort().forEach((date) => {
    if (plEstWeekendOuFerie(date)) return;     // 24 h de week-end = structurelles (exclu)
    if (plEstCongres(date, idxP)) return;      // congrès = équipe minimale forcée (exclu)
    const duJour = parDate[date];
    const g24 = duJour.filter((s) => s.shift_type === "garde_24h");
    if (g24.length === 0) return;              // pas de 24 h ce jour → rien à signaler

    // SLACK 1 — off-clinic posé ce jour.
    const offs = duJour.filter((s) => s.shift_type === "off").map((s) => s.doctor_id);
    // SLACK 2 — médecin planifiable, disponible, mais NON POSTÉ (aucune entrée).
    const nonPostes = medecins.filter((m) =>
      planifiable(m) &&
      plSousContrat(m, date) &&
      ((m.jours_travailles && m.jours_travailles.length ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7]).includes(plJourSemaine(date))) &&
      (m.statut !== "independant" || (dispo[m.id] && dispo[m.id].has(date))) &&
      !(indispo[m.id] && indispo[m.id].has(date)) &&
      !(presence[date] && presence[date].has(m.id))
    ).map((m) => m.id);

    if (offs.length === 0 && nonPostes.length === 0) return; // pas de slack → 24 h justifiée

    const raisons = [];
    if (offs.length) raisons.push("off-clinic : " + offs.map(nom).join(", "));
    if (nonPostes.length) raisons.push("non posté(s) : " + nonPostes.map(nom).join(", "));
    conflits.push({ date, message:
      "Garde 24 h de semaine (" + g24.map((s) => nom(s.doctor_id)).join(", ") +
      ") avec du monde disponible le même jour [" + raisons.join(" ; ") +
      "] — à éviter ; ne se justifie que par déficit/équilibrage." });
  });
  return conflits;
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
/*          medecins:[...], preferences:[...] (optionnel),                */
/*          periodes:[...] (Module 17 : congrès / fermetures, optionnel) }*/
/* Renvoie un tableau de conflits : [{ date, message }].                  */
/* ===================================================================== */
function validerPlanning(opts) {
  const annee = opts.annee;
  const mois = opts.mois;
  const shifts = opts.shifts || [];
  const medecins = opts.medecins || [];
  const conflits = [];

  const couv = plCouv();
  const bloquantes = plBloq();
  const idxP = plIndexerPeriodes(opts.periodes); // congrès / fermetures (M17)

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
      // Jour de semaine : stations OUVERTES pourvues + nuit ≥2 dont ≥1 résident.
      // Module 17 : une unité FERMÉE n'est pas exigée ; un jour de CONGRÈS,
      // jusqu'à `congres_postes_vides` stations vides sont tolérées (§3.2).
      const postesJour = plPostesOuverts(date, idxP);
      const occupants = {}; // code station -> [doctorId]
      duJour.forEach((s) => {
        if (s.poste) (occupants[s.poste] = occupants[s.poste] || []).push(s.doctor_id);
      });
      const pourvues = postesJour.filter((c) => occupants[c] && occupants[c].length >= 1);
      const toleres = plToleranceVides(date, idxP);
      if (pourvues.length < postesJour.length - toleres) {
        conflits.push({ date, message: `Jour : ${pourvues.length}/${postesJour.length} stations pourvues` +
          (toleres ? ` (congrès : minimum ${postesJour.length - toleres})` : "") + `.` });
      }
      // (Une station tenue par 2 médecins est une DOUBLURE permise — max 2 par
      //  unité ; le seul vrai dépassement, ≥3 sur une unité ou ≥2 au Labo de choc,
      //  est signalé plus bas à l'étape « occupation des unités ».)
      // Affectation sur une unité FERMÉE (retouche manuelle) : signalée.
      if (idxP.fermees[date]) {
        idxP.fermees[date].forEach((c) => {
          if (occupants[c] && occupants[c].length > 0) {
            conflits.push({ date, message: `Jour : station ${c} affectée alors que l'unité est fermée.` });
          }
        });
      }
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

      // 2a-0) (les contrôles d'occupation des unités sont faits plus bas,
      //        après la boucle par médecin — cf. « occupation des unités »)
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

      // 2d) Récup COUPLÉE (révision) : le jour de repos de la semaine suivante
      //     n'est dû QUE pour des gardes couplées — jeudi+samedi → lundi off ;
      //     vendredi+dimanche → mardi off. (Une 24 h de week-end isolée ne
      //     donne que le repos du lendemain, déjà contrôlé en 2c.)
      const avantVeille = plAdd(date, -2); // samedi (si lundi) / dimanche (si mardi)
      const jMoins4 = plAdd(date, -4);     // jeudi (si lundi) / vendredi (si mardi)
      const jSem = plJourSemaine(date);
      if ((jSem === 1 || jSem === 2) &&
          dm[avantVeille] && dm[avantVeille].some((s) => s.shift_type === "garde_24h") &&
          dm[jMoins4] && dm[jMoins4].some(estGarde)) {
        const lib = jSem === 1 ? "lundi après gardes couplées jeudi+samedi"
                               : "mardi après gardes couplées vendredi+dimanche";
        conflits.push({ date, message: `${nom(id)} : récup non respectée (travail le ${lib}).` });
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

  // ---- 3 bis) OCCUPATION DES UNITÉS (révision 2026-06-12) ----
  //  - Labo de choc : JAMAIS plus d'une personne ;
  //  - autres unités : MAXIMUM 2 personnes (titulaire + 1 doublure).
  const occParJour = {}; // date -> { poste -> nb }
  shifts.forEach((s) => {
    if ((s.shift_type !== "jour" && s.shift_type !== "garde_24h") || !s.poste) return;
    const o = (occParJour[s.date] = occParJour[s.date] || {});
    o[s.poste] = (o[s.poste] || 0) + 1;
  });
  Object.keys(occParJour).forEach((date) => {
    Object.keys(occParJour[date]).forEach((poste) => {
      const n = occParJour[date][poste];
      if (plSansContinuite(poste) && n > 1) {
        conflits.push({ date, message: `Labo de choc : ${n} personnes le ${date} (1 maximum, jamais de doublure).` });
      } else if (!plSansContinuite(poste) && n > 2) {
        conflits.push({ date, message: `${poste} : ${n} personnes le ${date} (2 maximum : titulaire + 1 doublure).` });
      }
    });
  });

  // ---- 4) Max 2 week-ends travaillés par mois et par médecin (§6 N2) ----
  // Un week-end = clé samedi ISO ; sam OU dim travaillé en garde 24h/tour le compte.
  const weekendsParMois = {}; // id -> { "YYYY-MM": Set(clé samedi) }
  shifts.forEach((s) => {
    const jr = plJourSemaine(s.date);
    let key = null;
    // Sam/dim : garde 24h ou tour. Vendredi : garde du soir (entame le samedi).
    if ((jr === 6 || jr === 7) && (s.shift_type === "garde_24h" || s.shift_type === "twe")) key = jr === 6 ? s.date : plAdd(s.date, -1);
    if (jr === 5 && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")) key = plAdd(s.date, 1);
    if (!key) return; // autre jour / férié en semaine : ne compte pas (§7)
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

  // ---- 5) Plafond 60 h par semaine ISO (Module 12, N2 — indicatif) ----
  // Avertissement NON bloquant : le plafond est compensable la semaine suivante.
  const eqV = plEquite();
  const heuresParSemaine = {}; // id -> { lundiISO -> h }
  const gardesSemH = {};       // id -> { lundiISO -> { tot, we } } : explication de la charge
  shifts.forEach((s) => {
    const lk = plLundiDe(s.date);
    if (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") {
      const g = (gardesSemH[s.doctor_id] = gardesSemH[s.doctor_id] || {});
      const e = (g[lk] = g[lk] || { tot: 0, we: 0 });
      e.tot++;
      const jr = plJourSemaine(s.date);
      if (jr === 6 || jr === 7 || jr === 5) e.we++; // sam/dim + vendredi soir (entame le WE)
    }
    let h = PL_HEURES[s.shift_type] || 0;
    if (s.shift_type === "off") h = PL_HEURES_OFFCLINIC; // off-clinic = heures de travail
    if (h <= 0) return;                                  // absences / repos = 0 h
    const m = (heuresParSemaine[s.doctor_id] = heuresParSemaine[s.doctor_id] || {});
    m[lk] = (m[lk] || 0) + h;
  });
  Object.keys(heuresParSemaine).forEach((id) => {
    Object.keys(heuresParSemaine[id]).forEach((lk) => {
      const h = Math.round(heuresParSemaine[id][lk] * 10) / 10;
      if (h > eqV.plafond_hebdo) {
        const g = (gardesSemH[id] && gardesSemH[id][lk]) || { tot: 0, we: 0 };
        const expl = `${g.tot} garde${g.tot > 1 ? "s" : ""} cette semaine` +
          (g.we > 0 ? ` dont ${g.we} de week-end` : "");
        conflits.push({ date: lk, message: `${nom(id)} : ${h} h la semaine du ${lk} (> ${eqV.plafond_hebdo} h — ${expl} ; N2 indicatif, compensable la semaine suivante).` });
      }
    });
  });

  // NB : l'équité fine (plancher horaire + ±1 garde) s'évalue sur l'ENSEMBLE
  // du trimestre, pas au mois → voir validerEquite(), appelée par l'app sur le
  // planning trimestriel complet.

  // RÈGLE « slack bloque la 24 h de semaine » (2026-06-15) : signale chaque
  // garde 24 h de semaine coexistant avec de l'off-clinic ou un médecin
  // disponible non posté (WE / congrès / config obligatoire exclus).
  plConflits24hSlack({ shifts, medecins, preferences: opts.preferences, periodes: opts.periodes })
    .forEach((c) => conflits.push(c));

  // Tri par date pour un affichage lisible.
  conflits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return conflits;
}


/* =====================================================================
   MODULE 12 — Équité fine évaluée sur le TRIMESTRE (priorité N2)
   ---------------------------------------------------------------------
   L'équilibrage est pensé sur l'ensemble du trimestre (état partagé de
   genererTrimestre). Cette fonction PURE produit des avertissements
   INDICATIFS (non bloquants) à partir de TOUS les shifts du trimestre :
     - Plancher horaire : médecins nettement sous la charge moyenne.
     - Équité des gardes : écart > 1 vs le nombre attendu (proportionnel
       au fte / à la disponibilité).
   À appeler avec l'ensemble des shifts du trimestre. Renvoie [{date,message}].
   ===================================================================== */
function validerEquite(shifts, medecins, preferences) {
  const eq = plEquite();
  const conflits = [];
  const medById = {};
  (medecins || []).forEach((m) => { medById[m.id] = m; });
  const nom = (id) => (medById[id] && medById[id].name) ? medById[id].name : "?";
  // Date d'ancrage = 1er jour présent dans les shifts (pour le tri d'affichage).
  let dateAncre = null;
  shifts.forEach((s) => { if (!dateAncre || s.date < dateAncre) dateAncre = s.date; });
  dateAncre = dateAncre || "";

  // --- Heures de travail totales par médecin (hors absences/repos) ---
  const heuresTotales = {};
  const gardes = {};
  shifts.forEach((s) => {
    let h = PL_HEURES[s.shift_type] || 0;
    if (s.shift_type === "off") h = PL_HEURES_OFFCLINIC; // off-clinic = travail
    if (h > 0) heuresTotales[s.doctor_id] = (heuresTotales[s.doctor_id] || 0) + h;
    if (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") {
      gardes[s.doctor_id] = (gardes[s.doctor_id] || 0) + 1;
    }
  });

  // --- Crédit d'équité des CONGÉS (mêmes principes que plCrediterAbsences) :
  //     un jour ouvré de congé compte comme une journée pour la CHARGE (pas pour
  //     les heures affichées), afin de ne pas signaler « sous le plancher » un
  //     médecin simplement parti en congé — ni masquer une vraie surcharge. ---
  let dateFin = null;
  shifts.forEach((s) => { if (!dateFin || s.date > dateFin) dateFin = s.date; });
  const creditConge = {};
  if (preferences && dateAncre && dateFin) {
    const bloquantes = plBloq();
    (preferences || []).forEach((p) => {
      if (!bloquantes.includes(p.pref_type)) return;
      const m = medById[p.doctor_id];
      if (!m) return;
      let d = p.start_date < dateAncre ? dateAncre : p.start_date;
      const fin = p.end_date > dateFin ? dateFin : p.end_date;
      while (d <= fin) {
        const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
        if (!plEstWeekendOuFerie(d) && plSousContrat(m, d) && jt.includes(plJourSemaine(d))) {
          creditConge[p.doctor_id] = (creditConge[p.doctor_id] || 0) + PL_HEURES.jour;
        }
        d = plAdd(d, 1);
      }
    });
  }

  // --- Plancher horaire (charge relative à la cible, congés crédités) ---
  const charges = Object.keys(heuresTotales).map((id) => {
    const cible = (medById[id] && medById[id].weekly_hours_target) ? medById[id].weekly_hours_target : 52;
    return { id, charge: (heuresTotales[id] + (creditConge[id] || 0)) / cible, heures: heuresTotales[id] };
  });
  // PLANCHER 90 % (révision 2026-06-14) : chacun doit atteindre AU MOINS
  // `plancher_ratio` (défaut 90 %) de SA cible contractuelle (heures ÷ cible,
  // congés crédités) — équité normalisée par la quotité (un mi-temps est jugé
  // sur SA cible). En-dessous = signalé (rééquilibrage agressif déjà tenté).
  if (charges.length >= 1) {
    const seuil = (typeof eq.plancher_ratio === "number" && eq.plancher_ratio > 0) ? eq.plancher_ratio : 0.90;
    charges.forEach((c) => {
      if (c.charge < seuil - 1e-9) {
        const pct = Math.round(c.charge * 100);
        conflits.push({ date: dateAncre, message: `${nom(c.id)} : sous le plancher d'équilibre (${Math.round(c.heures * 10) / 10} h, ~${pct} % de sa cible ; minimum ${Math.round(seuil * 100)} %).` });
      }
    });
  }

  // --- Équité des gardes ±1, ATTENDU ∝ FTE (révision 2026-06-15) : gardes
  //     proratisées au temps de travail. Un mi-temps qui en fait moins n'est plus
  //     signalé à tort ; un plein temps en déficit (vacances) est mis en évidence. ---
  const actifsG = Object.keys(gardes);
  if (actifsG.length >= 2) {
    const fteDe = (id) => { const m = medById[id]; return (m && typeof m.fte === "number" && m.fte > 0) ? Math.min(m.fte, 1) : 1; };
    let totalG = 0, totalFte = 0;
    actifsG.forEach((id) => { totalG += gardes[id]; totalFte += fteDe(id); });
    actifsG.forEach((id) => {
      const attendu = totalFte > 0 ? totalG * (fteDe(id) / totalFte) : totalG / actifsG.length;
      const ecart = gardes[id] - attendu;
      if (ecart > 1) {
        conflits.push({ date: dateAncre, message: `${nom(id)} : ${gardes[id]} gardes (≈${Math.round(attendu * 10) / 10} attendues au prorata du temps de travail, écart > 1 — N2 indicatif).` });
      } else if (ecart < -1) {
        conflits.push({ date: dateAncre, message: `${nom(id)} : ${gardes[id]} gardes (≈${Math.round(attendu * 10) / 10} attendues au prorata du temps de travail, déficit > 1 — N2 indicatif).` });
      }
    });
  }

  conflits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return conflits;
}


/* Compteurs par médecin (heures / gardes / week-ends / tours / off) à partir
   d'une liste de shifts. Pur, réutilisé par le panneau admin (Module 6). */
function compterParMedecin(shifts) {
  const stats = {}; // doctorId -> { heures, gardes, weekends, tours, offs }
  (shifts || []).forEach((s) => {
    const st = stats[s.doctor_id] ||
      (stats[s.doctor_id] = { heures: 0, gardes: 0, weekends: 0, tours: 0, offs: 0, repos: 0, reposGarde: 0, joursSemaine: 0 });
    st.heures += PL_HEURES[s.shift_type] || 0;
    // Off-clinic crédité comme heures de travail (§9).
    if (s.shift_type === "off") { st.heures += PL_HEURES_OFFCLINIC; st.offs++; }
    if (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") st.gardes++;
    // Tour de week-end (TWE) : on en compte le total.
    if (s.shift_type === "twe") st.tours++;
    // Jours POSTÉS EN SEMAINE : une des 7 stations un jour ouvré (hors gardes).
    // Diagnostic mi-temps : isole la charge de station de la charge de gardes.
    if (s.shift_type === "jour") st.joursSemaine++;
    // Repos / récupération posé manuellement (comptabilisé). Le repos de garde
    // automatique ('repos_garde') est volontairement EXCLU des totaux : il est
    // seulement affiché dans le planning.
    if (s.shift_type === "recup") st.repos++;
    // Jours de repos de garde (révision : compteur INFORMATIF, non limitant).
    if (s.shift_type === "repos_garde") st.reposGarde++;
    // Week-end travaillé = clé samedi DISTINCTE (spec §7 révisée) : garde 24h
    // ou tour le samedi/dimanche, ET garde du VENDREDI soir (elle entame le
    // samedi matin). Sam+dim du même week-end, ou vendredi+dimanche, = 1 seul.
    const jr = plJourSemaine(s.date);
    let wk = null;
    if ((jr === 6 || jr === 7) && (s.shift_type === "garde_24h" || s.shift_type === "twe")) wk = plWeekendKey(s.date);
    if (jr === 5 && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")) wk = plWeekendKey(s.date);
    if (wk) (st._wk = st._wk || new Set()).add(wk);
  });
  Object.keys(stats).forEach((id) => {
    stats[id].heures = Math.round(stats[id].heures * 10) / 10;
    stats[id].weekends = stats[id]._wk ? stats[id]._wk.size : 0;
    delete stats[id]._wk;
  });
  return stats;
}


/* ===================================================================== */
/* §14 — ALERTES « absences simultanées » (informatif, NON bloquant)      */
/* --------------------------------------------------------------------- */
/* Par jour du mois, compte les médecins ABSENTS (préférence bloquante OU  */
/* shift d'absence posé, HORS repos de garde automatique) et gradue la     */
/* sévérité : 1–3 normal (rien) · 4–5 attention (contournable) · 6+        */
/* critique. Vérifie aussi qu'au moins 1 RÉSIDENT reste disponible la nuit.*/
/* opts = { annee, mois, medecins, preferences, shifts }. Renvoie une liste */
/* de { date, niveau ('attention'|'critique'), message }.                  */
function alertesAbsences(opts) {
  const annee = opts.annee, mois = opts.mois;
  const medecins = opts.medecins || [];
  const prefs = opts.preferences || [];
  const shifts = opts.shifts || [];
  const bloquantes = plBloq();
  const residents = medecins.filter((m) => m.grade === "resident");
  const out = [];
  const ms = String(mois).padStart(2, "0");
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  for (let j = 1; j <= nbJours; j++) {
    const date = annee + "-" + ms + "-" + String(j).padStart(2, "0");
    const absent = new Set();
    prefs.forEach((p) => {
      if (p.pref_type === "off_clinic") return; // off-clinic : contournable → ne compte pas
      if (bloquantes.indexOf(p.pref_type) !== -1 && p.start_date <= date && p.end_date >= date)
        absent.add(p.doctor_id);
    });
    shifts.forEach((s) => {
      if (s.date === date && plEstAbsence(s.shift_type) &&
          s.shift_type !== "repos_garde" && s.shift_type !== "off") // off-clinic exclu (contournable)
        absent.add(s.doctor_id);
    });
    const n = absent.size;
    if (n >= 6) out.push({ date, niveau: "critique", message: `Absences simultanées : ${n} médecins (critique, §14).` });
    else if (n >= 4) out.push({ date, niveau: "attention", message: `Absences simultanées : ${n} médecins (attention, contournable, §14).` });
    // Au moins 1 résident doit rester disponible pour la nuit (§14).
    if (residents.length > 0 && residents.every((m) => absent.has(m.id)))
      out.push({ date, niveau: "critique", message: "Aucun résident disponible pour la nuit (§14)." });
  }
  return out;
}

/* =====================================================================
   MODULE 23 — Échange de shifts entre médecins (workflow médecin → médecin)
   ---------------------------------------------------------------------
   Échange « à valeur égale » : garde↔garde, journée↔journée, tour↔tour. REFUSÉ
   si ça casse une règle de garde (≥1 résident, jamais 2 A/S) sur les jours
   concernés. Un échange de GARDE échange AUSSI les repos de garde associés
   (le repos suit la garde ; le repos COUPLÉ — jeudi+samedi → lundi,
   vendredi+dimanche → mardi — est RECALCULÉ : transféré, créé ou supprimé
   selon que le nouveau titulaire est couplé ou non). Vérifie aussi la
   DISPONIBILITÉ du receveur (même jour, veille, lendemain). FONCTION PURE :
   ne mute rien, renvoie { ok, message, changes } avec changes =
   [{ id, doctor_id }] (réaffecter) | [{ id, supprimer:true }] |
   [{ creer:{date, shift_type, poste, doctor_id} }] à appliquer côté base.
   ===================================================================== */
const PL_GROUPE_SHIFT = { garde_nuit: "garde", garde_24h: "garde", jour: "journee", twe: "tour" };
function plGroupeShift(t) { return PL_GROUPE_SHIFT[t] || null; }

function validerEchange(shifts, idA, idB, medecins) {
  const sA = (shifts || []).find((s) => String(s.id) === String(idA));
  const sB = (shifts || []).find((s) => String(s.id) === String(idB));
  if (!sA || !sB) return { ok: false, message: "Shift introuvable." };
  if (sA.doctor_id === sB.doctor_id) return { ok: false, message: "Les deux shifts sont au même médecin." };
  const gA = plGroupeShift(sA.shift_type), gB = plGroupeShift(sB.shift_type);
  if (!gA || !gB || gA !== gB) {
    return { ok: false, message: "Échange seulement entre shifts de même nature (garde↔garde, journée↔journée, tour↔tour)." };
  }
  const dA = sA.doctor_id, dB = sB.doctor_id;
  const changes = [{ id: sA.id, doctor_id: dB }, { id: sB.id, doctor_id: dA }];

  // Propriétaire APRÈS échange (réaffectations + suppressions au fil de l'eau).
  const reaff = {}; reaff[sA.id] = dB; reaff[sB.id] = dA;
  const suppr = new Set();
  const docDe = (s) => (reaff[s.id] !== undefined ? reaff[s.id] : s.doctor_id);
  const estG = (t) => t === "garde_nuit" || t === "garde_24h";
  const estTravail = (t) => t === "jour" || t === "twe" || t === "off" || estG(t);
  const aGardeApres = (id, date) => (shifts || []).some((s) =>
    !suppr.has(s.id) && estG(s.shift_type) && s.date === date && docDe(s) === id);
  const estWE = (d) => { const j = plJourSemaine(d); return j === 6 || j === 7; };

  // Les deux sens de l'échange : [shift gagné, ancien titulaire, nouveau].
  const sens = [[sA, dA, dB], [sB, dB, dA]];

  if (gA === "garde") {
    // 1) Le repos du LENDEMAIN suit toujours la garde.
    sens.forEach(([g, ancien, nouveau]) => {
      const r1 = (shifts || []).find((s) => s.shift_type === "repos_garde" &&
        s.doctor_id === ancien && s.date === plAdd(g.date, 1));
      if (r1) { changes.push({ id: r1.id, doctor_id: nouveau }); reaff[r1.id] = nouveau; }
    });

    // 2) Repos COUPLÉ (J+2 d'une 24 h de week-end) — règle révisée : il n'est
    //    dû que si le titulaire a AUSSI gardé l'avant-veille (jeudi+samedi →
    //    lundi ; vendredi+dimanche → mardi). On le recalcule pour les deux
    //    médecins, dans les deux directions possibles :
    //    a) la garde échangée EST la 24 h de week-end ;
    //    b) la garde échangée est la garde de semaine (jeudi/vendredi) couplée
    //       à une 24 h de week-end existante 2 jours plus tard.
    const recalc = []; // [weekendGarde (post-échange), candidatRepos]
    sens.forEach(([g]) => {
      if (estWE(g.date) && g.shift_type === "garde_24h") recalc.push(g);
      const dWE = plAdd(g.date, 2);
      (shifts || []).forEach((s) => {
        if (estG(s.shift_type) && s.shift_type === "garde_24h" && s.date === dWE && estWE(dWE)) recalc.push(s);
      });
    });
    const vus = new Set();
    recalc.forEach((w) => {
      if (vus.has(w.id)) return; vus.add(w.id);
      const titulaire = docDe(w);                       // titulaire post-échange
      const couple = aGardeApres(titulaire, plAdd(w.date, -2));
      const rep = (shifts || []).find((s) => s.shift_type === "repos_garde" &&
        !suppr.has(s.id) && s.date === plAdd(w.date, 2) &&
        (s.doctor_id === titulaire || s.doctor_id === dA || s.doctor_id === dB));
      if (couple) {
        if (rep && docDe(rep) !== titulaire) { changes.push({ id: rep.id, doctor_id: titulaire }); reaff[rep.id] = titulaire; }
        else if (!rep) changes.push({ creer: { date: plAdd(w.date, 2), shift_type: "repos_garde", poste: null, doctor_id: titulaire } });
      } else if (rep && docDe(rep) !== titulaire) {
        // le repos appartenait à l'ancien titulaire qui n'est plus couplé
        changes.push({ id: rep.id, supprimer: true }); suppr.add(rep.id);
      } else if (rep && docDe(rep) === titulaire && !couple) {
        changes.push({ id: rep.id, supprimer: true }); suppr.add(rep.id);
      }
    });

    // 2bis) NOUVEAU (2026-06-15, étendu 2026-06-16) — les JOURNÉES qui empêchent
    //    le receveur de prendre la garde sont REDONNÉES au cédant au lieu de
    //    bloquer l'échange. Deux jours concernés pour chaque garde gagnée :
    //      • le JOUR de la garde (le receveur ne peut pas tenir une station ET la
    //        garde le même jour) ;
    //      • le LENDEMAIN (il est en repos de garde).
    //    Chaque journée du NOUVEAU titulaire ces jours-là est confiée à l'ANCIEN
    //    titulaire, libéré (il a cédé la garde) — s'il est lui-même libre ce
    //    jour-là. Sinon on ne transfère pas → l'étape 4 refusera proprement.
    if (gA === "garde") {
      sens.forEach(([g, ancien, nouveau]) => {
        [g.date, plAdd(g.date, 1)].forEach((jourCible) => {
          // Tous les shifts de travail RÉSOLUBLES du nouveau titulaire ce jour :
          // une JOURNÉE (transférable) ou un OFF-CLINIC (droit contournable).
          (shifts || []).filter((s) => !suppr.has(s.id) && s.date === jourCible &&
            docDe(s) === nouveau && (s.shift_type === "jour" || s.shift_type === "off")).forEach((c) => {
            if (c.shift_type === "off") {
              // Off-clinic incompatible avec un repos de garde → on le retire (contournable).
              changes.push({ id: c.id, supprimer: true }); suppr.add(c.id);
              return;
            }
            // Journée : confiée à l'ANCIEN titulaire (libéré : il a cédé la garde) s'il
            // est libre ce jour-là ; sinon non transférée → l'étape 4 refusera.
            const ancienOccupe = (shifts || []).some((s) => !suppr.has(s.id) && s.id !== c.id &&
              s.date === jourCible && docDe(s) === ancien);
            const ancienGardeVeille = aGardeApres(ancien, plAdd(jourCible, -1));
            if (ancienOccupe || ancienGardeVeille) return;
            changes.push({ id: c.id, doctor_id: ancien });
            reaff[c.id] = ancien;
          });
        });
      });
    }

    // 3) Règles de composition de garde APRÈS échange (≥1 résident, jamais 2 A/S).
    const byId = {}; (medecins || []).forEach((m) => { byId[m.id] = m; });
    for (const date of [sA.date, sB.date]) {
      const gardes = (shifts || []).filter((s) => !suppr.has(s.id) && s.date === date && estG(s.shift_type));
      const grades = gardes.map((g) => byId[docDe(g)] && byId[docDe(g)].grade);
      const nbRes = grades.filter((x) => x === "resident").length;
      const nbAS = grades.filter((x) => x === "assistant_specialiste").length;
      if (gardes.length >= 2 && nbRes < 1)
        return { ok: false, message: "Échange refusé : aucun résident de garde le " + date + "." };
      if (nbAS >= 2)
        return { ok: false, message: "Échange refusé : 2 A/S de garde le " + date + " (interdit)." };
    }
  }

  // 4) DISPONIBILITÉ du receveur (toutes natures d'échange) — post-échange :
  //    - pas d'autre shift le même jour (congé, station, repos…) ;
  //    - pas de garde la veille (il serait en repos de garde) ;
  //    - pour une garde gagnée : pas de shift de TRAVAIL le lendemain.
  const nomDe = (id) => { const m = (medecins || []).find((x) => x.id === id); return (m && m.name) || id; };
  for (const [g, , nouveau] of sens) {
    const memeJour = (shifts || []).find((s) => !suppr.has(s.id) && s.id !== g.id &&
      s.date === g.date && docDe(s) === nouveau);
    if (memeJour)
      return { ok: false, message: "Échange refusé : " + nomDe(nouveau) + " a déjà « " + memeJour.shift_type + " » le " + g.date + "." };
    if (aGardeApres(nouveau, plAdd(g.date, -1)))
      return { ok: false, message: "Échange refusé : " + nomDe(nouveau) + " est de garde la veille du " + g.date + " (repos de garde)." };
    if (estG(g.shift_type)) {
      const lendemain = (shifts || []).find((s) => !suppr.has(s.id) && estTravail(s.shift_type) &&
        s.date === plAdd(g.date, 1) && docDe(s) === nouveau);
      if (lendemain)
        return { ok: false, message: "Échange refusé : " + nomDe(nouveau) + " a « " + lendemain.shift_type + " » le lendemain de la garde du " + g.date + " (repos impossible, non transférable)." };
    }
  }

  return { ok: true, message: "Échange valide.", changes };
}

/* =====================================================================
   MODULE 28 — Générateur PG (postgraduate) — INDÉPENDANT des résidents
   ---------------------------------------------------------------------
   Lancé APRÈS publication du planning résidents (qu'il ne modifie pas).
   Produit les shifts PG :
     - SEMAINE (lun-ven) : chaque PG disponible est posé en `pg_jour` (8,5 h,
       8:45-17:15) dans son UNITÉ MAISON, fixe par bloc de 3 semaines
       (continuité), indépendamment des résidents (doublure permise).
     - WEEK-END / FÉRIÉ : tour PG à part — 2 PG en `pg_twe` (6 h, 8h-14h),
       les moins servis d'abord (équité).
   Les GARDES PG sont AUTO-ENCODÉES par le PG (module ultérieur) : passées via
   opts.pgGardes = [{doctor_id, date}], elles bloquent le jour ET le lendemain
   (repos). opts = { annee, trimestre, medecins, preferences?, periodes?,
   pgGardes? }. Renvoie { shifts, conflits, stats }. PUR (sans DOM/Supabase).
   ===================================================================== */
function genererTrimestrePG(opts) {
  const pgs = (opts.medecins || []).filter((m) => m.grade === "pg");
  const sortie = [], conflits = [];
  if (!pgs.length) return { shifts: sortie, conflits, stats: [] };
  const annee = opts.annee, trimestre = opts.trimestre;
  const moisTrim = [0, 1, 2].map((k) => (trimestre - 1) * 3 + 1 + k);
  let dates = [];
  moisTrim.forEach((mo) => { dates = dates.concat(plDatesDuMois(annee, mo)); });

  // Préférences bloquantes (congé/récup…) + souhait « indispo » pour WE.
  const bloquantes = plBloq();
  const indispo = {}, indispoWE = {}, dispo = {};
  (opts.preferences || []).forEach((p) => {
    if (p.pref_type === "dispo") {
      (dispo[p.doctor_id] = dispo[p.doctor_id] || new Set());
      let d = p.start_date; while (d <= p.end_date) { dispo[p.doctor_id].add(d); d = plAdd(d, 1); }
      return;
    }
    // 'indispo' pour PG = souhait de ne PAS faire le tour WE ce jour (non bloquant pour pg_jour).
    if (p.pref_type === "indispo") {
      (indispoWE[p.doctor_id] = indispoWE[p.doctor_id] || new Set());
      let d = p.start_date; while (d <= p.end_date) { indispoWE[p.doctor_id].add(d); d = plAdd(d, 1); }
      return;
    }
    if (!bloquantes.includes(p.pref_type)) return;
    (indispo[p.doctor_id] = indispo[p.doctor_id] || new Set());
    let d = p.start_date; while (d <= p.end_date) { indispo[p.doctor_id].add(d); d = plAdd(d, 1); }
  });
  // Gardes PG auto-encodées : bloquent le jour de garde ET le lendemain (repos).
  const gardeBloc = {};
  (opts.pgGardes || []).forEach((g) => {
    (gardeBloc[g.doctor_id] = gardeBloc[g.doctor_id] || new Set());
    gardeBloc[g.doctor_id].add(g.date); gardeBloc[g.doctor_id].add(plAdd(g.date, 1));
  });

  const jtOk = (m, d) => ((m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1,2,3,4,5,6,7]).includes(plJourSemaine(d));
  const dispoCe = (m, d) => plSousContrat(m, d) && jtOk(m, d) &&
    !(indispo[m.id] && indispo[m.id].has(d)) &&
    (m.statut !== "independant" || (dispo[m.id] && dispo[m.id].has(d))) &&
    !(gardeBloc[m.id] && gardeBloc[m.id].has(d));

  // Continuité 3 semaines : unité maison par bloc de 3 semaines ISO.
  const units = plPostes().map((p) => p.code).filter((c) => !plSansContinuite(c));
  const lundis = [...new Set(dates.filter((d) => plJourSemaine(d) <= 5).map((d) => plLundiDe(d)))].sort();
  const blocDe = {}; lundis.forEach((lk, i) => { blocDe[lk] = Math.floor(i / 3); });
  const uniteDe = (pgIdx, lk) => {
    if (!units.length) return null;
    const b = (blocDe[lk] !== undefined) ? blocDe[lk] : 0;
    return units[(b + pgIdx) % units.length];
  };

  const twe = {}; pgs.forEach((m) => { twe[m.id] = 0; });
  // Binômes fixes : pgs[0]+pgs[1], pgs[2]+pgs[3], …
  // La rotation se fait par PAIRE (pas par individu) pour que le même binôme
  // travaille toujours ensemble. tweParPaire compte les WE/fériés de chaque paire.
  // weekendsDone : compteur d'ÉQUITÉ par PG (nombre de weekends effectués,
  // pas de jours). Permet de choisir qui fait le prochain weekend sans biaiser
  // par le fait qu'un weekend = 2 jours (sam + dim).
  const weekendsDone = {}; pgs.forEach((m) => { weekendsDone[m.id] = 0; });

  // Grouper les jours WE/fériés par semaine ISO : chaque groupe = 1 weekend.
  // On choisit les PG UNE FOIS par weekend ; ils font sam ET dim ensemble,
  // ce qui réduit le nombre total de weekends par personne.
  const weParSemaine = {};
  dates.forEach((d) => {
    if (plEstWeekendOuFerie(d)) (weParSemaine[plLundiDe(d)] = weParSemaine[plLundiDe(d)] || []).push(d);
  });
  const pgParSemaine = {}; // lundi ISO → [PG choisis pour tout le weekend]
  Object.keys(weParSemaine).sort().forEach((lk) => {
    const joursWE = weParSemaine[lk].sort();
    // Préférer les PG dispos sur TOUS les jours du weekend, sans indispoWE.
    const pasIndispoWE = (m) => !joursWE.some((d) => indispoWE[m.id] && indispoWE[m.id].has(d));
    const tousDisposFn = (m) => joursWE.every((d) => dispoCe(m, d)) && pasIndispoWE(m);
    let candidats = pgs.filter(tousDisposFn).sort((a, b) => weekendsDone[a.id] - weekendsDone[b.id]);
    // Fallback 1 : ignorer indispoWE si pas assez de candidats.
    if (candidats.length < 2)
      candidats = pgs.filter((m) => joursWE.every((d) => dispoCe(m, d))).sort((a, b) => weekendsDone[a.id] - weekendsDone[b.id]);
    // Fallback 2 : dispos au moins le premier jour.
    if (candidats.length < 2)
      candidats = pgs.filter((m) => dispoCe(m, joursWE[0])).sort((a, b) => weekendsDone[a.id] - weekendsDone[b.id]);
    const choisis = candidats.slice(0, 2);
    choisis.forEach((m) => { weekendsDone[m.id]++; });
    pgParSemaine[lk] = choisis;
    if (choisis.length < 2) conflits.push({ date: joursWE[0], message: "Tour PG week-end : " + choisis.length + "/2 PG disponibles pour la semaine du " + lk + "." });
  });

  dates.forEach((date) => {
    if (!plEstWeekendOuFerie(date)) {
      // SEMAINE : chaque PG disponible dans son unité maison du bloc.
      pgs.forEach((m, i) => {
        if (!dispoCe(m, date)) return;
        const u = uniteDe(i, plLundiDe(date));
        if (u) sortie.push({ date, shift_type: "pg_jour", poste: u, doctor_id: m.id });
      });
    } else {
      // WEEK-END : les PG choisis pour ce weekend font sam ET dim ensemble.
      const membres = (pgParSemaine[plLundiDe(date)] || []).filter((m) => dispoCe(m, date));
      membres.forEach((m) => {
        const u = uniteDe(pgs.indexOf(m), plLundiDe(date));
        sortie.push({ date, shift_type: "pg_twe", poste: u, doctor_id: m.id });
        twe[m.id]++;
      });
      if (membres.length < 2) conflits.push({ date, message: "Tour PG week-end/férié : " + membres.length + "/2 PG disponibles le " + date + "." });
    }
  });

  // ATTRIBUTION DES UNITÉS DU WEEK-END AUX RÉSIDENTS (les PG sont prioritaires).
  // Pour chaque résident de tour (TWE) ou de garde 24 h le week-end/férié, on
  // attribue une unité parmi les LIBRES (non prises par un PG ni un autre),
  // en préférant son unité de référence, sinon une unité où il a déjà tourné.
  // Renvoyé dans `majResidents` = [{id, poste}] à appliquer aux shifts résidents.
  const majResidents = [];
  const pub = opts.publishedShifts || [];
  const medById = {}; (opts.medecins || []).forEach((m) => { medById[m.id] = m; });
  const unitesConnues = {}; // résident -> Set(unités déjà tenues sur le trimestre)
  pub.forEach((s) => {
    if ((s.shift_type === "jour" || s.shift_type === "garde_24h") && s.poste && !plSansContinuite(s.poste)) {
      (unitesConnues[s.doctor_id] = unitesConnues[s.doctor_id] || new Set()).add(s.poste);
    }
  });
  const pgParDate = {}; // unités prises par les PG ce jour
  sortie.forEach((s) => { if (s.shift_type === "pg_twe" && s.poste) (pgParDate[s.date] = pgParDate[s.date] || new Set()).add(s.poste); });
  const weDates = [...new Set(pub.filter((s) => plEstWeekendOuFerie(s.date) && (s.shift_type === "twe" || s.shift_type === "garde_24h")).map((s) => s.date))];
  weDates.forEach((date) => {
    const pris = new Set(pgParDate[date] || []);
    const ceJour = pub.filter((s) => s.date === date && (s.shift_type === "twe" || s.shift_type === "garde_24h"));
    // D'abord, marquer les unités déjà posées (si certaines existaient).
    ceJour.forEach((s) => { if (s.poste && !plSansContinuite(s.poste)) pris.add(s.poste); });
    ceJour.forEach((s) => {
      if (s.poste && !plSansContinuite(s.poste)) return; // déjà une unité
      const m = medById[s.doctor_id];
      const ref = m && m.unite_reference;
      const libres = units.filter((u) => !pris.has(u));
      if (!libres.length) return; // plus d'unité libre → on laisse sans
      let choix = (ref && libres.indexOf(ref) !== -1) ? ref
        : (libres.find((u) => unitesConnues[s.doctor_id] && unitesConnues[s.doctor_id].has(u)) || libres[0]);
      pris.add(choix);
      majResidents.push({ id: s.id, poste: choix });
    });
  });

  const stats = pgs.map((m) => {
    let h = 0, j = 0, t = 0;
    sortie.forEach((s) => { if (s.doctor_id === m.id) { h += PL_HEURES[s.shift_type] || 0; if (s.shift_type === "pg_jour") j++; if (s.shift_type === "pg_twe") t++; } });
    return { id: m.id, heures: Math.round(h * 10) / 10, jours: j, tours: t };
  });
  return { shifts: sortie, conflits, stats, majResidents };
}

/* ------------- Export pour Node (tests). Sans effet en navigateur. ------ */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { genererPlanning, genererTrimestre, genererOffClinic, validerPlanning, validerEquite, compterParMedecin, plTrier, plRangDesiderata, alertesAbsences, validerEchange, plConflits24hSlack, plResorberOff24h, genererTrimestrePG };
}
