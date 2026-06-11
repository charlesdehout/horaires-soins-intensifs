# Feuille de route — Application Planning Soins Intensifs

> État d'avancement. Légende : ✅ fait · 🔜 à faire · 🟡 partiel · ⚠️ point ouvert.
> Mis à jour le 2026-06-11.

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

## ✅ Fait dans ce lot (juin 2026 — refonte graphique)

- **Site — refonte « sarcelle médical »** (aucun changement de logique métier) :
  - **En-tête d'application** (titre, nom + badge de rôle, déconnexion) et
    **navigation par onglets** : Planning (tous, avec les outils admin du mois),
    Demandes (avec pastille de comptage), Congrès & fermetures, Médecins
    (admin) ; Mes préférences (médecin). Barre d'onglets collante ;
    `calendrier.updateSize()` au retour sur l'onglet Planning.
  - **Palette teal** centralisée dans `:root` (style.css) — les anciens noms
    `--bleu`/`--bleu-fonce` restent des alias. Tableaux zébrés + en-têtes
    teintés, badges de grade (résident mauve / A/S sarcelle), boutons et
    FullCalendar assortis.
- **Exports Excel retravaillés** :
  - **Noms de FAMILLE** (plus le prénom) dans le planning ; initiale du prénom
    ajoutée en cas d'homonymie (« Dupont C. » / « Dupont L. »).
  - Colonnes élargies (18) et lignes de station avec **hauteur mini de 2 noms**
    (un 2e médecin peut être écrit à la main dans la même cellule).
  - **Ligne de titre fusionnée** par feuille (« semaine du … au … »),
    **volets figés** (colonne des postes + en-têtes), en-têtes différenciés
    semaine / week-end-férié / congrès, **impression paysage** ajustée à la
    largeur (planning + récap individuel).
  - Vérifié sous Node avec ExcelJS (écriture + relecture du classeur).

## ✅ Fait dans ce lot (juin 2026 — Pt 5 & Pt 6)

- **Pt 5 — Récup bien visible** (aucun SQL ; `app.js` + `index.html`) :
  - `recup` distingué de `repos_garde` : libellé « Récupération », code « Récup »,
    couleur **cyan #0891b2** (avant : gris terne, peu distinct du mauve du repos
    de garde) au calendrier et dans la grille.
  - **Grille** : la ligne fourre-tout « Absences / repos » est éclatée en lignes
    dédiées — **Récupération**, **Repos de garde**, **Off-clinic**, **Congés** ;
    le clic sur une cellule vide pose le bon type selon la ligne. On voit d'un
    coup d'œil qui est en récup chaque jour.
  - **Légende corrigée** : avant, la puce « Récup » affichait en réalité le mauve
    du repos de garde (et la vraie récup n'y figurait pas). Désormais deux entrées
    distinctes : « Récup (comptée) » (cyan) et « Repos de garde » (mauve).
  - Exports Excel inchangés (ils utilisent leurs propres remplissages `XL.*`).
- **🐞 Pt 6 — Couplage des gardes** (`planning.js` + 1 test) :
  - Le repos compensatoire couplé (jeudi-nuit + samedi-24h → lundi ;
    vendredi-nuit + dimanche-24h → mardi) se déclenchait rarement car la
    génération ne reliait pas la garde de nuit de l'avant-veille à la garde 24 h
    du week-end. Ajout d'un **départage SOUPLE** dans `plTrier`/`plChoisirWE` :
    à équité **strictement égale**, le médecin de la garde de nuit de l'avant-veille
    est favorisé pour la garde 24 h → le repos couplé se matérialise plus souvent,
    **sans dégrader l'équité intra-grade** (écart gardes A/S maintenu ≤ 2).
  - Choix retenu : préférence souple (et non « forte »), car le couplage fort
    portait l'écart de gardes A/S à 3. Le mécanisme privilégie le couplage chaque
    fois que les ex æquo le permettent.
  - **Tests** : nouveau cas « couplage nuit→24h week-end → repos couplé » →
    **36/36 verts**.

## ✅ Fait dans ce lot (juin 2026 — Pt 3a : désidératas)

- **Priorités des désidératas** (`planning.js` + selects `app.js` + 3 tests) :
  à souhait égal, **admin principal > secondaire > travailleur** (réutilise
  `admin_level`, déjà en base — **aucun SQL**). Implémenté comme DÉPARTAGE entre
  médecins souhaitant le même jour, dans `plTrier` et `plTrierGardeNuit` : la
  priorité n'agit qu'entre souhaiteurs et **n'écrase pas l'équité**. `admin_level`
  ajouté aux `select` doctors des deux générations (mois + trimestre).
- **Quota 20/trimestre — INDICATIF (non bloquant)** (`app.js`) : compteur
  « Désidératas T<n> AAAA : X/20 » sous les quotas de congés (trimestre **civil**
  du mois affiché ; compté par souhait dont la date de début tombe dans le bloc),
  + avertissement non bloquant à la saisie au-delà de 20. La saisie reste permise.
- **Tests** : 3 cas (indépendant, dépendant, non-régression équité) → **39/39**.
- **Note d'interprétation** : « admin principal = priorité absolue » est rendu par
  un départage entre désidératas (le principal passe devant les autres souhaiteurs),
  PAS par un passage devant l'équité. À renforcer si souhaité.

## ✅ Fait dans ce lot (juin 2026 — Pt 3b : récup férié)

- **Récup férié (jour compensatoire)** — **PAS d'auto-crédit** : un médecin qui
  TRAVAILLE un jour férié (garde / tour / journée) a droit à **1 jour** de congé
  compensatoire, à poser **dans les 6 semaines** qui suivent le férié, **validé
  par l'admin** (workflow de demande).
  - Nouveau `pref_type` **`recup_ferie`** : migration **`sql/module18_recup_ferie.sql`**
    (idempotent, reconstruit le CHECK). À lancer dans le SQL Editor Supabase.
  - **Bloquant une fois approuvé** : `recup_ferie` ajouté à `PREF_BLOQUANTES`
    (regles.js) → jour non planifiable. Option ajoutée au sélecteur (index.html).
  - **app.js** : calcul des **fériés travaillés** (depuis les shifts du médecin),
    affichage « Récup fériés : posées/acquises + échéances à 6 sem. » sous les
    quotas ; à la saisie, **blocage si aucun férié travaillé**, **alerte non
    bloquante** si la date est hors des 6 semaines ou si le droit est dépassé
    (l'admin tranche). Couleur cyan (cf. récup).
  - **Tests** : 1 cas (récup férié approuvée → jour non planifiable) → **40/40**.

## ✅ Fait dans ce lot (juin 2026 — §14 : alertes absences simultanées)

- **Alertes « absences simultanées »** (`planning.js` + `app.js` + `style.css`,
  **aucun SQL**) : fonction pure exportée **`alertesAbsences`** qui, par jour du
  mois, compte les médecins absents (préférences bloquantes + shifts d'absence,
  **hors repos de garde automatique**) et gradue : **1–3 normal** (rien) ·
  **4–5 attention** (contournable) · **6+ critique**. Vérifie aussi qu'au moins
  **1 résident reste disponible la nuit** (alerte critique sinon).
  - Affichage dans la zone « conflits » de l'onglet Planning, **à part** des
    conflits durs, avec sévérité colorée (🟠 attention / 🔴 critique). Informatif,
    non bloquant.
  - **Tests** : 4 cas (4→attention, 6→critique, tous résidents absents→nuit,
    3→rien) → **44/44 verts**.

## ✅ Fait dans ce lot (juin 2026 — Module 21 : durcissement / sécurité serveur)

- **Garde-fous CÔTÉ SERVEUR sur `preferences`** (`sql/module21_durcissement.sql`,
  idempotent ; **aucun changement JS** → `test_planning.js` reste 48/48) :
  - **Anti-auto-approbation** : trigger `trg_preferences_durcissement` — un
    travailleur (non-`is_admin()`) ne peut PAS créer une demande déjà
    `approuve`/`refuse` (statut imposé `en_attente`) ni modifier le statut de
    ses propres demandes. Seul l'admin valide. (Répond à la note ⚠️ de
    `module10_workflow.sql`.)
  - **Quota de congés à la SOUMISSION** : refus serveur si une demande
    (`conge`/`conge_annuel`/`extralegal`/`scientifique`), ajoutée aux demandes
    `en_attente` + `approuve` de la même catégorie, dépasse le quota de l'**année
    académique** (1 oct → 30 sep). **L'admin peut FORCER** (régularisation,
    congé exceptionnel) — le contrôle ne s'applique qu'aux non-admins.
  - **Logique miroir d'`app.js`** : jours OUVRÉS lun–ven hors **fériés belges**
    (Pâques calculée, Meeus/Butcher), année académique, **proration au contrat**
    exacte (`f_fraction_contrat`). Fonctions SQL dédiées : `f_paques`,
    `f_est_ferie_be`, `f_est_jour_ouvre`, `f_annee_academique`,
    `f_jours_ouvres_acad`, `f_fraction_contrat`.
  - **Tests serveur** (en bas du fichier SQL) : auto-approbation refusée,
    changement de statut refusé, dépassement de quota refusé, admin non bloqué.
  - **À lancer** dans le SQL Editor Supabase APRÈS `module10` + `module18`.

## ✅ Fait dans ce lot (juin 2026 — Module 11b : hiérarchie off-clinic)

- **Off-clinic — limitation & arbitrage** (`planning.js` `genererOffClinic` +
  `regles.js` `OFFCLINIC` + 2 tests ; **aucun SQL**) :
  - **Plafond d'absences simultanées** : on n'ajoute pas un off-clinic un jour
    où le nombre d'absents (méthode §14) atteindrait `OFFCLINIC.max_absences_jour`
    (défaut 5, sous la zone critique 6+) → le droit est **reporté** sur un autre
    jour ouvrable éligible du mois.
  - **Minimum de résidents disponibles** : on garde ≥ `OFFCLINIC.min_residents_dispo`
    résidents non absents ce jour-là (couverture de nuit). Non appliqué si
    l'effectif résident est ≤ ce seuil (insatisfiable).
  - **Arbitrage « retirer d'abord à ceux qui ont déjà des congés »** : à capacité
    limitée, les résidents avec le PLUS de congés (puis d'absences totales) sont
    traités EN DERNIER → ils **cèdent leur off-clinic en premier** ; départage
    final par ordre d'origine (stable).
  - **Rétro-compatible** : comportement identique sans saturation (faibles
    absences, effectif résident > seuil). Paramètres tunables dans `regles.js`.
  - **Tests** : 2 cas (report sur jour saturé ; arbitrage congés entre 2 résidents)
    → **50/50 attendus** (à confirmer en local).

## ✅ Fait dans ce lot (juin 2026 — Gardes semaine : 17h–9h vs 24h)

- **La garde 24 h de semaine n'est plus imposée** (`planning.js` `plGenererSemaine`
  + `regles.js` `GARDES` + 1 test) — **⚠️ refonte du couplage jour/nuit, à
  valider en local (tests non exécutables cette session)** :
  - Chaque nuit de semaine = 2 gardes (≥1 résident, jamais 2 A/S, inchangé).
    **Par défaut, les 2 arrivent à 17h (`garde_nuit` 17h–9h)** ; une `garde_24h`
    n'est introduite **que si le vivier de jour ne suffit pas à pourvoir les 7
    stations** (la 24 h tient alors une station). → besoin d'un médecin de jour
    de plus les jours « tout en 17h–9h » (≈ 9 présences/jour).
  - **A/S préféré pour la 24 h** (`pref_as_24h`) : les résidents restent en
    17h–9h, ne prenant une 24 h qu'à défaut d'A/S. **Éviter la 24 h à qui
    atteindrait 3 gardes/sem** (`eviter_24h_a_3_gardes`) : départage par charge
    de gardes croissante. Préférences SOUPLES (la couverture reste prioritaire).
  - **Drapeau de repli** `GARDES.garde24h_obligatoire = true` → comportement
    HISTORIQUE exact (1 garde 24 h imposée/jour). À utiliser si la refonte
    pose souci (revient au planning d'avant ce lot).
  - **Équité/contraintes dures inchangées** : nombre de gardes/jour et sélection
    des médecins de nuit identiques ; seul le FORMAT (17h–9h vs 24 h) change →
    redistribution d'heures, sans toucher au comptage de gardes/week-ends.
  - **Test** : « nuit confortable = 2× 17h–9h, pas de 24h ». ⚠️ Lancer
    `node test_planning.js` en local et vérifier les ~50 cas (surveiller le
    couplage Pt6 et la couverture des stations).

## 🔜 Reste à faire (par priorité)

- N4 : suppression TOTALE de l'off-clinic en dernier recours (au-delà de la
  limitation actuelle).
- Raffinements N3/N4 restants éventuels (cf. CONFORMITE.md).

## ✅ Fait dans ce lot (juin 2026 — Module 20 : rotation trimestrielle des unités)

- **Rotation trimestrielle des unités** (`planning.js` + `app.js` + `index.html`
  + `style.css` + **`sql/module20_rotation_unites.sql`**) :
  - Nouvelle colonne **`doctors.unite_reference`** : station « maison » du médecin
    pour le trimestre, **base de la continuité** hebdomadaire à la génération.
  - **Algorithme** : `plChoisirStation` et la continuité de `plGenererSemaine`
    démarrent sur `unite_reference` si la station de la semaine n'est pas encore
    fixée. **Rétro-compatible** : sans `unite_reference`, comportement inchangé.
  - **Proposition modifiable** (onglet Planning, admin) : bouton « Proposer une
    rotation » → unité précédente **dérivée des shifts du trimestre précédent**
    (pas de table d'historique), proposition équilibrée évitant l'unité
    précédente, tableau **éditable** (un menu par médecin), puis « Enregistrer »
    écrit `unite_reference` → s'applique à la prochaine génération.
  - **Tests** : 1 cas (l'unité de référence dicte la continuité) → **48/48 verts**.

## ✅ Fait dans ce lot (juin 2026 — Module 19 : pré-placement manuel)

- **Pré-placements ÉPINGLÉS respectés à la génération** (`planning.js` + `app.js`
  + `index.html` + `style.css` + **`sql/module19_preplacement.sql`**) :
  - Nouvelle colonne **`shifts.epingle`** (bool, défaut false). L'admin coche
    « 📌 Épingler » dans la modale d'un shift posé à la main ; seuls les épinglés
    survivent à une (re)génération (les auto sont remplacés).
  - **Algorithme** : `genererPlanning`/`genererTrimestre` acceptent `prePlaces`
    (les épinglés). `plGenererSemaine` et `plGenererWeekend` posent ces shifts
    TELS QUELS et **construisent autour** : médecins épinglés exclus des
    sélections, stations/gardes/tour épinglés comptés, complétion du reste dans
    le respect des règles dures (≥1 résident, jamais 2 A/S, binôme TWE, couplage,
    récup). **Comportement strictement identique en l'absence de pré-placement.**
  - Étendue complète : stations de jour, gardes de nuit/24 h, tour (TWE) et
    absences peuvent être épinglés. Repère **📌** dans la grille.
  - **Tests** : 3 cas (station semaine, garde nuit semaine, garde 24 h week-end)
    → **47/47 verts**.

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
