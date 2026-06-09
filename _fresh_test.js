const assert = require("assert");
const { genererPlanning, genererTrimestre, genererOffClinic, validerPlanning, compterParMedecin } = require("./planning.js");
let reussis = 0, total = 0;
function test(nom, fn) {
  total++;
  try { fn(); reussis++; console.log("  ✅ " + nom); }
  catch (e) { console.log("  ❌ " + nom + "\n     " + e.message); }
}
function equipe() {
  const meds = [];
  const ajouter = (n, grade) => {
    for (let i = 1; i <= n; i++) {
      meds.push({ id: grade + i, name: grade + i, grade, fte: 1, weekly_hours_target: 52,
        contract_start: null, contract_end: null, jours_travailles: [1, 2, 3, 4, 5, 6, 7] });
    }
  };
  ajouter(6, "resident"); ajouter(4, "assistant_specialiste"); ajouter(4, "specialiste");
  return meds;
}
console.log("\n=== Module 5 — genererPlanning ===");
const meds = equipe();
const res = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
test("génère des shifts", () => assert(res.shifts.length > 0, "aucun shift généré"));
test("chaque jour de semaine a 7 stations distinctes", () => {
  const parDate = {};
  res.shifts.forEach((s) => { (parDate[s.date] = parDate[s.date] || []).push(s); });
  const stations = (parDate["2026-06-01"] || []).filter((s) => s.poste).map((s) => s.poste);
  assert.strictEqual(new Set(stations).size, 7, "stations=" + new Set(stations).size);
});
test("nuit de semaine : ≥2 gardes dont ≥1 résident", () => {
  const duJour = res.shifts.filter((s) => s.date === "2026-06-01");
  const gardes = duJour.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h");
  assert(gardes.length >= 2, "gardes nuit < 2");
  assert(gardes.filter((s) => /^resident/.test(s.doctor_id)).length >= 1, "aucun résident");
});
console.log("\n=== Module 6 — validerPlanning ===");
test("planning généré : pas de double affectation", () => {
  const c = validerPlanning({ annee: 2026, mois: 6, shifts: res.shifts, medecins: meds, preferences: [] });
  assert.strictEqual(c.filter((x) => /double affectation/.test(x.message)).length, 0);
});
test("détecte double affectation injectée", () => {
  const m = res.shifts.slice();
  const cible = res.shifts.find((s) => s.shift_type === "jour");
  m.push({ date: cible.date, shift_type: "twe", doctor_id: cible.doctor_id, poste: null });
  const c = validerPlanning({ annee: 2026, mois: 6, shifts: m, medecins: meds, preferences: [] });
  assert(c.some((x) => /double affectation/.test(x.message)));
});
test("détecte station manquante", () => {
  const cible = res.shifts.find((s) => s.date === "2026-06-01" && s.shift_type === "jour");
  const ss = res.shifts.filter((s) => s !== cible);
  const c = validerPlanning({ annee: 2026, mois: 6, shifts: ss, medecins: meds, preferences: [] });
  assert(c.some((x) => x.date === "2026-06-01" && /stations pourvues/.test(x.message)));
});
test("détecte congé non respecté", () => {
  const cible = res.shifts.find((s) => s.shift_type === "jour");
  const prefs = [{ doctor_id: cible.doctor_id, start_date: cible.date, end_date: cible.date, pref_type: "conge_annuel" }];
  const c = validerPlanning({ annee: 2026, mois: 6, shifts: res.shifts, medecins: meds, preferences: prefs });
  assert(c.some((x) => /congé .* indisponibilité/.test(x.message)));
});
test("détecte non-respect repos 12h", () => {
  const shifts = [
    { date: "2026-06-01", shift_type: "garde_24h", doctor_id: "resident1", poste: "usi1" },
    { date: "2026-06-02", shift_type: "jour", doctor_id: "resident1", poste: "usi1" }];
  const c = validerPlanning({ annee: 2026, mois: 6, shifts, medecins: meds, preferences: [] });
  assert(c.some((x) => /repos 12h/.test(x.message)));
});
console.log("\n=== compterParMedecin ===");
test("compte heures/gardes/week-ends", () => {
  const shifts = [
    { date: "2026-06-01", shift_type: "jour", doctor_id: "x", poste: "usi1" },
    { date: "2026-06-06", shift_type: "garde_24h", doctor_id: "x", poste: null }];
  const st = compterParMedecin(shifts);
  assert.strictEqual(st.x.heures, 34.5); assert.strictEqual(st.x.gardes, 1); assert.strictEqual(st.x.weekends, 1);
});
console.log("\n=== Module 7 — genererTrimestre (équité) ===");
const medsT = equipe();
const resT = genererTrimestre({ annee: 2026, trimestre: 3, medecins: medsT, preferences: [] });
test("génère les 3 mois", () => {
  assert.deepStrictEqual(resT.mois, [7, 8, 9]);
  const mv = new Set(resT.shifts.map((s) => s.date.slice(5, 7)));
  ["07", "08", "09"].forEach((m) => assert(mv.has(m)));
});
test("contraintes dures sur tout le trimestre", () => {
  let n = 0;
  resT.mois.forEach((mois) => {
    const sm = resT.shifts.filter((s) => s.date.slice(5, 7) === String(mois).padStart(2, "0"));
    n += validerPlanning({ annee: 2026, mois, shifts: sm, medecins: medsT, preferences: [] })
      .filter((c) => /double affectation|repos 12h|récup/.test(c.message)).length;
  });
  assert.strictEqual(n, 0, "violations dures=" + n);
});
test("équité gardes : écart max ≤ 2", () => {
  const g = resT.stats.map((s) => s.gardes);
  const e = Math.max(...g) - Math.min(...g);
  assert(e <= 2, "écart=" + e + " (" + g.join(",") + ")");
});
test("équité week-ends : écart max ≤ 2", () => {
  const w = resT.stats.map((s) => s.weekends);
  const e = Math.max(...w) - Math.min(...w);
  assert(e <= 2, "écart=" + e + " (" + w.join(",") + ")");
});
test("proportionnalité mi-temps", () => {
  const mp = equipe(); mp[0].fte = 0.5; mp[0].jours_travailles = [1, 2, 3];
  const r = genererTrimestre({ annee: 2026, trimestre: 3, medecins: mp, preferences: [] });
  const mi = r.stats.find((s) => s.id === "resident1").gardes;
  const au = r.stats.filter((s) => /^resident/.test(s.id) && s.id !== "resident1").map((s) => s.gardes);
  assert(mi <= au.reduce((a, b) => a + b, 0) / au.length, "mi=" + mi);
});
console.log("\n=== Module 8 — Règles dures ===");
const medsR = equipe();
const resR = genererPlanning({ annee: 2026, mois: 6, medecins: medsR, preferences: [] });
function isoLundi(d) { const x = new Date(d + "T00:00:00Z"); const j = x.getUTCDay() === 0 ? 7 : x.getUTCDay(); x.setUTCDate(x.getUTCDate() - (j - 1)); return x.toISOString().slice(0, 10); }
test("≤ 3 gardes/semaine", () => {
  const ps = {};
  resR.shifts.forEach((s) => { if (s.shift_type !== "garde_nuit" && s.shift_type !== "garde_24h") return; const k = s.doctor_id + "|" + isoLundi(s.date); ps[k] = (ps[k] || 0) + 1; });
  assert(Math.max(0, ...Object.values(ps)) <= 3);
});
test("jamais 2 A/S en garde", () => {
  const pd = {}; resR.shifts.forEach((s) => { (pd[s.date] = pd[s.date] || []).push(s); });
  let pire = 0; Object.keys(pd).forEach((d) => { const as = pd[d].filter((s) => (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h") && /^assistant_specialiste/.test(s.doctor_id)); pire = Math.max(pire, as.length); });
  assert(pire < 2, "A/S simultanés=" + pire);
});
test("binôme TWE sam=dim", () => {
  const sam = resR.shifts.find((s) => s.date === "2026-06-13" && s.shift_type === "twe");
  const dim = resR.shifts.find((s) => s.date === "2026-06-14" && s.shift_type === "twe");
  assert(sam && dim); assert.strictEqual(sam.doctor_id, dim.doctor_id);
});
test("validerPlanning détecte 2 A/S injectés", () => {
  const shifts = [
    { date: "2026-06-01", shift_type: "garde_24h", doctor_id: "assistant_specialiste1", poste: "usi1" },
    { date: "2026-06-01", shift_type: "garde_nuit", doctor_id: "assistant_specialiste2", poste: null }];
  assert(validerPlanning({ annee: 2026, mois: 6, shifts, medecins: medsR, preferences: [] }).some((c) => /2 A\/S ensemble/.test(c.message)));
});
test("validerPlanning détecte > 3 gardes/semaine", () => {
  const shifts = [
    { date: "2026-06-01", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
    { date: "2026-06-02", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
    { date: "2026-06-03", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
    { date: "2026-06-04", shift_type: "garde_nuit", doctor_id: "resident1", poste: null }];
  assert(validerPlanning({ annee: 2026, mois: 6, shifts, medecins: medsR, preferences: [] }).some((c) => /max 3/.test(c.message)));
});
test("≤ 2 week-ends/mois généré", () => {
  const wk = {};
  resR.shifts.forEach((s) => { if (s.shift_type !== "garde_24h" && s.shift_type !== "twe") return; const x = new Date(s.date + "T00:00:00Z"); const j = x.getUTCDay() === 0 ? 7 : x.getUTCDay(); if (j !== 6 && j !== 7) return; const key = j === 6 ? s.date : (() => { x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); })(); (wk[s.doctor_id] = wk[s.doctor_id] || new Set()).add(key); });
  assert(Math.max(0, ...Object.values(wk).map((s) => s.size)) <= 2, "max we=" + Math.max(0, ...Object.values(wk).map((s) => s.size)));
});
test("validerPlanning signale > 2 week-ends/mois", () => {
  const shifts = [
    { date: "2026-06-06", shift_type: "garde_24h", doctor_id: "resident1", poste: null },
    { date: "2026-06-13", shift_type: "garde_24h", doctor_id: "resident1", poste: null },
    { date: "2026-06-20", shift_type: "twe", doctor_id: "resident1", poste: null }];
  assert(validerPlanning({ annee: 2026, mois: 6, shifts, medecins: medsR, preferences: [] }).some((c) => /week-ends travaillés/.test(c.message)));
});
console.log("\n=== Module 11 — Off-clinic ===");
test("résident dépendant sans absence : 2 jours", () => {
  const r = { id: "resident1", grade: "resident", statut: "dependant", fte: 1, jours_travailles: [1, 2, 3, 4, 5], contract_start: null, contract_end: null };
  const offs = genererOffClinic({ annee: 2026, mois: 6, medecins: [r], shifts: [], preferences: [] });
  assert.strictEqual(offs.length, 2);
});
test("pas pour A/S ni indépendant", () => {
  const as = { id: "as1", grade: "assistant_specialiste", statut: "dependant", jours_travailles: [1, 2, 3, 4, 5] };
  const indep = { id: "ri", grade: "resident", statut: "independant", jours_travailles: [1, 2, 3, 4, 5] };
  assert.strictEqual(genererOffClinic({ annee: 2026, mois: 6, medecins: [as, indep], shifts: [], preferences: [] }).length, 0);
});
console.log("\n--- " + reussis + "/" + total + " tests réussis ---\n");
process.exit(reussis === total ? 0 : 1);
