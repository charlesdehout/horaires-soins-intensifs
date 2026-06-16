# Prompt de reprise — Application Planning Soins Intensifs (v11)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Reprise après le lot « v11 » : équité horaire
> corrigée (congés crédités), gardes proratisées au fte, refonte des échanges
> (déblocage + interface/validation admin), règle « slack → 24 h », résorption
> off-clinic↔24 h, et surtout le **nouveau rôle PG (Module 28)** de bout en bout.

---

Tu m'aides à construire une application web de planning pour une unité de soins
intensifs. Je suis médecin intensiviste, non-développeur. Tu codes, je déploie
via **GitHub Desktop** (commit + push) sur **GitHub Pages**. On procède par
modules ; chaque module doit fonctionner et être testable avant le suivant.

## ⚠️ FRAGILITÉ OUTILLAGE — À LIRE EN PREMIER
Sur ce dépôt, l'outil d'édition a **tronqué plusieurs fois** `app.js`,
`planning.js` ET `index.html` (gros fichiers) : fin de fichier coupée (scripts,
`module.exports`, balises fermantes perdues). RÈGLES :
- **Édite ces 3 fichiers via script (python/sed) en bash**, PAS via l'éditeur.
- **Ne mélange jamais** éditeur (Read/Edit) et shell sur le même fichier dans la
  même passe (désync → perte de modifs).
- **Après CHAQUE édition** : `node --check planning.js && node --check app.js`,
  vérifier la présence de `module.exports` en fin de `planning.js` et des 6
  `<script>` + `</body></html>` en fin d'`index.html`.
- En cas de troncature : resplicer la fin depuis HEAD (`git show HEAD:fichier`).

## ⚠️ À VÉRIFIER EN PREMIER
`git pull` puis **`node test_planning.js`** : **107/107 tests au vert** attendus.
`PL_VERSION` actuel = `v2026.06.16-4` (affiché au message de génération ; si pas
visible dans l'app déployée → cache GitHub Pages, Ctrl+F5). Les compteurs lisent
la BASE : toute modif d'algo exige une **régénération du trimestre**.

## ⚠️ SQL À EXÉCUTER (Supabase, dans l'ordre, idempotents)
Modules historiques (cf. v10) **plus** :
- **`sql/module28_pg.sql`** (rôle PG) : colonnes `doctors.pg_type` (`ulb`/`fellow`)
  et `doctors.opting_out`, grade `pg` autorisé, ET **`ALTER TABLE shifts DROP
  CONSTRAINT IF EXISTS shifts_shift_type_check;`** (sinon l'insertion des shifts
  `pg_jour`/`pg_twe`/`garde_pg` échoue avec « violates check constraint
  shifts_shift_type_check »). **C'EST L'ÉTAPE QUI MANQUE SOUVENT.**

> RÈGLE pour l'IA : dès qu'un module touche la base, ÉCRIS le SQL, sauve-le dans
> `sql/`, ET dis EXPLICITEMENT à Charles « ⚠️ SQL à exécuter dans Supabase ».

## Avant de commencer
Lis : `REGLES_APPLICATION.md` (LA référence, à jour), `regles.js`, `planning.js`,
`app.js`, `index.html`, `sql/`, `google-apps-script/`. **Ne réécris pas ce qui
existe, étends-le.** `FEUILLE_DE_ROUTE.md` et `CONFORMITE.md` sont PÉRIMÉS.

## Architecture (inchangée)
Frontend HTML/CSS/JS vanilla (`index.html`, `app.js`, `style.css`, `regles.js`,
`planning.js`). Backend Supabase (Auth + PostgreSQL). FullCalendar v6, export
ExcelJS, miroir Google Sheets (Apps Script). Algo = JS pur testable sous Node
(`test_planning.js`). Connexion Supabase déjà dans `app.js`.

## CE QUI A ÉTÉ FAIT DANS LE LOT v11

### Équité (corrections majeures)
- **Rééquilibrage horaire crédite les congés** (`plReequilibrerHeures`) : il
  comparait les heures BRUTES → les gens en congé étaient « rattrapés » au même
  total (54 h/sem). Désormais charge créditée (heures + crédit congé) ÷ fte →
  écart h/sem entre temps pleins ~1–2 h. **C'était LE problème d'équité.**
- **Gardes proratisées au fte** (`plReequilibrerGardes` normalise compte/fte ;
  `validerEquite` attendu ∝ fte) : un mi-temps fait ~la moitié des gardes ; un
  plein temps en déficit (vacances) est signalé.
- **Choix du titulaire de 24 h** = le moins chargé vs SA cible (`plRatioHeures`),
  A/S en simple départage.
- **Résorption off-clinic ↔ 24 h** (`plResorberOff24h`) : l'off reprend la
  station, la 24 h redescend en 17h-9h.
- **Alerte « slack → 24 h »** (`plConflits24hSlack`) : 24 h de semaine signalée
  si off-clinic ou médecin dispo non posté le même jour.
- **Continuité** : le modèle binôme par unité a été ESSAYÉ puis ABANDONNÉ (il
  empirait la fragmentation, 2,75 vs 2,59 visages — structure incompatible).
  Seul gain gardé : le rééquilibrage horaire ne transfère plus une journée que
  vers qqn tenant déjà l'unité (consolidation). Piste restante = redesign
  « semaines garde / semaines clinique » (lourd, non fait).

### Échanges (Module 23 étendu)
- **Déblocage** : un échange de garde ne refuse plus si le collègue a une
  journée le jour de la garde OU le lendemain — elles sont **redonnées au
  cédant** ; un **off-clinic** ces jours-là est **retiré** (droit contournable).
  Refus seulement si vraie garde le lendemain (message nomme le type bloquant).
- **UI médecin** : on choisit le **collègue d'abord**, puis les shifts ; collègue
  grisé si aucun échange valide (couvre 2 A/S, etc.).
- **UI admin** (onglet Échanges) : **historique** complet ; **créer un échange**
  direct (appliqué immédiatement) ; **valider/refuser** une proposition en
  attente à la place du médecin.
- Alerte si miroir Sheet non configuré à l'acceptation.

### Rôle PG — Module 28 (NOUVEAU, complet)
PG = postgraduate (MACCS). Deux sous-types cochables dans la fiche médecin :
**PG ULB** (standard) et **Fellow** (suit le régime opt-out). Case **opting out**
(plafond hebdo 48 h sans / 60 h avec, cf. loi 12.12.2010 ; trimestre 624/780 h).
- **Génération PG SÉPARÉE et POSTÉRIEURE aux résidents** : fonction pure
  `genererTrimestrePG(opts)` + bouton admin « 🩺 Générer le planning PG
  (trimestre) ». Elle lit le planning résident publié SANS le modifier.
- **Semaine** : `pg_jour` (8,5 h, 8:45-17:15, lun-ven) dans l'**unité maison**,
  **continuité 3 semaines**, indépendant des résidents.
- **Week-end/férié** : tour PG à part, **2 PG** en `pg_twe` (6 h, 8h-14h) dans
  leur **unité maison**.
- **Unités du week-end attribuées aux résidents** (tour + gardes 24 h) à la
  génération PG : PG prioritaires, résidents prennent les autres en préférant
  leur unité de référence puis une unité déjà tournée (`majResidents`).
- **Gardes PG auto-encodées** : dans « Mes préférences », le PG déclare une date
  → `garde_pg` (24 h) + `recup` le lendemain ; supprime un `pg_jour` ces jours.
  La génération PG préserve ces gardes et bloque la pose ces jours-là.
- **Congé PG** : limite CACHÉE au PG (compteur masqué) + blocage par **trimestre
  civil** : 10 j ouvrés (ULB) / 20 j (Fellow), message générique sans révéler le
  compte. Constantes `PG_CONGE_TRIM_ULB`/`PG_CONGE_TRIM_FELLOW` dans `app.js`.
- **PG exclus du moteur résident** (`genererTrimestre`/`genererPlanning` filtrent
  `grade !== "pg"`) — sinon ils étaient planifiés comme résidents.
- **Google Sheet** : résidents + PG ensemble (PG dans les cellules d'unité +
  lignes « Tour PG (WE) » et « Garde PG (24h) »).
- Types/heures : `PL_HEURES` inclut `pg_jour:8.5, pg_twe:6, garde_pg:24`.

## DÉCISIONS EN SUSPENS / RESTE À FAIRE
1. **Couplage gardes jeudi+samedi → récup lundi** : Charles vérifie si la règle
   change (l'échange recalcule déjà la récup couplée — comportement correct).
2. **Chiffre congé Fellow** = 20 j/trim par défaut (à confirmer ; constante).
3. **Continuité** : redesign « semaines garde / semaines clinique » (optionnel,
   lourd) si la continuité devient prioritaire.
4. **Lissage mensuel** des heures (le trimestre est équitable, le mois bosselé).
5. Rafraîchir `FEUILLE_DE_ROUTE.md` et `CONFORMITE.md` (périmés).
6. Optionnel : garde-fou anti-troncature (vérifie `<script>` + `module.exports`).

## Style d'interaction attendu
- Pose des questions de clarification avant de coder si une règle est ambiguë.
- **Dès qu'un module touche la base : donne le SQL + dis « ⚠️ SQL à exécuter ».**
- Ajoute des tests dans `test_planning.js` pour chaque règle d'algo.
- Après toute édition de `app.js`/`planning.js`/`index.html` : `node --check` +
  anti-troncature (fin de fichier). Édite ces fichiers via script, pas l'éditeur.
- Réponds en français, de façon concise et directe.

**Commence par lire `REGLES_APPLICATION.md`, fais tourner `node test_planning.js`
(107 attendus), vérifie que le SQL `module28_pg.sql` est exécuté (sinon la
génération PG échoue), puis demande-moi par quoi reprendre.**
