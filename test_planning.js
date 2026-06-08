/* =====================================================================
   Tests Node — planning.js (Modules 5 & 6)
   Lancer :  node test_planning.js
   Aucune dépendance externe (assert intégré). Sortie lisible.
   ===================================================================== */

const assert = require("assert");
const { genererPlanning, genererTrimestre, validerPlanning, compterParMedecin } = require("./planning.js");

let reussis = 0, total = 0;
function test(nom, fn) {
  total++;
  try { fn(); reussis++; console.log("  ✅ " + nom); }
  catch (e) { console.log("  ❌ " + nom + "\n     " + e.message); }
}

/* --- Équipe de test : 6 résidents + 4 AS + 4 spécialistes = 14 médecins --- */
function equipe() {
  const meds = [];
  const ajouter = (n, grade) => {
    for (let i = 1; i <= n; i++) {
      meds.push({
        id: grade + i, name: grade + i, grade,
        fte: 1, weekly_hours_target: 52,
        contract_start: null, contract_end: null,
        jours_travailles: [1, 2, 3, 4, 5, 6, 7],
      });
    }
  };
  ajouter(6, "resident");
  ajouter(4, "assistant_specialiste");
  ajouter(4, "specialiste");
  return meds;
}

console.log("\n=== Module 5 — genererPlanning ===");

const meds = equipe();
const res = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });

test("génère des shifts", () => {
  assert(res.shifts.length > 0, "aucun shift généré");
});

test("chaque jour de semaine a 7 stations distinctes", () => {
  const parDate = {};
  res.shifts.forEach((s) => { (parDate[s.date] = parDate[s.date] || []).push(s); });
  // 2026-06-01 est un lundi.
  const stations = (parDate["2026-06-01"] || [])
    .filter((s) => s.poste).map((s) => s.poste);
  assert.strictEqual(new Set(stations).size, 7, "stations attendues=7, obtenu=" + new Set(stations).size);
});

test("nuit de semaine : ≥2 gardes dont ≥1 résident", () => {
  const duJour = res.shifts.filter((s) => s.date === "2026-06-01");
  const gardes = duJour.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h");
  assert(gardes.length >= 2, "gardes nuit < 2");
  const residents = gardes.filter((s) => /^resident/.test(s.doctor_id));
  assert(residents.length >= 1, "aucun résident de garde la nuit");
});

console.log("\n=== Module 6 — validerPlanning ===");

test("un planning fraîchement généré ne génère pas de conflit de double affectation", () => {
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts: res.shifts, medecins: meds, preferences: [] });
  const doubles = conflits.filter((c) => /double affectation/.test(c.message));
  assert.strictEqual(doubles.length, 0, "conflits de double affectation : " + doubles.length);
});

test("détecte une double affectation injectée", () => {
  const mauvais = res.shifts.slice();
  // On colle un 2e shift le même jour au même médecin.
  const cible = res.shifts.find((s) => s.shift_type === "jour");
  mauvais.push({ date: cible.date, shift_type: "twe", doctor_id: cible.doctor_id, poste: null });
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts: mauvais, medecins: meds, preferences: [] });
  assert(conflits.some((c) => /double affectation/.test(c.message)), "double affectation non détectée");
});

test("détecte une station manquante (suppression d'un shift de jour)", () => {
  // On retire une station d'un lundi → 6/7 pourvues.
  const cible = res.shifts.find((s) => s.date === "2026-06-01" && s.shift_type === "jour");
  const sansStation = res.shifts.filter((s) => s !== cible);
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts: sansStation, medecins: meds, preferences: [] });
  assert(conflits.some((c) => c.date === "2026-06-01" && /stations pourvues/.test(c.message)),
    "station manquante non détectée");
});

test("détecte un congé non respecté", () => {
  const cible = res.shifts.find((s) => s.shift_type === "jour");
  const prefs = [{ doctor_id: cible.doctor_id, start_date: cible.date, end_date: cible.date, pref_type: "conge_annuel" }];
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts: res.shifts, medecins: meds, preferences: prefs });
  assert(conflits.some((c) => /congé .* indisponibilité/.test(c.message)), "congé non respecté non détecté");
});

test("détecte le non-respect du repos 12h", () => {
  // Garde le lundi 2026-06-01 puis shift le mardi 2026-06-02 pour le même médecin.
  const shifts = [
    { date: "2026-06-01", shift_type: "garde_24h", doctor_id: "resident1", poste: "usi1" },
    { date: "2026-06-02", shift_type: "jour", doctor_id: "resident1", poste: "usi1" },
  ];
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts, medecins: meds, preferences: [] });
  assert(conflits.some((c) => /repos 12h/.test(c.message)), "repos 12h non détecté");
});

console.log("\n=== compterParMedecin ===");

test("compte heures / gardes / week-ends", () => {
  const shifts = [
    { date: "2026-06-01", shift_type: "jour", doctor_id: "x", poste: "usi1" },     // lundi, 10.5h
    { date: "2026-06-06", shift_type: "garde_24h", doctor_id: "x", poste: null },  // samedi, 24h, week-end+garde
  ];
  const stats = compterParMedecin(shifts);
  assert.strictEqual(stats.x.heures, 34.5, "heures=" + stats.x.heures);
  assert.strictEqual(stats.x.gardes, 1, "gardes=" + stats.x.gardes);
  assert.strictEqual(stats.x.weekends, 1, "weekends=" + stats.x.weekends);
});

console.log("\n=== Module 7 — genererTrimestre (équité) ===");

const medsT = equipe();
const resT = genererTrimestre({ annee: 2026, trimestre: 3, medecins: medsT, preferences: [] }); // T3 = juil/août/sept

test("génère les 3 mois du trimestre", () => {
  assert.deepStrictEqual(resT.mois, [7, 8, 9], "mois=" + resT.mois);
  const moisVus = new Set(resT.shifts.map((s) => s.date.slice(5, 7)));
  ["07", "08", "09"].forEach((m) => assert(moisVus.has(m), "mois manquant : " + m));
});

test("contraintes dures respectées sur tout le trimestre (validerPlanning par mois)", () => {
  let totalDur = 0;
  resT.mois.forEach((mois) => {
    const shiftsMois = resT.shifts.filter((s) => s.date.slice(5, 7) === String(mois).padStart(2, "0"));
    const conflits = validerPlanning({ annee: 2026, mois, shifts: shiftsMois, medecins: medsT, preferences: [] });
    totalDur += conflits.filter((c) => /double affectation|repos 12h|récup/.test(c.message)).length;
  });
  assert.strictEqual(totalDur, 0, "violations dures (double/repos/récup) : " + totalDur);
});

test("équité gardes : équipe homogène => écart max ≤ 2 gardes sur le trimestre", () => {
  const g = resT.stats.map((s) => s.gardes);
  const ecart = Math.max(...g) - Math.min(...g);
  assert(ecart <= 2, "écart de gardes trop grand : " + ecart + " (" + g.join(",") + ")");
});

test("équité week-ends : équipe homogène => écart max ≤ 2 week-ends", () => {
  const w = resT.stats.map((s) => s.weekends);
  const ecart = Math.max(...w) - Math.min(...w);
  assert(ecart <= 2, "écart de week-ends trop grand : " + ecart + " (" + w.join(",") + ")");
});

test("proportionnalité : un mi-temps (fte 0.5) reçoit moins de gardes qu'un temps plein", () => {
  const medsP = equipe();
  medsP[0].fte = 0.5;                     // resident1 à mi-temps
  medsP[0].jours_travailles = [1, 2, 3];  // dispo réduite
  const r = genererTrimestre({ annee: 2026, trimestre: 3, medecins: medsP, preferences: [] });
  const mi = r.stats.find((s) => s.id === "resident1").gardes;
  // Moyenne des autres résidents (temps plein).
  const autres = r.stats.filter((s) => /^resident/.test(s.id) && s.id !== "resident1").map((s) => s.gardes);
  const moyAutres = autres.reduce((a, b) => a + b, 0) / autres.length;
  assert(mi <= moyAutres, "mi-temps gardes=" + mi + " > moyenne temps plein=" + moyAutres.toFixed(1));
});

console.log("\n--- " + reussis + "/" + total + " tests réussis ---\n");
process.exit(reussis === total ? 0 : 1);
