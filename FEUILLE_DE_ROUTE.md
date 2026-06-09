# Feuille de route — Application Planning Soins Intensifs

> État d'avancement. Légende : ✅ fait · 🔜 à faire · 🟡 partiel · ⚠️ point ouvert.
> Mis à jour le 2026-06-09.

## ✅ Socle déjà en place (Modules 1–12 + exports v1)

- **M1–M7** : authentification Supabase, CRUD médecins, préférences/congés avec
  quotas, calendrier FullCalendar, génération **mensuelle** puis **trimestrielle**
  avec équité proportionnelle à la disponibilité.
- **Règles dures N1** : jamais 2 A/S en garde, ≥1 résident, max 3 gardes/semaine,
  binôme TWE sam=dim, max 2 week-ends/mois, férié-semaine non compté,
  hors-contrat non planifiable, génération bloquée si demandes en attente.
- **M9** personnel · **M10** workflow de validation · **M11** off-clinic auto.
- **Split `repos_garde`** : repos de garde auto (affiché, non comptabilisé) vs
  repos manuel `recup` (comptabilisé).
- **M12a/b** : gardes sans biais de grade, plafond 60 h/sem souple, plancher
  horaire, ±1 garde, repos compensatoires couplés — évalués sur le **trimestre**.

## ✅ Fait dans ce lot (juin 2026)

- **🐞 Bug export Excel « lignes écrasées »** : hauteurs de ligne recalculées
  (généreuses), colonnes élargies → plus de texte rogné.
- **Prénoms courts** dans l'export planning (+ initiale du nom en cas d'homonymie,
  ex. « Camille Ben. » / « Camille Ber. »).
- **M12c — concentration des gardes de nuit** (semaine) : départage à déficit
  STRICTEMENT égal en faveur du médecin ayant gardé le plus récemment ; regroupe
  les nuits sans coût d'équité (tunable `EQUITE.concentration_*`).
- **Export par TRIMESTRE** : bouton dédié, un onglet par semaine (~13).
- **Week-end / férié** : Labo de choc affiché « Fermé », autres unités vides
  éditables. **1 ligne vierge par unité** pour la saisie manuelle.
- **Compteurs du mois** : colonne « # » (numéro de liste), total de médecins,
  **tri croissant/décroissant** au clic sur chaque colonne.

## ✅ Fait dans ce lot (juin 2026 — révision)

- **Suppression du grade « Spécialiste »** : seuls Résident et A/S subsistent.
  Migration `sql/module16_supprimer_grade_specialiste.sql` (bascule des
  ex-spécialistes en A/S + contrainte CHECK), UI nettoyée (index.html, app.js),
  équipe de test passée à 6 R + 8 A/S. Les ex-spécialistes sont désormais soumis
  à « jamais 2 A/S en garde ».
- **Équilibrage des week-ends revu (V3)** : poids week-end calculés sur le
  **trimestre** (plus de reset mensuel → charge lissée) et équité comptée en
  **week-ends DISTINCTS** (sam+dim = 1, plus 2). Résultat : A/S quasi parfaits
  (écart ~1), gardes resserrées (écart ≤ 2 par grade). Aucune contrainte dure
  cassée. (Gardes toujours équilibrées au MOIS.)
- **Tests d'équité reformulés en INTRA-grade** (`test_planning.js`) : 27/27
  verts. L'équité se mesure résidents-entre-eux et A/S-entre-eux.
- **Quotas de congés en ANNÉE ACADÉMIQUE (1 oct → 30 sep)** : comptage, proration
  au contrat et contrôle bloquant basculés de l'année civile vers l'académique
  (les 3 types : annuel, extra-légaux, scientifique). Remise à zéro automatique
  au 1er octobre (le consommé est dérivé des préférences). 100 % côté `app.js`,
  pas de SQL. Affichage « 2025–2026 ». Proration : quota PLEIN si le contrat
  couvre toute l'année académique OU s'il ne la chevauche pas du tout (dates
  absentes / hors période) ; proratisé seulement en couverture PARTIELLE (évite
  un quota « 0 » qui bloquerait la saisie de congé). Le compteur suit le MOIS
  AFFICHÉ au calendrier (pas la date système) : naviguer au-delà du 1er octobre
  bascule sur la nouvelle année académique (à 0) → permet de demander ses congés
  à l'avance ; rafraîchi via `datesSet`.
- **Souhaits / désidératas effectifs (« je veux travailler ce jour »)** : le
  souhait, jusque-là inerte, oriente désormais la génération. Pour un médecin
  INDÉPENDANT il est QUASI-BLOQUANT (priorité absolue en tête des tris de gardes
  nuit / week-end / jour) ; pour un DÉPENDANT il reste SOUPLE (départage tardif,
  n'écrase pas l'équité). `planning.js` + tests. Aucune régression (27/27 + 3
  tests souhait).
- **Congé accepté → réduit la CIBLE horaire du mois** (compteurs admin) : chaque
  jour de congé accepté (préférence approuvée ou shift congé) retire la charge
  quotidienne attendue (cible hebdo / nb jours travaillables) → une semaine de
  congé = −1 semaine de cible. Marqueur « * » + infobulle détaillant le calcul.
  `app.js` + `style.css`, pas de SQL.

## ✅ Fait dans ce lot (juin 2026 — Module 17)

- **Congrès ISICEM / ISICARE + fermetures d'unités** (spec §1.3, §1.4, §3.2) :
  - Nouvelle table `special_periods` (**`sql/module17_periodes_speciales.sql`**,
    idempotent) : type `congres` | `fermeture`, libellé, unité (si fermeture),
    dates. Lecture pour tous, **écriture admin uniquement** (RLS).
  - **Congrès** : saisie admin (dates manuelles annuelles). En SEMAINE, les
    7 unités restent ouvertes mais jusqu'à **2 stations vides sont tolérées**
    (paramètre `COUVERTURE.congres_postes_vides` dans regles.js) — décision
    utilisateur (la spec disait 6 unités / Labo fermé). Un congrès tombant un
    week-end suit les règles week-end normales (et compte comme week-end
    travaillé si planifié, §7). **Participants cochés par l'admin** à la
    création → une absence APPROUVÉE (congé scientifique ou formation, au
    choix) est créée pour chacun ; à la suppression du congrès, l'app propose
    de supprimer aussi ces absences (repérées par note + dates).
  - **Fermeture d'unité** : l'admin choisit l'unité (n'importe laquelle des 7,
    cumulable) et la période → le poste n'est **ni pourvu ni exigé** à la
    génération et à la validation ; une affectation manuelle sur une unité
    fermée est signalée en conflit. La continuité de station contourne
    l'unité fermée.
  - **Affichage** : fond orange (congrès) / gris (fermeture) au calendrier
    (visibles par tous, infobulle), en-tête orange + libellé du congrès et
    cellules « Fermé » dans la grille et les exports Excel (mois + trimestre).
  - **Tests** : 4 nouveaux cas (fermeture génération/validation, tolérance
    congrès, congrès week-end) → **35/35 verts**.

## 🔜 Reste à faire (par priorité)

4. **Récup férié auto-crédit** (§8.2) + **désidératas** (quota 20/trimestre +
   priorités admin principal > secondaires > travailleurs). *Touche la base (SQL).*
6. **Rotation trimestrielle des unités** (historique tracé, proposition modifiable).
7. **Alertes absences simultanées** (§14 : 1–3 normal, 4–5 attention, 6+ critique ;
   ≥1 résident dispo la nuit) + **pré-placement manuel** respecté à la génération.
8. **Durcissement** : triggers SQL quotas côté serveur ; empêcher l'auto-approbation
   des demandes.

## ⚠️ Points ouverts à arbitrer

- **Écart inter-grade gardes/week-ends — STRUCTUREL et attendu** (résolu sur le
  fond) : un résident est obligatoire sur le 1er créneau de chaque nuit, et il y
  a moins de résidents (6) que d'A/S (8) → plancher ≈ nb_nuits / nb_résidents
  (~15 gardes/résident sur un trimestre), donc les résidents font mécaniquement
  ~5 gardes de plus que les A/S. Ce n'est PAS un bug : l'équité se mesure
  **intra-grade** (résidents entre eux, A/S entre eux), ce que l'algo atteint
  (écart ≤ 2 gardes par grade). Les tests reflètent désormais cette définition.
- **Week-ends résidents** : restent un peu plus dispersés (écart ≤ 4 sur le
  trimestre, jusqu'à 3 week-ends sur un mois) pour la même raison structurelle.
  Améliorable seulement en augmentant l'effectif résident ou en assouplissant la
  règle « ≥1 résident/nuit » (décision clinique, hors scope algo).

## Notes techniques

- Frontend vanilla (`index.html`, `app.js`, `style.css`, `regles.js`, `planning.js`),
  backend Supabase. Déploiement GitHub Desktop → GitHub Pages.
- Validation de référence : `node test_planning.js` **en local** après `git pull`.
- Paramètres métier ajustables dans `regles.js` (`EQUITE`, couverture, quotas, fériés).
