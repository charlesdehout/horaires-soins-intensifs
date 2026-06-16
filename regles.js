/* =====================================================================
   Planning Soins Intensifs — Fichier de configuration des règles
   ---------------------------------------------------------------------
   Centralise les paramètres « métier » faciles à ajuster sans toucher
   à la logique de l'application : quotas de congés, jours fériés, etc.
   Chargé AVANT app.js (voir index.html).
   ===================================================================== */


/* ---------------------------------------------------------------------
   Catégories de congés et quotas annuels par défaut (en jours OUVRÉS).
   Ces valeurs valent pour une année civile complète sous contrat ;
   elles sont proratisées selon la durée réelle du contrat dans l'année,
   et peuvent être surchargées par médecin (colonnes quota_* de doctors).
   --------------------------------------------------------------------- */
const CONGE_TYPES = {
  conge_annuel:       { label: "Congé annuel",       defaut: 24 },
  conge_extralegal:   { label: "Congés extra-légaux", defaut: 5 },
  conge_scientifique: { label: "Congé scientifique",  defaut: 12 },
};


/* ---------------------------------------------------------------------
   Postes de jour (stations cliniques) — Module 5.
   En SEMAINE, ces 7 stations doivent toutes être pourvues (= couverture
   minimale de jour). L'ordre sert d'ordre de remplissage par défaut.
   Toutes accessibles à tous les grades. Modifiable ici sans toucher au code.
   --------------------------------------------------------------------- */
const POSTES_JOUR = [
  { code: "usi1",      label: "USI 1" },
  { code: "usi2",      label: "USI 2" },
  { code: "usi3",      label: "USI 3" },
  { code: "usi4",      label: "USI 4" },
  { code: "usi5",      label: "USI 5" },
  { code: "bordet",    label: "USI Bordet" },
  { code: "labo_choc", label: "Labo de choc" },
];


/* ---------------------------------------------------------------------
   Paramètres de couverture (contraintes DURES) — Module 5.
   - min_nuit       : médecins de garde la nuit en semaine (≥1 résident).
   - twe_weekend    : médecins au tour le week-end / jour férié.
   - gardes_weekend : combien de ces médecins enchaînent en garde 24h.
   (La couverture de jour en semaine = nombre de POSTES_JOUR.)
   --------------------------------------------------------------------- */
const COUVERTURE = {
  min_nuit:       2,
  twe_weekend:    3,
  gardes_weekend: 2,
  // Module 17 — CONGRÈS (ISICEM / ISICARE, spec §3.2) : un jour de congrès en
  // SEMAINE, les 7 unités restent ouvertes mais la couverture est ASSOUPLIE :
  // jusqu'à N stations peuvent rester vides sans que ce soit un conflit
  // (beaucoup de médecins sont au congrès). Gardes de nuit inchangées.
  // Un congrès tombant un week-end/férié suit les règles week-end normales.
  congres_postes_vides: 2,
};


/* ---------------------------------------------------------------------
   Paramètres d'ÉQUITÉ fine (Module 12 — priorité N2). Tous SOUPLES :
   ils orientent la génération et déclenchent des avertissements
   indicatifs (non bloquants) dans validerPlanning.
   - plafond_hebdo  : heures max par semaine ISO et par médecin. On évite
     de le dépasser (compensable la semaine suivante) ; dépassement signalé.
   - plancher_ratio : part minimale de la charge horaire moyenne en-deçà
     de laquelle un médecin est signalé comme « sous le plancher » (risque
     de déséquilibre). 0.85 = on alerte sous 85 % de la charge moyenne.
   --------------------------------------------------------------------- */
const EQUITE = {
  plafond_hebdo:  60,
  plancher_ratio: 0.90,
  // Module 12c — CONCENTRATION des gardes de nuit en semaine (préférence N3,
  // souple). « Tendance légère à enchaîner » : à déficit de gardes quasi égal,
  // on privilégie le médecin qui a déjà gardé récemment, pour regrouper un peu
  // ses gardes plutôt que de les éparpiller. SOUPLE et BORNÉE : le bonus de
  // récence vaut toujours MOINS qu'une garde d'écart de déficit, donc l'équité
  // (N2) reste prioritaire — on ne fait jamais passer quelqu'un qui a une garde
  // de retard. Ne s'applique qu'aux gardes de nuit de SEMAINE (pas le week-end).
  concentration_nuits: true, // activer/désactiver le biais
  concentration_coeff: 0.5,  // intensité ∈ ]0,1[ (0,5 = discret ; <1 garantit la borne)
  fenetre_nuits:       14,    // « récent » = dernière garde ≤ 14 jours avant
  // RÉÉQUILIBRAGE FINAL DES HEURES (révision 2026-06-13) : écart maximal
  // d'heures cumulées toléré entre le plus et le moins chargé en fin de
  // génération — au-delà, des journées de station sont transférées du plus
  // chargé vers le moins chargé (correction avant brouillon). 0 = désactiver.
  ecart_heures_max: 12,
  // MINIMUM D'HEURES HEBDOMADAIRE (révision 2026-06-12) : équivalent à
  // atteindre par semaine pour un ETP complet présent tous les jours ouvrés
  // (proratisé fte × jours disponibles). Complété par des DOUBLURES d'unités
  // si le planning normal ne suffit pas. 0 = désactiver.
  minimum_hebdo_h: 40,
  // Pt 6 — COUPLAGE des gardes (jeudi→samedi, vendredi→dimanche) : le médecin
  // de la garde de nuit de l'avant-veille est préféré pour la 24 h du week-end
  // (combo MAXIMISÉ, sous l'équité week-end et les contraintes dures).
  // null = aucune borne d'heures (défaut) ; un nombre (en h) borne l'écart
  // d'heures cumulées toléré ; 0 = désactiver le couplage.
  couplage_tolerance_h: null,
};


/* ---------------------------------------------------------------------
   GARDES de NUIT en SEMAINE — format 17h–9h vs 24 h (préférence N3).
   ---------------------------------------------------------------------
   Chaque nuit de semaine reste couverte par 2 médecins (≥1 résident, jamais
   2 A/S). NOUVEAU : la garde 24 h n'est plus IMPOSÉE chaque jour.
   - garde24h_obligatoire : si false (défaut), les 2 gardes arrivent à 17h
     (garde_nuit 17h–9h) et une garde 24 h n'est utilisée QUE si nécessaire
     pour pourvoir une station de jour (sinon il manquerait un médecin de jour).
     Mettre `true` pour revenir au comportement historique (1 garde 24 h
     imposée chaque jour de semaine, qui tient une station).
   - pref_as_24h : quand une 24 h EST nécessaire, on préfère l'attribuer à un
     A/S (les résidents restent en 17h–9h, moins lourd ; un résident ne prend
     une 24 h qu'à défaut d'A/S).
   - eviter_24h_a_3_gardes : on évite de donner la 24 h au médecin qui
     atteindrait 3 gardes dans la semaine ISO (on lui préfère la 17h–9h).
   Préférences SOUPLES : la COUVERTURE (pourvoir les stations, ≥1 résident la
   nuit) reste prioritaire ; ces réglages n'agissent qu'en départage.
   --------------------------------------------------------------------- */
const GARDES = {
  garde24h_obligatoire:  false,
  pref_as_24h:           true,
  eviter_24h_a_3_gardes: true,
  // Révision 2026-06-13 — COMPENSATION DU MINIMUM D'HEURES : un médecin resté
  // sous son minimum cumulé (EQUITE.minimum_hebdo_h proratisé) prend sa garde
  // de SEMAINE en 24 h (station + nuit) pour rattraper. Seuil de déficit (h)
  // déclenchant la promotion ; 0 = désactiver.
  promotion_24h_deficit_h: 9,
};


/* ---------------------------------------------------------------------
   OFF-CLINIC (§9) — hiérarchie de suppression / limitation (préférence N3).
   L'off-clinic des Résidents dépendants est un DROIT, mais on le LIMITE pour
   ne pas aggraver les jours déjà tendus, et on ARBITRE entre résidents :
   ceux qui ont DÉJÀ le plus de congés (puis le plus d'absences) cèdent leur
   off-clinic en PREMIER (les autres restent prioritaires). Tous SOUPLES :
   - max_absences_jour   : on n'AJOUTE pas un off-clinic un jour où le nombre
     d'absents simultanés (méthode §14) atteindrait ce seuil → on REPORTE sur
     un autre jour ouvrable du mois. 5 = on reste sous la zone critique (6+).
   - min_residents_dispo : on garde au moins ce nombre de résidents DISPONIBLES
     (non absents) ce jour-là, pour la couverture de nuit (≥1 résident). Non
     appliqué si l'effectif résident est ≤ ce seuil (contrainte insatisfiable).
   --------------------------------------------------------------------- */
const OFFCLINIC = {
  max_absences_jour:   5,
  min_residents_dispo: 1,
};


/* ---------------------------------------------------------------------
   Types de préférence qui rendent un médecin NON planifiable un jour
   donné (contrainte dure). 'souhait' reste souple (non bloquant).
   --------------------------------------------------------------------- */
const PREF_BLOQUANTES = [
  "conge", "conge_annuel", "conge_extralegal", "conge_scientifique",
  "off_clinic", "recuperation",
  "formation", "autre", // Module 10 : formation USI et congé « autre » bloquent aussi
  "conge_maladie",      // Admin only : congé maladie (hors quota, bloquant)
  "recherche_clinique", // Fellow only : jour de recherche clinique (bloquant, dans quota trimestriel)
  "recup_ferie",        // Module 18 : récup férié approuvée = jour non planifiable
  // NB : 'indispo' n'est PLUS bloquant — c'est désormais un souhait SOUPLE de ne
  // pas être de GARDE (cf. planning.js plBiaisGarde), non bloquant, gardes only.
];


/* ---------------------------------------------------------------------
   Jours fériés légaux belges.
   Les fériés mobiles dépendent de Pâques : on les calcule automatiquement
   pour n'importe quelle année (aucune liste à maintenir à la main).
   --------------------------------------------------------------------- */

/* Date du dimanche de Pâques (algorithme de Meeus/Butcher, grégorien). */
function calculerPaques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/* Convertit un objet Date (UTC) en chaîne "AAAA-MM-JJ". */
function dateEnISO(d) {
  return d.toISOString().slice(0, 10);
}

/* Ajoute n jours à une Date UTC et renvoie une nouvelle Date. */
function ajouterJours(d, n) {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/* Cache des fériés par année (évite de recalculer en boucle). */
const _cacheFeries = {};
/* FÉRIÉS ÉDITABLES PAR L'ADMIN (Module 26) : surcharge le calcul belge.
   _feriesAjouts  : dates "AAAA-MM-JJ" à AJOUTER (agissent comme un week-end).
   _feriesRetraits: fériés belges calculés à RETIRER (redeviennent ouvrables).
   Alimentés par definirFeriesAdmin() — depuis Supabase (app.js) ou les tests. */
let _feriesAjouts = new Set();
let _feriesRetraits = new Set();
/* Définit les surcharges admin et invalide le cache. ajouts/retraits = tableaux
   (ou Sets) de dates ISO. Idempotent. */
function definirFeriesAdmin(ajouts, retraits) {
  _feriesAjouts = new Set(ajouts || []);
  _feriesRetraits = new Set(retraits || []);
  for (const k in _cacheFeries) delete _cacheFeries[k]; // recalcul à la prochaine lecture
}

/* Renvoie un Set des jours fériés belges (chaînes "AAAA-MM-JJ") d'une année. */
function joursFeriesBE(annee) {
  if (_cacheFeries[annee]) return _cacheFeries[annee];

  const paques = calculerPaques(annee);
  const feries = new Set([
    annee + "-01-01",                       // Nouvel An
    dateEnISO(ajouterJours(paques, 1)),     // Lundi de Pâques
    annee + "-05-01",                       // Fête du travail
    dateEnISO(ajouterJours(paques, 39)),    // Ascension
    dateEnISO(ajouterJours(paques, 50)),    // Lundi de Pentecôte
    annee + "-07-21",                       // Fête nationale
    annee + "-08-15",                       // Assomption
    annee + "-11-01",                       // Toussaint
    annee + "-11-11",                       // Armistice
    annee + "-12-25",                       // Noël
  ]);

  // Surcharges admin (Module 26) : retraits puis ajouts de l'année demandée.
  _feriesRetraits.forEach((d) => feries.delete(d));
  _feriesAjouts.forEach((d) => { if (d.slice(0, 4) === String(annee)) feries.add(d); });

  _cacheFeries[annee] = feries;
  return feries;
}

/* Vrai si la date "AAAA-MM-JJ" est un jour ouvré (lun–ven, hors férié belge). */
function estJourOuvre(dateISO) {
  const d = new Date(dateISO + "T00:00:00Z");
  const jourSemaine = d.getUTCDay(); // 0 = dimanche, 6 = samedi
  if (jourSemaine === 0 || jourSemaine === 6) return false;
  const annee = d.getUTCFullYear();
  return !joursFeriesBE(annee).has(dateISO);
}

/* ---------------------------------------------------------------------
   Export pour Node (tests). Sans effet dans le navigateur.
   --------------------------------------------------------------------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONGE_TYPES, calculerPaques, joursFeriesBE, definirFeriesAdmin, estJourOuvre,
    dateEnISO, ajouterJours,
    POSTES_JOUR, COUVERTURE, PREF_BLOQUANTES, EQUITE, OFFCLINIC, GARDES,
  };
}
