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
    .select("id, name, role")
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
      '<tr><td colspan="8">Erreur de chargement (vérifie les règles RLS).</td></tr>';
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

// Libellés lisibles des types de préférence.
const PREF_LABELS = {
  conge: "Congé",
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

  rendrePreferences(data || []);
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
};

/* Couleurs de fond des préférences affichées dans le calendrier. */
const PREF_BG = {
  conge:        "rgba(26,127,55,0.18)",   // vert
  indispo:      "rgba(207,34,46,0.16)",    // rouge
  souhait:      "rgba(31,111,235,0.14)",   // bleu
  off_clinic:   "rgba(154,103,0,0.16)",    // orangé
  recuperation: "rgba(130,80,223,0.16)",   // violet
};

/* Libellés complets des types de préférence (inclut off_clinic / recuperation). */
const PREF_LABELS_FULL = {
  conge: "Congé",
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

/* Charge une fois la correspondance id → médecin (pour nommer les shifts).
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
    .select("id, date, shift_type, doctor_id, schedule_id")
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
      const dateFin = cfg.lendemain ? lendemainDe(s.date) : s.date;

      events.push({
        title: nom + " · " + cfg.court,
        start: s.date + "T" + cfg.debut + ":00",
        end: dateFin + "T" + cfg.fin + ":00",
        backgroundColor: cfg.couleur,
        borderColor: estMien ? "#1f2328" : cfg.couleur,
        classNames: estMien ? ["shift-mien"] : [],
        extendedProps: { tooltip: nom + " — " + cfg.label },
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
        end: lendemainDe(p.end_date), // fin exclusive → +1 jour pour inclure end_date
        display: "background",
        backgroundColor: PREF_BG[p.pref_type] || "rgba(0,0,0,0.06)",
        extendedProps: {
          tooltip: (med.name ? med.name + " — " : "") + libelle +
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
      dayMaxEvents: true,       // regroupe en « +N » si la journée est chargée
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,listMonth",
      },
      buttonText: {
        today: "Aujourd'hui",
        month: "Mois",
        week: "Semaine",
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
    });
    calendrier.render();
  } else {
    // Déjà créé : on rafraîchit l'affichage et les données.
    calendrier.render();
    calendrier.refetchEvents();
  }
}

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
