# Reprise — Moteur de planning « couplé, week-ends d'abord »

> Document de référence unique pour reprendre le moteur. Décrit l'architecture,
> l'algorithme et l'état actuel. Dernière mise à jour : 2026-06-19.

---

## 0. Où est le code (base simplifiée 2026-06-19)

**Une seule source de vérité pour le moteur** — il n'y a plus de copie prototype.

- **`planning.js`** — moteur de base + fonctions communes (sélection, affectation,
  repos, off-clinic, rééquilibrages, récups…). Exporte sous Node (`module.exports`).
  Toujours utilisé par le bouton « 📅 Générer le trimestre (équité) » (moteur historique).
- **`planning-couple.js`** — moteur COUPLÉ « week-ends d'abord ». Étend `planning.js`
  (réutilise ses fonctions). Définit `genererTrimestreCouple()` + helpers
  (`plPeutGarde`, `plCoupleChoisir`, `plEquilibrerGardesMois`). Chargé par `index.html`
  APRÈS `planning.js`. Branché au bouton « 🧪 Générer — moteur couplé (test) ».
- **`regles.js`** — règles métier (fériés BE, etc.). Chargé en premier.
- **`app.js`**, **`index.html`**, **`style.css`** — l'application.
- **`test-couple.js`** — tests Node du moteur couplé. Charge `planning.js` +
  `planning-couple.js` dans **un seul scope CommonJS** (loader en tête de fichier) :
  `node test-couple.js`.
- **`SPECIFICATIONS.md`** — spécification métier (grades, contrats, couverture, règles dures).
- **`sql/`** — migrations Supabase (dont `module33_cap_fromager.sql`).

✅ **Plus de double-maintenance** : toute modif du moteur se fait dans `planning.js`
et/ou `planning-couple.js`. Le navigateur les charge via `<script>` ; Node les charge
via le loader en tête de `test-couple.js`. Même source pour les deux.

⚠️ **Environnement Cowork** : le shell sandbox sert parfois une vue tronquée/stale des
fichiers. Toujours valider en RÉEL avec `node test-couple.js`, puis committer depuis la machine.

---

## 1. Couverture à assurer (règles dures)

- **Jour de SEMAINE** (lun→ven, hors férié) : **7 stations** (usi1–5, bordet, labo_choc)
  + **2 gardes de nuit** (17h–9h), dont **≥1 résident**, **jamais 2 A/S**.
- **WEEK-END (sam & dim) et FÉRIÉ en semaine** : **2 gardes 24h** (≥1 résident, jamais
  2 A/S) + **1 tour (TWE)**. **Pas de stations de jour.** Les 2 gardes 24h FONT le tour
  (donc 3 présents = 2 gardes + 1 tour).
- Repos post-garde : lendemain de toute garde. Repos couplé : combo de week-end →
  repos en début de semaine suivante (lundi/mardi, `materialiserReposCouples`).
- Cibles horaires : **48–52 h/semaine** (plein temps), proratisé à l'ETP (mi-temps).

---

## 2. Concepts clés

- **Long week-end** : faire une garde le **JEUDI** LIBÈRE le week-end (la personne de
  garde jeudi n'est PAS de garde/tour ce sam/dim). Jeudi ≠ samedi la même semaine.
- **Couplage TEMPOREL jeudi↔samedi** : sur le trimestre, les MÊMES personnes font des
  jeudis ET des samedis (équilibre `|nbJeudi − nbSamedi| ≤ 2`), mais à des semaines
  DIFFÉRENTES.
- **Consolidation VENDREDI→DIMANCHE** : la garde de nuit du vendredi entame déjà le
  week-end → la MÊME personne reprend la garde 24h du dimanche (= 1 seul week-end
  « amené » au lieu de 2). Donne un repos couplé le mardi. **À 100 %.**
- **Récup de week-end** : chaque garde 24h de week-end ouvre droit à une journée de
  **récup** la semaine suivante, étiquetée « récup (samedi) » ou « récup (V/D) ».
- **CAP fromager** (`cap_fromager`) : résident à part entière (gardes seul, compté
  résident) MAIS : jamais le lundi, jamais de garde le dimanche (tours OK), même nb de
  **week-ends** que les autres (rattrapage par samedi), pas d'off-clinic, récup de
  samedi le **lundi**.

---

## 3. Champs de la fiche médecin (`doctors`) lus par le moteur

| Champ | Sens |
|---|---|
| `grade` | "resident" / "assistant_specialiste" / "pg" (pg générés à part) |
| `fte` | quotité (1 = plein temps, 0.5 = mi-temps) |
| `weekly_hours_target` | cible hebdo (52 plein temps) |
| `jours_travailles` | jours travaillables [1..7] (1=lun … 7=dim) |
| `statut` | "independant" (planifié sur ses jours déclarés) / "dependant" |
| `unite_reference` | station de référence (rotation) |
| `nouvel_engage` | exclu des viviers 14 j, posé en doublure |
| `cap_fromager` | statut spécial (voir §2) |

---

## 4. ALGORITHME — `genererTrimestreCouple(opts)`

opts = { annee, trimestre (1–4), medecins, preferences, periodes, prePlaces, feriesAdmin }

### Setup
Filtre les pg. **Clone** les `cap_fromager` en retirant le lundi de `jours_travailles`.
État via `plNouvelEtat`. `poidsWeekend`/`poidsGarde` = présence × fte sur le trimestre.

### PHASE 1 — Tous les WEEK-ENDS (samedi par samedi)
1. `poserWE(sat, null)` : 2 gardes 24h le samedi, **non couplé au jeudi** (long week-end).
   Rattrapage CAP fromager (priorité samedi s'il est sous la moyenne). Filets couverture.
2. `poserWE(sun, fri)` : 2 gardes 24h le dimanche, **couplées au vendredi nuit** (consolidation 100 %).
3. **Tours** : 1 tour-seul, binôme sam+dim.

### PHASE 1b — FÉRIÉS en semaine
Jour « type week-end » : 2 gardes 24h + 1 tour, **0 station, 0 garde de nuit**.

### PHASE 2 — Autres gardes de NUIT de semaine
Compléter à 2 gardes/nuit (≥1 résident, jamais 2 A/S).
- **JEUDI** : déprioriser qui est déjà de garde/tour ce week-end (long week-end) ;
  couplage temporel (préférer qui a fait plus de samedis que de jeudis).
- Lun/mar/mer/ven : équité gardes.

### PHASE 2b — PROMOTION 24h
Une garde de NUIT d'un médecin sous-chargé devient une garde 24h. **Jamais le vendredi**
(consolidation) ni une 2e 24h dans la même semaine.

### Rééquilibrage des GARDES
- `plReequilibrerGardes` : équité du nombre de gardes intra-grade (nuits lun→mer).
- `plEquilibrerGardesMois` : lisse les **heures-de-garde PAR MOIS** intra-grade
  (déplace une nuit **lun/mar/mer uniquement** — jamais jeu/ven — d'un médecin trop
  chargé ce mois vers un moins chargé). *(§6.1 — implémenté.)*

### Repos
`materialiserRepos` (lendemain) + `materialiserReposCouples` (lundi/mardi des combos).
**Chaque repos est marqué `plMarquerAssigne`** → la Phase 3 ne staffe pas par-dessus.

### RÉCUPS D'OFFICE (AVANT le staffing) — *(§6.2 — implémenté)*
`plEmettreCongesFerie` + `plEmettreRecupsWeekend` posés **juste après les repos**, puis
**jours bloqués** (`plMarquerAssigne`). Pose les récups tant que les jours sont encore
libres → la récup **V/D** ne « saute » plus.

Pas de **double récup** : quand un combo de consolidation existe (vendredi nuit→dimanche,
ou jeudi→samedi), le **repos couplé** posé à J+2 (mardi pour V/D, lundi pour samedi) EST
la récup → il est **relabellé** en récup (visible) au lieu d'émettre une récup déplaçable
en plus. Sinon (pas de combo) : récup flexible sur un jour ouvré libre.

### PHASE 3 — UNITÉS (stations de jour)
7 stations par continuité puis heures. **Placée APRÈS les récups** → ne vole plus les
jours de récup (`plDispo` respecte `etat.assigneJour` & `etat.bloque`).

### PHASE 4 — Off-clinic, plancher, équités finales
Off-clinic par mois (exclut `cap_fromager`/`sans_off`), `plCompleterMinimumHeures`
(plancher), `plEquilibrerTours`, `plReequilibrerHeures`, allègement des sur-chargés (>45 h/sem).

---

## 5. Ordre de génération (résumé)

1. Gardes (Phases 1, 1b, 2, 2b)
2. Rééquilibrage gardes (`plReequilibrerGardes` + `plEquilibrerGardesMois`)
3. Repos (`materialiserRepos` + `materialiserReposCouples`) — **marqués bloqués**
4. **RÉCUPS D'OFFICE** (`plEmettreCongesFerie` + `plEmettreRecupsWeekend`) — **marqués bloqués**
5. **PHASE 3** (stations)
6. Phase 4 (off, plancher, tours, resserrement heures, allègement)

⚠️ Ne jamais déplacer les gardes du **jeudi** ni du **vendredi** au rééquilibrage
(sinon couplage cassé) — `plEquilibrerGardesMois` ne touche que lun→mer.

---

## 6. État & validation

`node test-couple.js` → cible **12/12**. Couvre : couverture WE (2 gardes + 1 tour) ;
couverture nuit (≥1 résident ou signal) ; long week-end (≥80 % des jeudis libèrent le WE) ;
couplage temporel (|Δ|≤2) ; consolidation ven→dim ; équité gardes/tours intra-grade ;
écart d'heures trimestre borné ; récups étiquetées (≤1/sem, jamais férié) ; congés +
mi-temps ; férié = jour type week-end ; statut CAP fromager.

**À VALIDER en réel après les changements 2026-06-19** (§6.1 + §6.2 + fusion source unique) :
1. `node test-couple.js` = 12/12.
2. Mesurer l'écart d'heures **mensuel** avant/après (objectif §6.1 : le réduire).
3. Vérifier que la récup **V/D** est bien posée (objectif §6.2 : ne saute plus) et
   coïncide avec le repos couplé du mardi.
4. Vérifier que les couplages jeu/ven et les repos couplés tiennent toujours.

Si un test casse : le réordonnancement §6.2 (récups avant Phase 3) ou le loader de
`test-couple.js` sont les premiers suspects. Le loader bundle `planning.js` +
`planning-couple.js` dans un scope CJS — il doit être strictement équivalent à
l'ancienne copie concaténée.

---

## 7. Câblage app / déploiement

- `index.html` charge `regles.js` → `planning.js` → `planning-couple.js` → `app.js`.
- `app.js` : le bouton « 📅 Générer le trimestre » appelle `genererTrimestreCouple` **par
  défaut** (repli sur l'ancien `genererTrimestre` seulement s'il n'est pas chargé). Le
  bouton « moteur couplé (test) » et le flag `_useMoteurCouple` ont été retirés (2026-06-19).
- DB : exécuter `sql/module33_cap_fromager.sql`.
- Toujours `node test-couple.js` (12/12) avant de committer.
