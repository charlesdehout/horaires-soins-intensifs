/* =====================================================================
   Planning Soins Intensifs — Module 1 : Authentification
   ---------------------------------------------------------------------
   Logique : connexion via Supabase Auth, puis détection du rôle
   (admin ou médecin) en lisant la table "doctors".
   ===================================================================== */


/* ---------------------------------------------------------------------
   CONFIGURATION  ← À MODIFIER (une seule fois)
   Remplace les deux valeurs ci-dessous par celles de TON projet Supabase.
   Tu les trouves dans : Supabase → Project Settings → API
     - Project URL      → SUPABASE_URL
     - anon public key   → SUPABASE_ANON_KEY
   (La clé "anon" est publique : pas de danger à la mettre ici.)
   --------------------------------------------------------------------- */
const SUPABASE_URL = "https://rmkpuzmqwghzdtsuqgpq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJta3B1em1xd2doemR0c3VxZ3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjAyNzQsImV4cCI6MjA5NjMzNjI3NH0.13dKTlGEhE65SqFfVgJK4W1jBjavrmGXdku8VQadYYE";


/* --------------------------------------------------------------------- */
/* Initialisation du client Supabase                                     */
/* --------------------------------------------------------------------- */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


/* --------------------------------------------------------------------- */
/* Références aux éléments du DOM                                        */
/* --------------------------------------------------------------------- */
const loginView   = document.getElementById("login-view");
const appView     = document.getElementById("app-view");
const loginForm   = document.getElementById("login-form");
const loginBtn    = document.getElementById("login-btn");
const loginMsg    = document.getElementById("login-message");
const welcomeText = document.getElementById("welcome-text");
const roleText    = document.getElementById("role-text");
const adminZone   = document.getElementById("admin-zone");
const doctorZone  = document.getElementById("doctor-zone");
const logoutBtn   = document.getElementById("logout-btn");

/* Références DOM — gestion des médecins (Module 2) */
const addDoctorBtn    = document.getElementById("add-doctor-btn");
const doctorForm      = document.getElementById("doctor-form");
const doctorId        = document.getElementById("doctor-id");
const dName           = document.getElementById("d-name");
const dEmail          = document.getElementById("d-email");
const dGrade          = document.getElementById("d-grade");
const dFte            = document.getElementById("d-fte");
const dHours          = document.getElementById("d-hours");
const dRole           = document.getElementById("d-role");
const dStart          = document.getElementById("d-start");
const dEnd            = document.getElementById("d-end");
const dQuotaAnnuel    = document.getElementById("d-quota-annuel");
const dQuotaExtra     = document.getElementById("d-quota-extra");
const dQuotaScient    = document.getElementById("d-quota-scientifique");
const cancelDoctorBtn = document.getElementById("cancel-doctor-btn");
const doctorFormMsg   = document.getElementById("doctor-form-msg");
const doctorsTbody    = document.getElementById("doctors-tbody");
const doctorsTable    = document.getElementById("doctors-table");
const doctorsEmpty    = document.getElementById("doctors-empty");

/* Références DOM — préférences médecin (Module 3) */
const prefForm    = document.getElementById("pref-form");
const pType       = document.getElementById("p-type");
const pStart      = document.getElementById("p-start");
const pEnd        = document.getElementById("p-end");
const pNote       = document.getElementById("p-note");
const prefFormMsg = document.getElementById("pref-form-msg");
const prefsTbody  = document.getElementById("prefs-tbody");
const prefsTable  = document.getElementById("prefs-table");
const prefsEmpty  = document.getElementById("prefs-empty");

/* Références DOM — calendrier (Module 4) */
const legendMine  = document.getElementById("legend-mine");

/* Références DOM — quota de congés (Module 2/3) */
const congesCompteur = document.getElementById("conges-compteur");

/* Préférences du médecin connecté, mémorisées pour le calcul du quota. */
let prefsCourantes = [];

/* Profil du médecin actuellement connecté (id, name, role). */
let medecinCourant = null;


/* --------------------------------------------------------------------- */
/* Petites fonctions utilitaires d'affichage                             */
/* --------------------------------------------------------------------- */
function afficherMessage(texte, type = "error") {
  loginMsg.textContent = texte;
  loginMsg.className = "message " + type; // "message error" ou "message info"
}

function basculerVue(connecte) {
  // Affiche la vue connectée ou la vue login selon l'état.
  loginView.classList.toggle("hidden", connecte);
  appView.classList.toggle("hidden", !connecte);
}


/* --------------------------------------------------------------------- */
/* Détection du rôle : on lit la ligne du médecin dans la table doctors  */
/* On fait correspondre l'utilisateur connecté via son email.            */
/* La colonne "role" vaut 'admin' (chef de service) ou 'doctor'.         */
/* --------------------------------------------------------------------- */
async function chargerProfil(user) {
  const { data, error } = await sb
    .from("doctors")
    .select("id, name, role, contract_start, contract_end, quota_conge_annuel, quota_conge_extralegal, quota_conge_scientifique")
    .eq("email", user.email)
    .maybeSingle();

  if (error) {
    console.error("Erreur lecture profil :", error);
    afficherMessage("Erreur de lecture du profil. Vérifie la table doctors / les règles RLS.");
    return null;
  }

  if (!data) {
    // Utilisateur authentifié mais absent de la table doctors.
    afficherMessage(
      "Compte authentifié mais aucun profil trouvé dans la table doctors. " +
      "Demande à l'admin de t'ajouter.",
      "info"
    );
    await sb.auth.signOut();
    return null;
  }

  return data; // { name, role }
}


/* --------------------------------------------------------------------- */
/* Affiche l'espace connecté en fonction du rôle                         */
/* --------------------------------------------------------------------- */
function afficherEspace(profil) {
  medecinCourant = profil; // mémorise le médecin connecté
  const estAdmin = profil.role === "admin";

  welcomeText.textContent = "Connecté en tant que " + (profil.name || "");
  roleText.textContent = estAdmin ? "Administrateur (chef de service)" : "Médecin";

  // On montre uniquement la zone correspondant au rôle.
  adminZone.classList.toggle("hidden", !estAdmin);
  doctorZone.classList.toggle("hidden", estAdmin);

  basculerVue(true);

  // Côté admin : liste des médecins. Côté médecin : ses préférences.
  if (estAdmin) chargerMedecins();
  else chargerPreferences();

  // Planning (Module 4) : visible par tous. La légende « Mes shifts »
  // n'apparaît que pour un médecin (l'admin n'est pas dans le planning).
  legendMine.classList.toggle("hidden", estAdmin);
  initCalendrier();
}


/* --------------------------------------------------------------------- */
/* Soumission du formulaire de connexion                                 */
/* --------------------------------------------------------------------- */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  afficherMessage("");
  loginBtn.disabled = true;
  loginBtn.textContent = "Connexion…";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  loginBtn.disabled = false;
  loginBtn.textContent = "Se connecter";

  if (error) {
    afficherMessage("Échec de connexion : email ou mot de passe incorrect.");
    return;
  }

  // Connexion réussie → on charge le profil puis on affiche l'espace.
  const profil = await chargerProfil(data.user);
  if (profil) afficherEspace(profil);
});


/* --------------------------------------------------------------------- */
/* Déconnexion                                                           */
/* --------------------------------------------------------------------- */
logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  basculerVue(false);
  loginForm.reset();
  afficherMessage("");
});


/* ===================================================================== */
/* MODULE 2 — Gestion des médecins (CRUD admin)                          */
/* ===================================================================== */

// Heures hebdo de référence pour un plein temps (cible = HEURES_BASE × fte).
const HEURES_BASE = 52;

// Libellés lisibles des grades.
const GRADE_LABELS = {
  resident: "Résident",
  assistant_specialiste: "Assistant spéc.",
  specialiste: "Spécialiste",
};

/* Quota de base d'un type de congé : surcharge du médecin, sinon défaut (regles.js). */
function quotaBase(med, type) {
  const valeur = med["quota_" + type];
  return valeur != null ? valeur : CONGE_TYPES[type].defaut;
}

/* Résumé compact « annuel/extra/scientifique » pour le tableau admin. */
function quotasResume(med) {
  return quotaBase(med, "conge_annuel") + "/" +
         quotaBase(med, "conge_extralegal") + "/" +
         quotaBase(med, "conge_scientifique");
}

/* Affiche un message dans le formulaire médecin */
function messageFormMedecin(texte, type = "error") {
  doctorFormMsg.textContent = texte;
  doctorFormMsg.className = "message " + type;
}

/* Met à jour la cible horaire automatiquement quand la quotité change */
dFte.addEventListener("input", () => {
  const fte = parseFloat(dFte.value);
  if (!isNaN(fte)) dHours.value = Math.round(HEURES_BASE * fte * 10) / 10;
});

/* --- Jours travaillables (cases à cocher Lun→Dim, valeurs 1→7) --- */
function casesJoursTravailles() {
  return Array.from(document.querySelectorAll("#doctor-form .jt"));
}
function setJoursTravailles(jours) {
  const ens = new Set(jours && jours.length ? jours : [1, 2, 3, 4, 5, 6, 7]);
  casesJoursTravailles().forEach((c) => { c.checked = ens.has(parseInt(c.value, 10)); });
}
function getJoursTravailles() {
  return casesJoursTravailles().filter((c) => c.checked).map((c) => parseInt(c.value, 10));
}

/* Ouvre le formulaire en mode "ajout" (champs vides) */
function ouvrirAjout() {
  doctorForm.reset();
  doctorId.value = "";
  dFte.value = "1";
  dHours.value = HEURES_BASE; // 52h par défaut (plein temps)
  messageFormMedecin("");
  doctorForm.classList.remove("hidden");
}

/* Ouvre le formulaire en mode "édition", pré-rempli avec un médecin */
function ouvrirEdition(med) {
  doctorId.value = med.id;
  dName.value = med.name || "";
  dEmail.value = med.email || "";
  dGrade.value = med.grade || "specialiste";
  dFte.value = med.fte ?? 1;
  dHours.value = med.weekly_hours_target ?? HEURES_BASE;
  dRole.value = med.role || "doctor";
  dStart.value = med.contract_start || "";
  dEnd.value = med.contract_end || "";
  dQuotaAnnuel.value = med.quota_conge_annuel ?? "";
  dQuotaExtra.value = med.quota_conge_extralegal ?? "";
  dQuotaScient.value = med.quota_conge_scientifique ?? "";
  setJoursTravailles(med.jours_travailles);
  messageFormMedecin("");
  doctorForm.classList.remove("hidden");
  doctorForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* Ferme le formulaire */
function fermerFormulaire() {
  doctorForm.classList.add("hidden");
  doctorForm.reset();
  messageFormMedecin("");
}

addDoctorBtn.addEventListener("click", ouvrirAjout);
cancelDoctorBtn.addEventListener("click", fermerFormulaire);

/* Charge tous les médecins depuis Supabase et les affiche dans le tableau */
async function chargerMedecins() {
  const { data, error } = await sb
    .from("doctors")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Erreur chargement médecins :", error);
    doctorsTbody.innerHTML =
      '<tr><td colspan="9">Erreur de chargement (vérifie les règles RLS).</td></tr>';
    return;
  }

  rendreTableau(data || []);
}

/* Construit les lignes du tableau */
function rendreTableau(medecins) {
  doctorsTbody.innerHTML = "";

  const vide = medecins.length === 0;
  doctorsTable.classList.toggle("hidden", vide);
  doctorsEmpty.classList.toggle("hidden", !vide);

  medecins.forEach((med) => {
    const tr = document.createElement("tr");

    const contrat = med.contract_start
      ? med.contract_start + (med.contract_end ? " → " + med.contract_end : " → indéterminé")
      : "—";

    // textContent partout pour éviter toute injection HTML.
    const cells = [
      med.name,
      med.email,
      GRADE_LABELS[med.grade] || med.grade,
      med.fte,
      (med.weekly_hours_target ?? "") + " h",
      contrat,
      med.role === "admin" ? "Admin" : "Médecin",
      quotasResume(med),
    ];
    cells.forEach((valeur) => {
      const td = document.createElement("td");
      td.textContent = valeur;
      tr.appendChild(td);
    });

    // Cellule d'actions (Éditer / Supprimer)
    const tdActions = document.createElement("td");
    tdActions.className = "actions-cell";

    const btnEdit = document.createElement("button");
    btnEdit.textContent = "Éditer";
    btnEdit.className = "mini";
    btnEdit.addEventListener("click", () => ouvrirEdition(med));

    const btnDel = document.createElement("button");
    btnDel.textContent = "Supprimer";
    btnDel.className = "mini danger";
    btnDel.addEventListener("click", () => supprimerMedecin(med));

    tdActions.appendChild(btnEdit);
    tdActions.appendChild(btnDel);
    tr.appendChild(tdActions);

    doctorsTbody.appendChild(tr);
  });
}

/* Enregistre (création ou mise à jour) un médecin */
doctorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageFormMedecin("");

  const fte = parseFloat(dFte.value);

  // Construit l'objet à envoyer. Dates vides → null.
  const payload = {
    name: dName.value.trim(),
    email: dEmail.value.trim().toLowerCase(),
    grade: dGrade.value,
    fte: isNaN(fte) ? 1 : fte,
    weekly_hours_target: parseFloat(dHours.value) || HEURES_BASE,
    role: dRole.value,
    contract_type: fte >= 1 ? "temps_plein" : "temps_partiel",
    contract_start: dStart.value || null,
    contract_end: dEnd.value || null,
    // Quotas de congés annuels (jours ouvrés). Vide → null = valeur par défaut.
    quota_conge_annuel:       dQuotaAnnuel.value === "" ? null : parseInt(dQuotaAnnuel.value, 10),
    quota_conge_extralegal:   dQuotaExtra.value === ""  ? null : parseInt(dQuotaExtra.value, 10),
    quota_conge_scientifique: dQuotaScient.value === "" ? null : parseInt(dQuotaScient.value, 10),
    // Jours de semaine travaillables (1=lundi … 7=dimanche), contrainte dure du planning.
    jours_travailles: getJoursTravailles(),
  };

  let error;
  if (doctorId.value) {
    // Mise à jour
    ({ error } = await sb.from("doctors").update(payload).eq("id", doctorId.value));
  } else {
    // Création
    ({ error } = await sb.from("doctors").insert(payload));
  }

  if (error) {
    console.error("Erreur enregistrement :", error);
    if (error.code === "23505") {
      messageFormMedecin("Cet email est déjà utilisé par un autre médecin.");
    } else if (error.code === "42501" || /policy/i.test(error.message)) {
      messageFormMedecin("Action refusée : seul un administrateur peut modifier les médecins (RLS).");
    } else {
      messageFormMedecin("Erreur : " + error.message);
    }
    return;
  }

  fermerFormulaire();
  chargerMedecins();
});

/* Supprime un médecin après confirmation */
async function supprimerMedecin(med) {
  const ok = window.confirm("Supprimer définitivement " + med.name + " ?");
  if (!ok) return;

  const { error } = await sb.from("doctors").delete().eq("id", med.id);
  if (error) {
    console.error("Erreur suppression :", error);
    window.alert("Suppression impossible : " + error.message);
    return;
  }
  chargerMedecins();
}


/* ===================================================================== */
/* MODULE 3 — Préférences du médecin (congés / indispos / souhaits)      */
/* ===================================================================== */

// Libellés lisibles des types de préférence ('conge' = ancien type, compat.).
const PREF_LABELS = {
  conge: "Congé",
  conge_annuel: "Congé annuel",
  conge_extralegal: "Extra-légaux",
  conge_scientifique: "Scientifique",
  indispo: "Indisponibilité",
  souhait: "Souhait",
};

/* Affiche un message dans le formulaire de préférences */
function messageFormPref(texte, type = "error") {
  prefFormMsg.textContent = texte;
  prefFormMsg.className = "message " + type;
}

/* Charge les préférences du médecin connecté et les affiche */
async function chargerPreferences() {
  if (!medecinCourant) return;

  const { data, error } = await sb
    .from("preferences")
    .select("*")
    .eq("doctor_id", medecinCourant.id)
    .order("start_date", { ascending: true });

  if (error) {
    console.error("Erreur chargement préférences :", error);
    prefsTbody.innerHTML =
      '<tr><td colspan="5">Erreur de chargement (vérifie les règles RLS).</td></tr>';
    return;
  }

  prefsCourantes = data || [];
  majCompteurConges();          // met à jour l'affichage du quota
  rendrePreferences(prefsCourantes);
}

/* --- Comptage des congés en jours OUVRÉS, par catégorie et par année --- */

/* Catégorie de quota d'un pref_type ('conge' historique compté en annuel). */
function categorieConge(prefType) {
  if (prefType === "conge") return "conge_annuel";
  return CONGE_TYPES[prefType] ? prefType : null;
}

/* Jours ouvrés (lun–ven hors fériés) d'une plage tombant dans l'année donnée. */
function joursOuvresDansAnnee(debut, fin, annee) {
  let total = 0;
  const d = new Date(debut + "T00:00:00Z");
  const dFin = new Date(fin + "T00:00:00Z");
  while (d <= dFin) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCFullYear() === annee && estJourOuvre(iso)) total++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return total;
}

/* Fraction de l'année civile couverte par le contrat du médecin (0 à 1). */
function fractionAnneeSousContrat(annee, med) {
  const debutAnnee = Date.UTC(annee, 0, 1);
  const finAnnee = Date.UTC(annee, 11, 31);
  let debut = med.contract_start ? Date.parse(med.contract_start + "T00:00:00Z") : debutAnnee;
  let fin = med.contract_end ? Date.parse(med.contract_end + "T00:00:00Z") : finAnnee;
  debut = Math.max(debut, debutAnnee);
  fin = Math.min(fin, finAnnee);
  if (fin < debut) return 0;
  const jours = (fin - debut) / 86400000 + 1;
  const joursAnnee = (finAnnee - debutAnnee) / 86400000 + 1;
  return jours / joursAnnee;
}

/* Quota effectif (défaut ou surcharge, proratisé au contrat) pour une année. */
function quotaEffectif(type, annee) {
  if (!medecinCourant) return 0;
  return Math.round(quotaBase(medecinCourant, type) *
                    fractionAnneeSousContrat(annee, medecinCourant));
}

/* Jours ouvrés déjà encodés pour une catégorie et une année. */
function congesUtilises(type, annee) {
  return prefsCourantes
    .filter((p) => categorieConge(p.pref_type) === type)
    .reduce((s, p) => s + joursOuvresDansAnnee(p.start_date, p.end_date, annee), 0);
}

/* Années à afficher : année courante + toute année comportant un congé. */
function anneesAvecConges() {
  const annees = new Set([new Date().getUTCFullYear()]);
  prefsCourantes.forEach((p) => {
    if (categorieConge(p.pref_type)) {
      annees.add(new Date(p.start_date + "T00:00:00Z").getUTCFullYear());
      annees.add(new Date(p.end_date + "T00:00:00Z").getUTCFullYear());
    }
  });
  return [...annees].sort();
}

/* Affiche les compteurs « X / Y jours ouvrés » par catégorie et par année. */
function majCompteurConges() {
  if (!congesCompteur || !medecinCourant) return;
  const lignes = anneesAvecConges().map((annee) => {
    const parts = Object.keys(CONGE_TYPES).map((type) => {
      return CONGE_TYPES[type].label + " " +
             congesUtilises(type, annee) + "/" + quotaEffectif(type, annee);
    });
    return "<strong>" + annee + "</strong> — " + parts.join(" · ");
  });
  congesCompteur.innerHTML =
    lignes.join("<br>") + "<br><em>en jours ouvrés (lun–ven hors fériés)</em>";
  congesCompteur.classList.remove("hidden");
}

/* Construit les lignes du tableau de préférences */
function rendrePreferences(prefs) {
  prefsTbody.innerHTML = "";

  const vide = prefs.length === 0;
  prefsTable.classList.toggle("hidden", vide);
  prefsEmpty.classList.toggle("hidden", !vide);

  prefs.forEach((pref) => {
    const tr = document.createElement("tr");

    // Pastille colorée selon le type
    const tdType = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge badge-" + pref.pref_type;
    badge.textContent = PREF_LABELS[pref.pref_type] || pref.pref_type;
    tdType.appendChild(badge);
    tr.appendChild(tdType);

    [pref.start_date, pref.end_date, pref.note || "—"].forEach((valeur) => {
      const td = document.createElement("td");
      td.textContent = valeur;
      tr.appendChild(td);
    });

    // Bouton suppression
    const tdActions = document.createElement("td");
    tdActions.className = "actions-cell";
    const btnDel = document.createElement("button");
    btnDel.textContent = "Supprimer";
    btnDel.className = "mini danger";
    btnDel.addEventListener("click", () => supprimerPreference(pref));
    tdActions.appendChild(btnDel);
    tr.appendChild(tdActions);

    prefsTbody.appendChild(tr);
  });
}

/* Ajoute une préférence pour le médecin connecté */
prefForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageFormPref("");

  if (!medecinCourant) {
    messageFormPref("Profil médecin introuvable.");
    return;
  }

  const debut = pStart.value;
  const fin = pEnd.value;

  // Validation simple des dates.
  if (fin < debut) {
    messageFormPref("La date de fin doit être postérieure ou égale à la date de début.");
    return;
  }

  // Contrôle des quotas de congés (bloquant), par catégorie et par année civile.
  const categorie = categorieConge(pType.value);
  if (categorie) {
    const anneeDebut = new Date(debut + "T00:00:00Z").getUTCFullYear();
    const anneeFin = new Date(fin + "T00:00:00Z").getUTCFullYear();
    for (let annee = anneeDebut; annee <= anneeFin; annee++) {
      const demande = joursOuvresDansAnnee(debut, fin, annee);
      if (demande === 0) continue;
      const dejaPris = congesUtilises(categorie, annee);
      const quota = quotaEffectif(categorie, annee);
      if (dejaPris + demande > quota) {
        messageFormPref(
          CONGE_TYPES[categorie].label + " " + annee + " : quota dépassé (" +
          (dejaPris + demande) + " j ouvrés demandés pour un maximum de " + quota +
          " j ; déjà " + dejaPris + " j encodés)."
        );
        return;
      }
    }
  }

  const payload = {
    doctor_id: medecinCourant.id,
    pref_type: pType.value,
    start_date: debut,
    end_date: fin,
    note: pNote.value.trim() || null,
  };

  const { error } = await sb.from("preferences").insert(payload);

  if (error) {
    console.error("Erreur ajout préférence :", error);
    if (error.code === "42501" || /policy/i.test(error.message)) {
      messageFormPref("Action refusée par les règles de sécurité (RLS).");
    } else {
      messageFormPref("Erreur : " + error.message);
    }
    return;
  }

  prefForm.reset();
  messageFormPref("Préférence enregistrée.", "info");
  chargerPreferences();
});

/* Supprime une préférence après confirmation */
async function supprimerPreference(pref) {
  const ok = window.confirm("Supprimer cette préférence ?");
  if (!ok) return;

  const { error } = await sb.from("preferences").delete().eq("id", pref.id);
  if (error) {
    console.error("Erreur suppression préférence :", error);
    window.alert("Suppression impossible : " + error.message);
    return;
  }
  chargerPreferences();
}


/* ===================================================================== */
/* MODULE 4 — Affichage du calendrier (FullCalendar)                     */
/* ===================================================================== */

/* Configuration des types de shift.
   Réutilisée par les modules suivants (génération du planning).
   - debut/fin = HEURES RÉELLES (pas l'affichage), utilisées pour le calcul.
   - lendemain = true si la fin tombe le jour suivant (gardes de nuit / 24h).
   - heures = durée réelle, servira au comptage horaire (Module 5+).         */
const SHIFT_CONFIG = {
  jour:       { label: "Journée",       court: "J",   couleur: "#1f6feb", debut: "08:00", fin: "18:30", lendemain: false, heures: 10.5 },
  twe:        { label: "Tour week-end",  court: "TWE", couleur: "#8250df", debut: "08:00", fin: "14:00", lendemain: false, heures: 6 },
  garde_nuit: { label: "Garde de nuit",  court: "GN",  couleur: "#bf3989", debut: "17:00", fin: "08:00", lendemain: true,  heures: 15 },
  garde_24h:  { label: "Garde 24h",      court: "G24", couleur: "#cf222e", debut: "08:00", fin: "08:00", lendemain: true,  heures: 24 },
  // Absences / repos posables par l'admin (0 h, sans station, affichées en
  // pastille « journée entière »). Les congés posés ici ne décomptent pas les
  // quotas (ceux-ci restent gérés via les préférences du médecin).
  recup:              { label: "Repos de garde",      court: "Repos", couleur: "#6e5494", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  off:                { label: "Off-clinique",        court: "Off",   couleur: "#9a6700", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  conge_annuel:       { label: "Congé annuel",        court: "Congé", couleur: "#1a7f37", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  conge_scientifique: { label: "Congé scientifique",  court: "Sci.",  couleur: "#0b6b63", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  conge_extralegal:   { label: "Congés extra-légaux", court: "E.L.",  couleur: "#0f5132", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
};

/* Vrai si le type de shift est une absence / un repos (0 h, sans station). */
function estShiftAbsence(type) {
  return !!(SHIFT_CONFIG[type] && SHIFT_CONFIG[type].absence);
}

/* Couleurs de fond des préférences affichées dans le calendrier. */
const PREF_BG = {
  conge:              "rgba(26,127,55,0.18)",   // vert (ancien type)
  conge_annuel:       "rgba(26,127,55,0.18)",   // vert
  conge_extralegal:   "rgba(26,127,55,0.28)",   // vert plus soutenu
  conge_scientifique: "rgba(13,148,136,0.20)",  // sarcelle
  indispo:            "rgba(207,34,46,0.16)",    // rouge
  souhait:            "rgba(31,111,235,0.14)",   // bleu
  off_clinic:         "rgba(154,103,0,0.16)",    // orangé
  recuperation:       "rgba(130,80,223,0.16)",   // violet
};

/* Libellés complets des types de préférence (inclut off_clinic / recuperation). */
const PREF_LABELS_FULL = {
  conge: "Congé",
  conge_annuel: "Congé annuel",
  conge_extralegal: "Congés extra-légaux",
  conge_scientifique: "Congé scientifique",
  indispo: "Indisponibilité",
  souhait: "Souhait",
  off_clinic: "Off/clinic",
  recuperation: "Récupération",
};

let calendrier = null;       // instance FullCalendar (créée une seule fois)
let carteMedecins = {};      // { doctor_id: { name, grade } }, pour nommer les shifts

/* Renvoie la date (YYYY-MM-DD) du lendemain d'une date donnée. */
function lendemainDe(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* Charge une fois la correspondance id -> médecin (pour nommer les shifts).
   La lecture de doctors est ouverte à tous les connectés (RLS). */
async function chargerCarteMedecins() {
  const { data, error } = await sb.from("doctors").select("id, name, grade");
  if (error) {
    console.error("Erreur chargement médecins (calendrier) :", error);
    return;
  }
  carteMedecins = {};
  (data || []).forEach((m) => { carteMedecins[m.id] = m; });
}

/* Construit les événements FullCalendar pour la période visible.
   debutISO / finISO : bornes fournies par FullCalendar (fin exclusive). */
async function construireEvenements(debutISO, finISO) {
  const debut = debutISO.slice(0, 10);
  const fin = finISO.slice(0, 10);
  const events = [];

  // --- 1) Shifts de la période (planning) ---
  const { data: shifts, error: errShifts } = await sb
    .from("shifts")
    .select("id, date, shift_type, doctor_id, schedule_id, poste")
    .gte("date", debut)
    .lt("date", fin);

  if (errShifts) {
    console.error("Erreur chargement shifts :", errShifts);
  } else {
    (shifts || []).forEach((s) => {
      const cfg = SHIFT_CONFIG[s.shift_type] || {
        label: s.shift_type, court: "?", couleur: "#57606a",
        debut: "08:00", fin: "18:30", lendemain: false,
      };
      const med = carteMedecins[s.doctor_id] || {};
      const nom = med.name || "?";
      const estMien = medecinCourant && medecinCourant.id === s.doctor_id;
      const station = s.poste ? (POSTE_LABELS[s.poste] || s.poste) : "";

      // Données du shift, attachées à chaque événement pour l'édition (Module 6).
      const propsBase = {
        estShift: true, shiftId: s.id, shiftType: s.shift_type,
        doctorId: s.doctor_id, poste: s.poste || null, dateStr: s.date,
      };
      const cls = estMien ? ["shift-mien"] : [];

      // Absence / repos : pastille « journée entière ».
      if (cfg.absence) {
        events.push({
          title: nom + " · " + cfg.court,
          start: s.date,
          allDay: true,
          backgroundColor: cfg.couleur,
          borderColor: estMien ? "#1f2328" : cfg.couleur,
          classNames: cls.concat(["shift-absence"]),
          extendedProps: Object.assign({ tooltip: nom + " - " + cfg.label }, propsBase),
        });
        return;
      }

      // Cas particulier : garde 24h de SEMAINE qui occupe une station.
      // On l'affiche sur DEUX lignes — une pour la station occupée le jour,
      // une pour la garde 24h — pour plus de clarté. Les deux pointent vers
      // le même shift (clic d'édition → même formulaire).
      if (s.shift_type === "garde_24h" && s.poste) {
        const jour = SHIFT_CONFIG.jour;
        events.push({
          title: nom + " · " + station,
          start: s.date + "T" + jour.debut + ":00",
          end: s.date + "T" + jour.fin + ":00",
          backgroundColor: jour.couleur,
          borderColor: estMien ? "#1f2328" : jour.couleur,
          classNames: cls,
          extendedProps: Object.assign({ tooltip: nom + " · " + station + " (garde 24h)" }, propsBase),
        });
        events.push({
          title: nom + " · " + cfg.court,
          start: s.date + "T" + cfg.debut + ":00",
          end: lendemainDe(s.date) + "T" + cfg.fin + ":00",
          backgroundColor: cfg.couleur,
          borderColor: estMien ? "#1f2328" : cfg.couleur,
          classNames: cls,
          extendedProps: Object.assign({ tooltip: nom + " - " + cfg.label }, propsBase),
        });
        return;
      }

      // Cas général : un seul événement.
      const dateFin = cfg.lendemain ? lendemainDe(s.date) : s.date;
      const suffixe = station ? " · " + station : "";
      events.push({
        title: nom + " - " + cfg.court + suffixe,
        start: s.date + "T" + cfg.debut + ":00",
        end: dateFin + "T" + cfg.fin + ":00",
        backgroundColor: cfg.couleur,
        borderColor: estMien ? "#1f2328" : cfg.couleur,
        classNames: cls,
        extendedProps: Object.assign({ tooltip: nom + " - " + cfg.label + suffixe }, propsBase),
      });
    });
  }

  // --- 2) Préférences en arrière-plan ---
  // Admin : toutes (RLS). Médecin : seulement les siennes (RLS).
  // On prend toute préférence qui chevauche la période affichée.
  const { data: prefs, error: errPrefs } = await sb
    .from("preferences")
    .select("id, doctor_id, start_date, end_date, pref_type, note")
    .lte("start_date", fin)
    .gte("end_date", debut);

  if (errPrefs) {
    console.error("Erreur chargement préférences (calendrier) :", errPrefs);
  } else {
    (prefs || []).forEach((p) => {
      const med = carteMedecins[p.doctor_id] || {};
      const libelle = PREF_LABELS_FULL[p.pref_type] || p.pref_type;
      events.push({
        start: p.start_date,
        end: lendemainDe(p.end_date), // fin exclusive -> +1 jour pour inclure end_date
        display: "background",
        backgroundColor: PREF_BG[p.pref_type] || "rgba(0,0,0,0.06)",
        extendedProps: {
          tooltip: (med.name ? med.name + " - " : "") + libelle +
                   (p.note ? " (" + p.note + ")" : ""),
        },
      });
    });
  }

  return events;
}

/* Initialise (une seule fois) puis affiche le calendrier.
   Appelée à chaque connexion ; le contenu se recharge selon la période. */
async function initCalendrier() {
  const el = document.getElementById("calendar");
  if (!el) return;

  await chargerCarteMedecins();

  if (!calendrier) {
    calendrier = new FullCalendar.Calendar(el, {
      initialView: "dayGridMonth",
      locale: "fr",
      firstDay: 1,              // semaine commençant le lundi
      height: "auto",
      nowIndicator: true,
      dayMaxEvents: true,       // regroupe en "+N" si la journée est chargée
      // Force les shifts horaires à s'afficher en BLOCS colorés (et non en
      // mode "point" sur fond transparent) en vue Mois : sinon le texte blanc
      // imposé par le CSS (.fc-daygrid-event) devient invisible sur la case
      // blanche. Les préférences en display:"background" ne sont pas affectées.
      eventDisplay: "block",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,listMonth",
      },
      buttonText: {
        today: "Aujourd'hui",
        month: "Mois",
        list: "Liste",
      },
      noEventsText: "Aucun shift sur cette période",
      // FullCalendar appelle cette fonction à chaque changement de période :
      // navigation entre mois, changement de vue, etc.
      events: async (info, success, failure) => {
        try {
          success(await construireEvenements(info.startStr, info.endStr));
        } catch (e) {
          console.error("Erreur construction des événements :", e);
          failure(e);
        }
      },
      // Affiche une infobulle (qui / quel shift) au survol.
      eventDidMount: (info) => {
        const t = info.event.extendedProps.tooltip;
        if (t) info.el.setAttribute("title", t);
      },
      // Clic sur un shift → édition (admin uniquement, Module 6).
      eventClick: (info) => {
        const p = info.event.extendedProps;
        if (!p.estShift) return; // ignore les fonds de préférences
        if (!medecinCourant || medecinCourant.role !== "admin") return;
        ouvrirEditionShift({
          id: p.shiftId, date: p.dateStr,
          shift_type: p.shiftType, doctor_id: p.doctorId, poste: p.poste,
        });
      },
      // À chaque changement de mois/vue : rafraîchit le panneau admin.
      datesSet: () => {
        if (medecinCourant && medecinCourant.role === "admin") {
          rafraichirPanneauAdmin(); // rafraîchit aussi la grille si elle est visible
        } else if (vueActive === "grille") {
          construireGrille();
        }
      },
    });
    calendrier.render();
  } else {
    // Déjà créé : on rafraîchit l'affichage et les données.
    calendrier.render();
    calendrier.refetchEvents();
  }
}

/* ===================================================================== */
/* MODULE 5 — Génération du planning (déclencheur de test pour l'admin)   */
/* ===================================================================== */

/* Libellés des stations de jour (depuis regles.js). */
const POSTE_LABELS = {};
(typeof POSTES_JOUR !== "undefined" ? POSTES_JOUR : []).forEach((p) => {
  POSTE_LABELS[p.code] = p.label;
});

const genererBtn = document.getElementById("generer-planning-btn");
const genererMsg = document.getElementById("generer-msg");

function messageGeneration(html, type = "info") {
  if (!genererMsg) return;
  genererMsg.innerHTML = html;
  genererMsg.className = "message " + type;
}

/* Génère un brouillon de planning pour le mois actuellement affiché. */
async function genererPlanningPourMoisAffiche() {
  if (!calendrier || typeof genererPlanning !== "function") return;

  // Verrou : un planning publié ne se régénère pas sans repasser en brouillon.
  if (planningVerrouille) {
    return messageGeneration(
      "Planning publié (lecture seule). Repasse-le en brouillon pour le régénérer.", "error");
  }

  const dateVue = calendrier.getDate();
  const annee = dateVue.getFullYear();
  const mois = dateVue.getMonth() + 1; // 1-12
  const moisStr = String(mois).padStart(2, "0");
  const debutMois = annee + "-" + moisStr + "-01";
  const finMois = annee + "-" + moisStr + "-" + new Date(annee, mois, 0).getDate();

  genererBtn.disabled = true;
  messageGeneration("Génération de " + mois + "/" + annee + " en cours…", "info");

  // 1) Médecins planifiables (l'admin / chef de service n'est pas dans le planning).
  const { data: medecins, error: e1 } = await sb
    .from("doctors")
    .select("id, name, grade, fte, contract_start, contract_end, weekly_hours_target, jours_travailles")
    .neq("role", "admin");
  if (e1) { genererBtn.disabled = false; return messageGeneration("Erreur lecture médecins : " + e1.message, "error"); }

  // 2) Préférences chevauchant le mois.
  const { data: prefs, error: e2 } = await sb
    .from("preferences")
    .select("doctor_id, start_date, end_date, pref_type")
    .lte("start_date", finMois)
    .gte("end_date", debutMois);
  if (e2) { genererBtn.disabled = false; return messageGeneration("Erreur lecture préférences : " + e2.message, "error"); }

  // 3) Génération (algorithme pur, planning.js).
  const res = genererPlanning({ annee, mois, medecins: medecins || [], preferences: prefs || [] });

  // 4) Remplace le brouillon du mois : on efface shifts du mois + schedules du mois.
  await sb.from("shifts").delete().gte("date", debutMois).lte("date", finMois);
  await sb.from("schedules").delete().eq("year", annee).eq("month", mois);

  const { data: sched, error: e3 } = await sb
    .from("schedules")
    .insert({ year: annee, month: mois, status: "draft" })
    .select("id")
    .single();
  if (e3) { genererBtn.disabled = false; return messageGeneration("Erreur création du planning : " + e3.message, "error"); }

  // 5) Insertion des shifts générés.
  const lignes = res.shifts.map((s) => ({
    date: s.date, shift_type: s.shift_type, poste: s.poste,
    doctor_id: s.doctor_id, schedule_id: sched.id,
  }));
  if (lignes.length) {
    const { error: e4 } = await sb.from("shifts").insert(lignes);
    if (e4) { genererBtn.disabled = false; return messageGeneration("Erreur insertion des shifts : " + e4.message, "error"); }
  }

  // 6) Résumé + rafraîchissement du calendrier.
  genererBtn.disabled = false;
  const nbConf = res.conflits.length;
  if (nbConf === 0) {
    messageGeneration("Planning " + mois + "/" + annee + " généré : " + lignes.length + " shifts. Aucun conflit. ✅", "info");
  } else {
    const apercu = res.conflits.slice(0, 8).map((c) => c.date + " — " + c.message).join("<br>");
    messageGeneration(
      "Planning " + mois + "/" + annee + " généré : " + lignes.length + " shifts. " +
      "<strong>" + nbConf + " conflit(s)</strong> à arbitrer :<br>" + apercu +
      (nbConf > 8 ? "<br>…" : ""), "error");
  }
  calendrier.refetchEvents();
  rafraichirPanneauAdmin(); // met à jour statut, compteurs et conflits
}

if (genererBtn) genererBtn.addEventListener("click", genererPlanningPourMoisAffiche);


/* ===================================================================== */
/* MODULE 6 — Admin : ajustements manuels, publication, compteurs        */
/* ===================================================================== */

/* Références DOM (Module 6). */
const planningStatut  = document.getElementById("planning-statut");
const ajouterShiftBtn = document.getElementById("ajouter-shift-btn");
const publierBtn      = document.getElementById("publier-btn");
const depublierBtn    = document.getElementById("depublier-btn");
const compteursTbody  = document.getElementById("compteurs-tbody");
const compteursTable  = document.getElementById("compteurs-table");
const compteursEmpty  = document.getElementById("compteurs-empty");
const conflitsZone    = document.getElementById("conflits-zone");

/* Modale d'édition / d'ajout de shift. */
const shiftModal     = document.getElementById("shift-modal");
const shiftModalTit  = document.getElementById("shift-modal-titre");
const shiftForm      = document.getElementById("shift-form");
const sDate          = document.getElementById("s-date");
const sType          = document.getElementById("s-type");
const sDoctor        = document.getElementById("s-doctor");
const sPoste         = document.getElementById("s-poste");
const shiftFormMsg   = document.getElementById("shift-form-msg");
const deleteShiftBtn = document.getElementById("delete-shift-btn");
const cancelShiftBtn = document.getElementById("cancel-shift-btn");

/* État du planning du mois affiché (rempli par rafraichirPanneauAdmin). */
let planningMois = { annee: null, mois: null, schedule: null,
                     shifts: [], medecins: [], preferences: [] };
let planningVerrouille = false; // vrai si le planning du mois est publié
let shiftEnEdition = null;      // shift en cours d'édition (null = mode ajout)

/* Bornes ISO du mois affiché dans le calendrier. */
function bornesMoisAffiche() {
  const d = calendrier.getDate();
  const annee = d.getFullYear();
  const mois = d.getMonth() + 1;
  const ms = String(mois).padStart(2, "0");
  return {
    annee, mois,
    debut: annee + "-" + ms + "-01",
    fin: annee + "-" + ms + "-" + new Date(annee, mois, 0).getDate(),
  };
}

/* Recharge statut + données + compteurs + conflits du mois affiché. */
async function rafraichirPanneauAdmin() {
  if (!medecinCourant || medecinCourant.role !== "admin" || !calendrier) return;

  const b = bornesMoisAffiche();
  planningMois.annee = b.annee;
  planningMois.mois = b.mois;

  // 1) Planning (schedule) du mois.
  const { data: sched } = await sb.from("schedules")
    .select("id, year, month, status, published_at")
    .eq("year", b.annee).eq("month", b.mois).maybeSingle();
  planningMois.schedule = sched || null;
  planningVerrouille = !!(sched && sched.status === "published");

  // 2) Shifts du mois.
  const { data: shifts } = await sb.from("shifts")
    .select("id, date, shift_type, doctor_id, schedule_id, poste")
    .gte("date", b.debut).lte("date", b.fin);
  planningMois.shifts = shifts || [];

  // 3) Médecins planifiables (hors admin) + 4) préférences du mois.
  const { data: meds } = await sb.from("doctors")
    .select("id, name, grade, fte, contract_start, contract_end, weekly_hours_target, jours_travailles")
    .neq("role", "admin").order("name", { ascending: true });
  planningMois.medecins = meds || [];

  const { data: prefs } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type")
    .lte("start_date", b.fin).gte("end_date", b.debut);
  planningMois.preferences = prefs || [];

  majStatutEtBoutons();
  majCompteurs();
  majConflits();
  if (vueActive === "grille") construireGrille();
}

/* Affiche le badge de statut et active/désactive les boutons. */
function majStatutEtBoutons() {
  const sched = planningMois.schedule;
  if (!sched) {
    planningStatut.textContent = "Aucun planning";
    planningStatut.className = "statut-badge statut-aucun";
  } else if (sched.status === "published") {
    planningStatut.textContent = "Publié";
    planningStatut.className = "statut-badge statut-published";
  } else {
    planningStatut.textContent = "Brouillon";
    planningStatut.className = "statut-badge statut-draft";
  }

  // Verrouillage : si publié, on bloque génération / ajout / publication.
  if (genererBtn) genererBtn.disabled = planningVerrouille;
  if (ajouterShiftBtn) ajouterShiftBtn.disabled = planningVerrouille;
  if (publierBtn) publierBtn.disabled = planningVerrouille || !sched || planningMois.shifts.length === 0;
  if (depublierBtn) depublierBtn.disabled = !planningVerrouille;
}

/* Tableau des compteurs heures / gardes / week-ends par médecin. */
function majCompteurs() {
  const stats = compterParMedecin(planningMois.shifts);
  const meds = planningMois.medecins;
  compteursTbody.innerHTML = "";

  const vide = planningMois.shifts.length === 0;
  compteursTable.classList.toggle("hidden", vide);
  compteursEmpty.classList.toggle("hidden", !vide);
  if (vide) return;

  // Nombre de semaines (approx.) du mois pour estimer la cible mensuelle.
  const nbJours = new Date(planningMois.annee, planningMois.mois, 0).getDate();
  const semaines = nbJours / 7;

  meds.forEach((m) => {
    const st = stats[m.id] || { heures: 0, gardes: 0, weekends: 0 };
    const cibleMois = Math.round((m.weekly_hours_target || 52) * semaines);
    const tr = document.createElement("tr");

    const tdNom = document.createElement("td"); tdNom.textContent = m.name; tr.appendChild(tdNom);
    const tdGrade = document.createElement("td");
    tdGrade.textContent = GRADE_LABELS[m.grade] || m.grade; tr.appendChild(tdGrade);

    const tdH = document.createElement("td");
    tdH.textContent = st.heures + " h";
    tdH.className = st.heures > cibleMois ? "depasse" : "ok";
    tr.appendChild(tdH);

    const tdCible = document.createElement("td"); tdCible.textContent = cibleMois + " h"; tr.appendChild(tdCible);
    const tdG = document.createElement("td"); tdG.textContent = st.gardes; tr.appendChild(tdG);
    const tdW = document.createElement("td"); tdW.textContent = st.weekends; tr.appendChild(tdW);

    compteursTbody.appendChild(tr);
  });
}

/* Liste des conflits du mois (via la fonction pure validerPlanning). */
function calculerConflitsMois(shifts) {
  return validerPlanning({
    annee: planningMois.annee, mois: planningMois.mois,
    shifts, medecins: planningMois.medecins, preferences: planningMois.preferences,
  });
}

function majConflits() {
  const conflits = calculerConflitsMois(planningMois.shifts);
  if (planningMois.shifts.length === 0) {
    conflitsZone.textContent = "Aucun planning chargé pour ce mois.";
    conflitsZone.className = "zone-info";
    return;
  }
  if (conflits.length === 0) {
    conflitsZone.textContent = "Aucun conflit. ✅";
    conflitsZone.className = "zone-info conflits-ok";
    return;
  }
  conflitsZone.className = "zone-info";
  conflitsZone.innerHTML = "";
  conflits.forEach((c) => {
    const div = document.createElement("div");
    div.className = "conflit-ligne";
    const sp = document.createElement("span");
    sp.className = "conflit-date"; sp.textContent = c.date + " — ";
    div.appendChild(sp);
    div.appendChild(document.createTextNode(c.message));
    conflitsZone.appendChild(div);
  });
}

/* --- Modale d'édition / d'ajout de shift --- */

/* Remplit la liste déroulante des médecins planifiables. */
function remplirSelectMedecins(selectionId) {
  sDoctor.innerHTML = "";
  planningMois.medecins.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name + " (" + (GRADE_LABELS[m.grade] || m.grade) + ")";
    if (m.id === selectionId) opt.selected = true;
    sDoctor.appendChild(opt);
  });
}

/* Remplit la liste déroulante des stations (+ « aucune »). */
function remplirSelectPostes(selectionCode) {
  sPoste.innerHTML = "";
  const aucun = document.createElement("option");
  aucun.value = ""; aucun.textContent = "— Aucune station —";
  sPoste.appendChild(aucun);
  (typeof POSTES_JOUR !== "undefined" ? POSTES_JOUR : []).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.code; opt.textContent = p.label;
    if (p.code === selectionCode) opt.selected = true;
    sPoste.appendChild(opt);
  });
  if (!selectionCode) aucun.selected = true;
}

function ouvrirModaleShift() {
  shiftFormMsg.textContent = "";
  shiftModal.classList.remove("hidden");
}
function fermerModaleShift() {
  shiftModal.classList.add("hidden");
  shiftEnEdition = null;
}

/* Ouvre la modale en mode édition pour un shift existant. */
function ouvrirEditionShift(shift) {
  if (planningVerrouille) {
    window.alert("Planning publié (lecture seule). Repasse-le en brouillon pour le modifier.");
    return;
  }
  shiftEnEdition = shift;
  shiftModalTit.textContent = "Modifier le shift";
  sDate.value = shift.date;
  sDate.disabled = true; // on ne déplace pas un shift via la date ici
  sType.value = shift.shift_type;
  remplirSelectMedecins(shift.doctor_id);
  remplirSelectPostes(shift.poste);
  majEtatStation();
  deleteShiftBtn.classList.remove("hidden");
  ouvrirModaleShift();
}

/* Ouvre la modale en mode ajout (nouveau shift), éventuellement pré-rempli
   (depuis un clic sur une cellule de la grille). */
function ouvrirAjoutShift(opts) {
  if (planningVerrouille) return;
  opts = opts || {};
  shiftEnEdition = null;
  shiftModalTit.textContent = "Ajouter un shift";
  const b = bornesMoisAffiche();
  sDate.value = opts.date || b.debut;
  sDate.disabled = false;
  sDate.min = b.debut; sDate.max = b.fin;
  sType.value = opts.type || "jour";
  remplirSelectMedecins(null);
  const posteDefaut = ("poste" in opts) ? opts.poste
    : ((typeof POSTES_JOUR !== "undefined" && POSTES_JOUR[0]) ? POSTES_JOUR[0].code : null);
  remplirSelectPostes(posteDefaut);
  majEtatStation();
  deleteShiftBtn.classList.add("hidden");
  ouvrirModaleShift();
}

/* Quand le type change : suggère une station cohérente et (dés)active le
   sélecteur de station selon le type. */
function majEtatStation() {
  const t = sType.value;
  const sansStation = estShiftAbsence(t) || t === "garde_nuit" || t === "twe";
  if (sansStation) { remplirSelectPostes(null); sPoste.value = ""; }
  sPoste.disabled = sansStation;
}
sType.addEventListener("change", () => {
  if (sType.value === "jour" && !sPoste.value) {
    const premier = (typeof POSTES_JOUR !== "undefined" && POSTES_JOUR[0]) ? POSTES_JOUR[0].code : null;
    remplirSelectPostes(premier);
  }
  majEtatStation();
});

/* Garantit qu'un schedule (brouillon) existe pour le mois ; renvoie son id. */
async function assurerScheduleMois() {
  if (planningMois.schedule) return planningMois.schedule.id;
  const { data, error } = await sb.from("schedules")
    .insert({ year: planningMois.annee, month: planningMois.mois, status: "draft" })
    .select("id").single();
  if (error) throw error;
  planningMois.schedule = { id: data.id, year: planningMois.annee, month: planningMois.mois, status: "draft" };
  return data.id;
}

/* Enregistre le shift (ajout ou modification) avec avertissement non bloquant. */
shiftForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  shiftFormMsg.textContent = "";

  const propose = {
    id: shiftEnEdition ? shiftEnEdition.id : null,
    date: sDate.value,
    shift_type: sType.value,
    doctor_id: sDoctor.value,
    poste: sPoste.value || null,
  };
  if (!propose.date || !propose.doctor_id) {
    shiftFormMsg.textContent = "Date et médecin obligatoires."; shiftFormMsg.className = "message error";
    return;
  }

  // Avertissement non bloquant : on compare les conflits avant / après.
  const avant = calculerConflitsMois(planningMois.shifts);
  const apres = (() => {
    const liste = planningMois.shifts.filter((s) => s.id !== propose.id);
    liste.push({ date: propose.date, shift_type: propose.shift_type, doctor_id: propose.doctor_id, poste: propose.poste });
    return calculerConflitsMois(liste);
  })();
  const cleSet = (arr) => new Set(arr.map((c) => c.date + "|" + c.message));
  const avantSet = cleSet(avant);
  const nouveaux = apres.filter((c) => !avantSet.has(c.date + "|" + c.message));
  if (nouveaux.length > 0) {
    const txt = nouveaux.slice(0, 8).map((c) => "• " + c.date + " — " + c.message).join("\n");
    const ok = window.confirm(
      "Cette modification introduit " + nouveaux.length + " conflit(s) :\n\n" + txt +
      (nouveaux.length > 8 ? "\n…" : "") + "\n\nEnregistrer quand même ?");
    if (!ok) return;
  }

  try {
    const scheduleId = await assurerScheduleMois();
    if (propose.id) {
      const { error } = await sb.from("shifts").update({
        date: propose.date, shift_type: propose.shift_type,
        doctor_id: propose.doctor_id, poste: propose.poste,
      }).eq("id", propose.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("shifts").insert({
        date: propose.date, shift_type: propose.shift_type,
        doctor_id: propose.doctor_id, poste: propose.poste, schedule_id: scheduleId,
      });
      if (error) throw error;
    }
  } catch (err) {
    console.error("Erreur enregistrement shift :", err);
    shiftFormMsg.textContent = "Erreur : " + (err.message || err); shiftFormMsg.className = "message error";
    return;
  }

  fermerModaleShift();
  calendrier.refetchEvents();
  rafraichirPanneauAdmin();
});

/* Supprime le shift en cours d'édition. */
deleteShiftBtn.addEventListener("click", async () => {
  if (!shiftEnEdition) return;
  if (!window.confirm("Supprimer ce shift ?")) return;
  const { error } = await sb.from("shifts").delete().eq("id", shiftEnEdition.id);
  if (error) {
    shiftFormMsg.textContent = "Erreur : " + error.message; shiftFormMsg.className = "message error";
    return;
  }
  fermerModaleShift();
  calendrier.refetchEvents();
  rafraichirPanneauAdmin();
});

cancelShiftBtn.addEventListener("click", fermerModaleShift);
shiftModal.addEventListener("click", (e) => { if (e.target === shiftModal) fermerModaleShift(); });
if (ajouterShiftBtn) ajouterShiftBtn.addEventListener("click", () => ouvrirAjoutShift());

/* Publication : brouillon → publié (verrouille l'édition). */
if (publierBtn) publierBtn.addEventListener("click", async () => {
  if (!planningMois.schedule) return;
  const conflits = calculerConflitsMois(planningMois.shifts);
  if (conflits.length > 0) {
    const ok = window.confirm(
      "Ce planning comporte " + conflits.length + " conflit(s) non résolu(s).\n" +
      "Publier quand même ?");
    if (!ok) return;
  }
  const { error } = await sb.from("schedules")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", planningMois.schedule.id);
  if (error) { messageGeneration("Erreur de publication : " + error.message, "error"); return; }
  messageGeneration("Planning " + planningMois.mois + "/" + planningMois.annee + " publié. ✅", "info");
  rafraichirPanneauAdmin();
});

/* Dé-publication : publié → brouillon (rouvre l'édition). */
if (depublierBtn) depublierBtn.addEventListener("click", async () => {
  if (!planningMois.schedule) return;
  if (!window.confirm("Repasser ce planning en brouillon ? Il ne sera plus marqué comme publié.")) return;
  const { error } = await sb.from("schedules")
    .update({ status: "draft", published_at: null })
    .eq("id", planningMois.schedule.id);
  if (error) { messageGeneration("Erreur : " + error.message, "error"); return; }
  messageGeneration("Planning repassé en brouillon. Tu peux le modifier.", "info");
  rafraichirPanneauAdmin();
});


/* ===================================================================== */
/* MODULE 6 — Vue « Grille postes × jours » + bascule de vue             */
/* --------------------------------------------------------------------- */
/* Tableau lisible : lignes = stations / nuit / 24h WE / TWE / absences ; */
/* colonnes = jours du mois ; cellule = médecin(s). Cellules cliquables   */
/* (admin) pour ajouter / modifier un shift.                              */
/* ===================================================================== */

const vueCalendrierBtn = document.getElementById("vue-calendrier-btn");
const vueGrilleBtn     = document.getElementById("vue-grille-btn");
const grilleWrapper    = document.getElementById("grille-wrapper");
const calendarEl       = document.getElementById("calendar");
const grilleTable      = document.getElementById("grille-table");
const grilleTitre      = document.getElementById("grille-titre");
const grillePrev       = document.getElementById("grille-prev");
const grilleNext       = document.getElementById("grille-next");

let vueActive = "calendrier";
let grilleShiftsById = {}; // id -> shift (pour l'édition au clic)

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin",
                 "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_FR = ["D", "L", "M", "M", "J", "V", "S"]; // index = getUTCDay()

/* Définition des lignes de la grille (ordre d'affichage). */
function grilleLignes() {
  const postes = (typeof POSTES_JOUR !== "undefined" ? POSTES_JOUR : []);
  const lignes = postes.map((p) => ({ label: p.label, type: "station", code: p.code }));
  lignes.push({ label: "Garde de nuit", type: "garde_nuit" });
  lignes.push({ label: "Garde 24h (WE)", type: "garde_24h_we" });
  lignes.push({ label: "TWE", type: "twe" });
  lignes.push({ label: "Absences / repos", type: "absence" });
  return lignes;
}

/* Week-end ou férié (réutilise joursFeriesBE de regles.js si dispo). */
function estWeekendOuFerieISO(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const j = d.getUTCDay();
  if (j === 0 || j === 6) return true;
  try { return joursFeriesBE(d.getUTCFullYear()).has(iso); } catch (e) { return false; }
}

/* Nom court d'un médecin pour la grille. */
function nomCourt(id) {
  const m = carteMedecins[id];
  return m && m.name ? m.name : "?";
}

/* Quels shifts d'un jour correspondent à une ligne donnée ? */
function shiftsPourLigne(ligne, duJour) {
  if (ligne.type === "station") {
    return duJour.filter((s) =>
      (s.shift_type === "jour" && s.poste === ligne.code) ||
      (s.shift_type === "garde_24h" && s.poste === ligne.code));
  }
  if (ligne.type === "garde_nuit") return duJour.filter((s) => s.shift_type === "garde_nuit");
  if (ligne.type === "garde_24h_we") return duJour.filter((s) => s.shift_type === "garde_24h" && !s.poste);
  if (ligne.type === "twe") return duJour.filter((s) => s.shift_type === "twe");
  if (ligne.type === "absence") return duJour.filter((s) => estShiftAbsence(s.shift_type));
  return [];
}

/* Type de shift par défaut quand on clique une cellule vide d'une ligne. */
function typeDefautLigne(ligne) {
  if (ligne.type === "station") return { type: "jour", poste: ligne.code };
  if (ligne.type === "garde_nuit") return { type: "garde_nuit", poste: null };
  if (ligne.type === "garde_24h_we") return { type: "garde_24h", poste: null };
  if (ligne.type === "twe") return { type: "twe", poste: null };
  if (ligne.type === "absence") return { type: "recup", poste: null };
  return { type: "jour", poste: null };
}

/* Construit (ou reconstruit) la grille pour le mois affiché au calendrier. */
async function construireGrille() {
  if (!calendrier) return;
  const d = calendrier.getDate();
  const annee = d.getFullYear();
  const mois = d.getMonth() + 1;
  const ms = String(mois).padStart(2, "0");
  const nbJours = new Date(annee, mois, 0).getDate();
  const debut = annee + "-" + ms + "-01";
  const fin = annee + "-" + ms + "-" + nbJours;

  grilleTitre.textContent = MOIS_FR[mois - 1] + " " + annee;

  // Données : médecins (noms) + shifts du mois.
  if (!Object.keys(carteMedecins).length) await chargerCarteMedecins();
  const { data: shifts, error } = await sb.from("shifts")
    .select("id, date, shift_type, doctor_id, poste")
    .gte("date", debut).lte("date", fin);
  if (error) { console.error("Erreur grille :", error); return; }

  grilleShiftsById = {};
  const parJour = {};
  (shifts || []).forEach((s) => {
    grilleShiftsById[s.id] = s;
    (parJour[s.date] = parJour[s.date] || []).push(s);
  });

  const editable = medecinCourant && medecinCourant.role === "admin" && !planningVerrouille;
  const lignes = grilleLignes();

  // En-tête : coin + un th par jour (numéro + lettre du jour).
  let html = "<thead><tr><th class='grille-coin'>Poste \\ Jour</th>";
  for (let j = 1; j <= nbJours; j++) {
    const iso = annee + "-" + ms + "-" + String(j).padStart(2, "0");
    const dd = new Date(iso + "T00:00:00Z");
    const we = estWeekendOuFerieISO(iso) ? " grille-we" : "";
    html += "<th class='grille-jour" + we + "'><span class='gj-num'>" + j +
            "</span><span class='gj-dow'>" + JOURS_FR[dd.getUTCDay()] + "</span></th>";
  }
  html += "</tr></thead><tbody>";

  // Lignes.
  lignes.forEach((ligne) => {
    html += "<tr><th class='grille-rowhead'>" + escapeHtml(ligne.label) + "</th>";
    for (let j = 1; j <= nbJours; j++) {
      const iso = annee + "-" + ms + "-" + String(j).padStart(2, "0");
      const we = estWeekendOuFerieISO(iso) ? " grille-we" : "";
      const duJour = parJour[iso] || [];
      const correspondants = shiftsPourLigne(ligne, duJour);
      const cls = "grille-cell" + we + (editable ? " editable" : "");
      const defaut = typeDefautLigne(ligne);
      let contenu = "";
      correspondants.forEach((s) => {
        const suff = (s.shift_type === "garde_24h" && s.poste) ? " (24h)"
                   : estShiftAbsence(s.shift_type) ? (" " + (SHIFT_CONFIG[s.shift_type] ? SHIFT_CONFIG[s.shift_type].court : ""))
                   : "";
        const couleur = SHIFT_CONFIG[s.shift_type] ? SHIFT_CONFIG[s.shift_type].couleur : "#57606a";
        contenu += "<span class='grille-chip' data-shiftid='" + s.id + "' " +
                   "style='background:" + couleur + "' title='" +
                   escapeHtml(nomCourt(s.doctor_id) + suff) + "'>" +
                   escapeHtml(nomCourt(s.doctor_id)) + escapeHtml(suff) + "</span>";
      });
      html += "<td class='" + cls + "' data-date='" + iso + "' data-type='" + defaut.type +
              "' data-poste='" + (defaut.poste || "") + "'>" + contenu + "</td>";
    }
    html += "</tr>";
  });
  html += "</tbody>";
  grilleTable.innerHTML = html;
}

/* Échappe le HTML (les noms sont insérés dans une chaîne HTML). */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Clic sur la grille : chip → édition du shift ; cellule vide → ajout. */
grilleTable.addEventListener("click", (e) => {
  if (!medecinCourant || medecinCourant.role !== "admin") return;
  if (planningVerrouille) {
    window.alert("Planning publié (lecture seule). Repasse-le en brouillon pour le modifier.");
    return;
  }
  const chip = e.target.closest(".grille-chip");
  if (chip) {
    const s = grilleShiftsById[chip.getAttribute("data-shiftid")];
    if (s) ouvrirEditionShift({ id: s.id, date: s.date, shift_type: s.shift_type, doctor_id: s.doctor_id, poste: s.poste });
    return;
  }
  const cell = e.target.closest(".grille-cell");
  if (cell) {
    ouvrirAjoutShift({
      date: cell.getAttribute("data-date"),
      type: cell.getAttribute("data-type"),
      poste: cell.getAttribute("data-poste") || null,
    });
  }
});

/* Bascule Calendrier / Grille. */
function basculerVuePlanning(vue) {
  vueActive = vue;
  const grille = vue === "grille";
  grilleWrapper.classList.toggle("hidden", !grille);
  calendarEl.classList.toggle("hidden", grille);
  vueGrilleBtn.classList.toggle("actif", grille);
  vueCalendrierBtn.classList.toggle("actif", !grille);
  if (grille) {
    construireGrille();
  } else if (calendrier) {
    calendrier.updateSize(); // recalcule la taille après réaffichage
  }
}
if (vueCalendrierBtn) vueCalendrierBtn.addEventListener("click", () => basculerVuePlanning("calendrier"));
if (vueGrilleBtn) vueGrilleBtn.addEventListener("click", () => basculerVuePlanning("grille"));

/* Navigation mois dans la grille (pilote le calendrier ; datesSet
   reconstruit la grille automatiquement). */
if (grillePrev) grillePrev.addEventListener("click", () => { if (calendrier) calendrier.prev(); });
if (grilleNext) grilleNext.addEventListener("click", () => { if (calendrier) calendrier.next(); });


/* --------------------------------------------------------------------- */
/* Au chargement de la page : restaure la session si elle existe déjà    */
/* (évite de redemander le login à chaque rafraîchissement).             */
/* --------------------------------------------------------------------- */
(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const profil = await chargerProfil(session.user);
    if (profil) afficherEspace(profil);
  }
})();
