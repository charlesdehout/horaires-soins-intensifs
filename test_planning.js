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

console.log("\n=== Module 8 — Règles dures (spec Calabro) ===");

// Planning d'un mois contenant des week-ends (juin 2026).
const medsR = equipe();
const resR = genererPlanning({ annee: 2026, mois: 6, medecins: medsR, preferences: [] });

function isoLundi(d) { // lundi de la semaine ISO d'une date "YYYY-MM-DD"
  const x = new Date(d + "T00:00:00Z");
  const j = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - (j - 1));
  return x.toISOString().slice(0, 10);
}

test("aucun médecin ne dépasse 3 gardes par semaine", () => {
  const parSem = {};
  resR.shifts.forEach((s) => {
    if (s.shift_type !== "garde_nuit" && s.shift_type !== "garde_24h") return;
    const k = s.doctor_id + "|" + isoLundi(s.date);
    parSem[k] = (parSem[k] || 0) + 1;
  });
  const max = Math.max(0, ...Object.values(parSem));
  assert(max <= 3, "max gardes/semaine = " + max);
});

test("jamais 2 A/S ensemble en garde (généré)", () => {
  const parDate = {};
  resR.shifts.forEach((s) => { (parDate[s.date] = parDate[s.date] || []).push(s); });
  let pire = 0;
  Object.keys(parDate).forEach((d) => {
    const as = parDate[d].filter((s) => (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")
      && /^assistant_specialiste/.test(s.doctor_id));
    pire = Math.max(pire, as.length);
  });
  assert(pire < 2, "A/S simultanés en garde = " + pire);
});

test("binôme TWE : même médecin au tour samedi et dimanche", () => {
  // 2026-06-13 = samedi, 2026-06-14 = dimanche.
  const sam = resR.shifts.find((s) => s.date === "2026-06-13" && s.shift_type === "twe");
  const dim = resR.shifts.find((s) => s.date === "2026-06-14" && s.shift_type === "twe");
  assert(sam && dim, "tour manquant samedi ou dimanche");
  assert.strictEqual(sam.doctor_id, dim.doctor_id, "TWE sam=" + sam.doctor_id + " dim=" + dim.doctor_id);
});

test("validerPlanning détecte 2 A/S injectés en garde", () => {
  const shifts = [
    { date: "2026-06-01", shift_type: "garde_24h", doctor_id: "assistant_specialiste1", poste: "usi1" },
    { date: "2026-06-01", shift_type: "garde_nuit", doctor_id: "assistant_specialiste2", poste: null },
  ];
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts, medecins: medsR, preferences: [] });
  assert(conflits.some((c) => /2 A\/S ensemble/.test(c.message)), "2 A/S non détecté");
});

test("validerPlanning détecte > 3 gardes dans une semaine", () => {
  const shifts = [
    { date: "2026-06-01", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
    { date: "2026-06-02", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
    { date: "2026-06-03", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
    { date: "2026-06-04", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
  ];
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts, medecins: medsR, preferences: [] });
  assert(conflits.some((c) => /max 3/.test(c.message)), "dépassement gardes/semaine non détecté");
});

test("aucun médecin ne dépasse 2 week-ends sur le mois généré", () => {
  // Week-end = samedi/dimanche travaillé en garde 24h ou tour (clé = samedi).
  const wkmois = {};
  resR.shifts.forEach((s) => {
    if (s.shift_type !== "garde_24h" && s.shift_type !== "twe") return;
    const x = new Date(s.date + "T00:00:00Z");
    const j = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
    if (j !== 6 && j !== 7) return;
    const key = j === 6 ? s.date : (() => { x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); })();
    (wkmois[s.doctor_id] = wkmois[s.doctor_id] || new Set()).add(key);
  });
  const max = Math.max(0, ...Object.values(wkmois).map((set) => set.size));
  assert(max <= 2, "max week-ends/mois = " + max);
});

test("validerPlanning signale > 2 week-ends dans le mois", () => {
  const shifts = [
    { date: "2026-06-06", shift_type: "garde_24h", doctor_id: "resident1", poste: null }, // we 1
    { date: "2026-06-13", shift_type: "garde_24h", doctor_id: "resident1", poste: null }, // we 2
    { date: "2026-06-20", shift_type: "twe", doctor_id: "resident1", poste: null },        // we 3
  ];
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts, medecins: medsR, preferences: [] });
  assert(conflits.some((c) => /week-ends travaillés/.test(c.message)), "dépassement week-ends non signalé");
});

console.log("\n--- " + reussis + "/" + total + " tests réussis ---\n");
process.exit(reussis === total ? 0 : 1);
