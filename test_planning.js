/* =====================================================================
   Tests Node — planning.js (Modules 5 & 6)
   Lancer :  node test_planning.js
   Aucune dépendance externe (assert intégré). Sortie lisible.
   ===================================================================== */

const assert = require("assert");
const { genererPlanning, genererTrimestre, genererOffClinic, validerPlanning, compterParMedecin } = require("./planning.js");

let reussis = 0, total = 0;
function test(nom, fn) {
  total++;
  try { fn(); reussis++; console.log("  ✅ " + nom); }
  catch (e) { console.log("  ❌ " + nom + "\n     " + e.message); }
}

/* --- Équipe de test : 6 résidents + 8 A/S = 14 médecins ---
   (Le grade « Spécialiste » a été supprimé : les ex-spécialistes sont des A/S.) --- */
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
  ajouter(8, "assistant_specialiste");
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

/* ÉQUITÉ ÉVALUÉE PAR GRADE — un résident est OBLIGATOIRE sur le 1er créneau de
   chaque nuit (règle dure). Avec moins de résidents (6) que d'A/S (8), les
   résidents portent MÉCANIQUEMENT plus de gardes/week-ends : l'écart inter-grade
   est structurel et incompressible (plancher ≈ nb_nuits / nb_résidents). La
   comparaison pertinente est donc INTRA-grade (résidents entre eux, A/S entre
   eux). Voir FEUILLE_DE_ROUTE.md (points ouverts). */
function ecartParGrade(stats, prefixe, cle) {
  const v = stats.filter((s) => s.id.startsWith(prefixe)).map((s) => s[cle]);
  return { ecart: Math.max(...v) - Math.min(...v), v };
}

test("équité gardes INTRA-grade : résidents entre eux (écart ≤ 2)", () => {
  const r = ecartParGrade(resT.stats, "resident", "gardes");
  assert(r.ecart <= 2, "écart gardes résidents = " + r.ecart + " (" + r.v.join(",") + ")");
});

test("équité gardes INTRA-grade : A/S entre eux (écart ≤ 2)", () => {
  const r = ecartParGrade(resT.stats, "assistant_specialiste", "gardes");
  assert(r.ecart <= 2, "écart gardes A/S = " + r.ecart + " (" + r.v.join(",") + ")");
});

test("équité week-ends INTRA-grade : A/S entre eux (écart ≤ 2)", () => {
  const r = ecartParGrade(resT.stats, "assistant_specialiste", "weekends");
  assert(r.ecart <= 2, "écart week-ends A/S = " + r.ecart + " (" + r.v.join(",") + ")");
});

test("équité week-ends résidents : dispersion bornée (écart ≤ 4, structurel)", () => {
  // Les 6 résidents couvrent le créneau « ≥1 résident » de CHAQUE jour de
  // week-end → charge plus lourde et un peu plus dispersée (irréductible).
  const r = ecartParGrade(resT.stats, "resident", "weekends");
  assert(r.ecart <= 4, "écart week-ends résidents = " + r.ecart + " (" + r.v.join(",") + ")");
});

test("gardes indépendantes du FTE : un mi-temps présent tous les jours ≈ autant de gardes", () => {
  const medsP = equipe();
  medsP[0].fte = 0.5;                     // resident1 à mi-temps MAIS présent tous les jours
  // jours_travailles inchangé (présence identique aux autres) → mêmes gardes attendues.
  const r = genererTrimestre({ annee: 2026, trimestre: 3, medecins: medsP, preferences: [] });
  const mi = r.stats.find((s) => s.id === "resident1").gardes;
  const autres = r.stats.filter((s) => /^resident/.test(s.id) && s.id !== "resident1").map((s) => s.gardes);
  const moyAutres = autres.reduce((a, b) => a + b, 0) / autres.length;
  // Le FTE ne doit PLUS réduire les gardes : écart faible attendu (≤ 2).
  assert(Math.abs(mi - moyAutres) <= 2, "mi-temps gardes=" + mi + " vs moyenne résidents=" + moyAutres.toFixed(1) + " (devrait être ~égal)");
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

test("week-ends/mois généré : A/S ≤ 2 (plafond N2) ; résidents ≤ 3 (structurel)", () => {
  // Week-end = samedi/dimanche travaillé en garde 24h ou tour (clé = samedi).
  // Le plafond souple « 2 week-ends/mois » est tenu par les A/S ; les résidents
  // peuvent monter à 3 car ils doivent couvrir le créneau résident de chaque
  // jour de week-end (effectif résident restreint).
  const wkmois = {};
  resR.shifts.forEach((s) => {
    if (s.shift_type !== "garde_24h" && s.shift_type !== "twe") return;
    const x = new Date(s.date + "T00:00:00Z");
    const j = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
    if (j !== 6 && j !== 7) return;
    const key = j === 6 ? s.date : (() => { x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); })();
    (wkmois[s.doctor_id] = wkmois[s.doctor_id] || new Set()).add(key);
  });
  Object.keys(wkmois).forEach((id) => {
    const n = wkmois[id].size;
    if (/^assistant_specialiste/.test(id)) assert(n <= 2, "A/S " + id + " = " + n + " week-ends (max 2 attendu)");
    else assert(n <= 3, "résident " + id + " = " + n + " week-ends (seuil structurel 3)");
  });
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

console.log("\n=== Module 11 — Off-clinic (§9) ===");

test("off-clinic : un résident dépendant sans absence reçoit 2 jours", () => {
  const r = { id: "resident1", name: "R1", grade: "resident", statut: "dependant",
    fte: 1, jours_travailles: [1, 2, 3, 4, 5], contract_start: null, contract_end: null };
  // Aucun shift, aucune absence → 0 absence → droit = 2.
  const offs = genererOffClinic({ annee: 2026, mois: 6, medecins: [r], shifts: [], preferences: [] });
  assert.strictEqual(offs.length, 2, "off-clinic posés = " + offs.length);
  assert(offs.every((o) => o.shift_type === "off"), "type incorrect");
  // Jamais le week-end.
  assert(offs.every((o) => {
    const d = new Date(o.date + "T00:00:00Z").getUTCDay();
    return d !== 0 && d !== 6;
  }), "off-clinic posé un week-end");
});

test("off-clinic : pas pour un A/S ni un indépendant", () => {
  const as = { id: "as1", grade: "assistant_specialiste", statut: "dependant", jours_travailles: [1,2,3,4,5] };
  const indep = { id: "ri", grade: "resident", statut: "independant", jours_travailles: [1,2,3,4,5] };
  const offs = genererOffClinic({ annee: 2026, mois: 6, medecins: [as, indep], shifts: [], preferences: [] });
  assert.strictEqual(offs.length, 0, "off-clinic indûment posés = " + offs.length);
});

test("off-clinic : droit réduit à 1 si 5–9 jours d'absence", () => {
  const r = { id: "r5", grade: "resident", statut: "dependant", jours_travailles: [1,2,3,4,5] };
  // 5 congés en semaine (1→5 juin = lun-ven).
  const prefs = [{ doctor_id: "r5", start_date: "2026-06-01", end_date: "2026-06-05", pref_type: "conge_annuel" }];
  const offs = genererOffClinic({ annee: 2026, mois: 6, medecins: [r], shifts: [], preferences: prefs });
  assert.strictEqual(offs.length, 1, "droit attendu 1, obtenu " + offs.length);
});

test("off-clinic : jamais la veille ni le lendemain d'une garde", () => {
  const r = { id: "rg", grade: "resident", statut: "dependant", jours_travailles: [1,2,3,4,5] };
  // Garde le mercredi 3/6 → mardi 2 (veille) et jeudi 4 (lendemain) interdits.
  const shifts = [{ date: "2026-06-03", shift_type: "garde_nuit", doctor_id: "rg", poste: null }];
  const offs = genererOffClinic({ annee: 2026, mois: 6, medecins: [r], shifts, preferences: [] });
  const interdits = ["2026-06-02", "2026-06-03", "2026-06-04"];
  assert(offs.every((o) => !interdits.includes(o.date)), "off-clinic posé sur jour interdit : " + offs.map((o) => o.date).join(","));
});

test("off-clinic crédité comme heures de travail (10,5 h)", () => {
  const stats = compterParMedecin([{ date: "2026-06-02", shift_type: "off", doctor_id: "x", poste: null }]);
  assert.strictEqual(stats.x.heures, 10.5, "heures off-clinic = " + stats.x.heures);
});

console.log("\n=== Point 4 — Souhaits (désidératas « je veux travailler ») ===");

const ABSENCES_TEST = ["recup", "repos_garde", "off", "conge_annuel", "conge_scientifique", "conge_extralegal"];

test("indépendant : souhait de travailler honoré (quasi-bloquant)", () => {
  const meds = equipe();
  const ind = meds.find((m) => m.id === "assistant_specialiste8"); ind.statut = "independant";
  const prefs = [
    { doctor_id: ind.id, start_date: "2026-06-08", end_date: "2026-06-08", pref_type: "dispo" },
    { doctor_id: ind.id, start_date: "2026-06-08", end_date: "2026-06-08", pref_type: "souhait" },
  ];
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: prefs });
  const w = r.shifts.filter((s) => s.doctor_id === ind.id && s.date === "2026-06-08" && !ABSENCES_TEST.includes(s.shift_type));
  assert(w.length >= 1, "indépendant non planifié son jour de souhait");
});

test("indépendant résident : souhait de garde honoré", () => {
  const meds = equipe();
  const ind = meds.find((m) => m.id === "resident6"); ind.statut = "independant";
  const prefs = [
    { doctor_id: ind.id, start_date: "2026-06-08", end_date: "2026-06-08", pref_type: "dispo" },
    { doctor_id: ind.id, start_date: "2026-06-08", end_date: "2026-06-08", pref_type: "souhait" },
  ];
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: prefs });
  const w = r.shifts.filter((s) => s.doctor_id === ind.id && s.date === "2026-06-08" && !ABSENCES_TEST.includes(s.shift_type));
  assert(w.length >= 1, "résident indépendant non planifié son jour de souhait");
});

test("dépendant : souhait souple, n'enfreint pas les contraintes dures", () => {
  const meds = equipe();
  const prefs = [{ doctor_id: "resident1", start_date: "2026-06-10", end_date: "2026-06-10", pref_type: "souhait" }];
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: prefs });
  const ce = r.shifts.filter((s) => s.doctor_id === "resident1" && s.date === "2026-06-10");
  assert(ce.length <= 1, "double affectation suite au souhait");
});

console.log("\n--- " + reussis + "/" + total + " tests réussis ---\n");
process.exit(reussis === total ? 0 : 1);
