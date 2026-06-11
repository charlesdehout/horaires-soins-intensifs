# Application Planning Soins Intensifs — Règles & fonctionnement

> Document de référence décrivant ce que fait l'application **aujourd'hui** et ses
> possibilités. Mis à jour le 2026-06-12.
> (Le `.docx` natif sera généré dès que l'environnement de génération sera disponible ;
> ce Markdown s'ouvre et s'importe directement dans Word.)

---

## 1. Présentation générale

Application web de planning pour une unité de soins intensifs. Frontend **HTML/CSS/
JavaScript vanilla** (`index.html`, `app.js`, `style.css`, `regles.js`, `planning.js`),
backend **Supabase** (Auth + PostgreSQL). Déploiement via GitHub Pages.

L'organisation se fait **par ONGLETS** : Planning, Demandes, Congrès & fermetures,
Médecins (admin) ; Mes préférences (médecin). Calendrier **FullCalendar** (vues Mois
et Liste), exports **Excel** (ExcelJS).

L'algorithme de génération du planning (`planning.js`) est une fonction **pure**,
testable sous Node (`test_planning.js`, ~59 cas).

---

## 2. Rôles, statuts et grades

- **Admin (« chef »)** : gère le planning, valide les demandes, configure congrès/
  fermetures. **N'apparaît jamais à l'horaire** (exclu de la génération et des listes
  « repos / non planifiés »).
- **Médecin** : voit le planning, encode ses préférences/demandes.
- **Statut** : **Salarié** (anciennement « dépendant ») ou **Indépendant** (résident
  qui déclare ses semaines disponibles — contrainte dure : planifiable uniquement sur
  les jours déclarés `dispo`).
- **Grades** : **Résident** et **Assistant spécialiste (A/S)**. (Le grade
  « Spécialiste » a été supprimé ; les ex-spécialistes sont des A/S.)
- **Niveau administratif** (`admin_level`) : principal > secondaire > travailleur —
  sert uniquement à départager des désidératas à souhait égal.

---

## 3. Contraintes DURES (jamais violées par la génération)

- **Jamais 2 A/S ensemble en garde** ; **≥ 1 résident** de garde chaque nuit.
- **Max 3 gardes par semaine** ISO et par médecin.
- **Max 2 week-ends par mois** et par médecin.
- **Repos de garde obligatoire** : lendemain de toute garde non planifiable (12 h) ;
  garde 24 h de week-end → repos prolongé (samedi → lundi ; dimanche → lundi + mardi).
- **Hors contrat** → non planifiable ; **jours travaillés** (`jours_travailles`) respectés.
- **Binôme TWE week-end** : le tour du samedi et du dimanche est la **même personne**.
- **Férié en semaine** : suit les règles de couverture du week-end mais **ne compte pas**
  comme week-end travaillé.
- **Continuité clinique** : même station toute la semaine (sauf Labo de choc, cf. §10).

---

## 4. Couverture

### Semaine (jour ouvré)
- **7 stations de jour** à pourvoir : USI 1 à 5, USI Bordet, **Labo de choc**.
- **Nuit** : 2 médecins de garde (≥ 1 résident, jamais 2 A/S).

### Format des gardes de semaine — 17h–9h vs 24 h
- **Par défaut, la garde 24 h n'est plus imposée** : les 2 gardes arrivent à 17h
  (**garde de nuit 17h–9h**).
- Une **garde 24 h** (qui tient une station + la nuit) n'est introduite **que si
  nécessaire** pour pourvoir une station (le vivier de jour manque d'un médecin).
- Quand une 24 h est nécessaire : **A/S préféré** (les résidents restent en 17h–9h, ne
  prenant une 24 h qu'à défaut d'A/S) ; on **évite** de donner une 24 h à qui
  atteindrait 3 gardes dans la semaine.
- Paramétrable dans `regles.js` (`GARDES`) : `garde24h_obligatoire` (revenir au
  comportement historique), `pref_as_24h`, `eviter_24h_a_3_gardes`.

### Week-end / férié
- Pas de stations de jour : **3 médecins au tour (TWE)**, dont **2 en garde 24 h**
  (≥ 1 résident). Le **Labo de choc** est fermé le week-end.

---

## 5. Équité

- Mesurée **INTRA-grade** : résidents entre eux, A/S entre eux (l'écart inter-grade est
  structurel : moins de résidents que d'A/S et ≥ 1 résident/nuit obligatoire).
- **Gardes** équilibrées au **mois** ; **week-ends** au **trimestre**, comptés en
  **week-ends distincts** (sam + dim = 1). Écart visé ≤ 2 par grade.
- **Couplage des gardes** (Pt 6, souple) : à équité strictement égale, la garde de nuit
  de l'avant-veille reprend la 24 h du week-end → repos compensatoire couplé.
- **Concentration des gardes de nuit** (M12c, souple) : à déficit strictement égal, on
  privilégie le médecin ayant gardé le plus récemment (regroupe les nuits sans coût
  d'équité). Tunable `EQUITE.concentration_*`.
- **Plafond 60 h/semaine** souple, **plancher horaire** : avertissements non bloquants.
- **Indépendance au FTE** : un mi-temps présent tous les jours fait autant de gardes.

---

## 6. Congés et demandes

### Types de congés à quota (année ACADÉMIQUE 1 oct → 30 sep)
- **Congé annuel** (défaut 24 j ouvrés), **Extra-légaux** (5), **Scientifique** (12).
- Comptés en **jours ouvrés** (lun–ven hors fériés belges), **proratisés au contrat**.
- **Remise à zéro** automatique au 1er octobre ; le compteur suit le **mois affiché**
  (on peut demander ses congés à l'avance).

### Qui peut demander quoi
- **Le médecin** peut demander : congé annuel / extra-légaux / scientifique,
  indisponibilité (garde), souhait (garde), demande week-end/férié.
- **L'admin uniquement** peut poser : **Formation USI**, **Congé autre / maladie**
  (hors quota), via l'onglet Demandes → « **Forcer un congé / une absence** » (insère
  une absence directement **approuvée** ; l'admin peut dépasser les quotas).

### Workflow de validation
- Une demande de travailleur est créée **en attente** ; **seul l'admin** valide
  (approuve / refuse).
- La génération du planning est **bloquée** tant qu'il reste des demandes en attente.

### Durcissement SERVEUR (Module 21, triggers SQL)
- **Anti-auto-approbation** : un travailleur ne peut pas créer une demande déjà
  approuvée ni changer le statut des siennes.
- **Quota serveur** : refus à la **soumission** si une demande de congé dépasse le quota
  de l'année académique (proration au contrat reproduite côté SQL, fériés belges via
  calcul de Pâques). **L'admin peut forcer** (override).

---

## 7. Indisponibilités & souhaits (de GARDE)

- **Indisponibilité (garde)** = souhait SOUPLE de **ne pas être de garde** ce jour.
  **Non bloquant** (le médecin travaille quand même, p. ex. en journée).
- **Souhait (garde)** = souhait SOUPLE d'**être de garde** ce jour.
- Les deux **ne concernent QUE les gardes** (jamais les journées de station) et
  n'agissent qu'**en départage à équité strictement égale** (ils n'écrasent jamais
  l'équité). À souhait égal, priorité admin principal > secondaire > travailleur.
- La **disponibilité déclarée** des indépendants (`dispo`) reste une contrainte dure
  séparée.

---

## 8. Fériés et récupération (état actuel — refonte prévue)

- Les jours fériés belges sont **calculés** (Pâques + fixes) et traités comme des
  week-ends à la génération.
- **Récup férié (actuel)** : l'app repère a posteriori les fériés travaillés et ouvre
  1 jour compensatoire par férié, à poser sous 6 semaines, validé par l'admin
  (`recup_ferie`, bloquant une fois approuvé).
- ⚠️ **Refonte demandée (à venir)** : une demande unique « **travailler un férié** »
  qui, une fois acceptée, **place** le médecin sur ce férié et ouvre un « congé férié »
  à poser sous 6 semaines (et `recup_ferie` disparaît). **Fériés éditables par l'admin**
  également à intégrer.

---

## 9. Off-clinic (résidents salariés)

- Droit mensuel selon le total d'absences du mois : 0–4 absences → 2 jours ; 5–9 → 1 ;
  10+ → 0. Placement automatique sur jours ouvrables, **jamais** le jour d'une garde, ni
  la veille, ni le lendemain. Crédité 10,5 h.
- **Hiérarchie de limitation (N3)** : pas d'off-clinic un jour qui atteindrait le
  **plafond d'absences simultanées** (`OFFCLINIC.max_absences_jour`, défaut 5) ; on garde
  un **minimum de résidents disponibles** (`min_residents_dispo`). **Arbitrage** : à
  capacité limitée, les résidents qui ont déjà le plus de congés (puis d'absences) cèdent
  leur off-clinic en premier ; le droit non plaçable est **reporté** dans le mois.

---

## 10. Repos, continuité et rotation

- **Deux repos** : **repos de garde** (auto, affiché, NON comptabilisé) vs **Récupération**
  (`recup`, manuel, comptabilisé, bien visible).
- **Continuité d'unité** sur la semaine, base = **unité de référence** du trimestre.
- **Rotation trimestrielle** (M20) : l'admin propose une rotation des unités maison
  (`unite_reference`), éditable, évitant l'unité du trimestre précédent.
- **Labo de choc — exception** : **pas de continuité hebdomadaire ni d'ancrage
  trimestriel** ; il est pourvu chaque jour par qui est libre et exclu des propositions
  de rotation (`PL_STATIONS_SANS_CONTINUITE`).

---

## 11. Congrès & fermetures d'unités (Module 17)

- **Congrès** (ISICEM / ISICARE…) : saisi par l'admin (libellé + dates).
  - **La participation ne crée PLUS d'absence** : tout le monde peut participer ; un
    horaire DOIT pouvoir être généré.
  - **Équipe minimale** : en semaine, les **2 gardes de nuit sont forcées en 24 h**
    (tiennent une station + la nuit) ; tolérance de stations vides
    (`COUVERTURE.congres_postes_vides`). Les non-planifiés vont au congrès.
  - **Équité des jours de congrès prioritaire** : on sert d'abord le médecin qui a
    travaillé le **moins** de jours de congrès → tout le monde a ~le même nombre de jours
    libres (au-dessus de l'équité gardes/heures, sous les contraintes dures).
  - **Aucune demande de congé possible** pendant un congrès (gérée par l'admin + l'algo).
- **Fermeture d'unité** : l'admin choisit une unité et une période ; le poste n'est ni
  pourvu ni exigé ; la continuité contourne l'unité fermée.

---

## 12. Pré-placements & alertes

- **Pré-placement épinglé** (M19) : l'admin coche « 📌 Épingler » un shift ; les épinglés
  sont conservés et respectés à la (re)génération, l'algo construit autour.
- **Alertes absences simultanées** (§14, informatif) : par jour, 1–3 normal · 4–5
  attention (🟠) · 6+ critique (🔴) ; + alerte si aucun résident dispo la nuit.

---

## 13. Suppression & restauration de l'horaire (Module 22)

- **Snapshot automatique à chaque publication** d'un mois (table `schedule_backups`).
- **Supprimer le trimestre** (1 clic, admin) : sauvegarde de sécurité puis efface
  shifts + statuts des 3 mois.
- **Restaurer le dernier publié (trimestre)** : réinjecte le dernier snapshot publié de
  chaque mois **en brouillon** (modifiable), remplaçant l'actuel.

---

## 14. Échange de shifts (Module 23)

- **Workflow entre médecins** (propose → accepte), sur le planning **publié**.
- **À échange égal** : **garde ↔ garde**, **journée ↔ journée**, tour ↔ tour.
- **Refusé** si ça casse une règle de garde (≥ 1 résident, jamais 2 A/S) sur les jours
  concernés. Un **échange de garde échange aussi le repos de garde**.
- Moteur `validerEchange` (testé) en place ; **UI du workflow à finaliser**.

---

## 15. Encodage des préférences depuis le calendrier

- Un médecin **sélectionne une plage de dates** sur le calendrier → **popup** (fenêtre
  Du/Au modifiable + type) pour encoder une demande (souhait, congé…). La validation
  quota/règles existante s'applique.
- **Bloqué** sur les dates d'un planning **publié** ou pendant un **congrès**.

---

## 16. Affichage

- **Calendrier (Mois / Liste)** : ordre des événements par jour imposé — USI 1→5,
  Bordet, Labo, gardes/tour, repos de garde, récup, off, congés, puis synthèse
  « 🛌 N au repos » (admin). Pas de repos affiché les week-ends/fériés.
- **Grille (Poste × Jour)** : postés d'abord (USI 1→Labo, gardes, TWE), puis Off-clinic,
  Récupération, Repos de garde, Congés, et enfin **Non planifiés (repos)** =
  médecins actifs non postés et non en congé (hors contrat et admin exclus).
- **Exports Excel** : noms de famille, titre/semaine, volets figés, impression paysage,
  ligne « Non planifiés (repos) », mois + trimestre + récap individuel.

---

## 17. Paramètres ajustables (`regles.js`)

- `CONGE_TYPES` (quotas), `POSTES_JOUR` (unités), `COUVERTURE` (min nuit, TWE, gardes
  week-end, `congres_postes_vides`), `EQUITE` (plafond/plancher, concentration),
  `GARDES` (24 h obligatoire ?, préférence A/S, éviter 3 gardes), `OFFCLINIC`
  (plafond absences, min résidents), `PREF_BLOQUANTES`, `PL_STATIONS_SANS_CONTINUITE`.

---

## 18. En chantier / à venir

1. **Fériés (lot 2)** : demande « travailler un férié » → placement par l'algo + congé
   férié sous 6 sem. ; suppression de `recup_ferie` ; fériés éditables par l'admin.
2. **Échange de shifts** : finaliser l'**UI du workflow** (proposer / accepter).
3. Raffinements N3/N4 résiduels (cf. `CONFORMITE.md`).

---

## Annexe — fichiers SQL à exécuter (Supabase, dans l'ordre)

`module2_quota_conges`, `module4_rls`, `module5_planning`, `module6_planning_admin`,
`module6_absences`, `module9_personnel`, `module10_workflow`, `module15_repos_garde`,
`module16_supprimer_grade_specialiste`, `module17_periodes_speciales`,
`module18_recup_ferie`, `module19_preplacement`, `module20_rotation_unites`,
**`module21_durcissement`**, **`module22_sauvegarde_horaire`**, **`module23_echanges`**.
Tous idempotents.
