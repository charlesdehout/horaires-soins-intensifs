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
};


/* ---------------------------------------------------------------------
   Types de préférence qui rendent un médecin NON planifiable un jour
   donné (contrainte dure). 'souhait' reste souple (non bloquant).
   --------------------------------------------------------------------- */
const PREF_BLOQUANTES = [
  "conge", "conge_annuel", "conge_extralegal", "conge_scientifique",
  "indispo", "off_clinic", "recuperation",
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
    CONGE_TYPES, calculerPaques, joursFeriesBE, estJourOuvre,
    dateEnISO, ajouterJours,
    POSTES_JOUR, COUVERTURE, PREF_BLOQUANTES,
  };
}
