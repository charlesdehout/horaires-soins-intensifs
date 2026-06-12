/* =====================================================================
   Tests Node — planning.js (Modules 5 & 6)
   Lancer :  node test_planning.js
   Aucune dépendance externe (assert intégré). Sortie lisible.
   ===================================================================== */

const assert = require("assert");
const { genererPlanning, genererTrimestre, genererOffClinic, validerPlanning, compterParMedecin, plTrier, alertesAbsences, validerEchange } = require("./planning.js");

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

test("nuit de semaine confortable : 2 gardes 17h–9h, pas de 24h imposée (N3)", () => {
  // Équipe complète, 1er jour (aucune absence, aucun repos) → le vivier de jour
  // pourvoit les 7 stations sans promouvoir personne en 24 h. La garde 24 h de
  // semaine n'est plus obligatoire : les 2 gardes arrivent à 17h (garde_nuit).
  const duJour = res.shifts.filter((s) => s.date === "2026-06-01");
  const g24 = duJour.filter((s) => s.shift_type === "garde_24h");
  const gNuit = duJour.filter((s) => s.shift_type === "garde_nuit");
  assert.strictEqual(g24.length, 0, "garde 24h imposée alors que non nécessaire : " + g24.length);
  assert.strictEqual(gNuit.length, 2, "gardes de nuit 17h–9h attendues = 2, obtenu " + gNuit.length);
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

test("off-clinic : reporté si le jour atteint le plafond d'absences simultanées (§14)", () => {
  const r = { id: "rp", grade: "resident", statut: "dependant", jours_travailles: [1,2,3,4,5] };
  // 5 autres médecins absents le lundi 1/6 → +1 off = 6 (critique) → jour saturé.
  const prefs = [1,2,3,4,5].map((n) =>
    ({ doctor_id: "x" + n, start_date: "2026-06-01", end_date: "2026-06-01", pref_type: "conge_annuel" }));
  const offs = genererOffClinic({ annee: 2026, mois: 6, medecins: [r], shifts: [], preferences: prefs });
  assert.strictEqual(offs.length, 2, "droit préservé par report, obtenu " + offs.length);
  assert(offs.every((o) => o.date !== "2026-06-01"), "off-clinic posé sur un jour saturé");
});

test("off-clinic : à capacité limitée, le résident avec le plus de congés cède en premier (N3)", () => {
  const r1 = { id: "r1", grade: "resident", statut: "dependant", jours_travailles: [1] }; // 0 congé
  const r2 = { id: "r2", grade: "resident", statut: "dependant", jours_travailles: [1] }; // 1 congé
  const prefs = [
    { doctor_id: "r2", start_date: "2026-06-02", end_date: "2026-06-02", pref_type: "conge_annuel" },
  ];
  // Sature les lundis 8/15/22/29 → seul le lundi 1/6 reste libre. Avec 2 résidents
  // et min_residents_dispo=1, un seul des deux peut y poser un off-clinic.
  ["2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"].forEach((d) => {
    [1,2,3,4,5].forEach((n) => prefs.push({ doctor_id: "x" + d + n, start_date: d, end_date: d, pref_type: "conge_annuel" }));
  });
  const offs = genererOffClinic({ annee: 2026, mois: 6, medecins: [r1, r2], shifts: [], preferences: prefs });
  const r1offs = offs.filter((o) => o.doctor_id === "r1");
  const r2offs = offs.filter((o) => o.doctor_id === "r2");
  assert.strictEqual(r2offs.length, 0, "le résident avec le plus de congés aurait dû céder, obtenu " + r2offs.length);
  assert(r1offs.length >= 1 && r1offs.every((o) => o.date === "2026-06-01"), "r1 (moins de congés) devait obtenir le lundi 1/6");
});

console.log("\n=== Point 4 — Souhaits (désidératas « je veux travailler ») ===");

const ABSENCES_TEST = ["recup", "repos_garde", "off", "conge_annuel", "conge_scientifique", "conge_extralegal"];

test("souhait (garde) : à équité égale, le souhaiteur passe pour la garde", () => {
  const D = "2026-06-10";
  const A = { id: "A", weekly_hours_target: 52 };
  const B = { id: "B", weekly_hours_target: 52 };
  const etat = { nbGardes: { A: 0, B: 0 }, heures: { A: 0, B: 0 },
    souhait: { A: new Set([D]), B: new Set() }, eviterGarde: { A: new Set(), B: new Set() } };
  assert.strictEqual(plTrier([B, A], "garde", etat, D)[0].id, "A", "souhaiteur (garde) non prioritaire à équité égale");
});

test("indisponibilité (garde) : à équité égale, on évite le médecin indispo", () => {
  const D = "2026-06-10";
  const A = { id: "A", weekly_hours_target: 52 };
  const B = { id: "B", weekly_hours_target: 52 };
  const etat = { nbGardes: { A: 0, B: 0 }, heures: { A: 0, B: 0 },
    souhait: { A: new Set(), B: new Set() }, eviterGarde: { A: new Set([D]), B: new Set() } };
  assert.strictEqual(plTrier([A, B], "garde", etat, D)[0].id, "B", "le médecin indispo (garde) n'a pas été évité");
});

test("souhait/indispo n'agissent PAS sur les journées (jour)", () => {
  const D = "2026-06-10";
  const A = { id: "A", weekly_hours_target: 52 };
  const B = { id: "B", weekly_hours_target: 52 };
  // A souhaite, mais est plus chargé en heures : en 'jour', le souhait est ignoré
  // → l'équité horaire prime (B moins chargé passe devant).
  const etat = { nbGardes: { A: 0, B: 0 }, heures: { A: 5, B: 0 },
    souhait: { A: new Set([D]), B: new Set() }, eviterGarde: { A: new Set(), B: new Set() } };
  assert.strictEqual(plTrier([A, B], "jour", etat, D)[0].id, "B", "le souhait a influencé une journée (interdit)");
});

test("souhait (garde) souple : n'enfreint pas les contraintes dures (pas de double)", () => {
  const meds = equipe();
  const prefs = [{ doctor_id: "resident1", start_date: "2026-06-10", end_date: "2026-06-10", pref_type: "souhait" }];
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: prefs });
  const ce = r.shifts.filter((s) => s.doctor_id === "resident1" && s.date === "2026-06-10");
  assert(ce.length <= 1, "double affectation suite au souhait");
});

console.log("\n=== Module 17 — Congrès & fermetures d'unités ===");

test("fermeture : la station fermée n'est ni pourvue ni exigée", () => {
  const meds = equipe();
  const periodes = [{ type: "fermeture", unite: "usi4", start_date: "2026-06-01", end_date: "2026-06-05", label: "test" }];
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [], periodes });
  // Aucun shift posé sur usi4 pendant la fermeture (lun 1er → ven 5 juin).
  const surFermee = r.shifts.filter((s) => s.poste === "usi4" && s.date >= "2026-06-01" && s.date <= "2026-06-05");
  assert.strictEqual(surFermee.length, 0, "shifts posés sur l'unité fermée : " + surFermee.length);
  // Pas de conflit de couverture pendant la fermeture (6 postes suffisent).
  const conf = r.conflits.filter((c) => c.date >= "2026-06-01" && c.date <= "2026-06-05" && /postes pourvus/.test(c.message));
  assert.strictEqual(conf.length, 0, "conflits de couverture pendant la fermeture : " + conf.length);
  // usi4 à nouveau pourvue après la réouverture (lundi 8 juin).
  const apres = r.shifts.filter((s) => s.poste === "usi4" && s.date === "2026-06-08");
  assert(apres.length >= 1, "usi4 non pourvue après réouverture");
});

test("validerPlanning : unité fermée non exigée, mais affectation dessus signalée", () => {
  const meds = equipe();
  const periodes = [{ type: "fermeture", unite: "usi1", start_date: "2026-06-01", end_date: "2026-06-01" }];
  // Lundi 1er juin : 6 stations pourvues (sans usi1) + nuit conforme.
  const shifts = [
    { date: "2026-06-01", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
    { date: "2026-06-01", shift_type: "garde_24h", doctor_id: "resident2", poste: "usi2" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "resident3", poste: "usi3" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "resident4", poste: "usi4" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "resident5", poste: "usi5" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "assistant_specialiste1", poste: "bordet" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "assistant_specialiste2", poste: "labo_choc" },
  ];
  const ok = validerPlanning({ annee: 2026, mois: 6, shifts, medecins: meds, preferences: [], periodes });
  assert(!ok.some((c) => c.date === "2026-06-01" && /stations pourvues/.test(c.message)),
    "station fermée indûment exigée");
  // Affectation manuelle sur l'unité fermée → conflit signalé.
  const avec = shifts.concat([{ date: "2026-06-01", shift_type: "jour", doctor_id: "assistant_specialiste3", poste: "usi1" }]);
  const ko = validerPlanning({ annee: 2026, mois: 6, shifts: avec, medecins: meds, preferences: [], periodes });
  assert(ko.some((c) => /unité est fermée/.test(c.message)), "affectation sur unité fermée non signalée");
});

test("congrès en semaine : jusqu'à 2 stations vides tolérées (§3.2)", () => {
  const meds = equipe();
  const periodes = [{ type: "congres", start_date: "2026-06-01", end_date: "2026-06-04", label: "ISICEM" }];
  // 5/7 stations + nuit conforme : toléré pendant le congrès…
  const base = [
    { date: "2026-06-01", shift_type: "garde_nuit", doctor_id: "resident1", poste: null },
    { date: "2026-06-01", shift_type: "garde_24h", doctor_id: "resident2", poste: "usi1" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "resident3", poste: "usi2" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "resident4", poste: "usi3" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "resident5", poste: "usi4" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "assistant_specialiste1", poste: "usi5" },
  ];
  const ok = validerPlanning({ annee: 2026, mois: 6, shifts: base, medecins: meds, preferences: [], periodes });
  assert(!ok.some((c) => c.date === "2026-06-01" && /stations pourvues/.test(c.message)),
    "2 stations vides indûment signalées pendant le congrès");
  // …mais 4/7 (3 vides) dépasse la tolérance → conflit.
  const moins = base.filter((s) => s.poste !== "usi5");
  const ko = validerPlanning({ annee: 2026, mois: 6, shifts: moins, medecins: meds, preferences: [], periodes });
  assert(ko.some((c) => c.date === "2026-06-01" && /stations pourvues/.test(c.message)),
    "dépassement de la tolérance congrès non signalé");
  // Et hors congrès, 5/7 reste bien un conflit (rien d'assoupli).
  const sans = validerPlanning({ annee: 2026, mois: 6, shifts: base, medecins: meds, preferences: [] });
  assert(sans.some((c) => c.date === "2026-06-01" && /stations pourvues/.test(c.message)),
    "couverture normale indûment assouplie hors congrès");
});

test("congrès un week-end : règles week-end inchangées (priorité week-end)", () => {
  const meds = equipe();
  const periodes = [{ type: "congres", start_date: "2026-06-13", end_date: "2026-06-14", label: "ISICARE" }]; // sam-dim
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [], periodes });
  const sam = r.shifts.filter((s) => s.date === "2026-06-13");
  assert.strictEqual(sam.filter((s) => s.shift_type === "garde_24h").length, 2, "gardes 24h ≠ 2 le samedi de congrès");
  assert.strictEqual(sam.filter((s) => s.shift_type === "twe").length, 1, "TWE ≠ 1 le samedi de congrès");
});

test("congrès en SEMAINE : équipe minimale → les 2 gardes de nuit forcées en 24h", () => {
  const meds = equipe();
  const periodes = [{ type: "congres", start_date: "2026-06-01", end_date: "2026-06-05", label: "ISICEM" }]; // lun→ven
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [], periodes });
  const duJour = r.shifts.filter((s) => s.date === "2026-06-01"); // lundi de congrès
  const g24 = duJour.filter((s) => s.shift_type === "garde_24h");
  const gNuit = duJour.filter((s) => s.shift_type === "garde_nuit");
  assert.strictEqual(g24.length, 2, "2 gardes 24h attendues en congrès, obtenu " + g24.length);
  assert.strictEqual(gNuit.length, 0, "garde de nuit 17h–9h indue en congrès, obtenu " + gNuit.length);
  assert(g24.some((s) => /^resident/.test(s.doctor_id)), "≥1 résident requis parmi les gardes 24h");
  assert(!g24.every((s) => /^assistant_specialiste/.test(s.doctor_id)), "jamais 2 A/S en garde");
});

test("congrès : équité des JOURS DE CONGRÈS (répartition serrée des jours travaillés)", () => {
  const meds = equipe();
  const periodes = [{ type: "congres", start_date: "2026-06-01", end_date: "2026-06-05", label: "ISICEM" }]; // 5 jours
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [], periodes });
  const WORK = ["jour", "garde_nuit", "garde_24h", "twe"];
  const jours = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"];
  const compte = {}; meds.forEach((m) => { compte[m.id] = 0; });
  r.shifts.forEach((s) => { if (jours.includes(s.date) && WORK.includes(s.shift_type)) compte[s.doctor_id]++; });
  const vals = Object.values(compte);
  const ecart = Math.max(...vals) - Math.min(...vals);
  // Tout le monde doit travailler ~le même nombre de jours de congrès (donc avoir
  // ~le même nombre de jours LIBRES pour y aller). Répartition serrée attendue.
  assert(ecart <= 2, "jours de congrès travaillés trop déséquilibrés (écart " + ecart + ")");
});

console.log("\n=== Point 6 — Couplage des gardes (repos compensatoire couplé) ===");

test("couplage : nuit J-2 → garde 24h week-end → repos couplé matérialisé", () => {
  // Sur un mois généré, on cherche les couplages effectifs : un médecin qui fait
  // la garde de NUIT du jeudi (resp. vendredi) ET la garde 24 h du samedi (resp.
  // dimanche). Chaque couplage doit produire un repos_garde le lundi (resp.
  // mardi) suivant (jeudi+4 / vendredi+4), via materialiserReposCouples.
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: equipe(), preferences: [] });
  const parJour = {};
  r.shifts.forEach((s) => { (parJour[s.date] = parJour[s.date] || []).push(s); });
  const dow = (s) => { const j = new Date(s + "T00:00:00Z").getUTCDay(); return j === 0 ? 7 : j; };
  const add = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  let couplages = 0, reposOk = 0;
  Object.keys(parJour).forEach((d) => {
    const j = dow(d);
    if (j !== 4 && j !== 5) return; // jeudi / vendredi
    const nuit = (parJour[d] || []).find((s) => s.shift_type === "garde_nuit");
    if (!nuit) return;
    const we = add(d, 2); // samedi / dimanche
    const g24 = (parJour[we] || []).filter((s) => s.shift_type === "garde_24h").map((s) => s.doctor_id);
    if (!g24.includes(nuit.doctor_id)) return;
    couplages++;
    const repos = add(d, 4); // lundi / mardi
    if ((parJour[repos] || []).some((s) => s.shift_type === "repos_garde" && s.doctor_id === nuit.doctor_id)) reposOk++;
  });

  assert(couplages >= 1, "aucun couplage nuit→24h week-end détecté");
  assert.strictEqual(reposOk, couplages, "repos couplé manquant : " + reposOk + "/" + couplages);
});

console.log("\n=== Point 3 — Désidératas : priorité admin principal > secondaire > travailleur ===");

test("désidérata garde : à souhait égal, l'admin principal passe avant", () => {
  const D = "2026-06-02";
  const P = { id: "P", admin_level: "principal", weekly_hours_target: 52 };
  const T = { id: "T", admin_level: "aucun", weekly_hours_target: 52 };
  const etat = { nbGardes: { P: 0, T: 0 }, heures: { P: 0, T: 0 },
    souhait: { P: new Set([D]), T: new Set([D]) }, eviterGarde: { P: new Set(), T: new Set() } };
  assert.strictEqual(plTrier([T, P], "garde", etat, D)[0].id, "P", "principal non prioritaire");
});

test("désidérata garde : à souhait égal, le secondaire passe avant le travailleur", () => {
  const D = "2026-06-02";
  const S = { id: "S", admin_level: "secondaire", weekly_hours_target: 52 };
  const T = { id: "T", admin_level: "aucun", weekly_hours_target: 52 };
  const etat = { nbGardes: { S: 0, T: 0 }, heures: { S: 0, T: 0 },
    souhait: { S: new Set([D]), T: new Set([D]) }, eviterGarde: { S: new Set(), T: new Set() } };
  assert.strictEqual(plTrier([T, S], "garde", etat, D)[0].id, "S", "secondaire non prioritaire");
});

test("priorité désidératas n'agit QUE entre souhaiteurs (sinon l'équité prime)", () => {
  const D = "2026-06-02";
  const P = { id: "P", admin_level: "principal", weekly_hours_target: 52 };
  const T = { id: "T", admin_level: "aucun", weekly_hours_target: 52 };
  // Personne ne souhaite ce jour : le moins chargé (T) prime, le rang admin n'agit pas.
  const etat = { nbGardes: { P: 0, T: 0 }, heures: { P: 10, T: 0 },
    souhait: { P: new Set(), T: new Set() }, eviterGarde: { P: new Set(), T: new Set() } };
  assert.strictEqual(plTrier([P, T], "garde", etat, D)[0].id, "T", "le rang admin a écrasé l'équité à tort");
});

console.log("\n=== Module 18 — Récup férié (jour compensatoire bloquant) ===");

test("récup férié : une préférence recup_ferie rend le jour non planifiable", () => {
  const meds = equipe();
  const cible = "resident1";
  const D = "2026-06-03"; // mercredi (jour ouvré)
  const prefs = [{ doctor_id: cible, start_date: D, end_date: D, pref_type: "recup_ferie" }];
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: prefs });
  const travail = r.shifts.filter((s) => s.date === D && s.doctor_id === cible &&
    ["jour", "garde_nuit", "garde_24h", "twe"].includes(s.shift_type));
  assert.strictEqual(travail.length, 0, "médecin planifié malgré la récup férié approuvée");
});

console.log("\n=== §14 — Alertes absences simultanées ===");

function congesPour(ids, date) {
  return ids.map((id) => ({ doctor_id: id, start_date: date, end_date: date, pref_type: "conge_annuel" }));
}

test("§14 : 4 absences le même jour → alerte ATTENTION", () => {
  const D = "2026-06-10";
  const prefs = congesPour(["assistant_specialiste1", "assistant_specialiste2",
    "assistant_specialiste3", "assistant_specialiste4"], D);
  const al = alertesAbsences({ annee: 2026, mois: 6, medecins: equipe(), preferences: prefs, shifts: [] });
  const a = al.find((x) => x.date === D);
  assert(a && a.niveau === "attention", "attention non émise (4 absences)");
});

test("§14 : 6 absences le même jour → alerte CRITIQUE", () => {
  const D = "2026-06-10";
  const prefs = congesPour(["assistant_specialiste1", "assistant_specialiste2", "assistant_specialiste3",
    "assistant_specialiste4", "assistant_specialiste5", "assistant_specialiste6"], D);
  const al = alertesAbsences({ annee: 2026, mois: 6, medecins: equipe(), preferences: prefs, shifts: [] });
  assert(al.some((x) => x.date === D && x.niveau === "critique"), "critique non émise (6 absences)");
});

test("§14 : tous les résidents absents → alerte « aucun résident la nuit »", () => {
  const D = "2026-06-10";
  const prefs = congesPour(["resident1", "resident2", "resident3", "resident4", "resident5", "resident6"], D);
  const al = alertesAbsences({ annee: 2026, mois: 6, medecins: equipe(), preferences: prefs, shifts: [] });
  assert(al.some((x) => x.date === D && /aucun résident/i.test(x.message)), "alerte résident-nuit absente");
});

test("§14 : 3 absences → aucune alerte ce jour", () => {
  const D = "2026-06-10";
  const prefs = congesPour(["assistant_specialiste1", "assistant_specialiste2", "assistant_specialiste3"], D);
  const al = alertesAbsences({ annee: 2026, mois: 6, medecins: equipe(), preferences: prefs, shifts: [] });
  assert(!al.some((x) => x.date === D), "alerte indûment émise (3 absences)");
});

console.log("\n=== Module 19 — Pré-placements (shifts épinglés respectés) ===");

test("pré-placement semaine : station épinglée conservée, pas de doublon", () => {
  const D = "2026-06-03"; // mercredi
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: equipe(), preferences: [],
    prePlaces: [{ date: D, shift_type: "jour", doctor_id: "assistant_specialiste1", poste: "usi3" }] });
  const usi3 = r.shifts.filter((s) => s.date === D && s.poste === "usi3" && s.shift_type === "jour");
  assert.strictEqual(usi3.length, 1, "usi3 doit avoir 1 occupant");
  assert.strictEqual(usi3[0].doctor_id, "assistant_specialiste1", "pré-placement non conservé");
  const sien = r.shifts.filter((s) => s.date === D && s.doctor_id === "assistant_specialiste1"
    && ["jour", "garde_nuit", "garde_24h", "twe"].includes(s.shift_type));
  assert.strictEqual(sien.length, 1, "médecin pré-placé double-booké");
});

test("pré-placement semaine : garde de nuit épinglée respectée (2 gardes, ≥1 résident)", () => {
  const D = "2026-06-03";
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: equipe(), preferences: [],
    prePlaces: [{ date: D, shift_type: "garde_nuit", doctor_id: "resident5", poste: null }] });
  const g = r.shifts.filter((s) => s.date === D && (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h"));
  assert(g.some((s) => s.doctor_id === "resident5" && s.shift_type === "garde_nuit"), "garde épinglée perdue");
  assert.strictEqual(g.length, 2, "il faut exactement 2 gardes la nuit");
  assert(g.some((s) => /^resident/.test(s.doctor_id)), "≥1 résident requis");
});

test("pré-placement week-end : garde 24h épinglée conservée + ≥1 résident", () => {
  const SA = "2026-06-06"; // samedi
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: equipe(), preferences: [],
    prePlaces: [{ date: SA, shift_type: "garde_24h", doctor_id: "assistant_specialiste2", poste: null }] });
  const g = r.shifts.filter((s) => s.date === SA && s.shift_type === "garde_24h");
  assert(g.some((s) => s.doctor_id === "assistant_specialiste2"), "garde WE épinglée perdue");
  assert.strictEqual(g.length, 2, "2 gardes 24h le samedi");
  assert(g.some((s) => /^resident/.test(s.doctor_id)), "≥1 résident requis le WE");
});

console.log("\n=== Module 20 — Rotation trimestrielle (unité de référence) ===");

test("rotation : l'unité de référence sert de base à la continuité", () => {
  const meds = equipe().map((m) => m.id === "assistant_specialiste1"
    ? Object.assign({}, m, { unite_reference: "usi5" }) : m);
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  // Les DOUBLURES (plancher 40 h / nouvel engagé) ne sont pas des journées de
  // titulaire : la continuité ne s'applique qu'aux affectations normales.
  const jours = r.shifts.filter((s) => s.doctor_id === "assistant_specialiste1" && s.shift_type === "jour" && !s.doublure);
  assert(jours.length > 0, "le médecin ne fait aucune journée de station");
  assert(jours.every((s) => s.poste === "usi5"), "journées hors unité de référence : " +
    jours.filter((s) => s.poste !== "usi5").map((s) => s.date + ":" + s.poste).join(", "));
});

test("Labo de choc : pas d'ancrage (unité de référence Labo ignorée, rotation libre)", () => {
  // Unité de référence = Labo de choc : contrairement à usi5, le Labo ne doit
  // PAS fixer le médecin → il fait des journées sur d'AUTRES stations.
  const meds = equipe().map((m) => m.id === "assistant_specialiste1"
    ? Object.assign({}, m, { unite_reference: "labo_choc" }) : m);
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  const jours = r.shifts.filter((s) => s.doctor_id === "assistant_specialiste1" && s.shift_type === "jour");
  assert(jours.length > 0, "le médecin ne fait aucune journée de station");
  assert(jours.some((s) => s.poste !== "labo_choc"),
    "le Labo ne devrait pas fixer le médecin (toutes ses journées au Labo)");
});

console.log("\n=== Module 23 — Échange de shifts ===");

test("échange journée↔journée : valide, échange les médecins", () => {
  const shifts = [
    { id: "1", date: "2026-06-10", shift_type: "jour", doctor_id: "A", poste: "usi1" },
    { id: "2", date: "2026-06-11", shift_type: "jour", doctor_id: "B", poste: "usi2" },
  ];
  const r = validerEchange(shifts, "1", "2", []);
  assert(r.ok, "échange journée refusé à tort : " + r.message);
  const c1 = r.changes.find((c) => c.id === "1"), c2 = r.changes.find((c) => c.id === "2");
  assert.strictEqual(c1.doctor_id, "B", "shift 1 non transféré à B");
  assert.strictEqual(c2.doctor_id, "A", "shift 2 non transféré à A");
});

test("échange refusé entre natures différentes (garde vs journée)", () => {
  const shifts = [
    { id: "1", date: "2026-06-10", shift_type: "garde_nuit", doctor_id: "A", poste: null },
    { id: "2", date: "2026-06-11", shift_type: "jour", doctor_id: "B", poste: "usi2" },
  ];
  assert(!validerEchange(shifts, "1", "2", []).ok, "échange de natures différentes accepté à tort");
});

test("échange de garde refusé s'il crée 2 A/S la même nuit", () => {
  const meds = [
    { id: "R", grade: "resident" },
    { id: "AS1", grade: "assistant_specialiste" },
    { id: "AS2", grade: "assistant_specialiste" },
  ];
  const shifts = [
    { id: "g1", date: "2026-06-10", shift_type: "garde_nuit", doctor_id: "R", poste: null },
    { id: "g2", date: "2026-06-10", shift_type: "garde_24h", doctor_id: "AS1", poste: "usi1" },
    { id: "g3", date: "2026-06-11", shift_type: "garde_24h", doctor_id: "AS2", poste: "usi1" },
  ];
  // Échanger g1 (R) ↔ g3 (AS2) → la nuit du 10 aurait AS2 + AS1 = 2 A/S → refusé.
  assert(!validerEchange(shifts, "g1", "g3", meds).ok, "échange créant 2 A/S accepté à tort");
});

test("échange de garde : échange AUSSI le repos de garde", () => {
  const meds = [{ id: "R1", grade: "resident" }, { id: "R2", grade: "resident" }];
  const shifts = [
    { id: "g1", date: "2026-06-10", shift_type: "garde_nuit", doctor_id: "R1", poste: null },
    { id: "rp1", date: "2026-06-11", shift_type: "repos_garde", doctor_id: "R1", poste: null },
    { id: "g2", date: "2026-06-17", shift_type: "garde_nuit", doctor_id: "R2", poste: null },
    { id: "rp2", date: "2026-06-18", shift_type: "repos_garde", doctor_id: "R2", poste: null },
  ];
  const r = validerEchange(shifts, "g1", "g2", meds);
  assert(r.ok, "échange refusé à tort : " + r.message);
  const crp1 = r.changes.find((c) => c.id === "rp1");
  const crp2 = r.changes.find((c) => c.id === "rp2");
  assert(crp1 && crp1.doctor_id === "R2", "repos de g1 non transféré à R2");
  assert(crp2 && crp2.doctor_id === "R1", "repos de g2 non transféré à R1");
});

console.log("\n=== Règle repos — jour de semaine suivante UNIQUEMENT si gardes couplées ===");

test("repos : tout repos_garde de lundi/mardi est justifié (lendemain ou couplage)", () => {
  // RÈGLE (révision) : le lundi de repos exige jeudi+samedi gardés ; le mardi
  // exige vendredi+dimanche. Sinon, seul le repos du LENDEMAIN d'une garde
  // existe. On vérifie sur un mois généré que chaque repos_garde d'un lundi ou
  // mardi est justifié — et qu'aucune 24 h de week-end isolée n'ouvre de jour
  // de repos la semaine suivante.
  const meds = equipe();
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10); };
  const jour = (d) => { const j = new Date(d + "T00:00:00Z").getUTCDay(); return j === 0 ? 7 : j; };
  const gardes = new Set(r.shifts.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")
    .map((s) => s.doctor_id + "|" + s.date));
  const aGarde = (id, d) => gardes.has(id + "|" + d);
  r.shifts.filter((s) => s.shift_type === "repos_garde").forEach((s) => {
    const j = jour(s.date);
    if (j !== 1 && j !== 2) return; // seuls lundi/mardi sont concernés par la règle
    const lendemain = aGarde(s.doctor_id, add(s.date, -1));
    const couple = aGarde(s.doctor_id, add(s.date, -2)) && aGarde(s.doctor_id, add(s.date, -4));
    assert(lendemain || couple,
      s.doctor_id + " : repos_garde injustifié le " + s.date +
      " (ni lendemain de garde, ni couplage jeudi+samedi / vendredi+dimanche)");
  });
});

test("échange : le repos couplé est SUPPRIMÉ si le receveur n'est pas couplé", () => {
  // R1 a gardé jeudi 11/6 (nuit) + samedi 13/6 (24h) → repos dimanche 14 + lundi 15.
  // R1 échange sa 24 h du samedi contre la 24 h du dimanche 21/6 de R2 (non couplé
  // au vendredi) : le lundi 15 de R1 doit SAUTER (R2 n'a pas gardé le jeudi 11),
  // et R2 ne reçoit pas de mardi (R1 n'a pas gardé le vendredi 19).
  const meds = [{ id: "R1", grade: "resident", name: "R1" }, { id: "R2", grade: "resident", name: "R2" }];
  const shifts = [
    { id: "gj", date: "2026-06-11", shift_type: "garde_nuit", doctor_id: "R1", poste: null }, // jeudi
    { id: "rj", date: "2026-06-12", shift_type: "repos_garde", doctor_id: "R1", poste: null },
    { id: "gs", date: "2026-06-13", shift_type: "garde_24h", doctor_id: "R1", poste: null },  // samedi
    { id: "rd", date: "2026-06-14", shift_type: "repos_garde", doctor_id: "R1", poste: null },
    { id: "rl", date: "2026-06-15", shift_type: "repos_garde", doctor_id: "R1", poste: null }, // lundi (couplé)
    { id: "gd2", date: "2026-06-21", shift_type: "garde_24h", doctor_id: "R2", poste: null }, // dimanche
    { id: "rl2", date: "2026-06-22", shift_type: "repos_garde", doctor_id: "R2", poste: null },
  ];
  const r = validerEchange(shifts, "gs", "gd2", meds);
  assert(r.ok, "échange refusé à tort : " + r.message);
  const supprime = r.changes.find((c) => c.id === "rl" && c.supprimer);
  assert(supprime, "le repos couplé du lundi 15 de R1 devait être supprimé (R2 non couplé)");
  const creeMardi = r.changes.find((c) => c.creer && c.creer.date === "2026-06-23");
  assert(!creeMardi, "aucun mardi de repos ne devait être créé (R1 n'a pas gardé le vendredi 19)");
});

test("échange refusé : le receveur a déjà un shift le même jour", () => {
  const meds = [{ id: "R1", grade: "resident", name: "R1" }, { id: "R2", grade: "resident", name: "R2" }];
  const shifts = [
    { id: "j1", date: "2026-06-10", shift_type: "jour", doctor_id: "R1", poste: "usi1" },
    { id: "j2", date: "2026-06-11", shift_type: "jour", doctor_id: "R2", poste: "usi2" },
    { id: "j3", date: "2026-06-10", shift_type: "jour", doctor_id: "R2", poste: "usi3" }, // R2 déjà posté le 10
  ];
  const r = validerEchange(shifts, "j1", "j2", meds);
  assert(!r.ok, "échange accepté alors que R2 a déjà un shift le 10/6");
});

test("échange refusé : le receveur travaille le lendemain de la garde gagnée", () => {
  const meds = [{ id: "R1", grade: "resident", name: "R1" }, { id: "R2", grade: "resident", name: "R2" }];
  const shifts = [
    { id: "g1", date: "2026-06-10", shift_type: "garde_nuit", doctor_id: "R1", poste: null },
    { id: "g2", date: "2026-06-17", shift_type: "garde_nuit", doctor_id: "R2", poste: null },
    { id: "j1", date: "2026-06-11", shift_type: "jour", doctor_id: "R2", poste: "usi1" }, // R2 posté le 11
  ];
  const r = validerEchange(shifts, "g1", "g2", meds);
  assert(!r.ok, "échange accepté alors que R2 travaille le lendemain de la garde du 10/6");
});

test("combos MAXIMISÉS : la majorité des 24h de week-end sont couplées (jeudi/sam, ven/dim)", () => {
  // Demande (révision 2026-06-12) : favoriser au maximum les combos
  // jeudi+samedi / vendredi+dimanche, sous l'équité (gardes rééquilibrées en
  // fin de génération par plReequilibrerGardes). Mesuré ~75 % sur un trimestre
  // type ; on verrouille un plancher de 50 %.
  const r = genererTrimestre({ annee: 2026, trimestre: 3, medecins: equipe(), preferences: [] });
  const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10); };
  const dow = (d) => { const j = new Date(d + "T00:00:00Z").getUTCDay(); return j === 0 ? 7 : j; };
  const gardes = new Set(r.shifts.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")
    .map((s) => s.doctor_id + "|" + s.date));
  let we = 0, combos = 0;
  r.shifts.forEach((s) => {
    if (s.shift_type !== "garde_24h") return;
    const j = dow(s.date); if (j !== 6 && j !== 7) return;
    we++;
    if (gardes.has(s.doctor_id + "|" + add(s.date, -2))) combos++;
  });
  assert(we > 0, "aucune 24h de week-end générée");
  assert(combos / we >= 0.5, "combos " + combos + "/" + we + " (" + Math.round(100 * combos / we) + " % < 50 %)");
});

test("vendredi soir + dimanche = UN SEUL week-end travaillé (compteurs)", () => {
  // Une garde du vendredi soir se termine le samedi matin : elle ENTAME le
  // week-end. Combinée à la 24 h du dimanche, elle ne compte qu'UN week-end.
  const stats = compterParMedecin([
    { date: "2026-06-12", shift_type: "garde_nuit", doctor_id: "x", poste: null }, // vendredi
    { date: "2026-06-14", shift_type: "garde_24h", doctor_id: "x", poste: null },  // dimanche
    { date: "2026-06-06", shift_type: "garde_24h", doctor_id: "y", poste: null },  // samedi (autre WE)
    { date: "2026-06-07", shift_type: "twe", doctor_id: "y", poste: null },        // dimanche même WE
  ]);
  assert.strictEqual(stats.x.weekends, 1, "x (ven+dim) = " + stats.x.weekends + " week-end(s), attendu 1");
  assert.strictEqual(stats.y.weekends, 1, "y (sam+dim même WE) = " + stats.y.weekends + ", attendu 1");
});

test("consolidation : la majorité des 24h du DIMANCHE sont tenues par une garde du vendredi", () => {
  // Objectif (révision 2026-06-12) : diminuer le nombre total de week-ends
  // entamés — le médecin du vendredi soir reprend la 24 h du dimanche
  // (vendredi+dimanche = 1 week-end). Mesuré ~77 % ; plancher verrouillé à 60 %.
  const r = genererTrimestre({ annee: 2026, trimestre: 3, medecins: equipe(), preferences: [] });
  const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10); };
  const dow = (d) => { const j = new Date(d + "T00:00:00Z").getUTCDay(); return j === 0 ? 7 : j; };
  const gardes = new Set(r.shifts.filter((s) => s.shift_type === "garde_nuit" || s.shift_type === "garde_24h")
    .map((s) => s.doctor_id + "|" + s.date));
  let dim = 0, couples = 0;
  r.shifts.forEach((s) => {
    if (s.shift_type !== "garde_24h" || dow(s.date) !== 7) return;
    dim++;
    if (gardes.has(s.doctor_id + "|" + add(s.date, -2))) couples++;
  });
  assert(dim > 0, "aucune 24h de dimanche générée");
  assert(couples / dim >= 0.6, "dimanches couplés au vendredi : " + couples + "/" + dim +
    " (" + Math.round(100 * couples / dim) + " % < 60 %)");
});

test("échange : céder sa garde du JEUDI fait perdre la récup couplée du lundi", () => {
  // X a jeudi (nuit) + samedi (24h) → lundi de récup couplée. S'il échange sa
  // garde du JEUDI, le couplage est rompu : son lundi doit être SUPPRIMÉ
  // (le samedi seul ne donne que le repos du dimanche).
  const meds = [{ id: "X", grade: "resident", name: "X" }, { id: "Y", grade: "resident", name: "Y" }];
  const shifts = [
    { id: "gj",  date: "2026-06-11", shift_type: "garde_nuit",  doctor_id: "X", poste: null }, // jeudi
    { id: "rv",  date: "2026-06-12", shift_type: "repos_garde", doctor_id: "X", poste: null },
    { id: "gs",  date: "2026-06-13", shift_type: "garde_24h",   doctor_id: "X", poste: null }, // samedi
    { id: "rd",  date: "2026-06-14", shift_type: "repos_garde", doctor_id: "X", poste: null },
    { id: "rl",  date: "2026-06-15", shift_type: "repos_garde", doctor_id: "X", poste: null }, // lundi couplé
    { id: "gm",  date: "2026-06-17", shift_type: "garde_nuit",  doctor_id: "Y", poste: null }, // mercredi
    { id: "rj2", date: "2026-06-18", shift_type: "repos_garde", doctor_id: "Y", poste: null },
  ];
  const r = validerEchange(shifts, "gj", "gm", meds);
  assert(r.ok, "échange refusé à tort : " + r.message);
  assert(r.changes.some((c) => c.id === "rl" && c.supprimer),
    "la récup couplée du lundi devait être supprimée (jeudi cédé → couplage rompu)");
  assert(r.changes.some((c) => c.id === "rv" && c.doctor_id === "Y"),
    "le repos du vendredi devait suivre la garde du jeudi vers Y");
});

console.log("\n=== Révision 2026-06-12 — Nouvel engagé, plancher 40 h, offs trimestre ===");

test("nouvel engagé : doublure quotidienne 2 semaines, jamais de garde/WE, puis vie normale", () => {
  const meds = equipe();
  meds[0].nouvel_engage = true; meds[0].contract_start = "2026-06-01"; // resident1
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  const fenetre = r.shifts.filter((s) => s.doctor_id === "resident1" && s.date <= "2026-06-14");
  // Jamais de garde / TWE / week-end pendant la fenêtre.
  assert(fenetre.every((s) => s.shift_type === "jour"),
    "types interdits en fenêtre : " + fenetre.filter((s) => s.shift_type !== "jour").map((s) => s.date + ":" + s.shift_type).join(", "));
  const dow = (d) => { const j = new Date(d + "T00:00:00Z").getUTCDay(); return j === 0 ? 7 : j; };
  assert(fenetre.every((s) => dow(s.date) <= 5), "présent un week-end pendant la fenêtre");
  // Présence CHAQUE jour ouvré (10 jours ouvrés du 1 au 14 juin), en DOUBLURE
  // d'une unité déjà pourvue par un titulaire.
  assert.strictEqual(fenetre.length, 10, "jours de doublure = " + fenetre.length + " (10 attendus)");
  assert(fenetre.every((s) => s.doublure), "shift de fenêtre non marqué doublure");
  fenetre.forEach((s) => {
    const titulaires = r.shifts.filter((x) => x.date === s.date && x.poste === s.poste && x.doctor_id !== "resident1");
    assert(titulaires.length >= 1, s.date + " : doublé sur une unité sans titulaire (" + s.poste + ")");
  });
  // Après la fenêtre : il reprend des gardes.
  const apres = r.shifts.filter((s) => s.doctor_id === "resident1" && s.date > "2026-06-14" &&
    (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h"));
  assert(apres.length >= 1, "aucune garde après la fenêtre des 2 semaines");
});

test("nouvel engagé : statut PÉRIMÉ signalé en conflit (à retirer par l'admin)", () => {
  const meds = equipe();
  meds[0].nouvel_engage = true; meds[0].contract_start = "2026-03-01"; // fenêtre finie
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  assert(r.conflits.some((c) => /nouvel engagé.*PÉRIMÉ/i.test(c.message)),
    "statut périmé non signalé");
});

test("plancher 40 h/sem : sous la cible proratisée ⇒ plus aucun jour ouvré libre (doublures posées)", () => {
  // Cible hebdo = 40 h × fte × (jours de présence possibles / 5), où les jours
  // de repos de garde ne sont PAS travaillables. Si un médecin est sous sa
  // cible, c'est que TOUS ses jours ouvrés sont occupés (l'algo a doublé les
  // unités tant qu'il restait des jours libres).
  const meds = equipe();
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  const H = { jour: 10.5, twe: 6, garde_nuit: 15, garde_24h: 24, off: 10.5 };
  const lundi = (d) => { const x = new Date(d + "T00:00:00Z"); const j = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - j); return x.toISOString().slice(0, 10); };
  const par = {};
  r.shifts.forEach((s) => { ((par[s.doctor_id] = par[s.doctor_id] || {})[s.date] =
    (par[s.doctor_id] || {})[s.date] || []).push(s.shift_type); });
  const semaines = { "2026-06-01": [1, 2, 3, 4, 5], "2026-06-08": [8, 9, 10, 11, 12],
    "2026-06-15": [15, 16, 17, 18, 19], "2026-06-22": [22, 23, 24, 25, 26] };
  Object.keys(semaines).forEach((lk) => {
    meds.forEach((m) => {
      let h = 0;
      r.shifts.forEach((s) => { if (s.doctor_id === m.id && lundi(s.date) === lk) h += H[s.shift_type] || 0; });
      const jours = semaines[lk].map((j) => "2026-06-" + String(j).padStart(2, "0"));
      const presence = jours.filter((d) => !(((par[m.id] || {})[d]) || []).includes("repos_garde"));
      const cible = 40 * presence.length / 5;
      const libres = jours.filter((d) => !(((par[m.id] || {})[d]) || []).length);
      assert(!(h < cible - 0.01 && libres.length > 0),
        m.id + " semaine " + lk + " : " + h + " h < cible " + cible.toFixed(1) + " avec jours libres " + libres.join(","));
    });
  });
  assert(r.shifts.some((s) => s.doublure), "aucune doublure posée (plancher inactif ?)");
});

test("off-clinic : équilibre trimestriel (le moins d'offs cumulés est servi d'abord)", () => {
  // r2 a déjà 2 offs posés (mois précédent du trimestre) ; r1 n'en a aucun.
  // À capacité réduite (1 seul jour plaçable), r1 doit passer AVANT r2.
  const r1 = { id: "r1", name: "R1", grade: "resident", statut: "dependant", fte: 1,
    jours_travailles: [1, 2, 3, 4, 5], contract_start: null, contract_end: null };
  const r2 = Object.assign({}, r1, { id: "r2", name: "R2" });
  const shifts = [
    { date: "2026-05-04", shift_type: "off", doctor_id: "r2", poste: null },
    { date: "2026-05-11", shift_type: "off", doctor_id: "r2", poste: null },
  ];
  // Saturer presque tout juin : r1 et r2 occupés tous les jours ouvrés sauf le 1er.
  for (let j = 2; j <= 30; j++) {
    const d = "2026-06-" + String(j).padStart(2, "0");
    shifts.push({ date: d, shift_type: "jour", doctor_id: "r1", poste: "usi1" });
    shifts.push({ date: d, shift_type: "jour", doctor_id: "r2", poste: "usi2" });
  }
  const offs = genererOffClinic({ annee: 2026, mois: 6, medecins: [r1, r2], shifts, preferences: [] });
  const lundi1 = offs.filter((o) => o.date === "2026-06-01");
  assert(lundi1.length === 1 && lundi1[0].doctor_id === "r1",
    "le 01/06 devait aller à r1 (0 off cumulé) : " + JSON.stringify(lundi1));
});

test("unités : jamais 2 au Labo de choc, jamais 3 sur une unité (doublures comprises)", () => {
  // Avec un nouvel engagé (doublures quotidiennes) ET le plancher 40 h
  // (doublures de complément), l'occupation doit rester bornée :
  // Labo de choc = 1 personne max ; autres unités = 2 max (titulaire + 1).
  const meds = equipe();
  meds[0].nouvel_engage = true; meds[0].contract_start = "2026-06-01";
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  const occ = {}; // date|poste -> n
  r.shifts.forEach((s) => {
    if ((s.shift_type !== "jour" && s.shift_type !== "garde_24h") || !s.poste) return;
    occ[s.date + "|" + s.poste] = (occ[s.date + "|" + s.poste] || 0) + 1;
  });
  Object.keys(occ).forEach((k) => {
    const [date, poste] = k.split("|");
    if (poste === "labo_choc") assert(occ[k] <= 1, date + " : " + occ[k] + " personnes au Labo de choc");
    else assert(occ[k] <= 2, date + " : " + occ[k] + " personnes sur " + poste);
  });
});

test("validerPlanning signale 2 au Labo de choc et 3 sur une unité", () => {
  const shifts = [
    { date: "2026-06-01", shift_type: "jour", doctor_id: "resident1", poste: "labo_choc" },
    { date: "2026-06-01", shift_type: "jour", doctor_id: "resident2", poste: "labo_choc" }, // interdit
    { date: "2026-06-02", shift_type: "jour", doctor_id: "resident3", poste: "usi1" },
    { date: "2026-06-02", shift_type: "jour", doctor_id: "resident4", poste: "usi1" },      // doublure OK
    { date: "2026-06-02", shift_type: "jour", doctor_id: "resident5", poste: "usi1" },      // 3e : interdit
  ];
  const conflits = validerPlanning({ annee: 2026, mois: 6, shifts, medecins: equipe(), preferences: [] });
  assert(conflits.some((c) => /Labo de choc : 2 personnes/.test(c.message)), "2 au labo non signalé");
  assert(conflits.some((c) => /usi1 : 3 personnes/.test(c.message)), "3 sur usi1 non signalé");
});

test("doublures : jamais sur une unité tenue par une garde 24h (sauf nouvel engagé)", () => {
  const meds = equipe();
  meds[0].nouvel_engage = true; meds[0].contract_start = "2026-06-01"; // resident1
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  const tenue24 = new Set(r.shifts.filter((s) => s.shift_type === "garde_24h" && s.poste)
    .map((s) => s.date + "|" + s.poste));
  r.shifts.filter((s) => s.doublure && s.doctor_id !== "resident1").forEach((s) => {
    assert(!tenue24.has(s.date + "|" + s.poste),
      s.date + " : doublure de " + s.doctor_id + " sur " + s.poste + " tenue par une garde 24h");
  });
});

test("plancher 40 h : un temps plein SANS lundi (convenance) atteint quand même ~40 h/sem", () => {
  // La cible se rapporte aux jours ouvrés TRAVAILLABLES du médecin (4 pour
  // lui), pas à 5 fixes : avec /5, sa cible tombait à 32 h et il plafonnait
  // à ~37 h/sem de moyenne malgré son temps plein.
  const meds = equipe();
  meds[4].jours_travailles = [2, 3, 4, 5, 6, 7]; // resident5 : jamais le lundi
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: [] });
  const H = { jour: 10.5, twe: 6, garde_nuit: 15, garde_24h: 24, off: 10.5 };
  let h = 0;
  r.shifts.forEach((s) => { if (s.doctor_id === "resident5") h += H[s.shift_type] || 0; });
  const moy = h / (30 / 7);
  assert(moy >= 39, "resident5 (temps plein sans lundi) : moyenne " + moy.toFixed(1) + " h/sem < 39 h");
});

test("compensation 24h : personne sous 40 h/sem de moyenne sur le trimestre (équipe pleine dispo)", () => {
  // Révision 2026-06-13 : un médecin resté sous son minimum cumulé prend sa
  // garde de SEMAINE en 24 h (station + nuit) pour rattraper — et libère du
  // même coup un jour de station pour un médecin en excédent (qui récupère).
  const meds = equipe();
  const r = genererTrimestre({ annee: 2026, trimestre: 3, medecins: meds, preferences: [] });
  const H = { jour: 10.5, twe: 6, garde_nuit: 15, garde_24h: 24, off: 10.5 };
  const tot = {}; meds.forEach((m) => { tot[m.id] = 0; });
  r.shifts.forEach((s) => { if (H[s.shift_type]) tot[s.doctor_id] += H[s.shift_type]; });
  const sem = 92 / 7;
  meds.forEach((m) => {
    const moy = tot[m.id] / sem;
    assert(moy >= 40, m.id + " : " + moy.toFixed(1) + " h/sem < 40 (compensation 24h inopérante)");
  });
  // La promotion 24 h en semaine doit exister (sinon la règle est inactive).
  const dow = (d) => { const j = new Date(d + "T00:00:00Z").getUTCDay(); return j === 0 ? 7 : j; };
  assert(r.shifts.some((s) => s.shift_type === "garde_24h" && dow(s.date) <= 5),
    "aucune garde 24h de semaine générée (promotion par déficit inactive ?)");
});

console.log("\n=== Équilibre des heures — crédit d'équité des congés ===");

test("congé : un médecin en congé 2 semaines ne dépasse pas les heures de ses pairs", () => {
  // resident1 est en congé annuel du 1er au 14 juin (2 semaines pleines).
  // SANS crédit d'équité, l'algorithme le considérait « en déficit d'heures »
  // et le surchargeait à son retour, au point de dépasser des collègues SANS
  // congé. AVEC crédit : ses heures réelles restent NETTEMENT sous la moyenne
  // des autres résidents.
  const meds = equipe();
  const prefs = [{ doctor_id: "resident1", pref_type: "conge_annuel",
                   start_date: "2026-06-01", end_date: "2026-06-14", status: "approuve" }];
  const r = genererPlanning({ annee: 2026, mois: 6, medecins: meds, preferences: prefs });
  const heures = {};
  meds.forEach((m) => { heures[m.id] = 0; });
  const H = { jour: 10.5, twe: 6, garde_nuit: 15, garde_24h: 24, off: 10.5 };
  r.shifts.forEach((s) => { if (H[s.shift_type]) heures[s.doctor_id] += H[s.shift_type]; });
  const autres = meds.filter((m) => m.grade === "resident" && m.id !== "resident1");
  const moyenne = autres.reduce((a, m) => a + heures[m.id], 0) / autres.length;
  assert(heures["resident1"] < moyenne,
    "resident1 (congé 2 sem) fait " + heures["resident1"] + " h ≥ moyenne des autres résidents (" +
    Math.round(moyenne) + " h) — le congé n'allège pas sa charge");
});

console.log("\n--- " + reussis + "/" + total + " tests réussis ---\n");
process.exit(reussis === total ? 0 : 1);
