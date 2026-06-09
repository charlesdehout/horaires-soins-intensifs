const CONGE_TYPES = {
  conge_annuel:       { label: "Congé annuel",       defaut: 24 },
  conge_extralegal:   { label: "Congés extra-légaux", defaut: 5 },
  conge_scientifique: { label: "Congé scientifique",  defaut: 12 },
};

const POSTES_JOUR = [
  { code: "usi1",      label: "USI 1" },
  { code: "usi2",      label: "USI 2" },
  { code: "usi3",      label: "USI 3" },
  { code: "usi4",      label: "USI 4" },
  { code: "usi5",      label: "USI 5" },
  { code: "bordet",    label: "USI Bordet" },
  { code: "labo_choc", label: "Labo de choc" },
];

const COUVERTURE = {
  min_nuit:       2,
  twe_weekend:    3,
  gardes_weekend: 2,
};

const EQUITE = {
  plafond_hebdo:  60,
  plancher_ratio: 0.85,
  concentration_nuits: true,
  concentration_coeff: 0.5,
  fenetre_nuits:       14,
};

const PREF_BLOQUANTES = [
  "conge", "conge_annuel", "conge_extralegal", "conge_scientifique",
  "indispo", "off_clinic", "recuperation",
  "formation", "autre",
];

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
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}
function dateEnISO(d) { return d.toISOString().slice(0, 10); }
function ajouterJours(d, n) {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
const _cacheFeries = {};
function joursFeriesBE(annee) {
  if (_cacheFeries[annee]) return _cacheFeries[annee];
  const paques = calculerPaques(annee);
  const feries = new Set([
    annee + "-01-01",
    dateEnISO(ajouterJours(paques, 1)),
    annee + "-05-01",
    dateEnISO(ajouterJours(paques, 39)),
    dateEnISO(ajouterJours(paques, 50)),
    annee + "-07-21",
    annee + "-08-15",
    annee + "-11-01",
    annee + "-11-11",
    annee + "-12-25",
  ]);
  _cacheFeries[annee] = feries;
  return feries;
}
function estJourOuvre(dateISO) {
  const d = new Date(dateISO + "T00:00:00Z");
  const jourSemaine = d.getUTCDay();
  if (jourSemaine === 0 || jourSemaine === 6) return false;
  const annee = d.getUTCFullYear();
  return !joursFeriesBE(annee).has(dateISO);
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONGE_TYPES, calculerPaques, joursFeriesBE, estJourOuvre,
    dateEnISO, ajouterJours,
    POSTES_JOUR, COUVERTURE, PREF_BLOQUANTES, EQUITE,
  };
}
