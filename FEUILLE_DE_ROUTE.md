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

## 🔜 Reste à faire (par priorité)

4. **Récup férié auto-crédit** (§8.2) + **désidératas** (quota 20/trimestre +
   priorités admin principal > secondaires > travailleurs). *Touche la base (SQL).*
5. **Congrès ISICEM / ISICARE** (dates manuelles) + **fermetures d'unités**
   (été/Noël) avec couverture adaptée. *Touche la base.*
6. **Rotation trimestrielle des unités** (historique tracé, proposition modifiable).
7. **Alertes absences simultanées** (§14 : 1–3 normal, 4–5 attention, 6+ critique ;
   ≥1 résident dispo la nuit) + **pré-placement manuel** respecté à la génération.
8. **Durcissement** : triggers SQL quotas côté serveur ; empêcher l'auto-approbation
   des demandes.

## ⚠️ Points ouverts à arbitrer

- **Tests de référence `test_planning.js`** : les assertions « écart ≤ 2 »
  (gardes, week-ends) et « ≤ 2 week-ends/mois » ne tiennent **pas** sur l'algo
  actuel — déséquilibre **structurel** : un résident est obligatoire sur le 1er
  créneau de chaque nuit → les résidents ont mécaniquement plus de gardes que les
  A/S (écart ~5 même sans M12c). À décider : recalibrer ces seuils, ou revoir la
  répartition résidents/A‑S (sujet de fond).
- **Statut `specialiste`** : la spec ne connaît que Résident & A/S → clarifier son rôle.

## Notes techniques

- Frontend vanilla (`index.html`, `app.js`, `style.css`, `regles.js`, `planning.js`),
  backend Supabase. Déploiement GitHub Desktop → GitHub Pages.
- Validation de référence : `node test_planning.js` **en local** après `git pull`.
- Paramètres métier ajustables dans `regles.js` (`EQUITE`, couverture, quotas, fériés).
