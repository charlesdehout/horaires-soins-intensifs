/* MESURE DOUBLURES & ÉQUILIBRE (2026-07-03) — harnais de diagnostic.
   À lancer sur ta machine :  node mesure-doublures.js
   Équipe factice (6 résidents + 8 A/S plein temps + 1 résident 0.5), trimestre
   2026-T3. Affiche : chaque doublure créée (qui, quand, où, motif probable),
   les écarts d'heures PAR MOIS et sur le TRIMESTRE, le % du mi-temps, et les
   gardes 24 h de semaine. Ne modifie rien. */
const fs = require("fs"), path = require("path"), Module = require("module");
const P = (function () {
  const code = fs.readFileSync(path.join(__dirname, "planning.js"), "utf8") + "\n"
    + fs.readFileSync(path.join(__dirname, "planning-couple.js"), "utf8")
    + "\nif(typeof genererTrimestreCouple!=='undefined')module.exports.genererTrimestreCouple=genererTrimestreCouple;";
  const m = new Module(path.join(__dirname, "_mesure_bundle.js"));
  m.filename = path.join(__dirname, "_mesure_bundle.js");
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(code, m.filename);
  return m.exports;
})();
const regles = require("./regles.js");

// ---- Équipe factice ----
const medecins = [];
const ajouter = (n, grade, fte) => {
  for (let i = 1; i <= n; i++) medecins.push({
    id: grade + (fte < 1 ? "_mi" : "") + i, name: grade + i, grade,
    fte, weekly_hours_target: 52 * fte, jours_travailles: [1, 2, 3, 4, 5, 6, 7],
  });
};
ajouter(6, "resident", 1);
ajouter(8, "assistant_specialiste", 1);
ajouter(1, "resident", 0.5);

const ANNEE = 2026, TRIM = 3;
const R = P.genererTrimestreCouple({ annee: ANNEE, trimestre: TRIM, medecins, preferences: [] });

// ---- Aides ----
const H = { jour: 10.5, twe: 6, garde_nuit: 15, garde_24h: 24, off: 10.5 };
const js = (s) => { const j = new Date(s + "T00:00:00Z").getUTCDay(); return j === 0 ? 7 : j; };
const feries = new Set(regles.joursFeriesBE(ANNEE));
const nomDe = {}; medecins.forEach((m) => { nomDe[m.id] = m.name + (m.fte < 1 ? " (0.5)" : ""); });
const fteDe = {}; medecins.forEach((m) => { fteDe[m.id] = m.fte; });

// ---- 1. Doublures ----
const doublures = R.shifts.filter((s) => s.doublure);
console.log("\n=== DOUBLURES CRÉÉES : " + doublures.length + " ===");
doublures.sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
  const motif = fteDe[s.doctor_id] < 1 ? "PASS 1 (plancher ETP mi-temps)" : "PASS 2 (déficit plein temps)";
  console.log("  " + s.date + "  " + (s.poste || "?") + "  " + nomDe[s.doctor_id] + "  → " + motif);
});
if (!doublures.length) console.log("  (aucune)");

// ---- 2. Heures par mois / trimestre ----
const mois = {};
R.shifts.forEach((s) => {
  const h = H[s.shift_type] || 0; if (!h) return;
  const mo = s.date.slice(0, 7);
  (mois[mo] = mois[mo] || {})[s.doctor_id] = ((mois[mo] || {})[s.doctor_id] || 0) + h;
});
const trim = {}; medecins.forEach((m) => { trim[m.id] = 0; });
Object.values(mois).forEach((t) => { Object.keys(t).forEach((id) => { trim[id] += t[id]; }); });

const pleins = medecins.filter((m) => m.fte >= 1).map((m) => m.id);
const ecart = (t) => { const v = pleins.map((id) => t[id] || 0); return Math.max(...v) - Math.min(...v); };
console.log("\n=== ÉCART D'HEURES (pleins temps) ===");
Object.keys(mois).sort().forEach((mo) => {
  console.log("  " + mo + " : écart " + ecart(mois[mo]).toFixed(1) + " h");
});
console.log("  TRIMESTRE : écart " + ecart(trim).toFixed(1) + " h");

// ---- 3. Mi-temps ----
const median = (a) => { const s = a.slice().sort((x, y) => x - y); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const medPT = median(pleins.map((id) => trim[id]));
medecins.filter((m) => m.fte < 1).forEach((m) => {
  const pct = (100 * trim[m.id] / medPT).toFixed(0);
  console.log("\n=== MI-TEMPS " + nomDe[m.id] + " : " + trim[m.id].toFixed(1) + " h = " + pct + " % d'un plein temps (cible ≥ " + (100 * m.fte).toFixed(0) + " %) ===");
});

// ---- 4. Gardes 24 h de semaine (hors férié) ----
const g24sem = R.shifts.filter((s) => s.shift_type === "garde_24h" && js(s.date) <= 5 && !feries.has(s.date));
console.log("\n=== GARDES 24 h DE SEMAINE (hors férié) : " + g24sem.length + " ===");

// ---- 5. Détail heures par médecin ----
console.log("\n=== HEURES PAR MÉDECIN (par mois | trimestre) ===");
const mos = Object.keys(mois).sort();
medecins.forEach((m) => {
  const parts = mos.map((mo) => (mois[mo][m.id] || 0).toFixed(0).padStart(4));
  console.log("  " + nomDe[m.id].padEnd(28) + parts.join(" |") + " || " + trim[m.id].toFixed(0).padStart(5) + " h");
});

console.log("\nConflits signalés : " + (R.conflits ? R.conflits.length : 0));
(R.conflits || []).slice(0, 15).forEach((c) => console.log("  ⚠ " + (c.date || "") + " " + c.message));
