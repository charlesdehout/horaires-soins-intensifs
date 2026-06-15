# Prompt de reprise — Application Planning Soins Intensifs (v10)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Reprise après le lot « v10 » : refonte du **mi-temps**
> (gardes/week-ends/stations proratisés au fte, équité **normalisée par la
> quotité**, plancher **90 %**, congés proratisés), **fériés (lot 2 / Module 26)**
> terminé (demande « travailler un férié » + jour de récup visible + fériés
> éditables par l'admin), **miroir Google Sheets (Module 27)** opérationnel,
> **alertes nettoyées**, équité des **off en round-robin**, et corrections
> congés (liste médecin = compteurs, compteur admin qui suit l'année affichée).

---

Tu m'aides à construire une application web de planning pour une unité de soins
intensifs. Je suis médecin intensiviste, non-développeur. Tu codes, je déploie
via **GitHub Desktop** (commit + push) sur **GitHub Pages**. On procède par
modules ; chaque module doit fonctionner et être testable avant le suivant.

## Avant de commencer
Lis : `REGLES_APPLICATION.md` (LA référence des règles, à jour), `regles.js`,
`planning.js`, `app.js`, `index.html`, `sql/`, `google-apps-script/`.
`FEUILLE_DE_ROUTE.md` et `CONFORMITE.md` sont PÉRIMÉS — à rafraîchir à l'occasion.
**Ne réécris pas ce qui existe, étends-le.**

## ⚠️ À VÉRIFIER EN PREMIER
`git pull` puis **`node test_planning.js`** : **86/86 tests au vert** attendus.
Le message de génération affiche la version de l'algo (`PL_VERSION`, actuellement
`v2026.06.15-1`). Si la version n'apparaît pas dans l'app déployée, c'est un cache
GitHub Pages (attendre le déploiement, Ctrl+F5). Les compteurs lisent la BASE :
toute modif d'algo exige une **régénération du trimestre** pour être visible.

> ⚠️ **Fragilité outillage** : sur ce dépôt, l'outil d'édition a parfois TRONQUÉ
> `app.js` / `planning.js` (gros fichiers). Après chaque édition, vérifier
> `node --check` + présence de `module.exports` en fin de fichier. En cas de
> troncature, resplicer la fin depuis HEAD (marqueur unique avant la coupure).
> Privilégier les éditions via script (python/sed) plutôt que l'éditeur sur ces
> deux fichiers.

## Architecture
- Frontend HTML/CSS/JS **vanilla** : `index.html`, `app.js`, `style.css`,
  `regles.js`, `planning.js`. UI par **onglets**. Palette sarcelle.
- Backend **Supabase** (Auth + PostgreSQL, tier gratuit). Calendrier
  **FullCalendar v6**. Export **ExcelJS**. Auth email (Edge Function
  `inviter-medecin`, SMTP Brevo).
- Algorithme : JavaScript pur (`planning.js`), fonction pure testable sous Node.
- **Miroir Google Sheets** : script `google-apps-script/PlanningSheet.gs` (Web App
  Apps Script) + push lecture seule depuis `app.js`.
- Commentaires en français.

## Connexion Supabase (déjà dans app.js)
- Project URL : `https://rmkpuzmqwghzdtsuqgpq.supabase.co` · anon key dans `app.js`.

## SQL à exécuter (Supabase, dans l'ordre — tous idempotents)
Les modules historiques (cf. v9) **plus** :
- **`module26_feries`** : pref_types `travailler_ferie` / `conge_ferie`, colonne
  `preferences.date_compensation`, table `feries_admin`, ET extension de la
  contrainte `shifts_shift_type_check` pour autoriser `conge_ferie` (le jour de
  récup est matérialisé en shift visible).
- **`module27_gsheet`** : table `app_settings` (clé/valeur, admin only) pour
  `gsheet_url` + `gsheet_token` (miroir Google Sheets).

## Règles clés AJOUTÉES/RÉVISÉES depuis la v9 (détail : REGLES_APPLICATION.md)
- **Mi-temps (quotité fte) — modèle proportionnel + normalisé** : gardes de
  semaine ET week-ends proratisés au fte (`poidsGarde`/`poidsWeekend` × fte) ;
  journées de **station plafonnées** (plafond hebdo = `weekly_hours_target`,
  gardes comprises dans le budget) ; **rééquilibrage final normalisé** (transferts
  sur `heures ÷ fte`, seuil `EQUITE.ecart_heures_max` en heures normalisées) ;
  **quota de congés proratisé au fte**. Limite connue : un mi-temps résident reste
  parfois sollicité en garde de semaine (couverture nuit ≥1 résident) → effet
  « bouche-trou ».
- **Plancher 90 %** (`EQUITE.plancher_ratio` = 0.90) : chacun doit atteindre ≥ 90 %
  de SA cible contractuelle (heures ÷ cible, congés crédités) ; sinon alerte dans
  `validerEquite` (rééquilibrage agressif déjà tenté).
- **Fériés (Module 26)** : les 10 fériés belges sont calculés ET **éditables par
  l'admin** (table `feries_admin` : ajout = couvert comme un week-end ; retrait =
  jour ouvré ; via `definirFeriesAdmin` dans `regles.js`). Demande **« travailler
  un férié »** (`travailler_ferie`) : placement PRIORITAIRE du demandeur sur le
  férié (`etat.prioriteFerie`) + jour de récup choisi dans le même formulaire
  (`date_compensation`), BLOQUANT et HORS QUOTA, **matérialisé** en shift
  `conge_ferie` visible. L'ancien `recup_ferie` est retiré de la logique active.
- **Alertes nettoyées** (`validerPlanning` / `alertesAbsences`) : plus de « station
  affectée à 2 médecins » (doublure permise ; seuls Labo≥2 et unité≥3 signalés) ;
  **off-clinic exclu** des « absences simultanées » (contournable) ; l'alerte
  > 60 h/sem précise le **nb de gardes** de la semaine (dont week-end).
- **Off-clinic — équité trimestrielle ROUND-ROBIN** : règle des absences conservée
  (0-4→2, 5-9→1, 10+→0) mais à chaque pose on sert le résident avec le moins d'off
  cumulés sur le trimestre → totaux aussi égaux que la couverture le permet.
- **Congés** : la liste Médecins affiche le quota **effectif** (proratisé contrat ×
  fte) identique aux compteurs d'équipe ; le **compteur admin** (onglet Demandes)
  suit l'**année académique du mois affiché** (et se rafraîchit à la navigation).
- **Échanges** : test de non-régression « le repos post-garde suit la garde ».

## Miroir Google Sheets (Module 27) — état & mise en route
- Script `google-apps-script/PlanningSheet.gs` à coller dans Extensions → Apps
  Script d'un Google Sheet, déployé en **Web App** (« Exécuter en tant que : Moi »,
  « Qui a accès : **Tout le monde** » — sinon le POST anonyme est refusé).
- Jeton partagé `TOKEN` (actuellement `erasme2026`) = champ « mot de passe » de
  l'app (écran admin → onglet Congrès & fermetures → Miroir Google Sheets).
- Push **lecture seule** (no-cors, awaité) à la **publication / échange accepté /
  restauration** + bouton **Resynchroniser**. Lit DIRECTEMENT tous les shifts en
  base (indépendant des `schedules`). Onglets hebdo `JJ-MM-AAAA`, noms de famille
  empilés, hauteur de lignes uniforme. Onglet `_synchro` = diagnostic (heure +
  statut + onglets reçus). Le script **recrée chaque onglet à neuf** (évite l'erreur
  « cellule d'en-tête du Tableau ») ; cellule coin = « Poste ».

## Reste à faire (priorité)
1. **Règle « off-clinic bloque la 24 h »** (demandée, NON commencée) : s'il y a
   quelqu'un en off-clinic un jour, personne ne fait de garde 24 h ce jour-là — on
   « pioche » dans les off pour tenir une journée de station plutôt que de promouvoir
   une garde en 24 h. À coder dans le moteur (`plGenererSemaine`), avec test.
2. **Mi-temps** : résorber le résidu de gardes de semaine (effet « bouche-trou »
   couverture) — option : plafond DUR de gardes/mois pour les mi-temps, relâché si
   la couverture l'exige, avec alerte.
3. Décisions en suspens : plafond d'offs par trimestre ; auto-approbation des
   « dispo » des indépendants ; historique complet des demandes passées.
4. Rafraîchir `FEUILLE_DE_ROUTE.md` et `CONFORMITE.md` (périmés).

## Style d'interaction attendu
- Pose des questions de clarification avant de coder si une règle est ambiguë.
- Donne le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Ajoute des tests dans `test_planning.js` pour chaque règle d'algo, et donne les
  instructions de test à la fin de chaque module.
- **Après toute édition de `app.js`/`planning.js`** : `node --check` + vérifier la
  fin de fichier (anti-troncature).
- Réponds en français, de façon concise et directe.

**Commence par lire `REGLES_APPLICATION.md`, fais tourner `node test_planning.js`
(86 attendus), puis demande-moi par quoi reprendre (off-clinic/24 h en tête).**
