# Reprise — Moteur de planning « couplé, week-ends d'abord »

> Document de référence pour repartir à neuf. Explique **exactement** comment
> l'algorithme fonctionne, l'état actuel, et les 2 changements en cours.
> Dernière mise à jour : 2026-06-18.

---

## 0. Où est le code

- **`planning.js`** — moteur HISTORIQUE (génération chronologique). Toujours utilisé
  par le bouton « 📅 Générer le trimestre (équité) ». Contient les fonctions de base
  (sélection, affectation, repos, off-clinic, rééquilibrages) **réutilisées** par le
  moteur couplé.
- **`planning-couple.js`** — moteur COUPLÉ « week-ends d'abord » (NOUVEAU). Chargé par
  `index.html` APRÈS `planning.js` (il étend ses fonctions globales). Définit
  `genererTrimestreCouple()` + helpers (`plCoupleChoisir`, `plPeutGarde`,
  `plEquilibrerGardesMois`). Branché au bouton **« 🧪 Générer — moteur couplé (test) »**.
- **`planning.prototype-couple.js`** — COPIE AUTONOME du moteur couplé (planning.js
  complet + les fonctions couplées), pour tests Node hors navigateur.
- **`test_couple.prototype.js`** — tests du moteur couplé : `node test_couple.prototype.js`.
- **`sql/module33_cap_fromager.sql`** — colonne `doctors.cap_fromager`.
- **`CHANTIER_long_weekend.md`** — journal détaillé de tout le chantier.

⚠️ **Toute modif du moteur couplé doit être faite dans `planning-couple.js` ET
`planning.prototype-couple.js`** (les deux ont les mêmes fonctions couplées).
⚠️ **Environnement Cowork** : le shell sandbox sert parfois une vue tronquée/stale des
fichiers. Valider via `node test_couple.prototype.js`. Committer depuis la machine.

---

## 1. Couverture à assurer (règles dures)

- **Jour de SEMAINE** (lun→ven, hors férié) : **7 stations** (usi1–5, bordet, labo_choc)
  + **2 gardes de nuit** (17h–9h), dont **≥1 résident**, **jamais 2 A/S**.
- **WEEK-END (sam & dim) et FÉRIÉ en semaine** : **2 gardes 24h** (≥1 résident, jamais
  2 A/S) + **1 tour (TWE)**. **Pas de stations de jour.** Les 2 gardes 24h FONT le tour
  (donc 3 présents = 2 gardes + 1 tour, pas 5).
- Repos post-garde : lendemain de toute garde. Repos couplé : combo de week-end →
  repos en début de semaine suivante (lundi/mardi, `materialiserReposCouples`).
- Cibles horaires : **48–52 h/semaine** (plein temps), proratisé à l'ETP (mi-temps).

---

## 2. Concepts clés

- **Long week-end** : faire une garde le **JEUDI** LIBÈRE le week-end (la personne de
  garde jeudi n'est PAS de garde/tour ce sam/dim). Jeudi ≠ samedi la même semaine.
- **Couplage TEMPOREL jeudi↔samedi** : sur le trimestre, les MÊMES personnes font des
  jeudis ET des samedis (équilibre `|nbJeudi − nbSamedi| ≤ 2`), mais à des semaines
  DIFFÉRENTES (sinon pas de long week-end).
- **Consolidation VENDREDI→DIMANCHE** : la garde de nuit du vendredi entame déjà le
  week-end → la MÊME personne reprend la garde 24h du dimanche (= 1 seul week-end
  « amené » au lieu de 2). Donne un repos couplé le mardi. **À 100 %.**
- **Récup de week-end** : chaque garde 24h de week-end ouvre droit à une journée de
  **récup** la semaine suivante, étiquetée « récup (samedi) » ou « récup (V/D) ».
- **CAP fromager** (case à cocher fiche médecin, `cap_fromager`) : résident à part
  entière (gardes seul, compté résident) MAIS : jamais le lundi (cours), jamais de garde
  le dimanche (tours OK), même nb de **week-ends** que les autres (rattrapage par samedi,
  PAS de favori excessif), pas d'off-clinic, sa récup de samedi tombe le **lundi**.

---

## 3. Champs de la fiche médecin (`doctors`) lus par le moteur

| Champ | Sens |
|---|---|
| `grade` | "resident" / "assistant_specialiste" / "pg" (les pg sont générés à part) |
| `fte` | quotité (1 = plein temps, 0.5 = mi-temps) |
| `weekly_hours_target` | cible hebdo (52 plein temps) |
| `jours_travailles` | jours travaillables [1..7] (1=lun … 7=dim) |
| `statut` | "independant" (prioritaire, planifié sur ses jours déclarés) / "dependant" |
| `unite_reference` | station de référence (rotation) |
| `nouvel_engage` | exclu des viviers normaux pendant 14 j, posé en doublure |
| `cap_fromager` | statut spécial (voir §2) |

---

## 4. ALGORITHME du moteur couplé — `genererTrimestreCouple(opts)`

opts = { annee, trimestre (1–4), medecins, preferences, periodes, prePlaces, feriesAdmin }

### Setup
- Filtre les pg. **Clone** les médecins `cap_fromager` en retirant le lundi de
  `jours_travailles` (→ tous les contrôles respectent « pas de lundi »).
- État via `plNouvelEtat`. `poidsWeekend` et `poidsGarde` = présence × fte sur le
  trimestre (proration mi-temps).

### PHASE 1 — Tous les WEEK-ENDS du trimestre (samedi par samedi)
Pour chaque samedi `sat` (sun=+1, fri=−1, thu=−2) :
1. **`poserWE(sat, null)`** : 2 gardes 24h le samedi. **NON couplé au jeudi** (long
   week-end). Vivier = dispo samedi, ≤2 WE/mois (filet si mois saturé), ≥1 résident,
   jamais 2 A/S. Rattrapage CAP fromager (priorité samedi seulement s'il est SOUS la
   moyenne week-ends). Si pas de résident dispo → 2 A/S signalés (conflit doux).
2. **`poserWE(sun, fri)`** : 2 gardes 24h le dimanche, **couplées au vendredi nuit**
   (consolidation à 100 % : on restreint le vivier aux « couplables » dispo vendredi
   tant qu'il y en a ≥2 dont 1 résident).
3. **Tours** : `twe_weekend − gardes_weekend` (= 1) tour-seul, binôme sam+dim.

### PHASE 1b — FÉRIÉS en semaine
Chaque férié lun→ven = jour « type week-end » : 2 gardes 24h + 1 tour, **0 station,
0 garde de nuit**.

### PHASE 2 — Autres gardes de NUIT de semaine
Pour chaque jour ouvré, compléter à 2 gardes de nuit (≥1 résident, jamais 2 A/S).
- **JEUDI** (`choisirNuit`) : (a) **déprioriser** les médecins déjà de garde/tour CE
  week-end (long week-end : le jeudi doit libérer le WE) ; (b) **couplage temporel** :
  préférer qui a fait plus de samedis que de jeudis (`nbSamedi − nbJeudi` élevé).
- Lun/mar/mer/ven : équité gardes (`plTrierGardeNuit`).

### PHASE 2b — PROMOTION 24h (combler les heures)
Une garde de NUIT d'un médecin SOUS-chargé (heures/fte < moyenne − 10) devient une
garde 24h (tient une station + la nuit). **JAMAIS le vendredi** (consolidation) ni une
**2e 24h dans la même semaine** (évite les semaines à 90 h).

### PHASE 3 — UNITÉS (stations de jour), continuité au mieux
Pour chaque jour ouvré : 7 stations, par continuité puis heures. *(Cf. §6 : c'est cette
phase qui doit passer APRÈS les récups — changement en cours.)*

### Rééquilibrages des GARDES (AVANT matérialisation des repos)
- **`plReequilibrerGardes`** : équité du NOMBRE de gardes intra-grade sur le trimestre
  (déplace des nuits lun→mer, jamais jeu/ven).
- **`plEquilibrerGardesMois`** (NOUVEAU, voir §6) : lisse les **heures-de-garde PAR MOIS**
  intra-grade (déplace une nuit **lun/mar/mer uniquement** — jamais jeudi ni vendredi —
  d'un médecin trop chargé en gardes ce mois vers un moins chargé).

### Repos
`materialiserRepos` (lendemain) + `materialiserReposCouples` (lundi/mardi des combos).

### PHASE 4 — Off-clinic, plancher, équités finales
- Off-clinic par mois (résidents dépendants ; **exclut `cap_fromager`/`sans_off`**).
- `plCompleterMinimumHeures` (doublures pour le plancher), `plEquilibrerTours`,
  `plReequilibrerHeures` (resserre l'écart d'heures).
- **Allègement des sur-chargés** : retire les DOUBLURES (surnuméraires) aux médecins
  > 45 h/sem → non-planifié, sans trou (tant qu'ils restent ≥ 40 h).

### RÉCUPS de week-end
`plEmettreRecupsWeekend` : pour chaque garde 24h de WE, pose une `recup` étiquetée la
semaine suivante (jour ouvré libre ; jamais férié/week-end ; ≤1/médecin/semaine). CAP
fromager : récup de samedi posée/relabellée le lundi.

---

## 5. État actuel — TESTS

`node test_couple.prototype.js` → **12/12** sur l'état COMMITTÉ (commit « Fromager »).
Couvre : couverture WE (2 gardes + 1 tour) ; couverture nuit (≥1 résident ou signal) ;
long week-end (≥80 % des jeudis libèrent le WE) ; couplage temporel (|Δ|≤2) ;
consolidation ven→dim (≥50 %, en pratique 100 %) ; équité gardes/tours intra-grade ;
écart d'heures trimestre borné ; récups étiquetées (pas un férié, ≤1/sem) ; congés +
mi-temps ; férié = jour type week-end ; statut CAP fromager (0 lundi, 0 garde dimanche,
0 off, même nb de week-ends, récup le lundi).

Limite connue : équilibré sur le TRIMESTRE mais **écart d'heures MENSUEL encore élevé**
(porté par les GARDES, voir §6).

---

## 6. CHANGEMENTS EN COURS (non committés, à tester quand la sandbox revient)

### 6.1 `plEquilibrerGardesMois` (AJOUTÉ, non testé)
Cause racine du déséquilibre mensuel : les **heures-de-garde par mois** varient
énormément (mesuré : 69–84 h d'écart/mois, 2 à 8 gardes/mois par personne). La fonction
lisse ces heures-garde mois par mois (nuits **lun/mar/mer** seulement, pour préserver les
couplages jeudi et vendredi). Appelée une fois par mois après `plReequilibrerGardes`,
**avant** `materialiserRepos`. **À VALIDER** : relancer les tests + mesurer l'écart
mensuel avant/après ; vérifier que les couplages jeu/ven et les repos couplés tiennent.

### 6.2 RÉCUPS « d'office » AVANT le staffing (DEMANDÉ, à implémenter)
**Problème signalé** : la récup **V/D** (vendredi/dimanche) « saute » — parce que
`plEmettreRecupsWeekend` tourne en DERNIER, quand la semaine est déjà remplie (plus de
jour libre).
**Correctif demandé** : poser les récups **en tout premier, d'office**, AVANT tout
rééquilibrage/staffing. Ordre cible de `genererTrimestreCouple` :
1. Gardes (Phases 1, 1b, 2, 2b).
2. Rééquilibrage des gardes (`plReequilibrerGardes` + `plEquilibrerGardesMois`).
3. Repos (`materialiserRepos` + `materialiserReposCouples`).
4. **RÉCUPS D'OFFICE** (`plEmettreCongesFerie` + `plEmettreRecupsWeekend`), en
   **marquant les jours bloqués** (`plMarquerAssigne`) pour que le staffing les respecte.
   → La récup V/D tombera typiquement le mardi (jour du repos couplé ven→dim), ce qui est
   correct (c'est son jour de repos compensatoire).
5. **PHASE 3** (stations) — à déplacer ICI (après les récups) pour qu'elle ne vole plus
   les jours de récup.
6. Phase 4 (off, plancher, tours, resserrement heures, allègement).

⚠️ Attention V/D : ne jamais déplacer les gardes du **jeudi** ni du **vendredi** au
rééquilibrage (sinon couplage cassé) — déjà géré dans `plEquilibrerGardesMois` (lun→mer
seulement). Vérifier que la récup V/D coïncide bien avec le repos couplé du mardi.

---

## 7. Câblage app / déploiement

- `index.html` charge `planning.js` puis `planning-couple.js` ; bouton « 🧪 Générer —
  moteur couplé (test) ».
- `app.js` : `window._useMoteurCouple = true` → `genererTrimestreCouple` (sinon ancien
  moteur). Même brouillon (non publié), réversible (re-générer avec le bouton normal).
- DB : exécuter `sql/module33_cap_fromager.sql`.
- Toujours `node test_couple.prototype.js` (12/12) avant de committer.
