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
- **Statut** : **Salarié** (anciennement « dépendant ») ou **Indépendant** : il
  déclare ses jours de travail via la demande « **✅ Disponible** » (type
  `dispo`, en tête de sa liste de demandes, validée par l'admin). Double effet
  (révision 2026-06-13) : contrainte **dure** (planifiable uniquement sur ces
  jours) **et priorité à l'horaire** — sur un jour déclaré, il passe devant
  pour les journées de station (départage en sa faveur pour les gardes, sous
  l'équité).
- **Grades** : **Résident** et **Assistant spécialiste (A/S)**. (Le grade
  « Spécialiste » a été supprimé ; les ex-spécialistes sont des A/S.)
- **Niveau administratif** (`admin_level`) : principal > secondaire > travailleur —
  sert uniquement à départager des désidératas à souhait égal.

---

## 3. Contraintes DURES (jamais violées par la génération)

- **Jamais 2 A/S ensemble en garde** ; **≥ 1 résident** de garde chaque nuit.
- **Max 3 gardes par semaine** ISO et par médecin.
- **Max 2 week-ends par mois** et par médecin — contrainte **dure** : plus de
  repli silencieux ; en dernier recours absolu (garde sinon vide), la violation
  est **signalée par un conflit explicite**. **La garde du vendredi soir compte**
  (elle se termine le samedi matin : elle **entame** le week-end, clé = samedi).
- **Repos de garde obligatoire** : lendemain de toute garde non planifiable (12 h).
  Le jour de repos de la **semaine suivante** n'est dû **que pour des gardes
  COUPLÉES** : jeudi + samedi → lundi off ; vendredi + dimanche → mardi off.
  Une garde 24 h de week-end **isolée** ne donne que le repos du lendemain.
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
  **week-ends distincts** (sam + dim = 1 ; **vendredi soir + dimanche = 1** —
  la garde du vendredi entame le samedi matin). Écart visé ≤ 2 par grade.
- **Minimisation des week-ends entamés** (révision 2026-06-12) : le tri des
  gardes de week-end raisonne en **coût marginal** — un médecin déjà engagé sur
  CE week-end (garde du vendredi soir) ne « paie » rien à reprendre la 24 h du
  dimanche → il est prioritaire. Vendredi+dimanche ne mobilise ainsi qu'**une**
  personne-week-end au lieu de deux (~77 % des dimanches couplés au vendredi,
  ~81 % des samedis couplés au jeudi sur un trimestre type ; compteurs et
  validateur alignés sur ce comptage).
- **Crédit d'équité des congés** : un jour ouvré de congé est crédité comme une
  journée dans le compteur d'équité horaire (jamais dans les stats ni les
  plafonds). Un médecin en congé n'est donc plus « rattrapé » au-delà des autres
  à son retour (fini les dépassements pendant que des collègues sans congé font
  moins d'heures).
- **Couplage des gardes MAXIMISÉ** (Pt 6, révisé 2026-06-12) : les combos
  **jeudi+samedi** et **vendredi+dimanche** sont favorisés au maximum
  (~75 % des 24 h de week-end couplées sur un trimestre type) :
  le médecin de la garde de nuit de l'avant-veille est préféré pour la 24 h du
  week-end (sans borne d'heures par défaut ; `EQUITE.couplage_tolerance_h` :
  null = illimité, nombre = borne en h, 0 = désactivé), il reste candidat
  même au-delà du plafond souple de 60 h/sem (le repos couplé compense), et le
  jeudi/vendredi la garde de nuit est orientée vers les médecins en déficit de
  week-ends (combo préparé en amont). Garde-fous : équité week-end prioritaire,
  pas de favori déjà en excédent de gardes, et **rééquilibrage final des
  gardes** (`plReequilibrerGardes` : transfert de gardes de nuit lundi→mercredi
  des excédentaires vers les déficitaires, sans toucher aux combos) → équité
  ±1-2 gardes intra-grade conservée. La garde de semaine du médecin couplé
  reste une **17h–9h** (jamais une 24 h).
- **Concentration des gardes de nuit** (M12c, souple) : à déficit strictement égal, on
  privilégie le médecin ayant gardé le plus récemment (regroupe les nuits sans coût
  d'équité). Tunable `EQUITE.concentration_*`.
- **Plafond 60 h/semaine** souple, **plancher horaire (≥ 90 % de la cible de chacun)** : avertissements non bloquants.
- **Quotité (FTE) — révision 2026-06-14 (v2)** : équité **normalisée par la quotité** (`heures ÷ fte`). Les **journées de station**, les **gardes de semaine** ET les **week-ends** sont **proratisés au fte** (poids garde/week-end × fte ; plafond station hebdo) → un mi-temps vise un total ≈ `fte × plein temps`. Le **rééquilibrage final** transfère des journées sur la base des heures normalisées (seuil `EQUITE.ecart_heures_max` en heures normalisées) → les temps pleins restent resserrés et le mi-temps est ramené à sa part. **Quota de congés** proratisé au fte. *Limite connue* : un mi-temps résident reste parfois sollicité en garde de semaine au-delà de sa part quand la couverture nuit (≥1 résident) l'exige (effet « bouche-trou »).

---

## 6. Congés et demandes

### Types de congés à quota (année ACADÉMIQUE 1 oct → 30 sep)
- **Congé annuel** (défaut 24 j ouvrés), **Extra-légaux** (5), **Scientifique** (12).
- Comptés en **jours ouvrés** (lun–ven hors fériés belges), **proratisés au contrat ET à la quotité (FTE)**.
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
- **Onglet Demandes (admin), trois sections** (révision 2026-06-13) :
  les demandes **à valider** (badge de comptage), les demandes **validées à
  venir** (révocables d'un clic — repassent en refusé), et les **compteurs de
  congés par médecin** : jours ouvrés approuvés (+ en attente) / quota
  proratisé au contrat, par type, sur l'année académique en cours, avec total
  restant et dépassements en rouge.

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
  (`recup`, manuel, comptabilisé, bien visible). Repos de garde = **lendemain de
  toute garde** ; + **lundi** si gardes couplées jeudi+samedi, + **mardi** si
  vendredi+dimanche (cf. §3).
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
    La **continuité d'unité est suspendue** pendant les jours de congrès : les
    stations **tournent** de jour en jour (sinon les mêmes médecins retenaient
    leur station toute la semaine du congrès).
  - **Aucune demande de congé possible** pendant un congrès (gérée par l'admin + l'algo).
- **Fermeture d'unité** : l'admin choisit une unité et une période ; le poste n'est ni
  pourvu ni exigé ; la continuité contourne l'unité fermée.

---

## 11 bis. Nouvel engagé, plancher d'heures et compteurs (révision 2026-06-12)

- **Nouvel engagé** (case dans la fiche médecin, `module24_nouvel_engage.sql`) :
  pendant ses **14 premiers jours de contrat**, le médecin est présent **chaque
  jour ouvré en DOUBLURE** d'une unité déjà pourvue (unité choisie librement
  par l'algo, variable d'un jour à l'autre) ; **jamais** de garde, de week-end
  ni de tour. Le statut **doit être retiré par l'admin** : la génération d'un
  trimestre est **bloquée** si la fenêtre est entièrement passée.
- **Occupation des unités** : **jamais plus d'une personne au Labo de choc**
  (aucune doublure possible) ; **maximum 2 personnes par unité** (titulaire +
  1 doublure). Respecté par toutes les doublures (nouvel engagé, plancher
  d'heures) et contrôlé par le validateur. **Pas de doublure sur une unité
  tenue par une garde 24 h** (le médecin de 24 h couvre déjà jour + nuit) —
  seule exception : la doublure de formation du **nouvel engagé**.
- **Correction finale avant brouillon** (révision 2026-06-13) : en fin de
  génération, des **journées de station sont transférées** des médecins les
  plus chargés vers les moins chargés jusqu'à un **écart d'heures cumulées
  ≤ `EQUITE.ecart_heures_max`** (défaut 12 h ≈ une journée ; 0 = désactivé).
  Garde-fous : receveur libre (ni repos, ni congé, jour travaillable, sous
  contrat, pas d'autre unité cette semaine-là — continuité préservée), jours de
  congrès exclus, et le donneur reste au-dessus de son minimum. Résultat
  mesuré : écart trimestriel ≈ 10 h (0,8 h/sem) à pleine disponibilité.
- **Compensation par garde 24 h en semaine** (révision 2026-06-13) : un médecin
  resté **sous son minimum cumulé** (40 h/sem proratisé sur ses jours
  disponibles) prend sa **garde de semaine en 24 h** (station + nuit, +24 h au
  lieu de +15 h) pour rattraper — seuil `GARDES.promotion_24h_deficit_h`
  (défaut 9 h ; 0 = désactivé). Effet miroir : la station ainsi tenue libère un
  jour pour un médecin **en excédent d'heures**, qui récupère (le tri des
  journées sert toujours les moins chargés d'abord — les plus chargés restent
  « non planifiés (repos) »).
- **Minimum d'heures hebdomadaire** (`EQUITE.minimum_hebdo_h`, défaut 40 h ;
  0 = désactivé) : cible = 40 h × FTE × (jours de présence possibles / 5), les
  jours de **repos de garde n'étant pas travaillables**. Si le planning normal
  ne suffit pas, l'algo **double les unités** (journées marquées `doublure`)
  jusqu'à la cible ou épuisement des jours libres.
- **Off-clinic équilibrés sur le trimestre** : à capacité limitée, le résident
  avec le **moins d'offs cumulés** sur le trimestre est servi en premier.
- **Compteurs Mois / Trimestre** : sélecteur au-dessus du tableau (cumul du
  trimestre civil du mois affiché). Nouvelles colonnes **informatives, non
  limitantes** : « Repos g. » (jours de repos de garde) et « Non plan. »
  (jours ouvrés sous contrat sans aucune affectation ni congé).

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

- **Workflow entre médecins** (propose → accepte), sur le planning **publié**,
  via l'onglet **« Échanges »** (médecin) : proposer (mes shifts publiés à venir
  ↔ shift d'un collègue de même nature), listes reçues/émises, accepter /
  refuser / annuler, badge des propositions en attente.
- **À échange égal** : **garde ↔ garde**, **journée ↔ journée**, tour ↔ tour.
- **Refusé** si ça casse une règle de garde (≥ 1 résident, jamais 2 A/S), si le
  receveur a **déjà un shift le même jour**, une **garde la veille**, ou (pour
  une garde) **travaille le lendemain**.
- Un **échange de garde transfère le repos du lendemain** ; le **repos couplé**
  (lundi/mardi, cf. §3) est **recalculé** : transféré, créé ou supprimé selon
  que le nouveau titulaire est couplé ou non.
- Table `shift_swaps` (`sql/module23_echanges.sql`), moteur `validerEchange`
  (pur, testé), application des changements par l'UI à l'acceptation.

---

## 15. Encodage des préférences depuis le calendrier

- Un médecin **sélectionne une plage de dates** sur le calendrier → **popup** (fenêtre
  Du/Au modifiable + type) pour encoder une demande (souhait, congé…). La validation
  quota/règles existante s'applique.
- **Bloqué** sur les dates d'un planning **publié** ou pendant un **congrès**.

---

## 16. Affichage

- **Congés acceptés bien visibles** (révision 2026-06-13) : tout congé/absence
  **approuvé** apparaît au calendrier comme une **pastille nominative**
  (🏖 Nom · Congé annuel…) — l'admin voit tout le monde, chaque médecin voit
  les siens (RLS). Les demandes **en attente** restent en fond discret avec la
  mention « (en attente) ».
- **Calendrier (Mois / Liste)** : ordre des événements par jour imposé — USI 1→5,
  Bordet, Labo, gardes/tour, repos de garde, récup, off, congés, puis synthèse
  « 🛌 N au repos » (admin). Pas de repos affiché les week-ends/fériés.
- **Grille (Poste × Jour)** : postés d'abord (USI 1→Labo, gardes, TWE), puis Off-clinic,
  Récupération, Repos de garde, Congés, et enfin **Non planifiés (repos)** =
  médecins actifs non postés et non en congé (hors contrat et admin exclus).
- **Exports Excel** : noms de famille, titre/semaine, volets figés, impression paysage,
  ligne « Non planifiés (repos) », mois + trimestre + récap individuel.
  **Les onglets hebdomadaires sont nommés d'après le premier jour de la
  semaine** (JJ-MM-AAAA). Export supplémentaire « **Horaires reconnus** » :
  même gabarit que le planning du mois, mais les **colonnes des jours sans
  médecin « reconnu » parmi les personnes de garde sont surlignées en bleu**
  (statut « Médecin reconnu » éditable dans la fiche, `module25_reconnu.sql`).

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
2. Raffinements N3/N4 résiduels (cf. `CONFORMITE.md`).

---

## Annexe — fichiers SQL à exécuter (Supabase, dans l'ordre)

`module2_quota_conges`, `module4_rls`, `module5_planning`, `module6_planning_admin`,
`module6_absences`, `module9_personnel`, `module10_workflow`, `module15_repos_garde`,
`module16_supprimer_grade_specialiste`, `module17_periodes_speciales`,
`module18_recup_ferie`, `module19_preplacement`, `module20_rotation_unites`,
**`module21_durcissement`**, **`module22_sauvegarde_horaire`**, **`module23_echanges`**.
Tous idempotents.
