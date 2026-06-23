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

/* Hash de l'URL capturé AU CHARGEMENT, avant que supabase-js ne le consomme.
   Sert à détecter qu'on arrive via un lien d'invitation / de réinitialisation
   (#...type=invite ou type=recovery) pour afficher la page « définir le mot de
   passe » plutôt que de connecter directement. */
const URL_HASH_AU_CHARGEMENT = window.location.hash || "";

/* URL de la page (sans hash) : cible des liens email d'invitation / reset.
   Doit être autorisée dans Supabase → Authentication → URL Configuration. */
const REDIRECT_AUTH = window.location.origin + window.location.pathname;


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

/* Références DOM — réinitialisation / définition du mot de passe */
const forgotLink       = document.getElementById("forgot-password-link");
const setPasswordView  = document.getElementById("set-password-view");
const setPasswordForm  = document.getElementById("set-password-form");
const newPassword      = document.getElementById("new-password");
const newPasswordConf  = document.getElementById("new-password-confirm");
const setPasswordMsg   = document.getElementById("set-password-message");

/* Références DOM — gestion des médecins (Module 2) */
const addDoctorBtn    = document.getElementById("add-doctor-btn");
const doctorForm      = document.getElementById("doctor-form");
const doctorId        = document.getElementById("doctor-id");
const dName           = document.getElementById("d-name");
const dEmail          = document.getElementById("d-email");
const dGrade          = document.getElementById("d-grade");
const dPgFields       = document.getElementById("d-pg-fields");
const dPgType         = document.getElementById("d-pg-type");
const dOptingOut      = document.getElementById("d-opting-out");
const dFte            = document.getElementById("d-fte");
const dHours          = document.getElementById("d-hours");
const dAdminLevel     = document.getElementById("d-admin-level");
const dStatut         = document.getElementById("d-statut");
const dConges100      = document.getElementById("d-conges100");
const dNouvelEngage   = document.getElementById("d-nouvel-engage");
const dReconnu        = document.getElementById("d-reconnu");
const dStart          = document.getElementById("d-start");
const dEnd            = document.getElementById("d-end");
const dPeriodes       = document.getElementById("d-periodes");
const dAddPeriode     = document.getElementById("d-add-periode");
const dQuotaAnnuel    = document.getElementById("d-quota-annuel");
const dQuotaExtra     = document.getElementById("d-quota-extra");
const dQuotaScient    = document.getElementById("d-quota-scientifique");
const dCapFromager    = document.getElementById("d-cap-fromager");
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
const pComp       = document.getElementById("p-comp"); // jour de récup (travailler_ferie, M26)
const prefFormMsg = document.getElementById("pref-form-msg");
const prefsTbody  = document.getElementById("prefs-tbody");
/* Popup « désidérata depuis le calendrier » (sélection de dates). */
const desModal      = document.getElementById("desiderata-modal");
const desType       = document.getElementById("desiderata-type");
const desNote       = document.getElementById("desiderata-note");
const desDebut      = document.getElementById("desiderata-debut");
const desFin        = document.getElementById("desiderata-fin");
const desMsg        = document.getElementById("desiderata-msg");
const desOkBtn      = document.getElementById("desiderata-ok");
const desAnnulerBtn = document.getElementById("desiderata-annuler");
/* Popup admin « forcer un congé / une absence ». */
const forcerCongeBtn = document.getElementById("forcer-conge-btn");
const fcModal   = document.getElementById("force-conge-modal");
const fcMedecin = document.getElementById("fc-medecin");
const fcType    = document.getElementById("fc-type");
const fcDebut   = document.getElementById("fc-debut");
const fcFin     = document.getElementById("fc-fin");
const fcNote    = document.getElementById("fc-note");
const fcMsg     = document.getElementById("fc-msg");
const fcOkBtn   = document.getElementById("fc-ok");
const fcAnnulerBtn = document.getElementById("fc-annuler");
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
    .select("id, name, role, grade, pg_type, statut, fte, contract_start, contract_end, quota_conge_annuel, quota_conge_extralegal, quota_conge_scientifique")
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

  // En-tête : nom + badge de rôle (refonte graphique).
  welcomeText.textContent = profil.name || "";
  roleText.textContent = estAdmin ? "Admin" : "Médecin";

  // On montre uniquement la zone correspondant au rôle.
  adminZone.classList.toggle("hidden", !estAdmin);
  doctorZone.classList.toggle("hidden", estAdmin);

  // Onglets : ceux de l'admin / du médecin selon le rôle, et les outils
  // admin de l'onglet Planning (génération, compteurs, conflits).
  document.querySelectorAll(".tab-admin").forEach((el) => el.classList.toggle("hidden", !estAdmin));
  document.querySelectorAll(".tab-doctor").forEach((el) => el.classList.toggle("hidden", estAdmin));
  // PG : masquer l'onglet Échanges (non pertinent pour les PG)
  const estPg = profil.grade === "pg";
  const tabEchanges = document.querySelector('[data-tab="echanges"]');
  if (tabEchanges && !estAdmin) tabEchanges.classList.toggle("hidden", estPg);
  const adminPlanning = document.getElementById("admin-planning");
  if (adminPlanning) adminPlanning.classList.toggle("hidden", !estAdmin);
  basculerOnglet("planning"); // toujours démarrer sur le planning

  basculerVue(true);

  // M26 — fériés éditables : charge les surcharges et alimente le moteur de règles
  // (avant toute génération / affichage du calendrier).
  chargerFeriesAdmin();

  // M27 — miroir Google Sheets : charge les réglages admin (URL + jeton).
  if (estAdmin) chargerReglagesSheet();
  if (estAdmin) chargerEchangesAdmin();
  if (estAdmin && typeof echAdminCharger === "function") echAdminCharger();

  // Côté admin : liste des médecins. Côté médecin : ses préférences.
  if (estAdmin) chargerMedecins();
  else { chargerPreferences(); initEchanges(); }
  // INDÉPENDANT : son outil principal est la déclaration de ses jours de
  // travail (type « dispo », contrainte dure + PRIORITAIRE à l'horaire).
  // On ajoute l'option en TÊTE de la liste des types de demande.
  const pType = document.getElementById("p-type");
  if (!estAdmin && pType && profil.statut === "independant" && !pType.querySelector('option[value="dispo"]')) {
    const opt = document.createElement("option");
    opt.value = "dispo";
    opt.textContent = "✅ Disponible — je viens travailler ce jour (indépendant, PRIORITAIRE)";
    pType.insertBefore(opt, pType.firstChild);
    pType.value = "dispo";
  }

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
/* AUTH — Invitation / mot de passe oublié / définition du mot de passe  */
/* ===================================================================== */

/* Affiche un message dans la vue « définir le mot de passe ». */
function messageSetPassword(texte, type = "error") {
  if (!setPasswordMsg) return;
  setPasswordMsg.textContent = texte;
  setPasswordMsg.className = "message " + type;
}

/* Bascule sur la vue « définir le mot de passe » (cache login + app). */
function montrerDefinirMotDePasse() {
  if (loginView) loginView.classList.add("hidden");
  if (appView) appView.classList.add("hidden");
  if (setPasswordView) setPasswordView.classList.remove("hidden");
}

/* Lien « Mot de passe oublié ? » : envoie un email de réinitialisation. */
if (forgotLink) {
  forgotLink.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = (document.getElementById("email").value || "").trim();
    if (!email) {
      afficherMessage("Entre d'abord ton email, puis clique « Mot de passe oublié ».", "info");
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_AUTH });
    if (error) {
      afficherMessage("Erreur : " + error.message);
    } else {
      afficherMessage("Si un compte existe pour cet email, un message de réinitialisation vient d'être envoyé.", "info");
    }
  });
}

/* Soumission du nouveau mot de passe (après lien d'invitation / de reset). */
if (setPasswordForm) {
  setPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageSetPassword("");
    const p1 = newPassword.value;
    const p2 = newPasswordConf.value;
    if (p1.length < 8) { messageSetPassword("8 caractères minimum."); return; }
    if (p1 !== p2) { messageSetPassword("Les deux mots de passe ne correspondent pas."); return; }

    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) { messageSetPassword("Erreur : " + error.message); return; }

    messageSetPassword("Mot de passe enregistré. Accès à votre espace…", "info");
    // Nettoie le hash du lien email puis ouvre l'espace.
    history.replaceState(null, "", REDIRECT_AUTH);
    setPasswordView.classList.add("hidden");
    const { data: { user } } = await sb.auth.getUser();
    const profil = user ? await chargerProfil(user) : null;
    if (profil) afficherEspace(profil);
    else basculerVue(false);
  });
}

/* Supabase émet PASSWORD_RECOVERY quand on arrive via un lien de
   réinitialisation : on affiche alors la page de définition du mot de passe. */
sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") montrerDefinirMotDePasse();
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
  pg: "PG / Fellow",
};

/* Affiche/masque les champs PG selon le grade ; un Fellow est toujours en
   opting out (case forcée et désactivée). Auto-cible : 60 h/sem si opting out,
   48 h/sem sinon (modifiable). */
function majChampsPg() {
  if (!dPgFields) return;
  const estPg = dGrade.value === "pg";
  dPgFields.classList.toggle("hidden", !estPg);
  const trimBox = document.getElementById("d-pg-trimestres");
  if (trimBox) trimBox.classList.toggle("hidden", !estPg);
  if (estPg && typeof renderPgTrimestres === "function") renderPgTrimestres();
  if (!estPg) return;
  const fellow = dPgType && dPgType.value === "fellow";
  if (dOptingOut) {
    if (fellow) { dOptingOut.checked = true; dOptingOut.disabled = true; }
    else { dOptingOut.disabled = false; }
  }
  if (dHours) dHours.value = (dOptingOut && dOptingOut.checked) ? 60 : 48;
}

/* Montre/masque les champs de planification selon le grade/rôle.
   Un admin pur (grade="admin" ou admin_level!="aucun") n'a pas de
   contrat, quotas, jours travaillables — il n'est jamais planifié. */
function majChampsAdmin() {
  const estAdmin = dGrade.value === "admin" || (dAdminLevel && dAdminLevel.value !== "aucun");
  const travFields = document.getElementById("d-travailleur-fields");
  if (travFields) travFields.classList.toggle("hidden", estAdmin);
  // Sync : si on choisit admin dans le grade → force le rôle admin
  if (dGrade.value === "admin" && dAdminLevel && dAdminLevel.value === "aucun") {
    dAdminLevel.value = "secondaire";
  }
  // Sync inverse : si rôle admin → passe le grade à "admin"
  if (dAdminLevel && dAdminLevel.value !== "aucun" && dGrade.value !== "admin") {
    dGrade.value = "admin";
  }
  majChampsPg();   // rafraîchit les champs PG après un éventuel changement de grade
}

/* Quota de base d'un type de congé : surcharge du médecin, sinon défaut (regles.js). */
function quotaBase(med, type) {
  const valeur = med["quota_" + type];
  return valeur != null ? valeur : CONGE_TYPES[type].defaut;
}

/* Résumé compact « annuel/extra/scientifique » pour le tableau admin.
   Affiche le quota EFFECTIF (proratisé au contrat ET à la quotité fte), identique
   aux « Compteurs de congés » de l'équipe (révision 2026-06-14). Année académique
   en cours (1 oct → 30 sep). */
function quotasResume(med) {
  // PG / Fellow : quota par TRIMESTRE civil (10 j ULB / 20 j Fellow), pas annuel.
  if (med.grade === "pg") {
    const lim = (med.pg_type === "fellow") ? PG_CONGE_TRIM_FELLOW : PG_CONGE_TRIM_ULB;
    return lim + " j/trim";
  }
  // Quota = base × quotité (FTE) uniquement — plus de proration par dates de
  // contrat (jugée trompeuse pour les temps partiels permanents).
  const f = fteDe(med);
  const q = (type) => Math.round(quotaBase(med, type) * f);
  return q("conge_annuel") + "/" + q("conge_extralegal") + "/" + q("conge_scientifique");
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

/* --- Périodes contractuelles multiples (§2) --- */
function lignesPeriodes() {
  return Array.from(dPeriodes.querySelectorAll(".periode-ligne"));
}
/* Ajoute une ligne de période supplémentaire (avec bouton de suppression). */
function ajouterLignePeriode(start, end) {
  const div = document.createElement("div");
  div.className = "periode-ligne";
  const i1 = document.createElement("input"); i1.type = "date"; i1.value = start || "";
  const sep = document.createElement("span"); sep.textContent = "→";
  const i2 = document.createElement("input"); i2.type = "date"; i2.value = end || "";
  const del = document.createElement("button");
  del.type = "button"; del.className = "mini danger"; del.textContent = "✕";
  del.addEventListener("click", () => div.remove());
  div.append(i1, sep, i2, del);
  dPeriodes.appendChild(div);
}
/* Lit toutes les périodes saisies : [{start, end}] (start obligatoire). */
function getPeriodes() {
  return lignesPeriodes().map((l) => {
    const ins = l.querySelectorAll("input[type=date]");
    return { start: ins[0].value || null, end: ins[1].value || null };
  }).filter((p) => p.start);
}
/* Pré-remplit les périodes : la 1re sur la ligne primaire, les autres ajoutées. */
function setPeriodes(periodes) {
  lignesPeriodes().forEach((l) => { if (!l.dataset.primaire) l.remove(); });
  const list = (periodes && periodes.length) ? periodes : [{ start: "", end: "" }];
  dStart.value = list[0].start || "";
  dEnd.value = list[0].end || "";
  for (let i = 1; i < list.length; i++) ajouterLignePeriode(list[i].start, list[i].end);
}
if (dAddPeriode) dAddPeriode.addEventListener("click", () => ajouterLignePeriode("", ""));

/* --- Trimestres de contrat PG : cases à cocher → périodes de dates --- */
const QUART_DEB = ["01-01", "04-01", "07-01", "10-01"];
const QUART_FIN = ["03-31", "06-30", "09-30", "12-31"];
function quartDates(annee, q) {
  return { start: annee + "-" + QUART_DEB[q], end: annee + "-" + QUART_FIN[q] };
}
let pgTrimAnnee = new Date().getFullYear();
/* Coche les T1–T4 de l'année affichée selon les périodes de dates en cours. */
function renderPgTrimestres() {
  const lab = document.getElementById("trim-annee");
  if (lab) lab.textContent = pgTrimAnnee;
  const periodes = getPeriodes();
  document.querySelectorAll(".trim-cb").forEach((cb) => {
    const q = parseInt(cb.dataset.q, 10);
    const d = quartDates(pgTrimAnnee, q);
    cb.checked = periodes.some((p) => p.start === d.start && p.end === d.end);
  });
}
/* Coche/décoche un trimestre → ajoute/retire la période de dates correspondante. */
function togglePgTrimestre(q, coche) {
  const d = quartDates(pgTrimAnnee, q);
  let periodes = getPeriodes();
  if (coche) {
    if (!periodes.some((p) => p.start === d.start && p.end === d.end)) periodes.push(d);
  } else {
    periodes = periodes.filter((p) => !(p.start === d.start && p.end === d.end));
  }
  periodes.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  setPeriodes(periodes);
  renderPgTrimestres();
}
document.addEventListener("change", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("trim-cb")) {
    togglePgTrimestre(parseInt(e.target.dataset.q, 10), e.target.checked);
  }
});
const trimPrevBtn = document.getElementById("trim-prev");
const trimNextBtn = document.getElementById("trim-next");
if (trimPrevBtn) trimPrevBtn.addEventListener("click", () => { pgTrimAnnee -= 1; renderPgTrimestres(); });
if (trimNextBtn) trimNextBtn.addEventListener("click", () => { pgTrimAnnee += 1; renderPgTrimestres(); });

/* Ouvre le formulaire en mode "ajout" (champs vides) */
function ouvrirAjout() {
  doctorForm.reset();
  doctorId.value = "";
  dFte.value = "1";
  dHours.value = HEURES_BASE; // 52h par défaut (plein temps)
  if (dPgType) dPgType.value = "ulb";
  if (dOptingOut) { dOptingOut.checked = false; dOptingOut.disabled = false; }
  majChampsAdmin();
  setPeriodes([]);            // une seule période vide
  messageFormMedecin("");
  doctorForm.classList.remove("hidden");
}

/* Ouvre le formulaire en mode "édition", pré-rempli avec un médecin */
function ouvrirEdition(med) {
  doctorId.value = med.id;
  dName.value = med.name || "";
  dEmail.value = med.email || "";
  dGrade.value = med.grade || "assistant_specialiste";
  if (dPgType) dPgType.value = med.pg_type || "ulb";
  if (dOptingOut) dOptingOut.checked = !!med.opting_out;
  majChampsPg();
  dFte.value = med.fte ?? 1;
  dHours.value = med.weekly_hours_target ?? HEURES_BASE;
  dAdminLevel.value = med.admin_level || (med.role === "admin" ? "principal" : "aucun");
  dStatut.value = med.statut || "dependant";
  dConges100.checked = !!med.conges_100pct;
  if (dNouvelEngage) dNouvelEngage.checked = !!med.nouvel_engage;
  if (dReconnu) dReconnu.checked = !!med.reconnu;
  setPeriodes(
    (med.contract_periods && med.contract_periods.length)
      ? med.contract_periods
      : (med.contract_start ? [{ start: med.contract_start, end: med.contract_end }] : [])
  );
  // Grille trimestres PG : ouvre sur l'année du 1er contrat (sinon année en cours).
  if (typeof renderPgTrimestres === "function") {
    const per0 = getPeriodes()[0];
    if (per0 && per0.start) pgTrimAnnee = parseInt(per0.start.slice(0, 4), 10);
    renderPgTrimestres();
  }
  dQuotaAnnuel.value = med.quota_conge_annuel ?? "";
  dQuotaExtra.value = med.quota_conge_extralegal ?? "";
  dQuotaScient.value = med.quota_conge_scientifique ?? "";
  setJoursTravailles(med.jours_travailles);
  if (dCapFromager) dCapFromager.checked = !!med.cap_fromager;
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
if (dGrade) dGrade.addEventListener("change", majChampsAdmin);
if (dPgType) dPgType.addEventListener("change", majChampsPg);
if (dAdminLevel) dAdminLevel.addEventListener("change", majChampsAdmin);
if (dOptingOut) dOptingOut.addEventListener("change", () => { if (dHours) dHours.value = dOptingOut.checked ? 60 : 48; });
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

  medecinsListe = data || [];
  appliquerFiltreMedecins();
}

/* Filtre la liste des médecins par catégorie (sous-onglets). */
let medecinsListe = [];
let medFiltre = "tous";
function medCategorie(med) {
  // Admin détecté AVANT le grade : un admin pur porte un grade factice
  // (assistant_specialiste) imposé par la contrainte NOT NULL.
  if (med.role === "admin" || (med.admin_level && med.admin_level !== "aucun")) return "admin";
  if (med.grade === "pg") return (med.pg_type === "fellow") ? "fellow" : "pg_ulb";
  if (med.grade === "assistant_specialiste") return "as";
  if (med.grade === "resident") return "resident";
  return "autre"; // sans grade → visible seulement sous « Tous »
}
function appliquerFiltreMedecins() {
  const liste = (medFiltre === "tous")
    ? medecinsListe
    : medecinsListe.filter((m) => medCategorie(m) === medFiltre);
  rendreTableau(liste);
}
document.querySelectorAll("#med-filtres .vue-btn").forEach((b) =>
  b.addEventListener("click", () => {
    medFiltre = b.dataset.filtre;
    document.querySelectorAll("#med-filtres .vue-btn").forEach((x) => x.classList.toggle("actif", x === b));
    appliquerFiltreMedecins();
  }));

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

    const btnInvite = document.createElement("button");
    btnInvite.textContent = "Inviter";
    btnInvite.className = "mini";
    btnInvite.title = "Envoyer un email d'invitation pour définir le mot de passe";
    btnInvite.addEventListener("click", () => inviterMedecin(med));

    const btnDel = document.createElement("button");
    btnDel.textContent = "Supprimer";
    btnDel.className = "mini danger";
    btnDel.addEventListener("click", () => supprimerMedecin(med));

    tdActions.appendChild(btnEdit);
    tdActions.appendChild(btnInvite);
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
  const periodes = getPeriodes();
  const adminLevel = dAdminLevel.value;

  // Construit l'objet à envoyer. Dates vides → null.
  const estAdminPur = adminLevel !== "aucun";
  const payload = {
    name: dName.value.trim(),
    email: dEmail.value.trim().toLowerCase(),
    // NOTE admin pur : colonnes NOT NULL en DB (grade/statut/jours_travailles…).
    // On envoie des valeurs valides factices ; l'admin est de toute façon exclu
    // du planning par role="admin" (filtres .neq("role","admin")).
    grade: estAdminPur ? "assistant_specialiste" : dGrade.value,
    pg_type: (!estAdminPur && dGrade.value === "pg") ? (dPgType ? dPgType.value : "ulb") : null,
    opting_out: (!estAdminPur && dGrade.value === "pg") ? ((dPgType && dPgType.value === "fellow") || (dOptingOut && dOptingOut.checked)) : false,
    fte: estAdminPur ? 1 : (isNaN(fte) ? 1 : fte),
    weekly_hours_target: estAdminPur ? HEURES_BASE : (parseFloat(dHours.value) || HEURES_BASE),
    // Rôle d'accès dérivé du niveau admin (travailleur → doctor, sinon admin).
    role: adminLevel === "aucun" ? "doctor" : "admin",
    admin_level: adminLevel,
    statut: estAdminPur ? "dependant" : dStatut.value,
    conges_100pct: estAdminPur ? false : dConges100.checked,
    nouvel_engage: estAdminPur ? false : (dNouvelEngage ? dNouvelEngage.checked : false),
    reconnu: estAdminPur ? false : (dReconnu ? dReconnu.checked : false),
    contract_type: estAdminPur ? "temps_plein" : (fte >= 1 ? "temps_plein" : "temps_partiel"),
    // Périodes contractuelles (non pertinent pour un admin pur).
    contract_start: estAdminPur ? null : (periodes[0] ? periodes[0].start : null),
    contract_end:   estAdminPur ? null : (periodes[0] ? periodes[0].end : null),
    contract_periods: estAdminPur ? null : (periodes.length ? periodes : null),
    // Quotas de congés (non pertinent pour un admin pur).
    quota_conge_annuel:       estAdminPur ? null : (dQuotaAnnuel.value === "" ? null : parseInt(dQuotaAnnuel.value, 10)),
    quota_conge_extralegal:   estAdminPur ? null : (dQuotaExtra.value === ""  ? null : parseInt(dQuotaExtra.value, 10)),
    quota_conge_scientifique: estAdminPur ? null : (dQuotaScient.value === "" ? null : parseInt(dQuotaScient.value, 10)),
    // Jours travaillables (non pertinent pour un admin pur).
    jours_travailles: estAdminPur ? [1,2,3,4,5,6,7] : getJoursTravailles(),
    // Statut « CAP fromager » (résident à part entière, contraintes spéciales).
    cap_fromager: estAdminPur ? false : !!(dCapFromager && dCapFromager.checked),
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

/* Invite un médecin par email (via l'Edge Function inviter-medecin, qui détient
   la clé service_role). Le médecin reçoit un lien pour définir son mot de passe. */
async function inviterMedecin(med) {
  if (!med.email) { window.alert("Ce médecin n'a pas d'email enregistré."); return; }
  if (!window.confirm("Envoyer une invitation par email à " + med.email + " ?")) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.alert("Session expirée, reconnecte-toi."); return; }

  try {
    const res = await fetch(SUPABASE_URL + "/functions/v1/inviter-medecin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email: med.email, redirectTo: REDIRECT_AUTH }),
    });
    // On lit le corps en TEXTE d'abord : si la réponse n'est pas du JSON
    // (erreur de passerelle, 401/404, page d'erreur…), on l'affiche quand même.
    const raw = await res.text();
    let out = {};
    try { out = raw ? JSON.parse(raw) : {}; } catch (e) { out = {}; }
    if (!res.ok) {
      const detail = out.error || out.message || out.msg || (raw && raw.slice(0, 300)) || "(réponse vide)";
      window.alert(
        "Échec de l'invitation — HTTP " + res.status + " : " + detail +
        "\n\nVérifie dans Supabase :\n" +
        "• Edge Functions → inviter-medecin → Logs (le vrai message)\n" +
        "• SMTP Brevo configuré + expéditeur validé (étape B du GUIDE_AUTH.md)\n" +
        "• ton compte a bien role='admin' dans la table doctors");
      return;
    }
    window.alert("Invitation envoyée à " + (out.email || med.email) + ".");
  } catch (e) {
    window.alert("Impossible de joindre la fonction d'invitation : " + e.message +
      "\n(Souvent : fonction non déployée, mauvais nom, ou blocage CORS.)");
  }
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
  indispo: "Indisponibilité (garde)",
  souhait: "Souhait (garde)",
  formation: "Formation USI",
  conge_maladie: "Congé maladie",
  autre: "Congé autre",
  demande_weekend: "Demande WE/férié",
  recup_ferie: "Récup férié",
  travailler_ferie: "Travailler un férié",
  conge_ferie: "Congé férié (récup)",
  recherche_clinique: "Recherche clinique",
  dispo: "✅ Disponible (indépendant, prioritaire)",
  garde_pg: "Garde PG (24 h)",
};

/* Affiche un message dans le formulaire de préférences */
function messageFormPref(texte, type = "error") {
  prefFormMsg.textContent = texte;
  prefFormMsg.className = "message " + type;
}

/* Charge les préférences du médecin connecté et les affiche */
/* Adapte le formulaire de préférences au grade de l'utilisateur connecté.
   PG : congé annuel + indisponibilité seulement (pas de souhait-garde,
   pas de demande-weekend, pas de scientifique/extra-légaux).
   Appelée à chaque chargement des prefs (après connaissance du profil). */
function majOptionsPrefsParGrade() {
  if (!pType || !medecinCourant) return;
  const estPg     = medecinCourant.grade === "pg";
  const estFellow = estPg && medecinCourant.pg_type === "fellow";
  const optsPG = [
    ["conge_annuel",       "Congé (bloquant — dans quota trimestriel)"],
    ...(estFellow ? [["recherche_clinique", "Jour de recherche clinique (bloquant — dans quota trimestriel)"]] : []),
    ["indispo",       "Indisponible pour le tour de week-end (souhait, non bloquant)"],
  ];
  const optsRes = [
    ["conge_annuel",       "Congé annuel (bloquant)"],
    ["conge_extralegal",   "Congés extra-légaux (bloquant)"],
    ["conge_scientifique", "Congé scientifique (bloquant)"],
    ["indispo",            "Indisponibilité — souhait de ne pas être de garde ni de tour WE (non bloquant)"],
    ["souhait",            "Souhait de garde ou de tour WE (non bloquant)"],
    ["travailler_ferie",   "Travailler un jour férié (+ je choisis mon jour de récup)"],
  ];
  const opts = estPg ? optsPG : optsRes;
  // Reconstruire seulement si la liste change (idempotent).
  const vals = opts.map(function(o) { return o[0]; }).join(",");
  const cur  = Array.from(pType.options).map(function(o) { return o.value; }).join(",");
  if (cur !== vals) {
    pType.innerHTML = opts.map(function(o) {
      return "<option value=\"" + o[0] + "\">" + o[1] + "</option>";
    }).join("");
  }
  // Texte d'intro
  const intro = document.getElementById("prefs-intro");
  if (intro) {
    intro.textContent = estPg
      ? "Encode tes congés, lendemains de garde et indisponibilités week-end. Ton quota de congés est géré par l'administration."
      : "Encode tes congés, indisponibilités et souhaits. Si tu poses congé en incluant le samedi et/ou dimanche, ces jours sont automatiquement bloqués pour les tours et gardes — sans être décomptés du quota (seuls les jours ouvrés lun–ven comptent).";
  }
}
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
  await chargerMesShifts();     // fériés travaillés → droits à récup férié
  majOptionsPrefsParGrade();    // adapte les options selon le grade (PG vs résident/AS)
  majCompteurConges();          // met à jour l'affichage du quota
  rendrePreferences(prefsCourantes);
  const pgZone = document.getElementById("pg-garde-zone");
  if (pgZone) {
    const estPg = medecinCourant.grade === "pg";
    pgZone.classList.toggle("hidden", !estPg);
    if (estPg) await chargerGardesPG();
  }
}

/* ----- GARDES PG auto-encodées : le PG déclare une date → garde_pg (24 h) +
   récup le lendemain. Indépendant du planning de service. ----- */
const _pgAddJ = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function chargerGardesPG() {
  const tbody = document.getElementById("pg-garde-tbody");
  if (!tbody || !medecinCourant) return;
  const { data } = await sb.from("preferences").select("id, start_date, doctor_id")
    .eq("doctor_id", medecinCourant.id).eq("pref_type", "garde_pg")
    .gte("start_date", new Date().toISOString().slice(0, 10)).order("start_date");
  const fmt = (iso) => { const d = iso.split("-"); return d[2] + "/" + d[1] + "/" + d[0]; };
  tbody.innerHTML = "";
  (data || []).forEach((g) => {
    const tr = document.createElement("tr");
    [fmt(g.start_date), fmt(_pgAddJ(g.start_date, 1))].forEach((c) => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
    const act = document.createElement("td");
    const del = document.createElement("button"); del.type = "button"; del.textContent = "Supprimer"; del.className = "mini danger";
    del.addEventListener("click", () => supprimerGardePG(g));
    act.appendChild(del); tr.appendChild(act); tbody.appendChild(tr);
  });
  const empty = document.getElementById("pg-garde-empty");
  if (empty) empty.classList.toggle("hidden", (data || []).length > 0);
}
async function declarerGardePG() {
  const msg = document.getElementById("pg-garde-msg");
  const dateEl = document.getElementById("pg-garde-date");
  const date = dateEl && dateEl.value;
  if (!date) { if (msg) { msg.textContent = "Choisis une date."; msg.className = "message error"; } return; }
  try {
    // Garde PG = auto-déclaration INDÉPENDANTE du planning → stockée en préférence
    // (type 'garde_pg', statut 'approuve'). Le PG a le droit d'écrire ses propres
    // préférences (RLS), donc plus besoin de planning existant ni de droits admin.
    // La génération PG la lira (blocage jour + lendemain) et matérialisera les shifts.
    const { error } = await sb.from("preferences").insert({
      doctor_id: medecinCourant.id, start_date: date, end_date: date,
      pref_type: "garde_pg", status: "approuve",
    });
    if (error) throw error;
    if (msg) { msg.textContent = "Garde déclarée (24 h) + récup le " + _pgAddJ(date, 1) + ". ✅"; msg.className = "message info"; }
    if (dateEl) dateEl.value = "";
    chargerPreferences();
  } catch (e) { if (msg) { msg.textContent = "Erreur : " + (e.message || e); msg.className = "message error"; } }
}
async function supprimerGardePG(g) {
  if (!window.confirm("Supprimer cette garde déclarée ?")) return;
  const { error } = await sb.from("preferences").delete().eq("id", g.id);
  if (error) { window.alert("Erreur : " + error.message); return; }
  chargerPreferences();
}
const _pgGardeAddBtn = document.getElementById("pg-garde-add");
if (_pgGardeAddBtn) _pgGardeAddBtn.addEventListener("click", declarerGardePG);

/* --- Comptage des congés en jours OUVRÉS, par catégorie et par ANNÉE ACADÉMIQUE --- */
/* L'année de référence des quotas n'est PAS l'année civile mais l'année
   ACADÉMIQUE : du 1er octobre au 30 septembre (révision Dr Calabro). Le compteur
   « repart à zéro » chaque 1er octobre, automatiquement, puisque le consommé est
   dérivé des préférences filtrées sur la fenêtre académique. */

/* Catégorie de quota d'un pref_type ('conge' historique compté en annuel). */
function categorieConge(prefType) {
  if (prefType === "conge") return "conge_annuel";
  if (prefType === "recherche_clinique") return "recherche_clinique"; // Fellow : compte dans quota trimestriel
  return CONGE_TYPES[prefType] ? prefType : null;
}

/* Année ACADÉMIQUE d'une date (objet Date UTC), identifiée par son année de
   DÉBUT : oct/nov/déc → année en cours ; jan→sep → année précédente.
   Ex. l'académique 2025 = 1 oct 2025 → 30 sep 2026. */
function anneeAcademique(d) {
  return (d.getUTCMonth() >= 9) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
/* Libellé d'affichage d'une année académique : « 2025–2026 ». */
function labelAcad(a) { return a + "–" + (a + 1); }

/* Année académique du MOIS ACTUELLEMENT AFFICHÉ dans le calendrier (et non de la
   date système) : permet au médecin de naviguer vers un mois futur pour demander
   ses congés à l'avance — le compteur bascule alors sur l'année académique visée.
   Repli sur la date du jour tant que le calendrier n'est pas initialisé. */
function anneeAcademiqueAffichee() {
  const ref = (typeof calendrier !== "undefined" && calendrier && typeof calendrier.getDate === "function")
    ? calendrier.getDate() : new Date();
  const m = ref.getMonth();          // mois LOCAL (cohérent avec le reste du calendrier)
  return (m >= 9) ? ref.getFullYear() : ref.getFullYear() - 1;
}

/* Jours ouvrés (lun–ven hors fériés) d'une plage tombant dans l'année ACADÉMIQUE. */
function joursOuvresDansAnnee(debut, fin, anneeAcad) {
  let total = 0;
  const d = new Date(debut + "T00:00:00Z");
  const dFin = new Date(fin + "T00:00:00Z");
  while (d <= dFin) {
    const iso = d.toISOString().slice(0, 10);
    if (anneeAcademique(d) === anneeAcad && estJourOuvre(iso)) total++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return total;
}

/* Fraction de l'année ACADÉMIQUE (1 oct → 30 sep) couverte par le contrat (0 à 1).
   Politique (révision) : on ne proratise QUE si le contrat couvre PARTIELLEMENT
   l'année académique. S'il n'y a pas de dates de contrat OU si le contrat ne
   chevauche PAS du tout l'année affichée (dates absentes/saisies pour une autre
   période), on considère le médecin comme actif → quota PLEIN (fraction 1).
   Cela évite un quota « 0 » trompeur qui bloquerait toute saisie de congé. */
function fractionAnneeSousContrat(anneeAcad, med) {
  const debutAnnee = Date.UTC(anneeAcad, 9, 1);      // 1er octobre (mois index 9)
  const finAnnee = Date.UTC(anneeAcad + 1, 8, 30);   // 30 septembre (mois index 8)
  // Pas de dates de contrat → année pleine.
  if (!med.contract_start && !med.contract_end) return 1;
  let debut = med.contract_start ? Date.parse(med.contract_start + "T00:00:00Z") : debutAnnee;
  let fin = med.contract_end ? Date.parse(med.contract_end + "T00:00:00Z") : finAnnee;
  debut = Math.max(debut, debutAnnee);
  fin = Math.min(fin, finAnnee);
  if (fin < debut) return 1;   // aucun chevauchement → quota plein (et non 0)
  const jours = (fin - debut) / 86400000 + 1;
  const joursAnnee = (finAnnee - debutAnnee) / 86400000 + 1;
  return jours / joursAnnee;
}

/* Quotité (fte) d'un médecin, bornée à ]0;1], défaut 1 (plein temps). Le quota
   de congés d'un mi-temps est proratisé à sa quotité (révision 2026-06-14). */
function fteDe(med) {
  const f = med && typeof med.fte === "number" ? med.fte : parseFloat(med && med.fte);
  return (!isNaN(f) && f > 0) ? Math.min(f, 1) : 1;
}

/* Quota effectif (défaut ou surcharge), proratisé au contrat ET à la quotité (fte),
   pour une année académique. */
function quotaEffectif(type, anneeAcad) {
  if (!medecinCourant) return 0;
  // Quota = base × FTE uniquement (anneeAcad conservé pour compat. d'appel).
  return Math.round(quotaBase(medecinCourant, type) * fteDe(medecinCourant));
}

/* Jours ouvrés déjà encodés pour une catégorie et une année académique. */
function congesUtilises(type, anneeAcad) {
  return prefsCourantes
    .filter((p) => categorieConge(p.pref_type) === type)
    .reduce((s, p) => s + joursOuvresDansAnnee(p.start_date, p.end_date, anneeAcad), 0);
}

/* Années académiques à afficher : l'académique du MOIS AFFICHÉ (qui « repart à
   zéro » au passage du 1er octobre, y compris en naviguant vers un mois futur)
   + toute année académique encore à venir déjà concernée par un congé. Les
   années antérieures au mois affiché ne sont plus listées. */
function anneesAvecConges() {
  const courante = anneeAcademiqueAffichee();
  const annees = new Set([courante]);
  prefsCourantes.forEach((p) => {
    if (categorieConge(p.pref_type)) {
      const a1 = anneeAcademique(new Date(p.start_date + "T00:00:00Z"));
      const a2 = anneeAcademique(new Date(p.end_date + "T00:00:00Z"));
      if (a1 >= courante) annees.add(a1);
      if (a2 >= courante) annees.add(a2);
    }
  });
  return [...annees].sort((a, b) => a - b);
}

/* ----- Désidératas : quota INDICATIF de 20 par trimestre CIVIL (§8–10) ----- */
const QUOTA_DESIDERATAS = 20;
const TRI_LABELS = ["T1 (jan–mars)", "T2 (avr–juin)", "T3 (juil–sept)", "T4 (oct–déc)"];
/* Bornes ISO du trimestre civil (tri = 0..3). */
function bornesTrimestreISO(annee, tri) {
  const p = (n) => String(n).padStart(2, "0");
  const m0 = tri * 3 + 1, m2 = m0 + 2;
  const dernier = new Date(annee, m2, 0).getDate();
  return { debut: annee + "-" + p(m0) + "-01", fin: annee + "-" + p(m2) + "-" + p(dernier) };
}
/* Nombre de désidératas (souhaits) encodés sur le trimestre civil donné
   (compté par préférence dont la date de début tombe dans le bloc). */
function desiderataUtilises(annee, tri) {
  const b = bornesTrimestreISO(annee, tri);
  return prefsCourantes.filter((p) => p.pref_type === "souhait" &&
    p.start_date >= b.debut && p.start_date <= b.fin).length;
}

/* ----- Récup férié : 1 jour compensatoire par férié TRAVAILLÉ (Module 18) -----
   À poser dans les 6 semaines après le férié, validé par l'admin. Pas d'auto-
   crédit : le médecin dépose une demande 'recup_ferie' (workflow de validation). */
const RECUP_FERIE_SEMAINES = 6;
const SHIFTS_TRAVAILLES = ["jour", "garde_nuit", "garde_24h", "twe"];
let mesShifts = []; // shifts du médecin connecté (pour repérer les fériés travaillés)

async function chargerMesShifts() {
  if (!medecinCourant) { mesShifts = []; return; }
  const { data, error } = await sb.from("shifts")
    .select("date, shift_type").eq("doctor_id", medecinCourant.id);
  mesShifts = error ? [] : (data || []);
}
/* Jours fériés belges effectivement TRAVAILLÉS (garde/tour/journée) → 1 droit chacun. */
function feriesTravailles() {
  const vus = new Set(); const out = [];
  mesShifts.forEach((s) => {
    if (SHIFTS_TRAVAILLES.indexOf(s.shift_type) === -1 || vus.has(s.date)) return;
    let ferie = false;
    try { ferie = joursFeriesBE(parseInt(s.date.slice(0, 4), 10)).has(s.date); } catch (e) {}
    if (ferie) { vus.add(s.date); out.push(s.date); }
  });
  return out.sort();
}
/* Date limite ISO (férié + 6 semaines) pour poser la récup. */
function echeanceRecup(ferieISO) {
  const d = new Date(ferieISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + RECUP_FERIE_SEMAINES * 7);
  return d.toISOString().slice(0, 10);
}
/* Récup fériés déjà déposées (en attente ou approuvées). */
function recupFeriesPosees() {
  return prefsCourantes.filter((p) => p.pref_type === "recup_ferie").length;
}
/* Ligne d'affichage des droits à récup férié (vide si aucun férié travaillé). */
function ligneRecupFerie() {
  const fer = feriesTravailles();
  if (!fer.length) return "";
  const detail = fer.map((f) => f + " → avant le " + echeanceRecup(f)).join(" · ");
  return "<br><strong>Récup fériés</strong> : " + recupFeriesPosees() + "/" + fer.length +
    " posée(s) · férié(s) travaillé(s) : " + detail +
    " <em>(1 jour/férié, à poser sous " + RECUP_FERIE_SEMAINES + " sem., validation admin)</em>";
}

/* Affiche les compteurs « X / Y jours ouvrés » par catégorie et par année académique. */
function majCompteurConges() {
  if (!congesCompteur || !medecinCourant) return;
  // PG / Fellow : quota par trimestre CIVIL (pas par année académique).
  if (medecinCourant.grade === "pg") {
    const limPG = (medecinCourant.pg_type === "fellow") ? PG_CONGE_TRIM_FELLOW : PG_CONGE_TRIM_ULB;
    const refDate = (typeof calendrier !== "undefined" && calendrier && calendrier.getDate)
      ? calendrier.getDate().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const tri = pgTrimBornes(refDate);
    // Jours de congé déjà posés dans ce trimestre
    let dejaPG = 0;
    (prefsCourantes || []).forEach((p) => {
      if (!categorieConge(p.pref_type)) return;
      const d1 = p.start_date > tri.start ? p.start_date : tri.start;
      const d2 = p.end_date   < tri.end   ? p.end_date   : tri.end;
      dejaPG += pgJoursOuvres(d1, d2);
    });
    const restePG = Math.max(0, limPG - dejaPG);
    const trimLabel = tri.key.replace("-Q", " T").replace("T0","T1").replace("T1","T1").replace("T2","T2").replace("T3","T3"); // "2025-Q2" → lisible
    // Label trimestre lisible
    const qNum = parseInt(tri.key.slice(-1)) + 1; // Q0→T1 … Q3→T4
    const triLisible = "T" + qNum + " " + tri.key.slice(0, 4);
    const alertePG = dejaPG >= limPG ? " <strong>⚠️ quota atteint</strong>" : "";
    congesCompteur.innerHTML =
      "<strong>Congés " + triLisible + "</strong> : " +
      dejaPG + "/" + limPG + " j ouvrés utilisés · " + restePG + " j restants" + alertePG +
      "<br><em>Quota par trimestre civil · jours ouvrés lun–ven hors fériés</em>";
    congesCompteur.classList.remove("hidden");
    return;
  }
  const lignes = anneesAvecConges().map((annee) => {
    const parts = Object.keys(CONGE_TYPES).map((type) => {
      return CONGE_TYPES[type].label + " " +
             congesUtilises(type, annee) + "/" + quotaEffectif(type, annee);
    });
    return "<strong>" + labelAcad(annee) + "</strong> — " + parts.join(" · ");
  });
  // Désidératas (souhaits) : quota INDICATIF de 20 par trimestre civil du mois affiché.
  const refDes = (typeof calendrier !== "undefined" && calendrier && calendrier.getDate)
    ? calendrier.getDate() : new Date();
  const triAnnee = refDes.getFullYear();
  const tri = Math.floor(refDes.getMonth() / 3);
  const nDes = desiderataUtilises(triAnnee, tri);
  const alerteDes = nDes > QUOTA_DESIDERATAS ? " <strong>⚠️ au-delà du quota indicatif</strong>" : "";
  congesCompteur.innerHTML =
    lignes.join("<br>") +
    "<br><em>en jours ouvrés (lun–ven hors fériés) · année académique 1 oct → 30 sep</em>" +
    "<br><strong>Désidératas</strong> " + TRI_LABELS[tri] + " " + triAnnee + " : " +
    nDes + "/" + QUOTA_DESIDERATAS + alerteDes +
    " <em>(souhaits ; quota indicatif, non bloquant)</em>" +
    ligneRecupFerie();
  congesCompteur.classList.remove("hidden");
}

/* Construit les lignes du tableau de préférences */
function rendrePreferences(prefs) {
  prefsTbody.innerHTML = "";

  // Les gardes PG (type garde_pg) sont affichées séparément dans « Mes gardes ».
  prefs = (prefs || []).filter((p) => p.pref_type !== "garde_pg");
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
    // Statut de validation (Module 10).
    const st = pref.status || "approuve";
    const stLib = { en_attente: "⏳ en attente", approuve: "✅ approuvé", refuse: "✖ refusé" };
    const stBadge = document.createElement("span");
    stBadge.className = "statut-demande statut-" + st;
    stBadge.textContent = " " + (stLib[st] || st);
    tdType.appendChild(stBadge);
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

  // Bouton « Supprimer mes demandes refusées » : visible s'il y en a.
  const btnRef = document.getElementById("suppr-mes-refusees-btn");
  if (btnRef) {
    const nbRef = prefs.filter((p) => (p.status || "") === "refuse").length;
    btnRef.classList.toggle("hidden", nbRef === 0);
  }
}

/* Demandeur : supprime d'un coup toutes ses propres demandes refusées. */
async function supprimerMesRefusees() {
  if (!medecinCourant) return;
  const refusees = (prefsCourantes || []).filter((p) => (p.status || "") === "refuse");
  if (!refusees.length) return;
  if (!window.confirm("Supprimer toutes vos demandes refusées (" + refusees.length + ") ?")) return;
  const ids = refusees.map((p) => p.id);
  const { error } = await sb.from("preferences").delete().in("id", ids);
  if (error) { window.alert("Suppression impossible : " + error.message); return; }
  chargerPreferences();
}
const supprMesRefuseesBtn = document.getElementById("suppr-mes-refusees-btn");
if (supprMesRefuseesBtn) supprMesRefuseesBtn.addEventListener("click", supprimerMesRefusees);

/* Quota de congé PG par TRIMESTRE CIVIL (jours ouvrés). PG ULB : 10 ; Fellow : 20
   (plus large, rôle recherche). La LIMITE n'est jamais montrée au PG. */
const PG_CONGE_TRIM_ULB = 10;
const PG_CONGE_TRIM_FELLOW = 20;
/* Jours ouvrés (lun–ven hors fériés BE) entre deux dates ISO incluses. */
function pgJoursOuvres(d1, d2) {
  if (!d1 || !d2 || d1 > d2) return 0;
  const feries = {}; let n = 0; let d = d1;
  while (d <= d2) {
    const dt = new Date(d + "T00:00:00Z"); const jr = dt.getUTCDay();
    if (jr >= 1 && jr <= 5) { const an = dt.getUTCFullYear(); if (!feries[an]) { try { feries[an] = joursFeriesBE(an); } catch (e) { feries[an] = new Set(); } } if (!feries[an].has(d)) n++; }
    const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10);
  }
  return n;
}
/* Bornes du trimestre CIVIL contenant une date ISO. */
function pgTrimBornes(iso) {
  const d = new Date(iso + "T00:00:00Z"); const y = d.getUTCFullYear(); const q = Math.floor(d.getUTCMonth() / 3);
  const start = y + "-" + String(q * 3 + 1).padStart(2, "0") + "-01";
  const end = new Date(Date.UTC(y, q * 3 + 3, 0)).toISOString().slice(0, 10);
  return { key: y + "-Q" + q, start, end };
}

/* Valide + insère une préférence pour le médecin connecté. Fonction PURE de DOM :
   renvoie { ok, message, level }. Réutilisée par le formulaire « Mes préférences »
   ET par le popup de désidérata depuis le calendrier. */
async function soumettrePreference(type, debut, fin, note, dateComp) {
  if (!medecinCourant) return { ok: false, message: "Profil médecin introuvable.", level: "error" };
  if (!debut || !fin) return { ok: false, message: "Dates manquantes.", level: "error" };
  if (fin < debut) return { ok: false, message: "La date de fin doit être postérieure ou égale à la date de début.", level: "error" };
  // Pas de demande pendant un congrès (jours gérés par l'admin + l'algo).
  if (await plagePendantCongres(debut, fin)) {
    return { ok: false, level: "error", message: "Période de congrès : les jours sont gérés par l'administrateur, aucune demande n'est possible sur ces dates." };
  }

  // Contrôle des quotas de congés (bloquant).
  const categorie = categorieConge(type);
  // PG / Fellow : limite par TRIMESTRE CIVIL, jamais révélée (message générique).
  if (categorie && medecinCourant.grade === "pg") {
    const limite = (medecinCourant.pg_type === "fellow") ? PG_CONGE_TRIM_FELLOW : PG_CONGE_TRIM_ULB;
    const trims = {};
    [debut, fin].forEach((iso) => { const t = pgTrimBornes(iso); trims[t.key] = t; });
    for (const k of Object.keys(trims)) {
      const t = trims[k];
      const demande = pgJoursOuvres(debut > t.start ? debut : t.start, fin < t.end ? fin : t.end);
      if (demande <= 0) continue;
      let deja = 0;
      (prefsCourantes || []).forEach((p) => {
        if (!categorieConge(p.pref_type)) return;
        deja += pgJoursOuvres(p.start_date > t.start ? p.start_date : t.start, p.end_date < t.end ? p.end_date : t.end);
      });
      if (deja + demande > limite) {
        return { ok: false, level: "error", message: "Limite de congé atteinte pour ce trimestre. Contacte l'administrateur si besoin." };
      }
    }
  }
  if (categorie && medecinCourant.grade !== "pg") {
    const anneeDebut = anneeAcademique(new Date(debut + "T00:00:00Z"));
    const anneeFin = anneeAcademique(new Date(fin + "T00:00:00Z"));
    for (let annee = anneeDebut; annee <= anneeFin; annee++) {
      const demande = joursOuvresDansAnnee(debut, fin, annee);
      if (demande === 0) continue;
      const dejaPris = congesUtilises(categorie, annee);
      const quota = quotaEffectif(categorie, annee);
      if (dejaPris + demande > quota) {
        return { ok: false, level: "error", message:
          CONGE_TYPES[categorie].label + " " + labelAcad(annee) + " : quota dépassé (" +
          (dejaPris + demande) + " j ouvrés demandés pour un maximum de " + quota +
          " j ; déjà " + dejaPris + " j encodés)." };
      }
    }
  }

  // Désidératas : avertissement INDICATIF si > 20 souhaits sur le trimestre (non bloquant).
  let avert = "";
  if (type === "souhait") {
    const dd = new Date(debut + "T00:00:00Z");
    const dejaDes = desiderataUtilises(dd.getUTCFullYear(), Math.floor(dd.getUTCMonth() / 3));
    if (dejaDes + 1 > QUOTA_DESIDERATAS) {
      avert += " ⚠️ " + (dejaDes + 1) + " désidératas ce trimestre (quota indicatif : " + QUOTA_DESIDERATAS + ").";
    }
  }

  // Travailler un férié (M26) : la date demandée DOIT être un jour férié ; le jour
  // de récup (date_compensation) est OBLIGATOIRE et idéalement sous 6 semaines
  // (alerte non bloquante hors fenêtre — l'admin tranche).
  if (type === "travailler_ferie") {
    let estFerie = false;
    try { estFerie = joursFeriesBE(parseInt(debut.slice(0, 4), 10)).has(debut); } catch (e) {}
    if (!estFerie) {
      return { ok: false, level: "error", message: "La date demandée n'est pas un jour férié. Choisis un férié (ou demande à l'admin de l'ajouter)." };
    }
    if (!dateComp) {
      return { ok: false, level: "error", message: "Choisis ton jour de récup (congé férié) dans le même formulaire." };
    }
    if (dateComp <= debut) {
      return { ok: false, level: "error", message: "Le jour de récup doit être postérieur au férié travaillé." };
    }
    if (dateComp > echeanceRecup(debut)) {
      avert += " ⚠️ jour de récup au-delà des 6 semaines suivant le férié.";
    }
  }

  const payload = {
    doctor_id: medecinCourant.id,
    pref_type: type,
    start_date: debut,
    end_date: fin,
    note: (note || "").trim() || null,
    status: "en_attente", // soumise pour validation par l'admin (§8.3)
  };
  if (type === "travailler_ferie") payload.date_compensation = dateComp; // M26 : jour de récup choisi
  const { error } = await sb.from("preferences").insert(payload);
  if (error) {
    console.error("Erreur ajout préférence :", error);
    const msg = (error.code === "42501" || /policy/i.test(error.message))
      ? "Action refusée par les règles de sécurité (RLS)."
      : "Erreur : " + error.message;
    return { ok: false, message: msg, level: "error" };
  }
  return { ok: true, level: "info", message: "Préférence enregistrée." + avert };
}

/* M26 — affiche le champ « jour de récup » uniquement pour « Travailler un férié »,
   et cale la date « Au » sur la date « Du » (un férié = une seule journée). */
function majChampFerie() {
  const wrap = document.getElementById("p-comp-wrap");
  const estFerie = pType && pType.value === "travailler_ferie";
  if (wrap) wrap.classList.toggle("hidden", !estFerie);
  if (estFerie && pStart && pEnd && pStart.value) pEnd.value = pStart.value;
}
if (pType) pType.addEventListener("change", majChampFerie);
if (pStart) pStart.addEventListener("change", () => { if (pType && pType.value === "travailler_ferie" && pEnd) pEnd.value = pStart.value; });

/* Ajoute une préférence pour le médecin connecté (formulaire « Mes préférences »). */
prefForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageFormPref("");
  const r = await soumettrePreference(pType.value, pStart.value, pEnd.value, pNote.value, pComp ? pComp.value : null);
  if (!r.ok) { messageFormPref(r.message, "error"); return; }
  prefForm.reset();
  messageFormPref(r.message, "info");
  chargerPreferences();
});

/* ----- Popup « désidérata depuis le calendrier » (Module : sélection dates) ----- */
/* Vrai si la plage [debut, fin] touche un mois au planning PUBLIÉ (non modifiable). */
async function plagePubliee(debut, fin) {
  const d0 = new Date(debut + "T00:00:00Z");
  const d1 = new Date(fin + "T00:00:00Z");
  const pairs = [];
  let y = d0.getUTCFullYear(), m = d0.getUTCMonth() + 1;
  const ey = d1.getUTCFullYear(), em = d1.getUTCMonth() + 1;
  while (y < ey || (y === ey && m <= em)) { pairs.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
  const annees = [...new Set(pairs.map((p) => p[0]))];
  const moiss = [...new Set(pairs.map((p) => p[1]))];
  const { data } = await sb.from("schedules").select("year, month, status").in("year", annees).in("month", moiss);
  return (data || []).some((s) => s.status === "published" && pairs.some((p) => p[0] === s.year && p[1] === s.month));
}

/* Vrai si la plage [debut, fin] chevauche un CONGRÈS (M17) : pendant un congrès,
   les jours sont gérés par l'admin + l'algo → pas de demande de congé possible. */
async function plagePendantCongres(debut, fin) {
  const { data } = await sb.from("special_periods")
    .select("start_date, end_date, type").eq("type", "congres")
    .lte("start_date", fin).gte("end_date", debut);
  return !!(data && data.length);
}

/* Ouvre le popup pré-rempli avec la plage sélectionnée. */
function ouvrirPopupDesiderata(debut, fin) {
  if (!desModal) return;
  desType.innerHTML = pType.innerHTML;     // mêmes types que le formulaire (filtrés par grade)
  desType.value = (medecinCourant && medecinCourant.grade === "pg") ? "recuperation" : "souhait";
  desNote.value = "";
  // Fenêtre de jours pré-remplie (jour choisi), DATES MODIFIABLES par le médecin.
  desDebut.value = debut;
  desFin.value = fin || debut;
  desMsg.textContent = ""; desMsg.className = "message";
  desModal.classList.remove("hidden");
}
if (desAnnulerBtn) desAnnulerBtn.addEventListener("click", () => desModal.classList.add("hidden"));
if (desModal) desModal.addEventListener("click", (e) => { if (e.target === desModal) desModal.classList.add("hidden"); });
if (desOkBtn) desOkBtn.addEventListener("click", async () => {
  const debut = desDebut.value, fin = desFin.value;
  if (!debut || !fin) { desMsg.textContent = "Choisis une date de début et de fin."; desMsg.className = "message error"; return; }
  // Re-vérifie le blocage « dates publiées » (la fenêtre a pu être modifiée).
  if (await plagePubliee(debut, fin)) {
    desMsg.textContent = "Ces dates touchent un planning déjà publié — demande impossible.";
    desMsg.className = "message error";
    return;
  }
  const r = await soumettrePreference(desType.value, debut, fin, desNote.value);
  desMsg.textContent = r.message; desMsg.className = "message " + r.level;
  if (r.ok) {
    desModal.classList.add("hidden");
    if (calendrier) calendrier.refetchEvents();
    chargerPreferences();
  }
});

/* ----- ADMIN : forcer un congé / une absence (absence APPROUVÉE imposée) ----- */
async function ouvrirPopupForceConge() {
  if (!medecinCourant || medecinCourant.role !== "admin") return;
  // Médecins (hors admin).
  const { data: meds } = await sb.from("doctors").select("id, name")
    .neq("role", "admin").order("name", { ascending: true });
  fcMedecin.innerHTML = (meds || []).map((m) =>
    "<option value='" + escapeHtml(m.id) + "'>" + escapeHtml(m.name || m.id) + "</option>").join("");
  // Liste COMPLÈTE côté admin : inclut Formation USI et Congé autre/maladie
  // (que les travailleurs ne peuvent plus demander eux-mêmes).
  fcType.innerHTML =
    "<option value='conge_annuel'>Congé annuel</option>" +
    "<option value='conge_extralegal'>Congés extra-légaux</option>" +
    "<option value='conge_scientifique'>Congé scientifique</option>" +
    "<option value='conge_maladie'>Congé maladie (admin — hors quota)</option>" +
    "<option value='formation'>Formation USI</option>" +
    "<option value='autre'>Congé autre — mariage / circonstances (hors quota)</option>" +
    "<option value='dispo'>✅ Disponible (désidérata indépendant)</option>" +
    "<option value='indispo'>Indisponibilité (garde)</option>" +
    "<option value='souhait'>Souhait (préférence non bloquante)</option>";
  fcType.value = "conge_annuel";
  fcNote.value = "";
  fcDebut.value = ""; fcFin.value = "";
  fcMsg.textContent = ""; fcMsg.className = "message";
  fcModal.classList.remove("hidden");
}
if (forcerCongeBtn) forcerCongeBtn.addEventListener("click", ouvrirPopupForceConge);
if (fcAnnulerBtn) fcAnnulerBtn.addEventListener("click", () => fcModal.classList.add("hidden"));
if (fcModal) fcModal.addEventListener("click", (e) => { if (e.target === fcModal) fcModal.classList.add("hidden"); });
if (fcOkBtn) fcOkBtn.addEventListener("click", async () => {
  if (!medecinCourant || medecinCourant.role !== "admin") return;
  const debut = fcDebut.value, fin = fcFin.value;
  if (!fcMedecin.value) { fcMsg.textContent = "Choisis un médecin."; fcMsg.className = "message error"; return; }
  if (!debut || !fin) { fcMsg.textContent = "Choisis les dates."; fcMsg.className = "message error"; return; }
  if (fin < debut) { fcMsg.textContent = "La date de fin doit être ≥ la date de début."; fcMsg.className = "message error"; return; }
  // Insertion APPROUVÉE directe (l'admin force ; il peut dépasser les quotas).
  const { error } = await sb.from("preferences").insert({
    doctor_id: fcMedecin.value,
    pref_type: fcType.value,
    start_date: debut,
    end_date: fin,
    note: fcNote.value.trim() || null,
    status: "approuve",
    decided_at: new Date().toISOString(),
  });
  if (error) {
    fcMsg.textContent = "Erreur : " + error.message; fcMsg.className = "message error";
    return;
  }
  fcModal.classList.add("hidden");
  if (calendrier) calendrier.refetchEvents();
  rafraichirPanneauAdmin();
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
  // Shifts PG (postgradués) — générés par genererTrimestrePG (Module 28).
  pg_jour:    { label: "PG – Journée",      court: "PG",   couleur: "#0891b2", debut: "08:45", fin: "17:15", lendemain: false, heures: 8.5 },
  pg_twe:     { label: "PG – Tour WE",      court: "PG-WE",couleur: "#0e7490", debut: "08:00", fin: "14:00", lendemain: false, heures: 6 },
  garde_pg:   { label: "Garde PG (soir)",   court: "GPG",  couleur: "#b45309", debut: "17:15", fin: "08:00", lendemain: true,  heures: 15.5 }, // journée USI (pg_jour 8,5 h) + garde 15,5 h = 24 h
  // Absences / repos posables par l'admin (0 h, sans station, affichées en
  // pastille « journée entière »). Les congés posés ici ne décomptent pas les
  // quotas (ceux-ci restent gérés via les préférences du médecin).
  // 'repos_garde' = repos obligatoire post-garde (auto, NON comptabilisé) ;
  // 'recup' = repos / récupération posé manuellement (COMPTABILISÉ).
  repos_garde:        { label: "Repos de garde",      court: "Repos g.", couleur: "#6e5494", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  recup:              { label: "Récupération",        court: "Récup", couleur: "#0891b2", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  off:                { label: "Off-clinique",        court: "Off",   couleur: "#9a6700", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  conge_annuel:       { label: "Congé annuel",        court: "Congé", couleur: "#1a7f37", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  conge_scientifique: { label: "Congé scientifique",  court: "Sci.",  couleur: "#0b6b63", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  conge_extralegal:   { label: "Congés extra-légaux", court: "E.L.",  couleur: "#0f5132", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
  conge_ferie:        { label: "Congé férié (récup)", court: "Récup F.", couleur: "#0891b2", debut: "00:00", fin: "00:00", lendemain: false, heures: 0, absence: true },
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
  formation:          "rgba(13,148,136,0.16)",   // sarcelle clair
  autre:              "rgba(110,84,148,0.16)",   // mauve
  demande_weekend:    "rgba(31,111,235,0.12)",   // bleu clair
  recup_ferie:        "rgba(8,145,178,0.18)",     // cyan (cf. récup)
  conge_maladie:      "rgba(220,38,38,0.14)",      // rouge (maladie)
  travailler_ferie:   "rgba(207,34,46,0.14)",     // rouge clair (jour de garde férié)
  conge_ferie:        "rgba(8,145,178,0.18)",     // cyan (jour de récup)
};

/* Libellés complets des types de préférence (inclut off_clinic / recuperation). */
const PREF_LABELS_FULL = {
  conge: "Congé",
  conge_annuel: "Congé annuel",
  conge_extralegal: "Congés extra-légaux",
  conge_scientifique: "Congé scientifique",
  indispo: "Indisponibilité (garde)",
  souhait: "Souhait (garde)",
  off_clinic: "Off/clinic",
  recuperation: "Récupération",
  formation: "Formation USI",
  autre: "Congé autre (hors quota)",
  conge_maladie: "Congé maladie (admin only, hors quota)",
  demande_weekend: "Demande week-end/férié",
  recup_ferie: "Récup férié (jour compensatoire)",
  travailler_ferie: "Travailler un férié (placement prioritaire)",
  conge_ferie: "Congé férié (jour de récup)",
  recherche_clinique: "Jour de recherche clinique (Fellow — bloquant, dans quota trimestriel)",
  dispo: "✅ Disponible — souhaite travailler ce jour (indépendant, prioritaire)",
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
  const { data, error } = await sb.from("doctors")
    .select("id, name, grade, role, contract_start, contract_end, contract_periods, reconnu, jours_travailles");
  if (error) {
    console.error("Erreur chargement médecins (calendrier) :", error);
    return;
  }
  carteMedecins = {};
  (data || []).forEach((m) => { carteMedecins[m.id] = m; });
  rbChargerMedecins();
}

/* Ordre d'affichage des événements dans une case du calendrier mois/liste :
   USI 1→5, Bordet, Labo de choc (par station), puis gardes / tour, puis les
   repos (repos de garde, récup, off), les congés, et enfin la synthèse
   « Non planifiés ». Plus le rang est petit, plus l'événement est HAUT. */
const CAL_RANG_STATION = { usi1: 1, usi2: 2, usi3: 3, usi4: 4, usi5: 5, bordet: 6, labo_choc: 7 };
function rangEvenementCal(shiftType, poste) {
  if (poste && CAL_RANG_STATION[poste] && (shiftType === "jour" || shiftType === "garde_24h"))
    return CAL_RANG_STATION[poste];
  switch (shiftType) {
    case "garde_nuit":        return 8;
    case "garde_24h":         return 9;   // garde 24 h sans station (week-end)
    case "twe":               return 10;
    case "pg_jour":          return 15;
    case "pg_twe":           return 16;
    case "garde_pg":         return 17;
    case "repos_garde":       return 11;
    case "recup":             return 12;
    case "off":               return 13;
    case "conge_annuel": case "conge_extralegal": case "conge_scientifique": case "conge": return 14;
    default:                  return 50;
  }
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
    .select("id, date, shift_type, doctor_id, schedule_id, poste, epingle")
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
        doctorId: s.doctor_id, poste: s.poste || null, dateStr: s.date, epingle: s.epingle,
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
          extendedProps: Object.assign({ tooltip: nom + " - " + cfg.label, ordre: rangEvenementCal(s.shift_type, s.poste) }, propsBase),
        });
        return;
      }

      // Cas particulier : garde 24h de SEMAINE qui occupe une station.
      // On l'affiche sur DEUX lignes — une pour la station occupée le jour,
      // une pour la garde 24h — pour plus de clarté. Les deux pointent vers
      // le même shift (clic d'édition → même formulaire).
      if (s.shift_type === "garde_24h" && s.poste) {
        const jour = SHIFT_CONFIG.jour;
        const rgSt = rangEvenementCal("jour", s.poste);
        events.push({
          title: nom + " · " + station,
          start: s.date, allDay: true,
          backgroundColor: jour.couleur,
          borderColor: estMien ? "#1f2328" : jour.couleur,
          classNames: cls,
          extendedProps: Object.assign({ tooltip: nom + " · " + station + " (garde 24h)", ordre: rgSt }, propsBase),
        });
        events.push({
          title: nom + " · " + cfg.court,
          start: s.date, allDay: true,
          backgroundColor: cfg.couleur,
          borderColor: estMien ? "#1f2328" : cfg.couleur,
          classNames: cls,
          extendedProps: Object.assign({ tooltip: nom + " - " + cfg.label, ordre: rgSt + 0.5 }, propsBase),
        });
        return;
      }

      // Cas général : un seul événement « journée entière » (l'heure n'est pas
      // utile en vue mois/liste ; l'ordre des cases est piloté par `ordre`).
      const suffixe = station ? " · " + station : "";
      events.push({
        title: nom + " - " + cfg.court + suffixe,
        start: s.date, allDay: true,
        backgroundColor: cfg.couleur,
        borderColor: estMien ? "#1f2328" : cfg.couleur,
        classNames: cls,
        extendedProps: Object.assign({ tooltip: nom + " - " + cfg.label + suffixe, ordre: rangEvenementCal(s.shift_type, s.poste) }, propsBase),
      });
    });
  }

  // --- 2) Préférences en arrière-plan ---
  // Admin : toutes (RLS). Médecin : seulement les siennes (RLS).
  // On prend toute préférence qui chevauche la période affichée.
  const { data: prefs, error: errPrefs } = await sb
    .from("preferences")
    .select("id, doctor_id, start_date, end_date, pref_type, note, status")
    .neq("status", "refuse") // on n'affiche pas les demandes refusées
    .lte("start_date", fin)
    .gte("end_date", debut);

  if (errPrefs) {
    console.error("Erreur chargement préférences (calendrier) :", errPrefs);
  } else {
    // Types d'absence dont l'APPROBATION mérite une vraie pastille nominative
    // (révision : les congés acceptés doivent être VISIBLES — admin : tous ;
    // médecin : les siens, via la RLS).
    const PREF_PASTILLE = {
      conge: "🏖", conge_annuel: "🏖", conge_extralegal: "🏖", conge_scientifique: "🔬",
      formation: "🎓", autre: "🏖", recuperation: "🛌", recup_ferie: "🛌", conge_maladie: "🤒",
      conge_ferie: "🛌",
    };
    (prefs || []).forEach((p) => {
      const med = carteMedecins[p.doctor_id] || {};
      const libelle = PREF_LABELS_FULL[p.pref_type] || p.pref_type;
      if (p.status === "approuve" && PREF_PASTILLE[p.pref_type]) {
        // Congé/absence ACCEPTÉ → événement nominatif bien visible.
        const cfg = SHIFT_CONFIG[p.pref_type];
        events.push({
          start: p.start_date,
          end: lendemainDe(p.end_date),
          allDay: true,
          title: PREF_PASTILLE[p.pref_type] + " " + (med.name || "?") + " · " + libelle,
          backgroundColor: (cfg && cfg.couleur) || "#1a7f37",
          borderColor: (cfg && cfg.couleur) || "#1a7f37",
          extendedProps: {
            tooltip: (med.name || "?") + " — " + libelle + " ACCEPTÉ du " + p.start_date +
                     " au " + p.end_date + (p.note ? " (" + p.note + ")" : ""),
            ordre: 14,
          },
        });
        return;
      }
      // Autres préférences (ou demandes en attente) : fond discret, comme avant.
      events.push({
        start: p.start_date,
        end: lendemainDe(p.end_date), // fin exclusive -> +1 jour pour inclure end_date
        display: "background",
        backgroundColor: PREF_BG[p.pref_type] || "rgba(0,0,0,0.06)",
        extendedProps: {
          tooltip: (med.name ? med.name + " - " : "") + libelle +
                   (p.status === "en_attente" ? " (en attente)" : "") +
                   (p.note ? " (" + p.note + ")" : ""),
        },
      });
    });
  }

  // --- 3) Congrès & fermetures d'unités en arrière-plan (Module 17) ---
  // Visibles par TOUS (lecture RLS ouverte). Silencieux si la table n'existe
  // pas encore (module17 SQL non lancé).
  const { data: periodesCal, error: errPer } = await sb
    .from("special_periods")
    .select("type, label, unite, start_date, end_date")
    .lte("start_date", fin)
    .gte("end_date", debut);
  if (errPer) {
    console.warn("Périodes spéciales non affichées :", errPer.message);
  } else {
    (periodesCal || []).forEach((p) => {
      const estCongres = p.type === "congres";
      const lib = estCongres
        ? "Congrès : " + p.label
        : "Unité fermée : " + (POSTE_LABELS[p.unite] || p.unite) + " (" + p.label + ")";
      events.push({
        start: p.start_date,
        end: lendemainDe(p.end_date),
        display: "background",
        backgroundColor: estCongres ? "rgba(255,153,0,0.20)" : "rgba(110,110,110,0.25)",
        extendedProps: { tooltip: lib },
      });
    });
  }

  // --- 4) Synthèse « au repos / non planifiés » par jour (ADMIN) ---
  // Une seule pastille compacte par jour : « 🛌 N au repos » (noms en infobulle).
  // Médecins actifs sans aucun shift ce jour et non en congé (shift OU congé
  // approuvé). Réservé à l'admin pour ne pas surcharger la vue d'un médecin.
  if (medecinCourant && medecinCourant.role === "admin") {
    const idsTous = Object.keys(carteMedecins);
    const aShiftJ = {}, congeJ = {};
    (shifts || []).forEach((s) => {
      (aShiftJ[s.date] = aShiftJ[s.date] || new Set()).add(s.doctor_id);
      if (GRILLE_CONGES.includes(s.shift_type))
        (congeJ[s.date] = congeJ[s.date] || new Set()).add(s.doctor_id);
    });
    // Itération de dates SÛRE en UTC (setUTCDate avance toujours d'un jour) —
    // ne PAS utiliser lendemainDe ici (parse en heure locale → peut ne pas
    // avancer en fuseau UTC+, ce qui provoquerait une boucle infinie).
    const isoUTC = (dt) => dt.toISOString().slice(0, 10);
    (prefs || []).forEach((p) => {
      if (!GRILLE_CONGES.includes(p.pref_type)) return;
      if (p.status && p.status !== "approuve") return;
      const cur = new Date(p.start_date + "T00:00:00Z");
      const stop = new Date(p.end_date + "T00:00:00Z");
      while (cur <= stop) {
        (congeJ[isoUTC(cur)] = congeJ[isoUTC(cur)] || new Set()).add(p.doctor_id);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    });
    const cur = new Date(debut + "T00:00:00Z");
    const stop = new Date(fin + "T00:00:00Z");
    while (cur < stop) {
      const d = isoUTC(cur);
      cur.setUTCDate(cur.getUTCDate() + 1); // avance AVANT tout continue
      // Pas de « repos » affiché les week-ends / fériés (tout le monde est off,
      // l'info n'a pas de sens ce jour-là).
      if (estWeekendOuFerieISO(d)) continue;
      const aS = aShiftJ[d] || new Set();
      const cg = congeJ[d] || new Set();
      const repos = idsTous.filter((id) => {
        const m = carteMedecins[id];
        return m && m.role !== "admin" && medActifISO(m, d) && jourTravaillableISO(m, d) &&
          !aS.has(id) && !cg.has(id); // hors contrat / admin / jour non travaillable exclus
      });
      if (!repos.length) continue;
      const noms = repos.map((id) => (carteMedecins[id] && carteMedecins[id].name) || "?")
        .sort((a, b) => a.localeCompare(b));
      events.push({
        start: d, allDay: true,
        title: "🛌 " + repos.length + " au repos",
        backgroundColor: "#eaecef", borderColor: "#d0d7de", textColor: "#57606a",
        classNames: ["shift-repos-synthese"],
        extendedProps: { tooltip: "Au repos (non planifiés) : " + noms.join(", "), ordre: 99 },
      });
    }
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
      // Sélection d'une plage de dates (clic-glissé) par un MÉDECIN pour encoder
      // un désidérata directement depuis le calendrier (cf. select ci-dessous).
      selectable: true,
      selectMirror: true,
      // Ordre des événements dans chaque case (mois) et chaque jour (liste) :
      // stations USI 1→Labo, gardes/tour, repos, congés, puis « Non planifiés ».
      eventOrder: function (a, b) {
        const ra = (a.extendedProps && a.extendedProps.ordre != null) ? a.extendedProps.ordre : 50;
        const rb = (b.extendedProps && b.extendedProps.ordre != null) ? b.extendedProps.ordre : 50;
        return ra - rb;
      },
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth",
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
          majCompteurCongres(); // compteur CONGRÈS séparé, sous le calendrier (nav + régénération)
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
          shift_type: p.shiftType, doctor_id: p.doctorId, poste: p.poste, epingle: p.epingle,
        });
      },
      // Sélection d'une plage de dates par un MÉDECIN → pré-remplit le formulaire
      // de préférence (onglet « Mes préférences ») : il choisit le type
      // (souhait, congé, indispo…) puis valide. La validation/quota existante
      // s'applique telle quelle. (Admin : sélection ignorée — il gère le planning.)
      select: async (info) => {
        if (calendrier) calendrier.unselect();
        if (!medecinCourant || medecinCourant.role === "admin") return; // l'admin gère le planning
        const debut = info.startStr.slice(0, 10);
        const dEnd = new Date(info.endStr.slice(0, 10) + "T00:00:00Z");
        dEnd.setUTCDate(dEnd.getUTCDate() - 1); // fin FullCalendar EXCLUSIVE → inclusive
        const fin = dEnd.toISOString().slice(0, 10);
        // Désidératas seulement sur des dates NON PUBLIÉES.
        if (await plagePubliee(debut, fin)) {
          window.alert("Ces dates font partie d'un planning déjà publié — les demandes ne sont plus possibles ici.");
          return;
        }
        // Pas de demande pendant un congrès (géré par l'admin).
        if (await plagePendantCongres(debut, fin)) {
          window.alert("Période de congrès : les jours sont gérés par l'administrateur, aucune demande n'est possible.");
          return;
        }
        ouvrirPopupDesiderata(debut, fin);
      },
      // À chaque changement de mois/vue : rafraîchit le panneau admin et le
      // compteur de congés (qui suit l'année académique du mois affiché).
      datesSet: () => {
        if (medecinCourant && medecinCourant.role === "admin") {
          rafraichirPanneauAdmin(); // rafraîchit aussi la grille si elle est visible
          if (typeof chargerCompteursConges === "function") chargerCompteursConges(); // compteur congés admin suit le mois affiché
        } else if (vueActive === "grille") {
          construireGrille();
        }
        majCompteurConges(); // le compteur suit le mois affiché (demande de congés à l'avance)
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

  // Garde-fou §8.3 : aucune demande en attente sur le mois.
  const nbAttente = await demandesEnAttenteSur(debutMois, finMois);
  if (nbAttente > 0) {
    genererBtn.disabled = false;
    return messageGeneration(
      nbAttente + " demande(s) en attente sur ce mois. Valide-les (Approuver/Refuser) avant de générer.", "error");
  }

  messageGeneration("Génération de " + mois + "/" + annee + " en cours…", "info");

  // 1) Médecins planifiables (l'admin / chef de service n'est pas dans le planning).
  const { data: medecins, error: e1 } = await sb
    .from("doctors")
    .select("id, name, grade, fte, contract_start, contract_end, weekly_hours_target, jours_travailles, statut, contract_periods, admin_level, unite_reference, nouvel_engage, cap_fromager")
    .neq("role", "admin");
  if (e1) { genererBtn.disabled = false; return messageGeneration("Erreur lecture médecins : " + e1.message, "error"); }

  // 2) Préférences APPROUVÉES chevauchant le mois (les autres n'influencent pas).
  const { data: prefs, error: e2 } = await sb
    .from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, date_compensation")
    .eq("status", "approuve")
    .lte("start_date", finMois)
    .gte("end_date", debutMois);
  if (e2) { genererBtn.disabled = false; return messageGeneration("Erreur lecture préférences : " + e2.message, "error"); }

  // 2bis) Congrès & fermetures d'unités chevauchant le mois (Module 17).
  const periodes = await periodesSur(debutMois, finMois);

  // 2ter) Pré-placements ÉPINGLÉS (Module 19) : conservés et respectés à la génération.
  const { data: epingles } = await sb.from("shifts")
    .select("date, shift_type, doctor_id, poste")
    .eq("epingle", true).gte("date", debutMois).lte("date", finMois);
  const prePlaces = epingles || [];

  // 3) Génération (algorithme pur, planning.js).
  const res = genererPlanning({ annee, mois, medecins: medecins || [], preferences: prefs || [], periodes, prePlaces, feriesAdmin: feriesAdminPourGeneration() });

  // 4) Remplace le brouillon du mois : on efface shifts du mois + schedules du mois.
  await sb.from("shifts").delete().gte("date", debutMois).lte("date", finMois);
  await sb.from("schedules").delete().eq("year", annee).eq("month", mois);

  const { data: sched, error: e3 } = await sb
    .from("schedules")
    .insert({ year: annee, month: mois, status: "draft" })
    .select("id")
    .single();
  if (e3) { genererBtn.disabled = false; return messageGeneration("Erreur création du planning : " + e3.message, "error"); }

  // 5) Insertion des shifts générés (on remarque les pré-placements épinglés).
  const cleEp = new Set(prePlaces.map((s) => s.date + "|" + s.doctor_id + "|" + s.shift_type + "|" + (s.poste || "")));
  const lignes = res.shifts.map((s) => ({
    date: s.date, shift_type: s.shift_type, poste: s.poste,
    doctor_id: s.doctor_id, schedule_id: sched.id,
    epingle: cleEp.has(s.date + "|" + s.doctor_id + "|" + s.shift_type + "|" + (s.poste || "")),
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
/* MODULE 7 — Génération trimestrielle (équité proportionnelle)          */
/* ===================================================================== */

const genererTrimBtn = document.getElementById("generer-trimestre-btn");

/* Bornes ISO d'un mois (1-12). */
function bornesMois(annee, mois) {
  const moisStr = String(mois).padStart(2, "0");
  return {
    debut: annee + "-" + moisStr + "-01",
    fin: annee + "-" + moisStr + "-" + new Date(annee, mois, 0).getDate(),
  };
}

/* Génère les 3 mois du trimestre contenant le mois affiché, en optimisant
   l'équité gardes/week-ends proportionnellement à la disponibilité. */
async function genererTrimestrePourMoisAffiche() {
  if (!calendrier || typeof genererTrimestre !== "function") return;

  const dateVue = calendrier.getDate();
  const annee = dateVue.getFullYear();
  const moisAffiche = dateVue.getMonth() + 1;          // 1-12
  // Le regroupement par blocs de 3 mois civils [1-3][4-6][7-9][10-12] coïncide
  // avec les trimestres ACADÉMIQUES (spec §1.1) ; seule l'étiquette change.
  const trimestre = Math.floor((moisAffiche - 1) / 3) + 1; // param interne (round-trip)
  const moisTrim = [0, 1, 2].map((k) => (trimestre - 1) * 3 + 1 + k);
  // Numéro académique : oct-déc=T1, jan-mars=T2, avr-juin=T3, juil-sept=T4.
  const acadNum = { 10: 1, 1: 2, 4: 3, 7: 4 }[moisTrim[0]];
  const acadDebut = (moisTrim[0] >= 10) ? annee : annee - 1; // année académique de début
  const libelleTrim = "T" + acadNum + " " + acadDebut + "–" + (acadDebut + 1) +
                      " (mois " + moisTrim.join("/") + ")";

  genererTrimBtn.disabled = true;

  // 1) Garde-fou : aucun des 3 mois ne doit être publié.
  const { data: scheds, error: e0 } = await sb
    .from("schedules")
    .select("month, status")
    .eq("year", annee)
    .in("month", moisTrim);
  if (e0) { genererTrimBtn.disabled = false; return messageGeneration("Erreur lecture des plannings : " + e0.message, "error"); }
  const publies = (scheds || []).filter((s) => s.status === "published").map((s) => s.month);
  if (publies.length) {
    genererTrimBtn.disabled = false;
    return messageGeneration(
      "Mois publié(s) dans ce trimestre : " + publies.join(", ") +
      ". Repasse-les en brouillon avant de régénérer le trimestre.", "error");
  }

  // 2) Confirmation : la génération écrase les 3 mois (brouillons).
  if (!window.confirm(
      "Générer tout le trimestre " + libelleTrim + " ?\n\n" +
      "Cela REMPLACE les brouillons des 3 mois (les ajustements manuels non publiés seront perdus).")) {
    genererTrimBtn.disabled = false;
    return;
  }

  messageGeneration("Génération du trimestre " + libelleTrim + " en cours…", "info");

  // 3) Médecins planifiables (hors admin / chef de service).
  const { data: medecins, error: e1 } = await sb
    .from("doctors")
    .select("id, name, grade, fte, contract_start, contract_end, weekly_hours_target, jours_travailles, statut, contract_periods, admin_level, unite_reference, nouvel_engage, cap_fromager")
    .neq("role", "admin");
  if (e1) { genererTrimBtn.disabled = false; return messageGeneration("Erreur lecture médecins : " + e1.message, "error"); }

  // 4) Préférences APPROUVÉES chevauchant le trimestre + garde-fou §8.3.
  const debutTrim = bornesMois(annee, moisTrim[0]).debut;
  const finTrim = bornesMois(annee, moisTrim[2]).fin;

  // Garde-fou « nouvel engagé » : un statut dont la fenêtre (14 j à partir du
  // début de contrat) est entièrement ANTÉRIEURE au trimestre doit être retiré
  // de la fiche par l'admin avant de pouvoir générer (révision 2026-06-12).
  const perimes = (medecins || []).filter((m) => {
    if (!m.nouvel_engage || !m.contract_start) return false;
    const fin = new Date(m.contract_start + "T00:00:00Z");
    fin.setUTCDate(fin.getUTCDate() + 13);
    return fin.toISOString().slice(0, 10) < debutTrim;
  });
  if (perimes.length) {
    genererTrimBtn.disabled = false;
    return messageGeneration("Statut « nouvel engagé » périmé pour : " +
      perimes.map((m) => m.name).join(", ") +
      ". Retire-le dans l'onglet Médecins avant de générer ce trimestre.", "error");
  }
  const nbAttente = await demandesEnAttenteSur(debutTrim, finTrim);
  if (nbAttente > 0) {
    genererTrimBtn.disabled = false;
    return messageGeneration(
      nbAttente + " demande(s) en attente sur ce trimestre. Valide-les avant de générer.", "error");
  }
  const { data: prefs, error: e2 } = await sb
    .from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, date_compensation")
    .eq("status", "approuve")
    .lte("start_date", finTrim)
    .gte("end_date", debutTrim);
  if (e2) { genererTrimBtn.disabled = false; return messageGeneration("Erreur lecture préférences : " + e2.message, "error"); }

  // 4bis) Congrès & fermetures d'unités chevauchant le trimestre (Module 17).
  const periodes = await periodesSur(debutTrim, finTrim);

  // 4ter) Pré-placements ÉPINGLÉS (Module 19) : conservés et respectés.
  const { data: epinglesT } = await sb.from("shifts")
    .select("date, shift_type, doctor_id, poste")
    .eq("epingle", true).gte("date", debutTrim).lte("date", finTrim);
  const prePlaces = epinglesT || [];
  const cleEp = new Set(prePlaces.map((s) => s.date + "|" + s.doctor_id + "|" + s.shift_type + "|" + (s.poste || "")));

  // 5) Génération (algorithme pur). Moteur COUPLÉ « week-ends d'abord »
  //    (planning-couple.js) par DÉFAUT ; repli sur l'ancien moteur seulement s'il
  //    n'est pas chargé. (Bascule 2026-06-19 : perf équivalente, validé 12/12.)
  const _gen = (typeof genererTrimestreCouple === "function") ? genererTrimestreCouple : genererTrimestre;
  const res = _gen({ annee, trimestre, medecins: medecins || [], preferences: prefs || [], periodes, prePlaces, feriesAdmin: feriesAdminPourGeneration() });

  // 6) Écriture mois par mois : on remplace chaque brouillon (shifts + schedule),
  //    puis on insère les shifts du mois rattachés à son schedule_id.
  try {
    for (const mois of moisTrim) {
      const b = bornesMois(annee, mois);
      await sb.from("shifts").delete().gte("date", b.debut).lte("date", b.fin);
      await sb.from("schedules").delete().eq("year", annee).eq("month", mois);

      const { data: sched, error: e3 } = await sb
        .from("schedules")
        .insert({ year: annee, month: mois, status: "draft" })
        .select("id").single();
      if (e3) throw e3;

      const lignes = res.shifts
        .filter((s) => s.date >= b.debut && s.date <= b.fin)
        .map((s) => ({ date: s.date, shift_type: s.shift_type, poste: s.poste,
                       doctor_id: s.doctor_id, schedule_id: sched.id,
                       epingle: cleEp.has(s.date + "|" + s.doctor_id + "|" + s.shift_type + "|" + (s.poste || "")) }));
      if (lignes.length) {
        const { error: e4 } = await sb.from("shifts").insert(lignes);
        if (e4) throw e4;
      }
    }
  } catch (err) {
    genererTrimBtn.disabled = false;
    return messageGeneration("Erreur d'écriture du trimestre : " + (err.message || err), "error");
  }

  // 7) Résumé + rafraîchissement. L'équité fine (plancher horaire + ±1 garde)
  //    s'évalue sur TOUT le trimestre (équilibrage trimestriel) via validerEquite.
  genererTrimBtn.disabled = false;
  const alertesEquite = (typeof validerEquite === "function")
    ? validerEquite(res.shifts, (medecins || []).filter((m) => m.grade !== "pg"), prefs || []) : [];
  const nbConf = res.conflits.length;
  const nbDoublures = res.shifts.filter((s) => s.doublure).length;
  // Étape 6 — récups de week-end non plaçables automatiquement (semaine suivante
  // saturée). Note SOUPLE (pas un conflit) : l'admin les pose à la main.
  const nbRecupNP = (res.recupsNonPosees || []).length;
  const recupNote = nbRecupNP > 0
    ? "<br><br>ℹ️ <strong>" + nbRecupNP + " récup(s) de week-end</strong> non plaçable(s) automatiquement " +
      "(semaine suivante saturée) — à poser manuellement."
    : "";
  const base = "Trimestre " + libelleTrim + " généré : " + res.shifts.length + " shifts (" +
    nbDoublures + " doublure" + (nbDoublures > 1 ? "s" : "") + ") · algo week-ends-d'abord (couplé). ";
  if (nbConf === 0 && alertesEquite.length === 0) {
    messageGeneration(base + "Aucun conflit. ✅" + recupNote, "info");
  } else {
    const apercu = res.conflits.slice(0, 8).map((c) => c.date + " — " + c.message).join("<br>");
    const apEq = alertesEquite.slice(0, 6).map((c) => "⚖️ " + c.message).join("<br>");
    let html = base;
    if (nbConf > 0) {
      html += "<strong>" + nbConf + " conflit(s)</strong> à arbitrer :<br>" + apercu + (nbConf > 8 ? "<br>…" : "");
    }
    if (alertesEquite.length > 0) {
      html += (nbConf > 0 ? "<br><br>" : "") +
        "<strong>Équité trimestrielle (" + alertesEquite.length + ", indicatif) :</strong><br>" +
        apEq + (alertesEquite.length > 6 ? "<br>…" : "");
    }
    html += recupNote;
    messageGeneration(html, nbConf > 0 ? "error" : "info");
  }
  calendrier.refetchEvents();
  rafraichirPanneauAdmin();
}

if (genererTrimBtn) genererTrimBtn.addEventListener("click", genererTrimestrePourMoisAffiche);

/* ===================================================================== */
/* GÉNÉRATION DU PLANNING PG (trimestre) — APRÈS les résidents.           */
/* Lit le planning résident en base (sans le supprimer), pose les shifts  */
/* PG (pg_jour/pg_twe) et attribue les unités du week-end aux résidents.  */
/* ===================================================================== */
const genererPgBtn = document.getElementById("generer-pg-btn");
async function genererPgPourTrimestreAffiche() {
  if (!calendrier || typeof genererTrimestrePG !== "function") return;
  const dateVue = calendrier.getDate();
  const annee = dateVue.getFullYear();
  const moisAffiche = dateVue.getMonth() + 1;
  const trimestre = Math.floor((moisAffiche - 1) / 3) + 1;
  const moisTrim = [0, 1, 2].map((k) => (trimestre - 1) * 3 + 1 + k);
  const debutTrim = bornesMois(annee, moisTrim[0]).debut;
  const finTrim = bornesMois(annee, moisTrim[2]).fin;
  if (genererPgBtn) genererPgBtn.disabled = true;
  try {
    // 1) Les schedules des 3 mois doivent exister (résidents générés d'abord).
    const { data: scheds } = await sb.from("schedules").select("id, month, status").eq("year", annee).in("month", moisTrim);
    const schedByMonth = {}; (scheds || []).forEach((s) => { schedByMonth[s.month] = s; });
    const manquants = moisTrim.filter((m) => !schedByMonth[m]);
    if (manquants.length) { messageGeneration("Génère d'abord le planning des résidents (mois manquants : " + manquants.join(", ") + ").", "error"); return; }
    const nonPubies = moisTrim.filter((m) => schedByMonth[m].status !== "published");
    if (nonPubies.length && !window.confirm("Mois non publiés (" + nonPubies.join(", ") + "). Générer le planning PG par-dessus le brouillon ?")) return;

    // 2) Médecins (avec champs PG), préférences, congrès/fermetures.
    const { data: medecins, error: eMed } = await sb.from("doctors")
      .select("id, name, grade, fte, contract_start, contract_end, weekly_hours_target, jours_travailles, statut, contract_periods, unite_reference, pg_type, opting_out")
      .neq("role", "admin");
    if (eMed) {
      // Erreur fréquente : colonnes pg_type/opting_out absentes → SQL module28_pg.sql non exécuté.
      const hint = (eMed.message || "").includes("pg_type") || (eMed.message || "").includes("opting_out")
        ? " ⚠️ Colonnes pg_type/opting_out manquantes : exécute sql/module28_pg.sql dans Supabase."
        : "";
      messageGeneration("Erreur lecture médecins : " + eMed.message + hint, "error"); return;
    }
    const pgs = (medecins || []).filter((m) => m.grade === "pg");
    if (!pgs.length) { messageGeneration("Aucun PG dans l'équipe (coche le grade « PG / Fellow » dans une fiche médecin).", "error"); return; }
    const { data: prefs } = await sb.from("preferences").select("doctor_id, start_date, end_date, pref_type").eq("status", "approuve").lte("start_date", finTrim).gte("end_date", debutTrim);
    const periodes = await periodesSur(debutTrim, finTrim);

    // 3) Shifts résidents du trimestre (contexte + unités connues + cibles week-end).
    const { data: pub } = await sb.from("shifts").select("id, date, shift_type, doctor_id, poste").gte("date", debutTrim).lte("date", finTrim);
    const publishedShifts = pub || [];

    // 4) Génération PG (fonction pure).
    // Gardes PG = préférences garde_pg (auto-déclarées par les PG, status approuve).
    const pgGardes = (prefs || []).filter((p) => p.pref_type === "garde_pg")
      .map((p) => ({ doctor_id: p.doctor_id, date: p.start_date }));
    const res = genererTrimestrePG({ annee, trimestre, medecins: medecins || [], preferences: prefs || [], periodes, publishedShifts, pgGardes });

    // 5) Écriture base.
    //   a) supprimer les anciens shifts PG du trimestre.
    await sb.from("shifts").delete().in("shift_type", ["pg_jour", "pg_twe", "garde_pg", "recup"]).gte("date", debutTrim).lte("date", finTrim); // re-matérialisés depuis les préférences ci-dessous
    //   b) réinitialiser les unités week-end posées sur les résidents (twe / garde_24h de week-end).
    const estWE = (d) => (typeof plEstWeekendOuFerie === "function") ? plEstWeekendOuFerie(d) : [0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay());
    const weResIds = publishedShifts.filter((s) => (s.shift_type === "twe" || s.shift_type === "garde_24h") && estWE(s.date)).map((s) => s.id);
    if (weResIds.length) await sb.from("shifts").update({ poste: null }).in("id", weResIds);
    //   c) insérer les shifts PG (rattachés au schedule du mois).
    const lignes = res.shifts.map((s) => ({
      date: s.date, shift_type: s.shift_type, poste: s.poste, doctor_id: s.doctor_id,
      schedule_id: (schedByMonth[parseInt(s.date.slice(5, 7), 10)] || {}).id,
    })).filter((l) => l.schedule_id);
    if (lignes.length) { const { error } = await sb.from("shifts").insert(lignes); if (error) throw error; }
    //   c-bis) matérialiser les gardes PG déclarées : shift garde_pg le jour + recup le lendemain.
    const gardeLignes = [];
    pgGardes.forEach((g) => {
      const sidG = (schedByMonth[parseInt(g.date.slice(5, 7), 10)] || {}).id;
      if (sidG) gardeLignes.push({ date: g.date, shift_type: "garde_pg", poste: null, doctor_id: g.doctor_id, schedule_id: sidG });
      const lend = _pgAddJ(g.date, 1);
      const sidL = (schedByMonth[parseInt(lend.slice(5, 7), 10)] || {}).id;
      if (sidL) gardeLignes.push({ date: lend, shift_type: "recup", poste: null, doctor_id: g.doctor_id, schedule_id: sidL });
    });
    if (gardeLignes.length) { const { error: eg } = await sb.from("shifts").insert(gardeLignes); if (eg) throw eg; }
    //   d) poser les unités week-end sur les résidents (groupées par poste).
    const parPoste = {}; (res.majResidents || []).forEach((m) => { (parPoste[m.poste] = parPoste[m.poste] || []).push(m.id); });
    for (const poste of Object.keys(parPoste)) { await sb.from("shifts").update({ poste }).in("id", parPoste[poste]); }

    // 6) Miroir Sheet + rafraîchissement.
    const sync = await pousserVersSheetAuto("planning PG");
    const nbConf = (res.conflits || []).length;
    messageGeneration("Planning PG généré : " + lignes.length + " shifts PG, " + (res.majResidents || []).length +
      " unité(s) week-end posée(s) aux résidents." + (nbConf ? " ⚠️ " + nbConf + " alerte(s) (tour PG incomplet)." : " ✅") +
      (sync && sync.ok ? " Sheet mis à jour." : (sync && sync.skip ? " (Sheet non configuré.)" : "")), nbConf ? "error" : "info");
    calendrier.refetchEvents();
    if (typeof rafraichirPanneauAdmin === "function") rafraichirPanneauAdmin();
  } catch (e) {
    messageGeneration("Erreur génération PG : " + (e.message || e), "error");
  } finally {
    if (genererPgBtn) genererPgBtn.disabled = false;
  }
}
if (genererPgBtn) genererPgBtn.addEventListener("click", genererPgPourTrimestreAffiche);


/* ===================================================================== */
/* ===================================================================== */
/* MODULE 29 — Rebouchage CM (congé maladie en cours de trimestre)       */
/* ===================================================================== */

const rbMedecin     = document.getElementById("rb-medecin");
const rbDebut       = document.getElementById("rb-debut");
const rbFin         = document.getElementById("rb-fin");
const rbBtnAnalyser = document.getElementById("rb-btn-analyser");
const rbBtnPublier  = document.getElementById("rb-btn-publier");
const rbTableWrap   = document.getElementById("rb-table-wrap");
const rbTable       = document.getElementById("rb-table");
const rbMessage     = document.getElementById("rb-message");

// État de l'assistant de remplacement CM (rempli par rbAnalyser).
let rbMalade     = null;   // fiche du médecin malade
let rbPostes     = [];     // [{ date, shift_type, poste, sourceId, _cands }]
let rbChoix      = {};     // index de poste -> doctorId remplaçant choisi
let rbDocs       = [];     // médecins planifiables (non-PG)
let rbShiftsTrim = [];     // tous les shifts du trimestre concerné
let rbPrefs      = [];     // congés/absences approuvés sur le trimestre
let rbOcc        = {};     // occupation des unités : rbOcc[date][poste] = nb

function rbMsg(txt, type) {
  if (!rbMessage) return;
  rbMessage.textContent = txt;
  rbMessage.className = "message" + (type ? " " + type : "");
}

/* Peuple le select médecin avec les médecins non-PG (depuis carteMedecins) */
function rbChargerMedecins() {
  if (!rbMedecin) return;
  rbMedecin.innerHTML = "";
  Object.values(carteMedecins)
    .filter(function(m) { return m.grade !== "pg"; })
    .sort(function(a, b) { return (a.name || "").localeCompare(b.name || ""); })
    .forEach(function(m) {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.name || m.id;
      rbMedecin.appendChild(o);
    });
}

/* ------- Helpers de l'assistant de remplacement CM (Module 29 refondu) ------- */
const RB_HEURES  = { jour: 10.5, garde_nuit: 15, garde_24h: 24, twe: 6, off: 10.5 };
const RB_TRAVAIL = ["jour", "garde_nuit", "garde_24h", "twe"];
const RB_GARDES  = ["garde_nuit", "garde_24h"];
const RB_JOURS   = ["", "lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

function rbJourISO(d) { const j = new Date(d + "T00:00:00Z").getUTCDay(); return j === 0 ? 7 : j; }
function rbAdd(d, n) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

/* Occupation des unités (nb de 'jour' par poste/date) → sert à détecter les
   DOUBLURES : la colonne `doublure` n'existe pas en base, mais une unité tenue
   par 2 personnes le même jour signale un rôle doublé (déplaçable / non repris). */
function rbCalcOccupation() {
  rbOcc = {};
  rbShiftsTrim.forEach(function (s) {
    if (s.shift_type === "jour" && s.poste) {
      (rbOcc[s.date] = rbOcc[s.date] || {});
      rbOcc[s.date][s.poste] = (rbOcc[s.date][s.poste] || 0) + 1;
    }
  });
}

/* Heures déjà posées pour un médecin sur le MOIS de `date` (guide à l'écran). */
function rbHeuresMois(docId, date) {
  const mois = date.slice(0, 7);
  let h = 0;
  rbShiftsTrim.forEach(function (s) {
    if (s.doctor_id === docId && s.date.slice(0, 7) === mois) h += (RB_HEURES[s.shift_type] || 0);
  });
  return h;
}

/* Le médecin a-t-il un congé/absence approuvé ce jour ? */
function rbEnConge(docId, date) {
  const bloquants = ["conge_annuel", "conge_scientifique", "conge_extralegal", "formation", "autre", "conge_maladie"];
  return rbPrefs.some(function (p) {
    return p.doctor_id === docId && bloquants.indexOf(p.pref_type) !== -1 && p.start_date <= date && date <= p.end_date;
  });
}

/* Statut d'un médecin un jour donné : libre / doublure / off / récup / occupé / congé. */
function rbStatut(docId, date) {
  if (rbEnConge(docId, date)) return { cat: "conge", rang: 5, lib: "congé" };
  const sh = rbShiftsTrim.filter(function (s) { return s.doctor_id === docId && s.date === date; });
  if (!sh.length) {
    const doc = rbDocs.find(function (m) { return m.id === docId; }) || {};
    const jt = (doc.jours_travailles && doc.jours_travailles.length) ? doc.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
    if (jt.indexOf(rbJourISO(date)) === -1) return { cat: "horscontrat", rang: 6, lib: "ne travaille pas ce jour" };
    return { cat: "libre", rang: 1, lib: "non planifié" };
  }
  if (sh.some(function (s) { return RB_GARDES.indexOf(s.shift_type) !== -1 || s.shift_type === "twe"; }))
    return { cat: "garde", rang: 7, lib: "déjà de garde/tour" };
  const jourSh = sh.find(function (s) { return s.shift_type === "jour" && s.poste; });
  if (jourSh) {
    const occ = (rbOcc[date] && rbOcc[date][jourSh.poste]) || 1;
    const lab = (typeof POSTE_LABELS !== "undefined" && POSTE_LABELS[jourSh.poste]) || jourSh.poste;
    if (occ >= 2) return { cat: "doublure", rang: 2, lib: "doublure " + lab + " (déplaçable)", shift: jourSh };
    return { cat: "titulaire", rang: 7, lib: "déjà sur " + lab };
  }
  const off = sh.find(function (s) { return s.shift_type === "off"; });
  if (off) return { cat: "off", rang: 3, lib: "off-clinic", shift: off };
  const rec = sh.find(function (s) { return s.shift_type === "recup"; });
  if (rec) return { cat: "recup", rang: 4, lib: "récup", shift: rec };
  if (sh.some(function (s) { return s.shift_type === "repos_garde"; })) return { cat: "repos", rang: 6, lib: "repos de garde" };
  return { cat: "autre", rang: 6, lib: (SHIFT_CONFIG[sh[0].shift_type] || {}).label || sh[0].shift_type };
}

/* Libre le lendemain (peut prendre une garde → repos J+1 possible) ?
   Une doublure ou un off/récup le lendemain = OK (déplaçable / repos). */
function rbLibreLendemain(docId, date) {
  const dem = rbAdd(date, 1);
  return !rbShiftsTrim.some(function (s) {
    if (s.doctor_id !== docId || s.date !== dem) return false;
    if (RB_TRAVAIL.indexOf(s.shift_type) === -1) return false;
    if (s.shift_type === "jour" && ((rbOcc[dem] && rbOcc[dem][s.poste]) || 1) >= 2) return false; // doublure → libérable
    return true;
  });
}

/* Candidats classés pour reprendre un poste : non planifiés > doublure ailleurs >
   off-clinic > récup, puis les autres signalés (⚠️). L'admin garde le dernier mot. */
function rbCandidats(post) {
  const estGarde = RB_GARDES.indexOf(post.shift_type) !== -1;
  const cands = rbDocs.filter(function (m) { return m.id !== rbMalade.id; }).map(function (m) {
    const st = rbStatut(m.id, post.date);
    let rang = st.rang, warn = "";
    if (["garde", "titulaire", "conge", "horscontrat", "repos"].indexOf(st.cat) !== -1) warn = st.lib;
    if (estGarde && !rbLibreLendemain(m.id, post.date)) { warn = warn ? warn + " · pas libre le lendemain" : "pas libre le lendemain"; rang = Math.max(rang, 8); }
    return { id: m.id, nom: m.name || m.id, grade: (typeof GRADE_LABELS !== "undefined" && GRADE_LABELS[m.grade]) || m.grade || "", statut: st, rang: rang, warn: warn, heures: rbHeuresMois(m.id, post.date) };
  });
  cands.sort(function (a, b) { return a.rang - b.rang || a.heures - b.heures || a.nom.localeCompare(b.nom); });
  return cands;
}

/* Étape 1 — lister les POSTES À REPRENDRE du médecin malade (hors doublures). */
async function rbAnalyser() {
  rbMsg("Analyse…");
  if (rbTableWrap) rbTableWrap.classList.add("hidden");
  rbPostes = []; rbChoix = {};
  const malId = rbMedecin && rbMedecin.value;
  const debut = rbDebut && rbDebut.value;
  const fin   = rbFin   && rbFin.value;
  if (!malId || !debut || !fin || debut > fin) { rbMsg("Sélectionne un médecin et une plage de dates valide.", "error"); return; }
  rbMalade = carteMedecins[malId] || { id: malId, name: malId };

  // Trimestre couvrant le mois de début (heures du mois + statut des candidats).
  const annee = parseInt(debut.slice(0, 4), 10);
  const trimestre = Math.ceil(parseInt(debut.slice(5, 7), 10) / 3);
  const m1 = (trimestre - 1) * 3 + 1, m3 = (trimestre - 1) * 3 + 3;
  const debutTrim = annee + "-" + String(m1).padStart(2, "0") + "-01";
  const finTrim   = annee + "-" + String(m3).padStart(2, "0") + "-" + String(new Date(annee, m3, 0).getDate()).padStart(2, "0");

  const r1 = await sb.from("doctors").select("id, name, grade, fte, jours_travailles, role").neq("role", "admin");
  if (r1.error) { rbMsg("Erreur médecins : " + r1.error.message, "error"); return; }
  rbDocs = (r1.data || []).filter(function (m) { return m.grade !== "pg"; });

  const r2 = await sb.from("shifts").select("id, date, shift_type, poste, doctor_id, schedule_id, epingle").gte("date", debutTrim).lte("date", finTrim);
  if (r2.error) { rbMsg("Erreur shifts : " + r2.error.message, "error"); return; }
  rbShiftsTrim = r2.data || [];

  const r3 = await sb.from("preferences").select("doctor_id, start_date, end_date, pref_type").eq("status", "approuve").lte("start_date", finTrim).gte("end_date", debutTrim);
  rbPrefs = r3.data || [];

  rbCalcOccupation();

  // Postes à reprendre = shifts de TRAVAIL du malade dans la plage. Une STATION
  // déjà DOUBLÉE (≥2 personnes) n'est PAS reprise (le malade y était surnuméraire) ;
  // les gardes et tours sont toujours repris.
  rbPostes = rbShiftsTrim.filter(function (s) {
    if (s.doctor_id !== malId || s.date < debut || s.date > fin) return false;
    if (RB_GARDES.indexOf(s.shift_type) !== -1 || s.shift_type === "twe") return true;
    if (s.shift_type === "jour" && s.poste) return (((rbOcc[s.date] && rbOcc[s.date][s.poste]) || 1) === 1);
    return false;
  }).map(function (s) { return { date: s.date, shift_type: s.shift_type, poste: s.poste || null, sourceId: s.id }; })
    .sort(function (a, b) { return a.date.localeCompare(b.date) || (a.poste || "").localeCompare(b.poste || ""); });

  rbRendreTable();
  if (!rbPostes.length) rbMsg("Aucun poste de travail à reprendre (doublures, repos, récups et congés ne se reprennent pas).", "info");
  else rbMsg(rbPostes.length + " poste(s) à reprendre. Choisis un remplaçant par ligne, puis publie.", "");
}

/* Étape 2 — tableau : une ligne par poste, un menu déroulant de remplaçants classés. */
function rbRendreTable() {
  if (!rbTable) return;
  if (!rbPostes.length) { rbTable.innerHTML = ""; if (rbTableWrap) rbTableWrap.classList.add("hidden"); return; }
  let html = "<thead><tr><th>Jour</th><th>Poste à reprendre</th><th>Remplaçant (classé : libre › off › récup)</th><th>Effet</th></tr></thead><tbody>";
  rbPostes.forEach(function (post, i) {
    const cands = rbCandidats(post);
    post._cands = cands;
    const best = cands.find(function (c) { return c.rang <= 4; }); // défaut = meilleur candidat « propre »
    if (best) rbChoix[i] = best.id;
    const libPoste = post.shift_type === "jour"
      ? ((typeof POSTE_LABELS !== "undefined" && POSTE_LABELS[post.poste]) || post.poste)
      : ((SHIFT_CONFIG[post.shift_type] || {}).label || post.shift_type);
    let opts = '<option value="">— à choisir —</option>';
    cands.forEach(function (c) {
      const flag = c.warn ? "  ⚠️ " + c.warn : "";
      const sel = (rbChoix[i] === c.id) ? " selected" : "";
      opts += '<option value="' + c.id + '"' + sel + '>' + escapeHtml(c.nom) + " (" + c.grade + ") · " + Math.round(c.heures) + "h/mois · " + escapeHtml(c.statut.lib + flag) + "</option>";
    });
    html += '<tr><td>' + RB_JOURS[rbJourISO(post.date)] + " " + post.date + '</td>' +
            '<td>' + escapeHtml(libPoste) + '</td>' +
            '<td><select class="rb-pick" data-i="' + i + '">' + opts + '</select></td>' +
            '<td class="rb-effet" data-i="' + i + '"></td></tr>';
  });
  html += "</tbody>";
  rbTable.innerHTML = html;
  if (rbTableWrap) rbTableWrap.classList.remove("hidden");
  rbTable.querySelectorAll(".rb-pick").forEach(function (sel) {
    const i = parseInt(sel.dataset.i, 10);
    sel.addEventListener("change", function () { rbChoix[i] = sel.value; rbMajEffet(i); });
    rbMajEffet(i);
  });
}

/* Affiche l'effet du choix : ce que le remplaçant libère + repos/récup auto. */
function rbMajEffet(i) {
  const cell = rbTable && rbTable.querySelector('.rb-effet[data-i="' + i + '"]');
  if (!cell) return;
  const post = rbPostes[i], docId = rbChoix[i];
  if (!docId) { cell.textContent = "— non repris —"; cell.className = "rb-effet rb-vide"; return; }
  const cand = (post._cands || []).find(function (c) { return c.id === docId; }) || {};
  let txt = "";
  if (cand.statut && ["off", "recup", "doublure"].indexOf(cand.statut.cat) !== -1) txt = "libère son " + cand.statut.lib + " ; ";
  if (RB_GARDES.indexOf(post.shift_type) !== -1) {
    txt += "repos le " + RB_JOURS[rbJourISO(rbAdd(post.date, 1))];
    const jr = rbJourISO(post.date);
    if (jr === 6 || jr === 7) txt += " + récup";
  }
  cell.textContent = txt || "ok";
  cell.className = "rb-effet" + (cand.warn ? " rb-warn" : "");
}

/* 1er jour OUVRÉ libre (lun-ven, sans shift) à partir de J+2 d'une garde de week-end. */
function rbProchaineRecup(docId, dateGarde) {
  let d = rbAdd(dateGarde, 2);
  for (let k = 0; k < 14; k++) {
    if (rbJourISO(d) <= 5 && !rbShiftsTrim.some(function (s) { return s.doctor_id === docId && s.date === d; })) return d;
    d = rbAdd(d, 1);
  }
  return null;
}

/* Étape 3 — publier : pose les remplaçants choisis (+ repos/récup auto pour une
   garde), libère les off/récup/doublures repris, retire les shifts du malade et
   le marque en CONGÉ MALADIE (préférence approuvée). Tout en BROUILLON. */
async function rbPublierManuel() {
  if (!rbPostes.length) { rbMsg("Rien à reprendre.", "info"); return; }
  const debut = rbDebut.value, fin = rbFin.value;
  const annee = parseInt(debut.slice(0, 4), 10);
  const malId = rbMalade.id;

  const aInserer = [];                 // nouveaux shifts (remplaçants, repos, récup)
  const aSupprimer = new Set();        // ids de shifts à retirer
  const resume = [];                   // résumé lisible (historique)
  let nonRepris = 0;

  rbPostes.forEach(function (post, i) {
    const docId = rbChoix[i];
    if (!docId) { nonRepris++; return; }
    aInserer.push({ date: post.date, shift_type: post.shift_type, poste: post.poste, doctor_id: docId });
    const remNom = (carteMedecins[docId] || {}).name || docId;
    resume.push({ date: post.date, type: post.shift_type, poste: post.poste || null, remplacant: remNom });
    // Le remplaçant était en off / récup / doublure ce jour → on libère ce shift.
    const cand = (post._cands || []).find(function (c) { return c.id === docId; });
    if (cand && cand.statut && cand.statut.shift && cand.statut.shift.id) aSupprimer.add(cand.statut.shift.id);
    // Garde → repos lendemain (+ récup la semaine suivante pour une garde de week-end).
    // On LIBÈRE d'abord le jour ciblé des shifts existants du remplaçant (ex. un off
    // ce lendemain), sinon il se retrouverait avec deux shifts le même jour (off + repos).
    if (RB_GARDES.indexOf(post.shift_type) !== -1) {
      const lendemain = rbAdd(post.date, 1);
      rbShiftsTrim.forEach(function (s) { if (s.doctor_id === docId && s.date === lendemain) aSupprimer.add(s.id); });
      aInserer.push({ date: lendemain, shift_type: "repos_garde", poste: null, doctor_id: docId });
      const jr = rbJourISO(post.date);
      if (jr === 6 || jr === 7) {
        const dRecup = rbProchaineRecup(docId, post.date);
        if (dRecup) {
          rbShiftsTrim.forEach(function (s) { if (s.doctor_id === docId && s.date === dRecup) aSupprimer.add(s.id); });
          aInserer.push({ date: dRecup, shift_type: "recup", poste: null, doctor_id: docId });
        }
      }
    }
  });

  // Malade : retirer TOUS ses shifts dans la plage (il est en congé maladie).
  const malShifts = rbShiftsTrim.filter(function (s) { return s.doctor_id === malId && s.date >= debut && s.date <= fin; });
  malShifts.forEach(function (s) { aSupprimer.add(s.id); });

  if (!aInserer.length && !aSupprimer.size) { rbMsg("Aucun remplaçant choisi.", "error"); return; }
  rbMsg("Publication…");

  // INSTANTANÉ « avant » : on mémorise les lignes retirées (pour pouvoir les
  // RÉINSÉRER à l'annulation) AVANT toute suppression.
  const supprimes = rbShiftsTrim
    .filter(function (s) { return aSupprimer.has(s.id); })
    .map(function (s) { return { date: s.date, shift_type: s.shift_type, poste: s.poste || null, doctor_id: s.doctor_id, schedule_id: s.schedule_id || null, epingle: !!s.epingle }; });
  const insereIds = [];
  let prefId = null;

  try {
    // 1) Marquer le malade en CONGÉ MALADIE (préférence approuvée sur la plage).
    //    conge_maladie est un type de PRÉFÉRENCE (pas un shift_type autorisé).
    const { data: prefRow, error: ePref } = await sb.from("preferences")
      .insert({ doctor_id: malId, pref_type: "conge_maladie", start_date: debut, end_date: fin, status: "approuve" })
      .select("id").single();
    if (ePref) console.warn("Marquage congé maladie (préférence) :", ePref.message);
    else if (prefRow) prefId = prefRow.id;

    // 2) Retirer les shifts libérés (malade + off/récup/doublures repris).
    if (aSupprimer.size) {
      const { error: eDel } = await sb.from("shifts").delete().in("id", Array.from(aSupprimer));
      if (eDel) throw eDel;
    }

    // 3) Insérer les nouveaux shifts, rattachés au schedule de leur mois (créé en
    //    brouillon si absent). On récupère leurs ids (pour l'annulation).
    const parMois = {};
    aInserer.forEach(function (s) { (parMois[s.date.slice(0, 7)] = parMois[s.date.slice(0, 7)] || []).push(s); });
    for (const k of Object.keys(parMois)) {
      const mois = parseInt(k.slice(5, 7), 10);
      let { data: sched } = await sb.from("schedules").select("id").eq("year", annee).eq("month", mois).maybeSingle();
      if (!sched) {
        const ns = await sb.from("schedules").insert({ year: annee, month: mois, status: "draft" }).select("id").single();
        if (ns.error) throw ns.error;
        sched = ns.data;
      }
      const lignes = parMois[k].map(function (s) {
        return { date: s.date, shift_type: s.shift_type, poste: s.poste || null, doctor_id: s.doctor_id, schedule_id: sched.id, epingle: false };
      });
      const { data: rows, error: eI } = await sb.from("shifts").insert(lignes).select("id");
      if (eI) throw eI;
      (rows || []).forEach(function (r) { insereIds.push(r.id); });
    }
  } catch (err) {
    rbMsg("Erreur publication : " + (err.message || err), "error"); return;
  }

  // 4) Enregistrer le CM dans l'historique (pour traçabilité + annulation).
  //    Non bloquant : si la table n'existe pas (module34 non lancé), on prévient
  //    mais les remplacements restent en place.
  try {
    const { error: eHist } = await sb.from("cm_remplacements").insert({
      malade_id: malId, start_date: debut, end_date: fin, pref_id: prefId,
      details: { supprimes: supprimes, inseres: insereIds, resume: resume, malade_nom: rbMalade.name || malId },
    });
    if (eHist) console.warn("Historique CM non enregistré (lancer sql/module34 ?) :", eHist.message);
  } catch (e) { console.warn("Historique CM :", e); }

  rbMsg("✓ Remplacements enregistrés" + (nonRepris ? " (" + nonRepris + " poste(s) laissé(s) non repris)" : "") + ". Le malade est marqué en congé maladie. Recharge le calendrier.", "success");
  if (rbTableWrap) rbTableWrap.classList.add("hidden");
  rbPostes = []; rbChoix = {};
  await chargerShifts();
  rbChargerHistorique();
}

/* ----- Historique des congés maladie + annulation (revert) ----- */
async function rbChargerHistorique() {
  const box = document.getElementById("rb-historique");
  if (!box) return;
  const { data, error } = await sb.from("cm_remplacements")
    .select("id, created_at, malade_id, start_date, end_date, details")
    .order("created_at", { ascending: false });
  if (error) {
    box.innerHTML = "<em>Historique indisponible (lance <code>sql/module34_cm_remplacements.sql</code> dans Supabase).</em>";
    return;
  }
  if (!data || !data.length) { box.innerHTML = "Aucun congé maladie enregistré."; return; }
  let html = "";
  data.forEach(function (op) {
    const d = op.details || {};
    const nom = d.malade_nom || (carteMedecins[op.malade_id] || {}).name || op.malade_id;
    const created = (op.created_at || "").slice(0, 16).replace("T", " ");
    const postes = (d.resume || []).map(function (r) {
      const lib = r.type === "jour" ? ((typeof POSTE_LABELS !== "undefined" && POSTE_LABELS[r.poste]) || r.poste)
        : ((SHIFT_CONFIG[r.type] || {}).label || r.type);
      return "<li>" + RB_JOURS[rbJourISO(r.date)] + " " + r.date + " — " + escapeHtml(lib) + " → " + escapeHtml(r.remplacant) + "</li>";
    }).join("");
    html += '<div class="cm-hist-item">' +
      '<div class="cm-hist-head"><strong>' + escapeHtml(nom) + '</strong> · ' + op.start_date + " → " + op.end_date +
      ' <span class="cm-hist-meta">(enregistré le ' + created + ", " + (d.resume || []).length + " poste(s) repris)</span>" +
      ' <button class="mini danger cm-annuler" data-id="' + op.id + '">↩ Annuler ce CM</button></div>' +
      (postes ? "<ul class='cm-hist-postes'>" + postes + "</ul>" : "") +
      "</div>";
  });
  box.innerHTML = html;
  box.querySelectorAll(".cm-annuler").forEach(function (b) {
    b.addEventListener("click", function () { rbAnnulerCM(b.dataset.id); });
  });
}

/* Annule un CM : retire les shifts ajoutés, réinsère ceux retirés, enlève le
   marquage congé maladie, puis supprime la ligne d'historique. */
async function rbAnnulerCM(opId) {
  if (!window.confirm("Annuler ce congé maladie et revenir à la situation d'avant ? Les remplaçants posés seront retirés et les shifts d'origine restaurés.")) return;
  const { data: op, error } = await sb.from("cm_remplacements").select("id, pref_id, details").eq("id", opId).single();
  if (error || !op) { window.alert("CM introuvable : " + (error && error.message)); return; }
  const d = op.details || {};
  try {
    // 1) Retirer les shifts ajoutés par le CM (remplaçants, repos, récups).
    if (d.inseres && d.inseres.length) {
      const { error: e1 } = await sb.from("shifts").delete().in("id", d.inseres);
      if (e1) throw e1;
    }
    // 2) Réinsérer les shifts d'origine retirés (malade + off/récup/doublures).
    if (d.supprimes && d.supprimes.length) {
      const lignes = d.supprimes.map(function (s) {
        return { date: s.date, shift_type: s.shift_type, poste: s.poste || null, doctor_id: s.doctor_id, schedule_id: s.schedule_id || null, epingle: !!s.epingle };
      });
      const { error: e2 } = await sb.from("shifts").insert(lignes);
      if (e2) throw e2;
    }
    // 3) Enlever le marquage congé maladie (préférence).
    if (op.pref_id) { await sb.from("preferences").delete().eq("id", op.pref_id); }
    // 4) Supprimer la ligne d'historique.
    const { error: e4 } = await sb.from("cm_remplacements").delete().eq("id", opId);
    if (e4) throw e4;
  } catch (err) {
    window.alert("Erreur d'annulation : " + (err.message || err)); return;
  }
  await chargerShifts();
  rbChargerHistorique();
  rbMsg("✓ Congé maladie annulé : situation d'avant restaurée.", "success");
}

if (rbBtnAnalyser) rbBtnAnalyser.addEventListener("click", rbAnalyser);
if (rbBtnPublier)  rbBtnPublier.addEventListener("click", rbPublierManuel);

/* ===================================================================== */
/* MODULE 35 — Doublures : repositionnement manuel de la charge          */
/* ===================================================================== */
const dbBtnAnalyser  = document.getElementById("db-btn-analyser");
const dbBtnAppliquer = document.getElementById("db-btn-appliquer");
const dbMessage      = document.getElementById("db-message");

let dbDocs = [], dbDoublures = [], dbActions = {}, dbOcc = {}, dbPeriodes = null;
let dbHeuresMois = {}, dbHeuresTrim = {}, dbWeeksMois = 4.33, dbWeeksTrim = 13;
const DB_POSTES = (typeof POSTES_JOUR !== "undefined") ? POSTES_JOUR.map((p) => p.code) : ["usi1","usi2","usi3","usi4","usi5","bordet","labo_choc"];

function dbMsg(t, type) { if (dbMessage) { dbMessage.textContent = t; dbMessage.className = "message" + (type ? " " + type : ""); } }

/* Stations OUVERTES ce jour et SANS personne (cibles de déplacement). */
function dbStationsLibres(date) {
  const occ = dbOcc[date] || {};
  const ouverts = (dbPeriodes && typeof plPostesOuverts === "function") ? plPostesOuverts(date, dbPeriodes) : DB_POSTES;
  return ouverts.filter((c) => !(occ[c] >= 1));
}

/* Étape 1 — analyser le mois affiché : charge par médecin + doublures. */
async function dbAnalyser() {
  if (!calendrier) return;
  const b = bornesMoisAffiche();
  dbMsg("Analyse du mois " + String(b.mois).padStart(2, "0") + "/" + b.annee + "…");
  dbActions = {};
  const content = document.getElementById("db-content");
  if (content) content.innerHTML = "";
  const wrap = document.getElementById("db-actions-wrap"); if (wrap) wrap.classList.add("hidden");

  const annee = b.annee, trimestre = Math.ceil(b.mois / 3);
  const m1 = (trimestre - 1) * 3 + 1, m3 = (trimestre - 1) * 3 + 3;
  const debutTrim = annee + "-" + String(m1).padStart(2, "0") + "-01";
  const finTrim = annee + "-" + String(m3).padStart(2, "0") + "-" + String(new Date(annee, m3, 0).getDate()).padStart(2, "0");

  const r1 = await sb.from("doctors").select("id, name, grade, fte, jours_travailles, role").neq("role", "admin");
  if (r1.error) { dbMsg("Erreur médecins : " + r1.error.message, "error"); return; }
  dbDocs = (r1.data || []).filter((m) => m.grade !== "pg");

  const rT = await sb.from("shifts").select("id, date, shift_type, poste, doctor_id").gte("date", debutTrim).lte("date", finTrim);
  if (rT.error) { dbMsg("Erreur shifts : " + rT.error.message, "error"); return; }
  const shiftsTrim = rT.data || [];
  const shiftsMois = shiftsTrim.filter((s) => s.date >= b.debut && s.date <= b.fin);

  let periodesRaw = [];
  try { periodesRaw = await periodesSur(b.debut, b.fin); } catch (e) { periodesRaw = []; }
  dbPeriodes = (typeof plIndexerPeriodes === "function") ? plIndexerPeriodes(periodesRaw) : null;

  dbOcc = {};
  shiftsMois.forEach((s) => { if (s.shift_type === "jour" && s.poste) { (dbOcc[s.date] = dbOcc[s.date] || {}); dbOcc[s.date][s.poste] = (dbOcc[s.date][s.poste] || 0) + 1; } });

  dbHeuresMois = {}; dbHeuresTrim = {};
  shiftsMois.forEach((s) => { dbHeuresMois[s.doctor_id] = (dbHeuresMois[s.doctor_id] || 0) + (RB_HEURES[s.shift_type] || 0); });
  shiftsTrim.forEach((s) => { dbHeuresTrim[s.doctor_id] = (dbHeuresTrim[s.doctor_id] || 0) + (RB_HEURES[s.shift_type] || 0); });
  dbWeeksMois = (new Date(annee, b.mois, 0).getDate()) / 7;
  dbWeeksTrim = (Math.round((new Date(finTrim + "T00:00:00Z") - new Date(debutTrim + "T00:00:00Z")) / 86400000) + 1) / 7;

  // Doublures = stations de jour tenues à ≥2 personnes ce jour-là.
  dbDoublures = shiftsMois.filter((s) => s.shift_type === "jour" && s.poste && (((dbOcc[s.date] && dbOcc[s.date][s.poste]) || 1) >= 2));

  dbRendre();
  const n = dbDoublures.length;
  dbMsg(n ? n + " doublure(s) sur le mois (médecins les plus chargés en haut)." : "Aucune doublure ce mois.", n ? "" : "info");
}

/* Étape 2 — rendu : par médecin (charge décroissante), ses doublures + impact live. */
function dbRendre() {
  const content = document.getElementById("db-content");
  const wrap = document.getElementById("db-actions-wrap");
  if (!content) return;
  if (!dbDoublures.length) { content.innerHTML = "<p>Aucune doublure à repositionner ce mois.</p>"; if (wrap) wrap.classList.add("hidden"); return; }
  const parDoc = {};
  dbDoublures.forEach((d) => { (parDoc[d.doctor_id] = parDoc[d.doctor_id] || []).push(d); });
  const docIds = Object.keys(parDoc).sort((a, b) => (dbHeuresMois[b] || 0) - (dbHeuresMois[a] || 0));
  let html = "";
  docIds.forEach((docId) => {
    const nom = (carteMedecins[docId] || {}).name || docId;
    const doubs = parDoc[docId].sort((a, b) => a.date.localeCompare(b.date));
    html += '<div class="db-doc">';
    html += '<div class="db-doc-head"><strong>' + escapeHtml(nom) + '</strong> <span class="db-impact" data-doc="' + docId + '"></span></div>';
    html += '<table class="data-table rb-table"><tbody>';
    doubs.forEach((d) => {
      const libres = dbStationsLibres(d.date);
      let opts = '<option value="">Garder en doublure</option>';
      libres.forEach((c) => { opts += '<option value="move:' + c + '">→ Déplacer vers ' + escapeHtml((POSTE_LABELS[c]) || c) + '</option>'; });
      opts += '<option value="remove">Retirer du planning (non planifié)</option>';
      html += '<tr><td>' + RB_JOURS[rbJourISO(d.date)] + ' ' + d.date + '</td>' +
              '<td>' + escapeHtml((POSTE_LABELS[d.poste]) || d.poste) + ' (doublée)</td>' +
              '<td><select class="db-pick" data-shift="' + d.id + '" data-doc="' + docId + '">' + opts + '</select></td></tr>';
    });
    html += '</tbody></table></div>';
  });
  content.innerHTML = html;
  if (wrap) wrap.classList.remove("hidden");
  content.querySelectorAll(".db-pick").forEach((sel) => {
    sel.addEventListener("change", () => { dbActions[sel.dataset.shift] = sel.value; dbMajImpact(sel.dataset.doc); });
  });
  docIds.forEach(dbMajImpact);
}

/* Impact LIVE : réduction de charge (mois + trimestre) selon les retraits cochés. */
function dbMajImpact(docId) {
  const span = document.querySelector('.db-impact[data-doc="' + docId + '"]');
  if (!span) return;
  let nRem = 0;
  dbDoublures.forEach((d) => { if (d.doctor_id === docId && dbActions[d.id] === "remove") nRem++; });
  const red = nRem * RB_HEURES.jour;
  const hM = dbHeuresMois[docId] || 0, hT = dbHeuresTrim[docId] || 0;
  const moy = (h, w) => (w > 0.2 ? (Math.round((h / w) * 10) / 10) : 0);
  let txt = "Mois : " + Math.round(hM) + " h (" + moy(hM, dbWeeksMois) + " h/sem) · Trim : " + Math.round(hT) + " h (" + moy(hT, dbWeeksTrim) + " h/sem)";
  if (red > 0) txt += "   →   après : " + Math.round(hM - red) + " h (" + moy(hM - red, dbWeeksMois) + " h/sem) mois · " + Math.round(hT - red) + " h (" + moy(hT - red, dbWeeksTrim) + " h/sem) trim";
  span.textContent = txt;
  span.className = "db-impact" + (red > 0 ? " db-reduit" : "");
}

/* Étape 3 — appliquer : déplacer (update poste) ou retirer (delete) les doublures. */
async function dbAppliquer() {
  const ids = Object.keys(dbActions).filter((id) => dbActions[id]);
  if (!ids.length) { dbMsg("Aucun changement sélectionné.", "info"); return; }
  if (!window.confirm(ids.length + " changement(s) — appliquer ? Les « retraits » suppriment la doublure (la personne passe non planifiée), les « déplacements » changent l'unité.")) return;
  dbMsg("Application…");
  try {
    for (const id of ids) {
      const act = dbActions[id];
      if (act === "remove") {
        const { error } = await sb.from("shifts").delete().eq("id", id); if (error) throw error;
      } else if (act.indexOf("move:") === 0) {
        const { error } = await sb.from("shifts").update({ poste: act.slice(5) }).eq("id", id); if (error) throw error;
      }
    }
  } catch (err) { dbMsg("Erreur : " + (err.message || err), "error"); return; }
  dbMsg("✓ Changements appliqués. Recharge le calendrier.", "success");
  await chargerShifts();
  dbAnalyser();
}

if (dbBtnAnalyser)  dbBtnAnalyser.addEventListener("click", dbAnalyser);
if (dbBtnAppliquer) dbBtnAppliquer.addEventListener("click", dbAppliquer);

/* ===================================================================== */
/* MODULE 30 — Vue Semaine (grille postes × jours, remplace la vue liste) */
/* ===================================================================== */

const vueSemaineBtn   = document.getElementById("vue-semaine-btn");
const semaineWrapper  = document.getElementById("semaine-wrapper");
const semaineTitre    = document.getElementById("semaine-titre");
const semainePrev     = document.getElementById("semaine-prev");
const semaineNext     = document.getElementById("semaine-next");
const semaineTable    = document.getElementById("semaine-table");

let semaineDebut = null; // ISO lundi de la semaine affichée

function sLundi(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const j = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (j === 0 ? 6 : j - 1));
  return d.toISOString().slice(0, 10);
}
function sAdd(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function sFmtCourt(iso) { return iso.slice(8, 10) + "/" + iso.slice(5, 7); }
const S_JOURS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

async function construireVueSemaine() {
  if (!semaineTable) return;
  if (!semaineDebut) {
    const base = calendrier ? calendrier.getDate().toISOString().slice(0, 10)
                            : new Date().toISOString().slice(0, 10);
    semaineDebut = sLundi(base);
  }
  const jours = [0,1,2,3,4,5,6].map(function(k) { return sAdd(semaineDebut, k); });
  const fin = jours[6];

  semaineTitre.textContent = "Semaine du " + sFmtCourt(semaineDebut) +
    " au " + sFmtCourt(fin) + "/" + fin.slice(0, 4);

  if (!Object.keys(carteMedecins).length) await chargerCarteMedecins();
  const nomsCourts = construireNomsCourts(carteMedecins);
  const nomFn = function(id) { return nomsCourts[id] || (carteMedecins[id] && carteMedecins[id].name) || "?"; };

  const { data: shifts } = await sb.from("shifts")
    .select("id, date, shift_type, doctor_id, poste, epingle")
    .gte("date", semaineDebut).lte("date", fin);
  const { data: prefs } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, status")
    .lte("start_date", fin).gte("end_date", semaineDebut).eq("status", "approuve");
  const { data: rosterRaw } = await sb.from("doctors")
    .select("id, name, grade, role, contract_start, contract_end, contract_periods, jours_travailles");
  const roster = rosterRaw || [];
  const shiftsList = shifts || [];
  const prefsList  = prefs  || [];

  // Index congés par jour
  const shiftDocsJour = {}, congeDocsJour = {};
  shiftsList.forEach(function(s) {
    (shiftDocsJour[s.date] = shiftDocsJour[s.date] || new Set()).add(s.doctor_id);
    if (GRILLE_CONGES.includes(s.shift_type))
      (congeDocsJour[s.date] = congeDocsJour[s.date] || new Set()).add(s.doctor_id);
  });
  prefsList.forEach(function(p) {
    if (!GRILLE_CONGES.includes(p.pref_type)) return;
    let d = p.start_date;
    while (d <= p.end_date && d <= fin) {
      (congeDocsJour[d] = congeDocsJour[d] || new Set()).add(p.doctor_id);
      d = sAdd(d, 1);
    }
  });

  const periodes = await periodesSur(semaineDebut, fin);
  const nomsS = function(d, pred) {
    return shiftsList.filter(function(s) { return s.date === d && pred(s); })
      .map(function(s) { return { nom: nomFn(s.doctor_id), id: s.id }; });
  };
  const nomsP = function(d, types) {
    return prefsList.filter(function(p) { return p.start_date <= d && p.end_date >= d && types.includes(p.pref_type); })
      .map(function(p) { return { nom: nomFn(p.doctor_id), id: null }; });
  };
  const nonPlan = function(d) {
    if (estWeekendOuFerieISO(d)) return [];
    const aShift = shiftDocsJour[d] || new Set();
    const enConge = congeDocsJour[d] || new Set();
    return roster.filter(function(m) {
      return m.role !== "admin" && m.grade !== "pg" && medActifISO(m, d) && jourTravaillableISO(m, d) &&
        !aShift.has(m.id) && !enConge.has(m.id);
    }).map(function(m) { return { nom: nomFn(m.id), id: null }; })
      .sort(function(a, b) { return a.nom.localeCompare(b.nom); });
  };

  const P = function(codes) { return function(s) { return codes.includes(s.shift_type); }; };
  const lignes = [
    { label: "USI 1",             cls: "semaine-row-station", code: "usi1",
      get: function(d) { return nomsS(d, function(s) { return s.poste === "usi1" && (s.shift_type === "jour" || s.shift_type === "garde_24h" || s.shift_type === "pg_jour" || s.shift_type === "twe" || s.shift_type === "pg_twe"); }); } },
    { label: "USI 2",             cls: "semaine-row-station", code: "usi2",
      get: function(d) { return nomsS(d, function(s) { return s.poste === "usi2" && (s.shift_type === "jour" || s.shift_type === "garde_24h" || s.shift_type === "pg_jour" || s.shift_type === "twe" || s.shift_type === "pg_twe"); }); } },
    { label: "USI 3",             cls: "semaine-row-station", code: "usi3",
      get: function(d) { return nomsS(d, function(s) { return s.poste === "usi3" && (s.shift_type === "jour" || s.shift_type === "garde_24h" || s.shift_type === "pg_jour" || s.shift_type === "twe" || s.shift_type === "pg_twe"); }); } },
    { label: "USI 4",             cls: "semaine-row-station", code: "usi4",
      get: function(d) { return nomsS(d, function(s) { return s.poste === "usi4" && (s.shift_type === "jour" || s.shift_type === "garde_24h" || s.shift_type === "pg_jour" || s.shift_type === "twe" || s.shift_type === "pg_twe"); }); } },
    { label: "USI 5",             cls: "semaine-row-station", code: "usi5",
      get: function(d) { return nomsS(d, function(s) { return s.poste === "usi5" && (s.shift_type === "jour" || s.shift_type === "garde_24h" || s.shift_type === "pg_jour" || s.shift_type === "twe" || s.shift_type === "pg_twe"); }); } },
    { label: "USI Bordet",        cls: "semaine-row-station", code: "bordet",
      get: function(d) { return nomsS(d, function(s) { return s.poste === "bordet" && (s.shift_type === "jour" || s.shift_type === "garde_24h" || s.shift_type === "pg_jour" || s.shift_type === "twe" || s.shift_type === "pg_twe"); }); } },
    { label: "Labo de choc",      cls: "semaine-row-station", code: "labo_choc", estLabo: true,
      get: function(d) { return nomsS(d, function(s) { return s.poste === "labo_choc" && (s.shift_type === "jour" || s.shift_type === "garde_24h" || s.shift_type === "pg_jour" || s.shift_type === "twe" || s.shift_type === "pg_twe"); }); } },
    { label: "Garde de nuit (17h–9h)", cls: "semaine-row-garde",
      get: function(d) { return nomsS(d, P(["garde_nuit"])); } },
    { label: "Garde 24h",              cls: "semaine-row-garde",
      get: function(d) { return nomsS(d, P(["garde_24h"])); } },
    { label: "Tour (TWE)",             cls: "semaine-row-garde",
      get: function(d) { return nomsS(d, P(["twe"])); } },
    { label: "Gardes PG",              cls: "semaine-row-garde",
      get: function(d) { return nomsS(d, P(["garde_pg"])); } },
    { label: "Tour PG (WE)",           cls: "semaine-row-garde",
      get: function(d) { return nomsS(d, P(["pg_twe"])); } },
    { label: "Off-clinic",             cls: "semaine-row-off",
      get: function(d) { return nomsS(d, P(["off_clinic"])); } },
    { label: "Récupération",           cls: "semaine-row-repos",
      get: function(d) {
        // Récup posée (shift_type 'recup'), avec l'étiquette d'origine WE (samedi / V/D).
        return shiftsList.filter(function(s) { return s.date === d && s.shift_type === "recup"; })
          .map(function(s) { return { nom: nomFn(s.doctor_id) + (s.recup_origine ? " (" + s.recup_origine + ")" : ""), id: s.id }; });
      } },
    { label: "Repos de garde",         cls: "semaine-row-reposg",
      get: function(d) { return nomsS(d, P(["repos_garde"])); } },
    { label: "Congé annuel",           cls: "semaine-row-conge",
      get: function(d) { return nomsS(d, P(["conge_annuel","conge_extralegal"])).concat(nomsP(d, ["conge_annuel","conge_extralegal"])); } },
    { label: "Congé scientifique",     cls: "semaine-row-conges",
      get: function(d) { return nomsS(d, P(["conge_scientifique"])).concat(nomsP(d, ["conge_scientifique"])); } },
    { label: "Formation / autre",      cls: "semaine-row-autre",
      get: function(d) { return nomsS(d, P(["formation","autre","conge_maladie"])).concat(nomsP(d, ["formation","autre","conge_maladie"])); } },
    { label: "Non planifiés",          cls: "semaine-row-repos",
      get: function(d) { return nonPlan(d); } },
  ];

  const chipCouleur = function(cls) {
    if (cls === "semaine-row-garde")  return "#0d9488";
    if (cls === "semaine-row-off")    return "#9a6700";
    if (cls === "semaine-row-repos")  return "#6e6e6e";
    if (cls === "semaine-row-reposg") return "#6e5494";
    if (cls === "semaine-row-conge")  return "#1a7f37";
    if (cls === "semaine-row-conges") return "#0b6b63";
    if (cls === "semaine-row-autre")  return "#8250df";
    return "#1f6feb";
  };

  semaineTable.innerHTML = "";
  const thead = semaineTable.createTHead();
  const trHead = thead.insertRow();
  const thCoin = document.createElement("th");
  thCoin.className = "semaine-rowhead semaine-coin";
  trHead.appendChild(thCoin);
  jours.forEach(function(iso, i) {
    const th = document.createElement("th");
    const we = estWeekendOuFerieISO(iso);
    const cg = congresISO(iso, periodes);
    th.className = cg ? "semaine-th-ferie" : (we ? "semaine-th-we" : "semaine-th-sem");
    th.innerHTML = "<strong>" + S_JOURS_FR[i] + " " + sFmtCourt(iso) + "</strong>" +
      (cg ? "<br><small>" + cg + "</small>" : "");
    trHead.appendChild(th);
  });

  const tbody = semaineTable.createTBody();
  const estAdmin = (medecinCourant && medecinCourant.role === "admin");
  lignes.forEach(function(lg) {
    const tr = document.createElement("tr");
    tr.className = lg.cls;
    const tdLabel = document.createElement("td");
    tdLabel.className = "semaine-rowhead";
    tdLabel.textContent = lg.label;
    tr.appendChild(tdLabel);
    jours.forEach(function(iso) {
      const td = document.createElement("td");
      const we = estWeekendOuFerieISO(iso);
      const cg = congresISO(iso, periodes);
      if (lg.estLabo && we) { td.className = "semaine-td-ferme"; td.textContent = "Fermé"; tr.appendChild(td); return; }
      if (lg.code && uniteFermeeISO(lg.code, iso, periodes)) { td.className = "semaine-td-ferme"; td.textContent = "Fermé"; tr.appendChild(td); return; }
      td.className = cg ? "semaine-td-ferie" : (we ? "semaine-td-we" : "");
      (lg.get(iso) || []).forEach(function(item) {
        const chip = document.createElement("span");
        chip.className = "semaine-chip" + (estAdmin && item.id ? " clickable" : "");
        chip.style.background = chipCouleur(lg.cls);
        chip.textContent = item.nom;
        if (estAdmin && item.id) {
          chip.setAttribute("data-shiftid", item.id);
          chip.addEventListener("click", function() {
            const s = shiftsList.find(function(x) { return x.id === item.id; });
            if (s) ouvrirEditionShift(s);
          });
        }
        td.appendChild(chip);
      });
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

if (semainePrev) semainePrev.addEventListener("click", function() {
  semaineDebut = sAdd(semaineDebut || sLundi(new Date().toISOString().slice(0,10)), -7);
  construireVueSemaine();
});
if (semaineNext) semaineNext.addEventListener("click", function() {
  semaineDebut = sAdd(semaineDebut || sLundi(new Date().toISOString().slice(0,10)), 7);
  construireVueSemaine();
});
if (vueSemaineBtn) vueSemaineBtn.addEventListener("click", function() { basculerVuePlanning("semaine"); });

/* MODULE 31 — Gestion des congés côté admin (Résidents/AS + PG)         */
/* ===================================================================== */

const cgTabRes     = document.getElementById("cg-tab-res");
const cgTabPG      = document.getElementById("cg-tab-pg");
const cgSecRes     = document.getElementById("cg-sec-res");
const cgSecPG      = document.getElementById("cg-sec-pg");
const cgResMedecin = document.getElementById("cg-res-medecin");
const cgResType    = document.getElementById("cg-res-type");
const cgResDebut   = document.getElementById("cg-res-debut");
const cgResFin     = document.getElementById("cg-res-fin");
const cgResNote    = document.getElementById("cg-res-note");
const cgResQuota   = document.getElementById("cg-res-quota");
const cgResTbody   = document.getElementById("cg-res-tbody");
const cgResEmpty   = document.getElementById("cg-res-empty");
const cgResMsg     = document.getElementById("cg-res-msg");
const cgPGMedecin  = document.getElementById("cg-pg-medecin");
const cgPGType     = document.getElementById("cg-pg-type");
const cgPGDebut    = document.getElementById("cg-pg-debut");
const cgPGFin      = document.getElementById("cg-pg-fin");
const cgPGNote     = document.getElementById("cg-pg-note");
const cgPGQuota    = document.getElementById("cg-pg-quota");
const cgPGTbody    = document.getElementById("cg-pg-tbody");
const cgPGEmpty    = document.getElementById("cg-pg-empty");
const cgPGMsg      = document.getElementById("cg-pg-msg");

let cgResDoctors = [];  // résidents + AS chargés
let cgPGDoctors  = [];  // PG + Fellow chargés

/* Sous-onglets Résidents/PG/En attente */
const cgTabAtt = document.getElementById("cg-tab-att");
const cgSecAtt = document.getElementById("cg-sec-att");
function cgBasculer(actif) {
  [cgTabRes, cgTabPG, cgTabAtt].forEach(function(b) { if (b) b.classList.remove("actif"); });
  [cgSecRes, cgSecPG, cgSecAtt].forEach(function(s) { if (s) s.classList.add("hidden"); });
  if (actif === "res")  { cgTabRes && cgTabRes.classList.add("actif");  cgSecRes && cgSecRes.classList.remove("hidden"); }
  if (actif === "pg")   { cgTabPG  && cgTabPG.classList.add("actif");   cgSecPG  && cgSecPG.classList.remove("hidden"); }
  if (actif === "att")  { cgTabAtt && cgTabAtt.classList.add("actif");  cgSecAtt && cgSecAtt.classList.remove("hidden"); chargerDemandes(); }
}
if (cgTabRes) cgTabRes.addEventListener("click", function() { cgBasculer("res"); });
if (cgTabPG)  cgTabPG.addEventListener("click",  function() { cgBasculer("pg");  });
if (cgTabAtt) cgTabAtt.addEventListener("click",  function() { cgBasculer("att"); });

/* Initialisation : chargée à l'ouverture de l'onglet */
async function cgInit() {
  const { data } = await sb.from("doctors")
    .select("id, name, grade, pg_type, fte, contract_start, contract_end, quota_conge_annuel, quota_conge_extralegal, quota_conge_scientifique")
    .neq("role", "admin").order("name", { ascending: true });

  cgResDoctors = (data || []).filter(function(m) { return m.grade !== "pg"; });
  cgPGDoctors  = (data || []).filter(function(m) { return m.grade === "pg"; });

  cgResMedecin.innerHTML = "<option value=''>— Choisir —</option>" +
    cgResDoctors.map(function(m) {
      return "<option value='" + m.id + "'>" + escapeHtml(m.name || m.id) + "</option>";
    }).join("");

  cgPGMedecin.innerHTML = "<option value=''>— Choisir —</option>" +
    cgPGDoctors.map(function(m) {
      const label = escapeHtml(m.name || m.id) + (m.pg_type === "fellow" ? " (Fellow)" : " (ULB)");
      return "<option value='" + m.id + "'>" + label + "</option>";
    }).join("");

  const optsRes = [
    ["conge_annuel",       "Congé annuel"],
    ["conge_extralegal",   "Congés extra-légaux"],
    ["conge_scientifique", "Congé scientifique"],
    ["conge_maladie",      "Congé maladie (hors quota)"],
    ["formation",          "Formation USI"],
    ["autre",              "Congé autre (hors quota)"],
    ["indispo",            "Indisponibilité (non bloquant)"],
    ["souhait",            "Souhait (non bloquant)"],
  ];
  if (cgResType) cgResType.innerHTML = optsRes.map(function(o) {
    return "<option value='" + o[0] + "'>" + o[1] + "</option>";
  }).join("");

  // Types PG rechargés à la sélection du médecin
  cgMajTypesPG(null);
}

function cgMajTypesPG(med) {
  const estFellow = med && med.pg_type === "fellow";
  const optsPG = [
    ["conge_annuel",       "Congé (dans quota trimestriel)"],
  ].concat(estFellow ? [["recherche_clinique", "Recherche clinique (dans quota trimestriel)"]] : []).concat([
    ["conge_maladie",  "Congé maladie (hors quota)"],
    ["formation",      "Formation USI"],
    ["autre",          "Congé autre (hors quota)"],
    ["indispo",        "Indisponibilité (non bloquant)"],
  ]);
  if (cgPGType) cgPGType.innerHTML = optsPG.map(function(o) {
    return "<option value='" + o[0] + "'>" + o[1] + "</option>";
  }).join("");
}

/* ── Quota résidents ─────────────────────────────────────────────────── */
function cgQuotaResHtml(med, prefs) {
  const anneesSet = new Set();
  // Ancre sur l'année académique du MOIS AFFICHÉ (suit la navigation), pas la date du jour.
  anneesSet.add(anneeAcademiqueAffichee());
  prefs.forEach(function(p) {
    if (categorieConge(p.pref_type)) {
      anneesSet.add(anneeAcademique(new Date(p.start_date + "T00:00:00Z")));
      anneesSet.add(anneeAcademique(new Date(p.end_date + "T00:00:00Z")));
    }
  });
  const annees = Array.from(anneesSet).sort();
  const lignes = annees.map(function(annee) {
    const f = Math.round(quotaBase(med, "conge_annuel") * fteDe(med));
    const parts = Object.keys(CONGE_TYPES).map(function(type) {
      const quota = Math.round(quotaBase(med, type) * fteDe(med));
      const utilises = prefs.filter(function(p) { return categorieConge(p.pref_type) === type; })
        .reduce(function(s, p) { return s + joursOuvresDansAnnee(p.start_date, p.end_date, annee); }, 0);
      return CONGE_TYPES[type].label + " <strong>" + utilises + "/" + quota + "</strong>";
    });
    return "<strong>" + labelAcad(annee) + "</strong> — " + parts.join(" · ");
  });
  return lignes.join("<br>") + "<br><em>jours ouvrés · année académique 1 oct → 30 sep</em>";
}

/* ── Quota PG ────────────────────────────────────────────────────────── */
function cgQuotaPGHtml(med, prefs) {
  const limPG = (med.pg_type === "fellow") ? PG_CONGE_TRIM_FELLOW : PG_CONGE_TRIM_ULB;
  // Trimestres couverts par les prefs + trimestre du MOIS AFFICHÉ (suit la
  // navigation du calendrier, et non la date du jour). Jour 15 → évite les
  // bascules de trimestre dues au fuseau horaire.
  const refAff = (typeof calendrier !== "undefined" && calendrier && typeof calendrier.getDate === "function")
    ? calendrier.getDate() : new Date();
  const isoAff = refAff.getFullYear() + "-" + String(refAff.getMonth() + 1).padStart(2, "0") + "-15";
  const trimsSet = {};
  trimsSet[pgTrimBornes(isoAff).key] = pgTrimBornes(isoAff);
  prefs.forEach(function(p) {
    if (!categorieConge(p.pref_type)) return;
    [p.start_date, p.end_date].forEach(function(d) {
      const t = pgTrimBornes(d); trimsSet[t.key] = t;
    });
  });
  const lignes = Object.values(trimsSet).sort(function(a,b) { return a.key < b.key ? -1 : 1; }).map(function(tri) {
    let utilises = 0;
    prefs.forEach(function(p) {
      if (!categorieConge(p.pref_type)) return;
      const d1 = p.start_date > tri.start ? p.start_date : tri.start;
      const d2 = p.end_date   < tri.end   ? p.end_date   : tri.end;
      utilises += pgJoursOuvres(d1, d2);
    });
    const qNum = parseInt(tri.key.slice(-1)) + 1;
    const triLisible = "T" + qNum + " " + tri.key.slice(0, 4);
    const reste = Math.max(0, limPG - utilises);
    const alerte = utilises >= limPG ? " <strong>⚠️ quota atteint</strong>" : "";
    return "<strong>Congés " + triLisible + "</strong> : " + utilises + "/" + limPG + " j ouvrés · " + reste + " j restants" + alerte;
  });
  return lignes.join("<br>") + "<br><em>Quota par trimestre civil (ULB : 10 j / Fellow : 20 j)</em>";
}

/* ── Rendu du tableau des prefs ──────────────────────────────────────── */
function cgRendrePrefs(tbody, emptyEl, prefs, reloadFn) {
  if (!tbody) return;
  tbody.innerHTML = "";
  const vide = !prefs || prefs.length === 0;
  if (emptyEl) emptyEl.classList.toggle("hidden", !vide);
  (prefs || []).forEach(function(p) {
    const tr = document.createElement("tr");
    const stLib = { en_attente: "⏳", approuve: "✅ approuvé", refuse: "✖ refusé" };
    [
      (PREF_LABELS[p.pref_type] || p.pref_type),
      p.start_date,
      p.end_date,
      p.note || "—",
      stLib[p.status || "approuve"] || p.status,
    ].forEach(function(val) {
      const td = document.createElement("td"); td.textContent = val; tr.appendChild(td);
    });
    const tdAct = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Supprimer"; btn.className = "mini danger";
    btn.addEventListener("click", async function() {
      if (!window.confirm("Supprimer cette préférence ?")) return;
      const { error } = await sb.from("preferences").delete().eq("id", p.id);
      if (error) { window.alert("Erreur : " + error.message); return; }
      reloadFn();
    });
    tdAct.appendChild(btn); tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
}

/* ── Chargement résidents ────────────────────────────────────────────── */
async function cgChargerRes() {
  const medId = cgResMedecin && cgResMedecin.value;
  if (!medId) {
    if (cgResQuota) cgResQuota.innerHTML = "";
    if (cgResTbody) cgResTbody.innerHTML = "";
    if (cgResEmpty) cgResEmpty.classList.add("hidden");
    return;
  }
  const med = cgResDoctors.find(function(m) { return m.id === medId; });
  if (!med) return;
  const { data: prefs } = await sb.from("preferences").select("*")
    .eq("doctor_id", medId).order("start_date", { ascending: true });
  const prefsList = prefs || [];
  if (cgResQuota) { cgResQuota.innerHTML = cgQuotaResHtml(med, prefsList); cgResQuota.classList.remove("hidden"); }
  cgRendrePrefs(cgResTbody, cgResEmpty, prefsList, cgChargerRes);
}

/* ── Chargement PG ───────────────────────────────────────────────────── */
async function cgChargerPG() {
  const medId = cgPGMedecin && cgPGMedecin.value;
  if (!medId) {
    if (cgPGQuota) cgPGQuota.innerHTML = "";
    if (cgPGTbody) cgPGTbody.innerHTML = "";
    if (cgPGEmpty) cgPGEmpty.classList.add("hidden");
    return;
  }
  const med = cgPGDoctors.find(function(m) { return m.id === medId; });
  if (!med) return;
  cgMajTypesPG(med);
  const { data: prefs } = await sb.from("preferences").select("*")
    .eq("doctor_id", medId).order("start_date", { ascending: true });
  const prefsList = prefs || [];
  if (cgPGQuota) { cgPGQuota.innerHTML = cgQuotaPGHtml(med, prefsList); cgPGQuota.classList.remove("hidden"); }
  cgRendrePrefs(cgPGTbody, cgPGEmpty, prefsList, cgChargerPG);
}

/* ── Ajout résidents ─────────────────────────────────────────────────── */
if (document.getElementById("cg-res-form")) {
  document.getElementById("cg-res-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    if (!cgResMedecin || !cgResMedecin.value) { cgResMsg.textContent = "Choisis un médecin."; cgResMsg.className = "message error"; return; }
    const debut = cgResDebut.value, fin = cgResFin.value;
    if (!debut || !fin || fin < debut) { cgResMsg.textContent = "Dates invalides."; cgResMsg.className = "message error"; return; }
    const { error } = await sb.from("preferences").insert({
      doctor_id: cgResMedecin.value,
      pref_type: cgResType.value,
      start_date: debut, end_date: fin,
      note: cgResNote.value.trim() || null,
      status: "approuve",
      decided_at: new Date().toISOString(),
    });
    if (error) { cgResMsg.textContent = "Erreur : " + error.message; cgResMsg.className = "message error"; return; }
    cgResMsg.textContent = "Ajouté."; cgResMsg.className = "message success";
    cgResDebut.value = ""; cgResFin.value = ""; cgResNote.value = "";
    cgChargerRes();
  });
}

/* ── Ajout PG ────────────────────────────────────────────────────────── */
if (document.getElementById("cg-pg-form")) {
  document.getElementById("cg-pg-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    if (!cgPGMedecin || !cgPGMedecin.value) { cgPGMsg.textContent = "Choisis un médecin."; cgPGMsg.className = "message error"; return; }
    const debut = cgPGDebut.value, fin = cgPGFin.value;
    if (!debut || !fin || fin < debut) { cgPGMsg.textContent = "Dates invalides."; cgPGMsg.className = "message error"; return; }
    const { error } = await sb.from("preferences").insert({
      doctor_id: cgPGMedecin.value,
      pref_type: cgPGType.value,
      start_date: debut, end_date: fin,
      note: cgPGNote.value.trim() || null,
      status: "approuve",
      decided_at: new Date().toISOString(),
    });
    if (error) { cgPGMsg.textContent = "Erreur : " + error.message; cgPGMsg.className = "message error"; return; }
    cgPGMsg.textContent = "Ajouté."; cgPGMsg.className = "message success";
    cgPGDebut.value = ""; cgPGFin.value = ""; cgPGNote.value = "";
    cgChargerPG();
  });
}

if (cgResMedecin) cgResMedecin.addEventListener("change", cgChargerRes);
if (cgPGMedecin)  cgPGMedecin.addEventListener("change",  cgChargerPG);

/* MODULE 14 — Exports Excel (.xlsx) via ExcelJS (spec §13)              */
/* ===================================================================== */

const exportPlanningBtn  = document.getElementById("export-planning-btn");
const exportTrimestreBtn = document.getElementById("export-trimestre-btn");
const exportRecapBtn     = document.getElementById("export-recap-btn");
const exportReconnusBtn  = document.getElementById("export-reconnus-btn");

/* Couleurs ARGB (préfixe FF = opaque) du gabarit — palette « sarcelle ». */
const XL = {
  titre:    "FF04342C", // bandeau de titre fusionné (teal sombre, texte clair)
  entete:   "FFE1F5EE", // teal clair : en-tête des jours de SEMAINE
  enteteWE: "FFD8DDDA", // gris-vert : en-tête samedi / dimanche / férié
  station:  "FFF1EFE8", // beige clair : libellés des stations
  garde:    "FF9FE1CB", // teal pâle : gardes / tour
  congeA:   "FFFCE4D6", // orange clair : congé annuel
  congeS:   "FFF8CBAD", // orange : congé scientifique
  repos_garde: "FFE4DFEC", // mauve clair : repos de garde (auto)
  repos:    "FFEDEDED", // gris clair : repos manuel
  off:      "FFFFE699", // jaune : off-clinic
  autre:    "FFF2F2F2", // gris très clair : indispo / autre
  auto:     "FFF7F7F7", // fond des cellules auto-remplies (vs vides éditables)
  ferme:    "FFC8C8C8", // gris : unité fermée (Labo le week-end / férié, fermetures M17)
  congres:  "FFFAC775", // ambre : en-tête d'un jour de congrès (M17)
  sansReconnu: "FF9DC3E6", // BLEU : jour sans médecin reconnu de garde (export dédié)
  trait:    "FFB0B0B0",
};

/* Vrai si la date ISO tombe un jour TRAVAILLABLE du médecin (jours_travailles,
   1 = lundi … 7 = dimanche ; vide = tous). Un médecin qui ne travaille jamais
   le lundi (convenance) ne doit PAS apparaître « non planifié » un lundi. */
function jourTravaillableISO(m, iso) {
  const jt = (m && m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : null;
  if (!jt) return true;
  const j = new Date(iso + "T00:00:00Z").getUTCDay() || 7;
  return jt.includes(j);
}

/* Vrai si la date ISO "AAAA-MM-JJ" est un samedi, dimanche ou jour férié belge.
   Utilise joursFeriesBE (regles.js, global dans le navigateur). Sert à
   l'affichage « Labo fermé » dans l'export planning (spec §3.2). */
function estWeekendOuFerieISO(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const j = d.getUTCDay(); // 0 = dimanche, 6 = samedi
  if (j === 0 || j === 6) return true;
  return (typeof joursFeriesBE === "function") && joursFeriesBE(d.getUTCFullYear()).has(iso);
}

/* Liste des semaines (lun→dim) couvrant un mois (1-12). */
function semainesDuMois(annee, mois) {
  const dernier = new Date(Date.UTC(annee, mois, 0));
  const d = new Date(Date.UTC(annee, mois - 1, 1));
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1)); // recule au lundi
  const semaines = [];
  while (d <= dernier) {
    const jours = [];
    for (let k = 0; k < 7; k++) {
      const x = new Date(d); x.setUTCDate(x.getUTCDate() + k);
      jours.push(x.toISOString().slice(0, 10));
    }
    semaines.push(jours);
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return semaines;
}

const JOURS_COURTS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

/* Nom d'une feuille hebdomadaire = PREMIER JOUR de la semaine (révision
   2026-06-12), au format JJ-MM-AAAA (les caractères / : ? * sont interdits
   dans les noms d'onglets Excel). */
function nomFeuilleSemaine(jours) {
  const d = jours[0];
  return d.slice(8, 10) + "-" + d.slice(5, 7) + "-" + d.slice(0, 4);
}
function libelleJour(iso, idx) {
  return JOURS_COURTS[idx] + " " + iso.slice(8, 10) + "/" + iso.slice(5, 7);
}

/* ----- Module 17 — aides « périodes spéciales » (exports + grille) ----- */
/* L'unité `code` est-elle fermée (fermeture admin) à la date `iso` ? */
function uniteFermeeISO(code, iso, periodes) {
  return (periodes || []).some((p) =>
    p.type === "fermeture" && p.unite === code && p.start_date <= iso && iso <= p.end_date);
}
/* Libellé(s) du/des congrès couvrant la date `iso`, ou null. */
function congresISO(iso, periodes) {
  const c = (periodes || []).filter((p) =>
    p.type === "congres" && p.start_date <= iso && iso <= p.end_date);
  return c.length ? c.map((p) => p.label).join(", ") : null;
}

/* Applique bordure + alignement à une cellule. */
function styleCellule(cell, fillArgb) {
  cell.border = {
    top:    { style: "thin", color: { argb: XL.trait } },
    left:   { style: "thin", color: { argb: XL.trait } },
    bottom: { style: "thin", color: { argb: XL.trait } },
    right:  { style: "thin", color: { argb: XL.trait } },
  };
  cell.alignment = { wrapText: true, vertical: "top" };
  if (fillArgb) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
}

/* Noms des médecins assignés un jour donné selon un prédicat sur le shift. */
function nomsShift(shifts, date, predicate, nomFn) {
  return shifts.filter((s) => s.date === date && predicate(s)).map((s) => nomFn(s.doctor_id));
}
/* Noms des médecins ayant une préférence (congé) couvrant la date. */
function nomsPref(prefs, date, types, nomFn) {
  return prefs.filter((p) => types.includes(p.pref_type) && p.start_date <= date && date <= p.end_date)
    .map((p) => nomFn(p.doctor_id));
}

/* Construit une feuille « semaine » au gabarit Erasme.
   `periodes` (Module 17, optionnel) : congrès (en-tête orange + libellé) et
   fermetures d'unités (cellule « Fermé » comme le Labo le week-end). */
function construireFeuilleSemaine(ws, jours, shifts, prefs, nomFn, periodes) {
  // Largeur des colonnes de jours. On affiche des NOMS DE FAMILLE courts (cf.
  // construireNomsCourts) → 18 pour qu'un nom (voire « De Visscher C. »)
  // tienne sur une seule ligne, tout en gardant un tableau compact.
  const LARG_JOUR = 18;
  // Paramètres de hauteur. IMPORTANT : dès qu'on fixe row.height, ExcelJS écrit
  // customHeight="1" et Excel n'auto-ajuste PLUS la ligne. Il faut donc estimer
  // une hauteur TOUJOURS ≥ au besoin réel, sinon le texte multi-lignes (wrapText)
  // est rogné en bas (aligné en haut) et les lignes paraissent « écrasées » tant
  // qu'on ne ré-ajuste pas la hauteur à la main.
  // - CHARS_PAR_LIGNE : capacité PRUDENTE d'une cellule, dérivée de la largeur
  //   réelle (≈ 0,8 × largeur, car majuscules/accents/traits d'union prennent plus
  //   de place que le « 0 » de référence). On sous-estime volontairement → on
  //   surestime le nombre de lignes → marge de sécurité, jamais de rognage.
  // - PT_PAR_LIGNE : hauteur confortable d'une ligne de texte (besoin réel ≈ 16 pt,
  //   on prend 18 pour garder une marge).
  const CHARS_PAR_LIGNE = Math.floor(LARG_JOUR * 0.8);
  const PT_PAR_LIGNE = 18;
  ws.getColumn(1).width = 28; // assez large pour que les libellés tiennent sur 1 ligne
  for (let c = 2; c <= 8; c++) ws.getColumn(c).width = LARG_JOUR;

  // VOLETS FIGÉS : la colonne des postes + le titre et l'en-tête restent
  // visibles au défilement. IMPRESSION : paysage, ajusté à la largeur de page.
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];
  ws.pageSetup = {
    orientation: "landscape", paperSize: 9, // A4
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
  };

  // Ligne 1 — TITRE fusionné sur toute la largeur : « semaine du … au … ».
  ws.mergeCells(1, 1, 1, 8);
  const cTitre = ws.getCell(1, 1);
  cTitre.value = "Planning USI — semaine du " +
    jours[0].slice(8, 10) + "/" + jours[0].slice(5, 7) + " au " +
    jours[6].slice(8, 10) + "/" + jours[6].slice(5, 7) + "/" + jours[6].slice(0, 4);
  cTitre.font = { bold: true, size: 12, color: { argb: "FFE1F5EE" } };
  cTitre.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  cTitre.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.titre } };
  ws.getRow(1).height = 24;

  // Ligne 2 — en-tête des jours : SEMAINE en teal clair, WEEK-END/FÉRIÉ en
  // gris, jour de CONGRÈS (M17) en ambre avec le nom du congrès en 2e ligne.
  const head = ws.getRow(2);
  styleCellule(head.getCell(1), XL.entete);
  let enteteCongres = false;
  jours.forEach((iso, i) => {
    const cell = head.getCell(2 + i);
    const congres = congresISO(iso, periodes);
    const we = estWeekendOuFerieISO(iso);
    cell.value = congres ? libelleJour(iso, i) + "\n" + congres : libelleJour(iso, i);
    cell.font = { bold: true, color: { argb: congres ? "FF633806" : (we ? "FF444441" : "FF085041") } };
    styleCellule(cell, congres ? XL.congres : (we ? XL.enteteWE : XL.entete));
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    if (congres) enteteCongres = true;
  });
  head.height = enteteCongres ? 2 * PT_PAR_LIGNE + 6 : 20; // place pour la 2e ligne

  // Définition des lignes (label, couleur, fonction de contenu par date).
  // Drapeaux possibles : estLabo (fermé le week-end), ligneVide (ligne vierge
  // éditable insérée sous chaque unité pour la saisie manuelle d'un 2e médecin).
  const P = (codes) => (s) => codes.includes(s.shift_type);
  // « Non planifiés (repos) » : tout médecin connu sans aucun shift ce jour et
  // non en congé (indispo / formation / autre / récup férié + simplement libres).
  const nonPlanifies = (d) => {
    if (estWeekendOuFerieISO(d)) return []; // pas de « repos » les week-ends/fériés
    const aShift = new Set(shifts.filter((s) => s.date === d).map((s) => s.doctor_id));
    const enConge = new Set();
    shifts.forEach((s) => { if (s.date === d && GRILLE_CONGES.includes(s.shift_type)) enConge.add(s.doctor_id); });
    (prefs || []).forEach((p) => {
      if (!GRILLE_CONGES.includes(p.pref_type)) return;
      if (p.status && p.status !== "approuve") return;
      if (p.start_date <= d && p.end_date >= d) enConge.add(p.doctor_id);
    });
    return Object.keys(carteMedecins)
      .filter((id) => carteMedecins[id].role !== "admin" && medActifISO(carteMedecins[id], d) &&
        jourTravaillableISO(carteMedecins[id], d) && // jour non travaillable ≠ non planifié
        !aShift.has(id) && !enConge.has(id)) // hors contrat / admin exclus
      .map((id) => nomFn(id))
      .sort((a, b) => String(a).localeCompare(String(b)));
  };
  const lignes = [];
  const stations = [
    ["USI 1", "usi1"], ["USI 2", "usi2"], ["USI 3", "usi3"], ["USI 4", "usi4"],
    ["USI 5", "usi5"], ["USI Bordet", "bordet"], ["Labo de choc", "labo_choc"],
  ];
  stations.forEach(([lib, code]) => {
    lignes.push({ label: lib, fill: XL.station, estLabo: code === "labo_choc", code,
      get: (d) => nomsShift(shifts, d, (s) => s.poste === code && (s.shift_type === "jour" || s.shift_type === "garde_24h"), nomFn) });
    // (révision 2026-06-12 : plus de ligne vide intercalée sous chaque unité)
  });
  lignes.push({ label: "Autres (saisie libre)", fill: null, get: () => [] });
  lignes.push({ label: "Garde de nuit (17h–9h)", fill: XL.garde, get: (d) => nomsShift(shifts, d, P(["garde_nuit"]), nomFn) });
  lignes.push({ label: "Garde 24h", fill: XL.garde, get: (d) => nomsShift(shifts, d, P(["garde_24h"]), nomFn) });
  lignes.push({ label: "Tour (TWE)", fill: XL.garde, get: (d) => nomsShift(shifts, d, P(["twe"]), nomFn) });
  // Ordre (cf. grille) : Off-clinic, Récupération, Repos de garde, Non planifiés,
  // puis les Congés à part.
  lignes.push({ label: "Off-clinic", fill: XL.off, get: (d) => nomsShift(shifts, d, P(["off"]), nomFn) });
  lignes.push({ label: "Récupération", fill: XL.repos, get: (d) => nomsShift(shifts, d, P(["recup"]), nomFn) });
  lignes.push({ label: "Repos de garde", fill: XL.repos_garde, get: (d) => nomsShift(shifts, d, P(["repos_garde"]), nomFn) });
  lignes.push({ label: "Congé annuel", fill: XL.congeA,
    get: (d) => nomsShift(shifts, d, P(["conge_annuel", "conge_extralegal"]), nomFn)
      .concat(nomsPref(prefs, d, ["conge_annuel", "conge_extralegal"], nomFn)) });
  lignes.push({ label: "Congé scientifique", fill: XL.congeS,
    get: (d) => nomsShift(shifts, d, P(["conge_scientifique"]), nomFn)
      .concat(nomsPref(prefs, d, ["conge_scientifique"], nomFn)) });
  // « Non planifiés (repos) » en DERNIER (cohérent avec la grille).
  lignes.push({ label: "Non planifiés (repos)", fill: XL.autre, get: (d) => nonPlanifies(d) });

  // Écriture des lignes (à partir de la ligne 3 : titre + en-tête au-dessus).
  lignes.forEach((lg, r) => {
    const row = ws.getRow(3 + r);
    const lab = row.getCell(1);

    // Ligne vierge éditable (sous une unité) : cellules blanches bordées.
    if (lg.ligneVide) {
      styleCellule(lab, null);
      lab.alignment = { vertical: "middle" };
      jours.forEach((iso, i) => { styleCellule(row.getCell(2 + i), null); });
      row.height = 30;
      return;
    }

    lab.value = lg.label; lab.font = { bold: true };
    styleCellule(lab, lg.fill);
    // Le libellé reste sur une seule ligne (pas de retour auto qui écraserait la ligne).
    lab.alignment = { wrapText: false, vertical: "middle" };
    let maxLignes = 1;
    jours.forEach((iso, i) => {
      const cell = row.getCell(2 + i);
      // Spec §3.2 : le Labo de choc est FERMÉ le week-end et les jours fériés.
      // Module 17 : toute unité FERMÉE par l'admin l'est aussi sur sa période.
      if ((lg.estLabo && estWeekendOuFerieISO(iso)) ||
          (lg.code && uniteFermeeISO(lg.code, iso, periodes))) {
        cell.value = "Fermé";
        styleCellule(cell, XL.ferme);
        cell.font = { italic: true, color: { argb: "FF777777" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        return;
      }
      const noms = (lg.get(iso) || []).filter(Boolean);
      // Nombre de lignes VISIBLES de la cellule = somme des noms empilés, chacun
      // pouvant lui-même passer sur plusieurs lignes s'il est plus long que la
      // colonne (retour à la ligne auto ≈ LARG_JOUR caractères par ligne).
      const lignesCell = noms.reduce((a, n) => a + Math.max(1, Math.ceil(n.length / CHARS_PAR_LIGNE)), 0);
      maxLignes = Math.max(maxLignes, lignesCell);
      cell.value = noms.length ? noms.join("\n") : null;
      // Cellule auto-remplie distinguée des cellules vides (éditables).
      styleCellule(cell, noms.length ? XL.auto : null);
    });
    // Hauteur explicite GÉNÉREUSE (cf. note ci-dessus) : ~18 pt par ligne visible
    // + marge, minimum 30 pt pour que les lignes vides du gabarit restent
    // confortables à remplir à la main et que rien ne soit jamais écrasé.
    // Les lignes de STATION réservent d'office la place de DEUX noms (un 2e
    // médecin peut être ajouté à la main dans la même cellule — révision).
    const minH = lg.code ? (2 * PT_PAR_LIGNE + 6) : 30;
    row.height = Math.max(minH, maxLignes * PT_PAR_LIGNE + 8);
  });
}

/* Déclenche le téléchargement d'un classeur ExcelJS. */
async function telechargerClasseur(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* Charge shifts + préférences approuvées + périodes spéciales (M17) de la période. */
async function donneesMoisExport(b) {
  const { data: shifts } = await sb.from("shifts")
    .select("date, shift_type, doctor_id, poste").gte("date", b.debut).lte("date", b.fin);
  const { data: prefs } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, date_compensation").eq("status", "approuve")
    .lte("start_date", b.fin).gte("end_date", b.debut);
  const periodes = await periodesSur(b.debut, b.fin); // congrès / fermetures
  if (!Object.keys(carteMedecins).length) await chargerCarteMedecins();
  return { shifts: shifts || [], prefs: prefs || [], periodes };
}

/* Sépare un nom complet en prénom (1er mot) et nom (le reste).
   Ex. "Laureline De Visscher" → { prenom: "Laureline", nom: "De Visscher" }. */
function prenomEtNom(nomComplet) {
  const parts = (nomComplet || "").trim().split(/\s+/);
  const prenom = parts.shift() || "";
  return { prenom, nom: parts.join(" ") };
}

/* Normalise une chaîne pour comparaison : minuscules, sans accents. */
function normaliserTexte(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* Construit un libellé COURT par doctor_id pour l'export planning : le NOM DE
   FAMILLE seul (révision : plus officiel que le prénom), sauf si plusieurs
   médecins partagent le même nom → on ajoute alors le plus petit préfixe du
   PRÉNOM (suivi d'un point) qui les rend uniques (« Dupont C. » / « Dupont L. »,
   et si même initiale → « Dupont Ca. » / « Dupont Cl. »). La détection
   d'homonymie porte sur TOUS les médecins connus (carteMedecins). */
function construireNomsCourts(carte) {
  const meds = Object.keys(carte).map((id) => {
    const { prenom, nom } = prenomEtNom(carte[id] && carte[id].name);
    return { id, prenom, nom: nom || prenom }; // nom unique (un seul mot) : on le garde
  });
  const groupes = {};
  meds.forEach((m) => {
    const cle = normaliserTexte(m.nom);
    (groupes[cle] = groupes[cle] || []).push(m);
  });
  const resultat = {};
  Object.values(groupes).forEach((groupe) => {
    if (groupe.length === 1) { resultat[groupe[0].id] = groupe[0].nom; return; }
    // Homonymie de nom de famille : on allonge le préfixe du prénom jusqu'à unicité.
    let longueur = 1;
    while (true) {
      const affichages = groupe.map((m) => {
        const pref = m.prenom.slice(0, longueur);
        return pref ? m.nom + " " + pref + "." : m.nom;
      });
      const uniques = new Set(affichages.map(normaliserTexte));
      if (uniques.size === affichages.length || longueur >= 12) {
        groupe.forEach((m, i) => { resultat[m.id] = affichages[i]; });
        break;
      }
      longueur++;
    }
  });
  return resultat;
}

/* Bornes + mois du TRIMESTRE (civil) contenant le mois affiché. Le découpage
   [1-3][4-6][7-9][10-12] coïncide avec les trimestres académiques (cf. app). */
function bornesTrimestreAffiche() {
  const d = calendrier.getDate();
  const annee = d.getFullYear();
  const moisAffiche = d.getMonth() + 1;
  const trimestre = Math.floor((moisAffiche - 1) / 3) + 1;
  const moisTrim = [0, 1, 2].map((k) => (trimestre - 1) * 3 + 1 + k);
  const ms0 = String(moisTrim[0]).padStart(2, "0");
  const ms2 = String(moisTrim[2]).padStart(2, "0");
  return {
    annee, trimestre, moisTrim,
    debut: annee + "-" + ms0 + "-01",
    fin: annee + "-" + ms2 + "-" + new Date(annee, moisTrim[2], 0).getDate(),
  };
}

/* Liste des semaines (lun→dim) couvrant tout le trimestre (du 1er du 1er mois
   au dernier jour du 3e mois). Les semaines de bord peuvent déborder légèrement
   sur le mois voisin ; l'en-tête de chaque feuille affiche les dates exactes. */
function semainesDuTrimestre(annee, moisTrim) {
  const premier = new Date(Date.UTC(annee, moisTrim[0] - 1, 1));
  const dernier = new Date(Date.UTC(annee, moisTrim[2], 0));
  const d = new Date(premier);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1)); // recule au lundi
  const semaines = [];
  while (d <= dernier) {
    const jours = [];
    for (let k = 0; k < 7; k++) {
      const x = new Date(d); x.setUTCDate(x.getUTCDate() + k);
      jours.push(x.toISOString().slice(0, 10));
    }
    semaines.push(jours);
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return semaines;
}

/* EXPORT 1 bis — Planning du TRIMESTRE : un onglet par semaine (~13). */
async function exporterExcelTrimestre() {
  if (typeof ExcelJS === "undefined") { window.alert("ExcelJS non chargé (vérifie ta connexion)."); return; }
  const b = bornesTrimestreAffiche();
  const { shifts, prefs, periodes } = await donneesMoisExport(b); // requête par plage debut/fin
  const nomsCourts = construireNomsCourts(carteMedecins);
  const nomFn = (id) => nomsCourts[id] || (carteMedecins[id] && carteMedecins[id].name) || "?";

  const wb = new ExcelJS.Workbook();
  semainesDuTrimestre(b.annee, b.moisTrim).forEach((jours) => {
    const ws = wb.addWorksheet(nomFeuilleSemaine(jours));
    construireFeuilleSemaine(ws, jours, shifts, prefs, nomFn, periodes);
  });
  const lib = b.annee + "_mois" + b.moisTrim[0] + "-" + b.moisTrim[2];
  await telechargerClasseur(wb, "planning_trimestre_" + lib + ".xlsx");
}

/* EXPORT 1 — Planning complet : un onglet par semaine du mois affiché. */
async function exporterExcelPlanning() {
  if (typeof ExcelJS === "undefined") { window.alert("ExcelJS non chargé (vérifie ta connexion)."); return; }
  const b = bornesMoisAffiche();
  const { shifts, prefs, periodes } = await donneesMoisExport(b);
  // Libellés courts (prénom, + initiale du nom si homonymie) pour densifier.
  const nomsCourts = construireNomsCourts(carteMedecins);
  const nomFn = (id) => nomsCourts[id] || (carteMedecins[id] && carteMedecins[id].name) || "?";

  const wb = new ExcelJS.Workbook();
  semainesDuMois(b.annee, b.mois).forEach((jours) => {
    const ws = wb.addWorksheet(nomFeuilleSemaine(jours));
    construireFeuilleSemaine(ws, jours, shifts, prefs, nomFn, periodes);
  });
  await telechargerClasseur(wb, "planning_" + b.annee + "-" + String(b.mois).padStart(2, "0") + ".xlsx");
}

/* EXPORT 1 bis — HORAIRES RECONNUS (révision 2026-06-12) : même gabarit que
   le planning du mois, mais les COLONNES des jours SANS médecin « reconnu »
   parmi les personnes de garde (garde de nuit / 24 h) sont surlignées en
   BLEU, pour repérer ces jours d'un coup d'œil. */
async function exporterExcelReconnus() {
  if (typeof ExcelJS === "undefined") { window.alert("ExcelJS non chargé (vérifie ta connexion)."); return; }
  const b = bornesMoisAffiche();
  const { shifts, prefs, periodes } = await donneesMoisExport(b);
  const nomsCourts = construireNomsCourts(carteMedecins);
  const nomFn = (id) => nomsCourts[id] || (carteMedecins[id] && carteMedecins[id].name) || "?";
  // Statut « reconnu » relu FRAIS depuis la base : la carte des médecins en
  // cache peut dater d'avant la colonne (→ tout sortait en bleu à tort).
  const { data: docsRec, error: eRec } = await sb.from("doctors").select("id, reconnu");
  if (eRec) { window.alert("Lecture du statut « reconnu » impossible : " + eRec.message +
    "\n(Le SQL module25_reconnu a-t-il été exécuté dans Supabase ?)"); return; }
  const reconnus = new Set((docsRec || []).filter((m) => m.reconnu).map((m) => String(m.id)));
  const estReconnu = (id) => reconnus.has(String(id));

  // Jour « sans reconnu » = il y a des gardes ce jour-là et AUCUNE n'est
  // tenue par un médecin reconnu. (Sans données → pas de surlignage.)
  const sansReconnu = (iso) => {
    const gardes = shifts.filter((s) => s.date === iso &&
      (s.shift_type === "garde_nuit" || s.shift_type === "garde_24h"));
    return gardes.length > 0 && !gardes.some((s) => estReconnu(s.doctor_id));
  };

  const wb = new ExcelJS.Workbook();
  semainesDuMois(b.annee, b.mois).forEach((jours) => {
    const ws = wb.addWorksheet(nomFeuilleSemaine(jours));
    construireFeuilleSemaine(ws, jours, shifts, prefs, nomFn, periodes);
    // Surlignage BLEU des colonnes des jours sans reconnu de garde.
    jours.forEach((iso, idx) => {
      if (!sansReconnu(iso)) return;
      const col = idx + 2; // colonne 1 = libellés des postes
      for (let r = 2; r <= ws.rowCount; r++) {
        const cell = ws.getRow(r).getCell(col);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.sansReconnu } };
      }
    });
    // Légende sous le tableau.
    const leg = ws.getRow(ws.rowCount + 2).getCell(1);
    leg.value = "Colonnes bleues = AUCUN médecin reconnu parmi les personnes de garde ce jour-là.";
    leg.font = { italic: true, color: { argb: "FF1F4E79" } };
  });
  await telechargerClasseur(wb, "horaires_reconnus_" + b.annee + "-" + String(b.mois).padStart(2, "0") + ".xlsx");
}

/* EXPORT 2 — Récapitulatif individuel : lignes = médecins, colonnes = jours,
   uniquement gardes / tours / congés / repos (pas la couverture des unités). */
const CODE_SHIFT = {
  garde_24h: "G24", garde_nuit: "GN", twe: "TWE", repos_garde: "RG", recup: "Repos", off: "Off",
  conge_annuel: "CA", conge_scientifique: "Sci", conge_extralegal: "EL",
};
const CODE_PREF = {
  conge_annuel: "CA", conge_extralegal: "EL", conge_scientifique: "Sci",
  indispo: "Ind", formation: "Form", autre: "Autre", off_clinic: "Off", recuperation: "Repos",
};

async function exporterExcelRecap() {
  if (typeof ExcelJS === "undefined") { window.alert("ExcelJS non chargé (vérifie ta connexion)."); return; }
  const b = bornesMoisAffiche();
  const { shifts, prefs } = await donneesMoisExport(b);
  const { data: meds } = await sb.from("doctors")
    .select("id, name, grade").neq("role", "admin").order("name", { ascending: true });
  const medecins = meds || [];
  const stats = (typeof compterParMedecin === "function") ? compterParMedecin(shifts) : {};

  const nbJours = new Date(b.annee, b.mois, 0).getDate();
  const ms = String(b.mois).padStart(2, "0");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Récap " + ms + "-" + b.annee);
  // Volets figés (noms + en-tête) et impression paysage ajustée.
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  ws.getColumn(1).width = 22;
  for (let j = 1; j <= nbJours; j++) ws.getColumn(1 + j).width = 6;
  ["Gardes", "WE", "Tours", "Off", "Repos", "Heures"].forEach((_, k) => { ws.getColumn(1 + nbJours + 1 + k).width = 9; });

  // En-tête.
  const head = ws.getRow(1);
  head.getCell(1).value = "Médecin"; head.getCell(1).font = { bold: true };
  styleCellule(head.getCell(1), XL.entete);
  for (let j = 1; j <= nbJours; j++) {
    const c = head.getCell(1 + j); c.value = j; c.font = { bold: true };
    styleCellule(c, XL.entete);
  }
  ["Gardes", "WE", "Tours", "Off", "Repos", "Heures"].forEach((lib, k) => {
    const c = head.getCell(1 + nbJours + 1 + k); c.value = lib; c.font = { bold: true };
    styleCellule(c, XL.entete);
  });

  // Index rapide : shift d'un médecin à une date (priorité au travail/garde).
  const parMedDate = {};
  shifts.forEach((s) => { parMedDate[s.doctor_id + "|" + s.date] = s; });

  medecins.forEach((m, r) => {
    const row = ws.getRow(2 + r);
    const lab = row.getCell(1); lab.value = m.name; lab.font = { bold: true };
    styleCellule(lab, GRADE_LABELS[m.grade] === "Résident" ? null : null);
    for (let j = 1; j <= nbJours; j++) {
      const iso = b.annee + "-" + ms + "-" + String(j).padStart(2, "0");
      const s = parMedDate[m.id + "|" + iso];
      let code = "";
      if (s) code = CODE_SHIFT[s.shift_type] || "";
      if (!code) {
        const p = prefs.find((x) => x.doctor_id === m.id && x.start_date <= iso && iso <= x.end_date && CODE_PREF[x.pref_type]);
        if (p) code = CODE_PREF[p.pref_type];
      }
      const c = row.getCell(1 + j);
      c.value = code || null;
      c.alignment = { horizontal: "center" };
      styleCellule(c, code ? XL.auto : null);
    }
    const st = stats[m.id] || { gardes: 0, weekends: 0, tours: 0, offs: 0, repos: 0, heures: 0 };
    [st.gardes, st.weekends, st.tours, st.offs, st.repos, st.heures].forEach((v, k) => {
      const c = row.getCell(1 + nbJours + 1 + k);
      c.value = v; c.alignment = { horizontal: "center" }; styleCellule(c, null);
    });
  });

  await telechargerClasseur(wb, "recap_individuel_" + b.annee + "-" + ms + ".xlsx");
}

if (exportPlanningBtn) exportPlanningBtn.addEventListener("click", exporterExcelPlanning);
if (exportTrimestreBtn) exportTrimestreBtn.addEventListener("click", exporterExcelTrimestre);
if (exportRecapBtn) exportRecapBtn.addEventListener("click", exporterExcelRecap);
if (exportReconnusBtn) exportReconnusBtn.addEventListener("click", exporterExcelReconnus);


/* ===================================================================== */
/* MODULE 6 — Admin : ajustements manuels, publication, compteurs        */
/* ===================================================================== */

/* Références DOM (Module 6). */
const planningStatut  = document.getElementById("planning-statut");
const ajouterShiftBtn = document.getElementById("ajouter-shift-btn");
const publierBtn      = document.getElementById("publier-btn");
const depublierBtn    = document.getElementById("depublier-btn");
const supprimerTrimBtn = document.getElementById("supprimer-trim-btn");
const restaurerTrimBtn = document.getElementById("restaurer-trim-btn");
const compteursTbody  = document.getElementById("compteurs-tbody");
const compteursTable  = document.getElementById("compteurs-table");
const compteursEmpty  = document.getElementById("compteurs-empty");
const compteursTotal  = document.getElementById("compteurs-total");
const compteursPorteeSel = document.getElementById("compteurs-portee");
if (compteursPorteeSel) compteursPorteeSel.addEventListener("change", () => {
  compteursPortee = compteursPorteeSel.value;
  compteursTrimCache = null; // re-chargé à la demande (données fraîches)
  majCompteurs();
});
const conflitsZone    = document.getElementById("conflits-zone");

/* Modale d'édition / d'ajout de shift. */
const shiftModal     = document.getElementById("shift-modal");
const shiftModalTit  = document.getElementById("shift-modal-titre");
const shiftForm      = document.getElementById("shift-form");
const sDate          = document.getElementById("s-date");
const sType          = document.getElementById("s-type");
const sDoctor        = document.getElementById("s-doctor");
const sPoste         = document.getElementById("s-poste");
const sEpingle       = document.getElementById("s-epingle");
const shiftFormMsg   = document.getElementById("shift-form-msg");
const deleteShiftBtn = document.getElementById("delete-shift-btn");
const cancelShiftBtn = document.getElementById("cancel-shift-btn");

/* État du planning du mois affiché (rempli par rafraichirPanneauAdmin). */
let planningMois = { annee: null, mois: null, schedule: null,
                     shifts: [], medecins: [], preferences: [], periodes: [] };
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

/* COMPTEUR CONGRÈS (SÉPARÉ du compteur général) — affiché SOUS le calendrier
   quand le mois affiché contient un congrès EN SEMAINE. Montre, par médecin, le
   nombre de jours de congrès TRAVAILLÉS (plus bas = plus de jours AU congrès) →
   permet de vérifier d'un coup d'œil que la répartition est juste pour tous. */
async function majCompteurCongres() {
  const box = document.getElementById("congres-compteur");
  if (!box || !calendrier) return;
  // Uniquement en vue calendrier (le compteur est « sous le mois »).
  if (vueActive !== "calendrier") { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const b = bornesMoisAffiche();
  let periodes = [];
  try { periodes = await periodesSur(b.debut, b.fin); } catch (e) { periodes = []; }
  const congres = (periodes || []).filter((p) => p.type === "congres");
  if (!congres.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  // Dates de congrès EN SEMAINE (lun-ven) à l'intérieur du mois affiché.
  // ⚠️ Avance de date en UTC STRICT (setUTCDate) — surtout PAS lendemainDe(),
  // qui mélange heure locale et toISOString() et peut renvoyer le MÊME jour en
  // fuseau positif (UTC+1/+2) → la boucle ne progresserait jamais (page figée).
  const jourSuivant = (s) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  const datesCongres = new Set();
  const labels = [];
  congres.forEach((p) => {
    labels.push(p.label || "Congrès");
    let cur = p.start_date < b.debut ? b.debut : p.start_date;
    const fin = p.end_date > b.fin ? b.fin : p.end_date;
    while (cur <= fin) {
      const jr = new Date(cur + "T00:00:00Z").getUTCDay(); // 0=dim … 6=sam
      if (jr >= 1 && jr <= 5) datesCongres.add(cur);
      cur = jourSuivant(cur);
    }
  });
  if (!datesCongres.size) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  // Shifts du mois → jours de congrès travaillés par médecin.
  const { data: shifts } = await sb.from("shifts")
    .select("date, shift_type, doctor_id").gte("date", b.debut).lte("date", b.fin);
  const travaille = (t) => t === "jour" || t === "garde_nuit" || t === "garde_24h" || t === "twe";
  const trav = {};
  (shifts || []).forEach((s) => {
    if (datesCongres.has(s.date) && travaille(s.shift_type))
      (trav[s.doctor_id] = trav[s.doctor_id] || new Set()).add(s.date);
  });
  const N = datesCongres.size;
  const meds = Object.values(carteMedecins).filter((m) => m.role !== "admin" && m.grade !== "pg");
  const lignes = meds.map((m) => ({
    nom: m.name || m.id,
    grade: (typeof GRADE_LABELS !== "undefined" && GRADE_LABELS[m.grade]) || m.grade || "",
    n: (trav[m.id] ? trav[m.id].size : 0),
  })).sort((x, y) => y.n - x.n || x.nom.localeCompare(y.nom));
  const moy = lignes.length ? (lignes.reduce((a, x) => a + x.n, 0) / lignes.length) : 0;
  let html = '<div class="cc-titre">🎓 Compteur congrès — ' + labels.join(", ") +
    ' (' + N + ' jour' + (N > 1 ? 's' : '') + ' de semaine ce mois)' +
    '<span class="cc-sous">jours travaillés / médecin — plus bas = plus présent au congrès · moyenne ' + moy.toFixed(1) + '</span></div>';
  html += '<table class="data-table cc-table"><thead><tr><th>Médecin</th><th>Grade</th><th>Jours travaillés (sur ' + N + ')</th></tr></thead><tbody>';
  lignes.forEach((l) => {
    const cls = (l.n - moy > 1.0) ? ' class="cc-fort"' : (moy - l.n > 1.0 ? ' class="cc-faible"' : '');
    html += '<tr' + cls + '><td>' + l.nom + '</td><td>' + l.grade + '</td><td>' + l.n + '</td></tr>';
  });
  html += '</tbody></table>';
  box.innerHTML = html;
  box.classList.remove("hidden");
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
    .select("id, date, shift_type, doctor_id, schedule_id, poste, epingle")
    .gte("date", b.debut).lte("date", b.fin);
  planningMois.shifts = shifts || [];

  // 3) Médecins planifiables (hors admin) + 4) préférences du mois.
  const { data: meds } = await sb.from("doctors")
    .select("id, name, grade, fte, contract_start, contract_end, weekly_hours_target, jours_travailles, statut, contract_periods, admin_level, unite_reference, nouvel_engage, cap_fromager")
    .neq("role", "admin").order("name", { ascending: true });
  planningMois.medecins = meds || [];

  // Préférences APPROUVÉES du mois (les demandes en attente/refusées
  // n'influencent pas la validation du planning).
  const { data: prefs } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, date_compensation")
    .eq("status", "approuve")
    .lte("start_date", b.fin).gte("end_date", b.debut);
  planningMois.preferences = prefs || [];

  // 5) Congrès & fermetures d'unités chevauchant le mois (Module 17) :
  //    utilisés par validerPlanning (couverture assouplie / unités fermées).
  planningMois.periodes = await periodesSur(b.debut, b.fin);

  majStatutEtBoutons();
  majCompteurs();
  majConflits();
  chargerDemandes();
  chargerPeriodes(); // tableau « Congrès & fermetures » (toutes périodes)
  if (vueActive === "grille") construireGrille();
}

/* ===================================================================== */
/* MODULE 10 — Validation des demandes (admin)                           */
/* ===================================================================== */

const demandesTable   = document.getElementById("demandes-table");
const demandesTbody   = document.getElementById("demandes-tbody");
const demandesEmpty   = document.getElementById("demandes-empty");
const refreshDemandesBtn = document.getElementById("refresh-demandes-btn");

let demandesEnAttente = []; // cache des demandes en attente (toutes périodes)

/* Charge toutes les demandes en attente (tous médecins) et les affiche. */
async function chargerDemandes() {
  if (!medecinCourant || medecinCourant.role !== "admin") return;
  if (!Object.keys(carteMedecins).length) await chargerCarteMedecins();

  const { data, error } = await sb.from("preferences")
    .select("id, doctor_id, start_date, end_date, pref_type, note, status, date_compensation")
    .eq("status", "en_attente")
    .order("start_date", { ascending: true });

  if (error) { console.error("Erreur chargement demandes :", error); return; }
  demandesEnAttente = data || [];
  rendreDemandes(demandesEnAttente);

  // Demandes déjà VALIDÉES, période non terminée → révocables (révision).
  const ajd = new Date().toISOString().slice(0, 10);
  const { data: validees } = await sb.from("preferences")
    .select("id, doctor_id, start_date, end_date, pref_type, note, status, date_compensation")
    .eq("status", "approuve")
    .gte("end_date", ajd)
    .order("start_date", { ascending: true })
    .limit(200);
  rendreDemandesValidees(validees || []);

  // Demandes REFUSÉES / RÉVOQUÉES → suppression définitive possible.
  const { data: refusees } = await sb.from("preferences")
    .select("id, doctor_id, start_date, end_date, pref_type, note, status, date_compensation")
    .eq("status", "refuse")
    .order("start_date", { ascending: true })
    .limit(500);
  rendreDemandesRefusees(refusees || []);

  // Compteurs de congés par médecin (vue admin).
  chargerCompteursConges();
  chargerCompteursCongesPG();
}

/* COMPTEURS PG / FELLOW — vue ADMIN. Quota par TRIMESTRE CIVIL du mois affiché
   (PG ULB 10 j ouvrés / Fellow 20 j ; congé + recherche clinique combinés). */
async function chargerCompteursCongesPG() {
  const tbody = document.getElementById("conges-pg-tbody");
  if (!tbody) return;
  const table = document.getElementById("conges-pg-table");
  const empty = document.getElementById("conges-pg-empty");
  const titre = document.getElementById("conges-pg-titre");
  // Trimestre civil du MOIS AFFICHÉ.
  const refAff = (typeof calendrier !== "undefined" && calendrier && typeof calendrier.getDate === "function")
    ? calendrier.getDate() : new Date();
  const isoAff = refAff.getFullYear() + "-" + String(refAff.getMonth() + 1).padStart(2, "0") + "-15";
  const tri = pgTrimBornes(isoAff);
  const qNum = parseInt(tri.key.slice(-1)) + 1;
  const triLisible = "T" + qNum + " " + tri.key.slice(0, 4);
  if (titre) titre.textContent = "Compteurs PG / Fellow — " + triLisible;

  const { data: docs, error: e1 } = await sb.from("doctors")
    .select("id, name, pg_type").eq("grade", "pg").order("name", { ascending: true });
  if (e1) { console.error("Compteurs PG :", e1); return; }
  const { data: prefs, error: e2 } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, status")
    .neq("status", "refuse")
    .lte("start_date", tri.end).gte("end_date", tri.start);
  if (e2) { console.error("Compteurs PG :", e2); return; }

  // Jours ouvrés de congé (catégorie reconnue) dans les bornes du trimestre, par PG.
  const conso = {};
  (prefs || []).forEach((p) => {
    if (!categorieConge(p.pref_type)) return; // garde_pg, indispo… non comptés
    const d1 = p.start_date > tri.start ? p.start_date : tri.start;
    const d2 = p.end_date   < tri.end   ? p.end_date   : tri.end;
    conso[p.doctor_id] = (conso[p.doctor_id] || 0) + pgJoursOuvres(d1, d2);
  });

  tbody.innerHTML = "";
  const liste = docs || [];
  if (table) table.classList.toggle("hidden", liste.length === 0);
  if (empty) empty.classList.toggle("hidden", liste.length > 0);
  liste.forEach((d) => {
    const fellow = d.pg_type === "fellow";
    const quota = fellow ? PG_CONGE_TRIM_FELLOW : PG_CONGE_TRIM_ULB;
    const used = conso[d.id] || 0;
    const reste = Math.max(0, quota - used);
    const tr = document.createElement("tr");
    [d.name || "?", fellow ? "Fellow" : "PG ULB", triLisible, String(used), String(quota), reste + " j"]
      .forEach((v, i) => {
        const td = document.createElement("td"); td.textContent = v;
        if (i === 3 && used > quota) { td.className = "depasse"; td.title = "Quota dépassé"; }
        tr.appendChild(td);
      });
    tbody.appendChild(tr);
  });
}

/* COMPTEURS DE CONGÉS — vue ADMIN (révision 2026-06-13) : consommation des
   quotas par médecin sur l'année académique EN COURS. Jours OUVRÉS approuvés
   (+ en attente, à titre indicatif) / quota proratisé au contrat — mêmes
   règles de calcul que le compteur personnel du médecin. */
async function chargerCompteursConges() {
  const tbody = document.getElementById("conges-admin-tbody");
  if (!tbody) return;
  const table = document.getElementById("conges-admin-table");
  const empty = document.getElementById("conges-admin-empty");
  const titre = document.getElementById("conges-admin-titre");
  // Suit l'année académique du MOIS AFFICHÉ (comme le compteur médecin), sinon
  // un congé validé pour un trimestre d'une AUTRE année académique que celle du
  // jour n'était ni récupéré ni compté (révision 2026-06-15).
  const acad = (typeof anneeAcademiqueAffichee === "function") ? anneeAcademiqueAffichee() : anneeAcademique(new Date());
  if (titre) titre.textContent = "Compteurs de congés — année académique " + acad + "–" + (acad + 1);
  const debA = acad + "-10-01", finA = (acad + 1) + "-09-30";

  const { data: docs, error: e1 } = await sb.from("doctors")
    .select("id, name, role, fte, contract_start, contract_end, quota_conge_annuel, quota_conge_extralegal, quota_conge_scientifique")
    .neq("role", "admin")
    .neq("grade", "pg")
    .order("name", { ascending: true });
  if (e1) { console.error("Compteurs congés admin :", e1); return; }
  const { data: prefs, error: e2 } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, status")
    .neq("status", "refuse")
    .lte("start_date", finA).gte("end_date", debA);
  if (e2) { console.error("Compteurs congés admin :", e2); return; }

  const TYPES = ["conge_annuel", "conge_extralegal", "conge_scientifique"];
  const conso = {}; // id -> { type -> { ok, att } }
  (prefs || []).forEach((p) => {
    const cat = categorieConge(p.pref_type);
    if (!cat) return;
    const jours = joursOuvresDansAnnee(p.start_date, p.end_date, acad);
    if (!jours) return;
    const c = (conso[p.doctor_id] = conso[p.doctor_id] || {});
    const t = (c[cat] = c[cat] || { ok: 0, att: 0 });
    if (p.status === "approuve") t.ok += jours; else t.att += jours;
  });

  tbody.innerHTML = "";
  const liste = docs || [];
  if (table) table.classList.toggle("hidden", liste.length === 0);
  if (empty) empty.classList.toggle("hidden", liste.length > 0);
  liste.forEach((d) => {
    const tr = document.createElement("tr");
    const tdN = document.createElement("td"); tdN.textContent = d.name || "?"; tr.appendChild(tdN);
    let restantTotal = 0;
    TYPES.forEach((type) => {
      const quota = Math.round(quotaBase(d, type) * fteDe(d));
      const c = (conso[d.id] && conso[d.id][type]) || { ok: 0, att: 0 };
      restantTotal += Math.max(0, quota - c.ok);
      const td = document.createElement("td");
      td.textContent = c.ok + (c.att ? " (+" + c.att + ")" : "") + " / " + quota;
      if (c.ok > quota) { td.className = "depasse"; td.title = "Quota dépassé"; }
      else if (c.att && c.ok + c.att > quota) { td.title = "Dépasserait le quota si les demandes en attente sont approuvées"; }
      tr.appendChild(td);
    });
    const tdR = document.createElement("td");
    tdR.textContent = restantTotal + " j";
    tdR.style.fontWeight = "600";
    tr.appendChild(tdR);
    tbody.appendChild(tr);
  });
}

/* Tableau des demandes APPROUVÉES à venir, avec bouton « Révoquer ». */
function rendreDemandesValidees(demandes) {
  const tbody = document.getElementById("demandes-validees-tbody");
  const table = document.getElementById("demandes-validees-table");
  const empty = document.getElementById("demandes-validees-empty");
  if (!tbody) return;
  tbody.innerHTML = "";
  const vide = demandes.length === 0;
  if (table) table.classList.toggle("hidden", vide);
  if (empty) empty.classList.toggle("hidden", !vide);
  demandes.forEach((d) => {
    const tr = document.createElement("tr");
    const med = carteMedecins[d.doctor_id] || {};
    const noteAff = (d.pref_type === "travailler_ferie" && d.date_compensation)
      ? ("récup : " + d.date_compensation + (d.note ? " · " + d.note : ""))
      : (d.note || "—");
    [med.name || "?", PREF_LABELS_FULL[d.pref_type] || d.pref_type,
     d.start_date, d.end_date, noteAff].forEach((v) => {
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    });
    const tdA = document.createElement("td");
    tdA.className = "actions-cell";
    const rv = document.createElement("button");
    rv.textContent = "Révoquer"; rv.className = "mini danger";
    rv.addEventListener("click", () => {
      const lib = (med.name || "?") + " — " + (PREF_LABELS_FULL[d.pref_type] || d.pref_type) +
        " du " + d.start_date + " au " + d.end_date;
      if (!window.confirm("Révoquer cette demande validée ?\n\n" + lib +
        "\n\nElle repassera en REFUSÉ. Si un planning en tenait compte, pense à le régénérer.")) return;
      deciderDemande(d.id, "refuse");
    });
    tdA.appendChild(rv);
    tr.appendChild(tdA);
    tbody.appendChild(tr);
  });
}

/* Tableau des demandes REFUSÉES / RÉVOQUÉES, avec suppression définitive
   (efface la ligne en base → disparaît aussi côté demandeur). */
function rendreDemandesRefusees(demandes) {
  const tbody = document.getElementById("demandes-refusees-tbody");
  const table = document.getElementById("demandes-refusees-table");
  const empty = document.getElementById("demandes-refusees-empty");
  const btnAll = document.getElementById("suppr-refusees-btn");
  if (!tbody) return;
  tbody.innerHTML = "";
  const vide = demandes.length === 0;
  if (table) table.classList.toggle("hidden", vide);
  if (empty) empty.classList.toggle("hidden", !vide);
  if (btnAll) btnAll.classList.toggle("hidden", vide);
  demandes.forEach((d) => {
    const tr = document.createElement("tr");
    const med = carteMedecins[d.doctor_id] || {};
    const noteAff = (d.pref_type === "travailler_ferie" && d.date_compensation)
      ? ("récup : " + d.date_compensation + (d.note ? " · " + d.note : ""))
      : (d.note || "—");
    [med.name || "?", PREF_LABELS_FULL[d.pref_type] || d.pref_type,
     d.start_date, d.end_date, noteAff].forEach((v) => {
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    });
    const tdA = document.createElement("td");
    tdA.className = "actions-cell";
    const del = document.createElement("button");
    del.textContent = "Supprimer"; del.className = "mini danger";
    del.addEventListener("click", async () => {
      const lib = (med.name || "?") + " — " + (PREF_LABELS_FULL[d.pref_type] || d.pref_type) +
        " du " + d.start_date + " au " + d.end_date;
      if (!window.confirm("Supprimer définitivement cette demande refusée ?\n\n" + lib)) return;
      const { error } = await sb.from("preferences").delete().eq("id", d.id);
      if (error) { window.alert("Erreur : " + error.message); return; }
      await chargerDemandes();
    });
    tdA.appendChild(del);
    tr.appendChild(tdA);
    tbody.appendChild(tr);
  });
}

/* Construit le tableau des demandes en attente avec boutons Approuver/Refuser. */
function rendreDemandes(demandes) {
  if (!demandesTbody) return;
  demandesTbody.innerHTML = "";
  const vide = demandes.length === 0;
  demandesTable.classList.toggle("hidden", vide);
  demandesEmpty.classList.toggle("hidden", !vide);

  // Pastille de comptage sur l'onglet « Demandes ».
  const badge = document.getElementById("tab-badge-demandes");
  if (badge) {
    badge.textContent = demandes.length;
    badge.classList.toggle("hidden", vide);
  }

  demandes.forEach((d) => {
    const tr = document.createElement("tr");
    const med = carteMedecins[d.doctor_id] || {};
    const cells = [
      med.name || "?",
      PREF_LABELS_FULL[d.pref_type] || d.pref_type,
      d.start_date, d.end_date, d.note || "—",
    ];
    cells.forEach((v) => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });

    const tdA = document.createElement("td");
    tdA.className = "actions-cell";
    const ok = document.createElement("button");
    ok.textContent = "Approuver"; ok.className = "mini";
    ok.addEventListener("click", () => deciderDemande(d.id, "approuve"));
    const no = document.createElement("button");
    no.textContent = "Refuser"; no.className = "mini danger";
    no.addEventListener("click", () => deciderDemande(d.id, "refuse"));
    tdA.appendChild(ok); tdA.appendChild(no);
    tr.appendChild(tdA);
    demandesTbody.appendChild(tr);
  });
}

/* Approuve ou refuse une demande, puis rafraîchit panneau + calendrier. */
async function deciderDemande(id, status) {
  const { error } = await sb.from("preferences")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) { window.alert("Erreur : " + error.message); return; }
  await chargerDemandes();
  if (calendrier) calendrier.refetchEvents();
  rafraichirPanneauAdmin();
}

if (refreshDemandesBtn) refreshDemandesBtn.addEventListener("click", chargerDemandes);

/* Purge ADMIN : supprime définitivement toutes les demandes refusées/révoquées. */
const supprRefuseesBtn = document.getElementById("suppr-refusees-btn");
if (supprRefuseesBtn) supprRefuseesBtn.addEventListener("click", async () => {
  if (!window.confirm("Supprimer DÉFINITIVEMENT toutes les demandes refusées / révoquées ?\n\nElles disparaîtront aussi côté demandeurs.")) return;
  const { error } = await sb.from("preferences").delete().eq("status", "refuse");
  if (error) { window.alert("Erreur : " + error.message); return; }
  await chargerDemandes();
});

/* Réinitialisation ADMIN : vide toutes les demandes EN ATTENTE + REFUSÉES de
   tous les médecins, sans passer par eux. Conserve les congés VALIDÉS. */
const resetDemandesBtn = document.getElementById("reset-demandes-btn");
if (resetDemandesBtn) resetDemandesBtn.addEventListener("click", async () => {
  if (!window.confirm("Mettre à VIERGE toutes les demandes EN ATTENTE et REFUSÉES de TOUS les médecins ?\n\nLes congés déjà VALIDÉS sont conservés. Action irréversible.")) return;
  const { error } = await sb.from("preferences").delete().in("status", ["en_attente", "refuse"]);
  if (error) { window.alert("Erreur : " + error.message); return; }
  await chargerDemandes();
  if (calendrier) calendrier.refetchEvents();
});

/* Nombre de demandes EN ATTENTE chevauchant une période [debut, fin].
   Sert à BLOQUER la génération tant que tout n'est pas validé (§8.3, §12). */
async function demandesEnAttenteSur(debut, fin) {
  const { data, error } = await sb.from("preferences")
    .select("id")
    .eq("status", "en_attente")
    .lte("start_date", fin).gte("end_date", debut);
  if (error) { console.error("Erreur vérif demandes en attente :", error); return 0; }
  return (data || []).length;
}

/* ===================================================================== */
/* MODULE 17 — Congrès & fermetures d'unités (saisie ADMIN, spec §1.3-1.4)*/
/* --------------------------------------------------------------------- */
/* - Congrès : couverture de jour ASSOUPLIE en semaine (regles.js →       */
/*   COUVERTURE.congres_postes_vides) ; l'admin coche les participants →  */
/*   une absence APPROUVÉE est créée pour chacun sur la période.          */
/* - Fermeture : l'unité choisie n'est ni pourvue ni exigée (génération   */
/*   + validation). Saisie réservée à l'admin (RLS, module17 SQL).        */
/* ===================================================================== */

const addPeriodeBtn      = document.getElementById("add-periode-btn");
const periodeForm        = document.getElementById("periode-form");
const spType             = document.getElementById("sp-type");
const spLabel            = document.getElementById("sp-label");
const spUnite            = document.getElementById("sp-unite");
const spUniteWrap        = document.getElementById("sp-unite-wrap");
const spStart            = document.getElementById("sp-start");
const spEnd              = document.getElementById("sp-end");
const spAbsType          = document.getElementById("sp-abstype");
const spAbsTypeWrap      = document.getElementById("sp-abstype-wrap");
const spParticipants     = document.getElementById("sp-participants");
const spParticipantsWrap = document.getElementById("sp-participants-wrap");
const cancelPeriodeBtn   = document.getElementById("cancel-periode-btn");
const periodeFormMsg     = document.getElementById("periode-form-msg");
const periodesTable      = document.getElementById("periodes-table");
const periodesTbody      = document.getElementById("periodes-tbody");
const periodesEmpty      = document.getElementById("periodes-empty");

const PERIODE_TYPE_LABELS = { congres: "Congrès", fermeture: "Fermeture d'unité" };

let periodesSpeciales = []; // cache de TOUTES les périodes (table admin)

function messagePeriode(texte, type = "error") {
  if (!periodeFormMsg) return;
  periodeFormMsg.textContent = texte;
  periodeFormMsg.className = "message " + type;
}

/* Charge toutes les périodes spéciales et les affiche dans le tableau. */
async function chargerPeriodes() {
  if (!medecinCourant || medecinCourant.role !== "admin") return;
  const { data, error } = await sb.from("special_periods")
    .select("id, type, label, unite, start_date, end_date")
    .order("start_date", { ascending: true });
  if (error) {
    // Table absente tant que module17_periodes_speciales.sql n'a pas été lancé.
    console.warn("Périodes spéciales indisponibles (lancer module17 SQL ?) :", error.message);
    return;
  }
  periodesSpeciales = data || [];
  rendrePeriodes();
}

function rendrePeriodes() {
  if (!periodesTbody) return;
  periodesTbody.innerHTML = "";
  const vide = periodesSpeciales.length === 0;
  periodesTable.classList.toggle("hidden", vide);
  periodesEmpty.classList.toggle("hidden", !vide);

  periodesSpeciales.forEach((p) => {
    const tr = document.createElement("tr");
    const cells = [
      PERIODE_TYPE_LABELS[p.type] || p.type,
      p.label,
      p.unite ? (POSTE_LABELS[p.unite] || p.unite) : "—",
      p.start_date, p.end_date,
    ];
    cells.forEach((v) => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
    const tdA = document.createElement("td");
    tdA.className = "actions-cell";
    const sup = document.createElement("button");
    sup.textContent = "Supprimer"; sup.className = "mini danger";
    sup.addEventListener("click", () => supprimerPeriode(p));
    tdA.appendChild(sup);
    tr.appendChild(tdA);
    periodesTbody.appendChild(tr);
  });
}

/* Adapte le formulaire au type choisi : fermeture → unité.
   Congrès → ni participants ni type d'absence (la participation ne crée plus
   d'absence bloquante : l'algo génère l'équipe minimale, le reste va au congrès). */
function majChampsPeriode() {
  const congres = spType.value === "congres";
  spUniteWrap.classList.toggle("hidden", congres);   // unité : seulement pour une fermeture
  spAbsTypeWrap.classList.add("hidden");
  spParticipantsWrap.classList.add("hidden");
}
if (spType) spType.addEventListener("change", majChampsPeriode);

/* Remplit le sélecteur d'unités depuis POSTES_JOUR (regles.js). */
function remplirSelectUnites() {
  spUnite.innerHTML = "";
  (typeof POSTES_JOUR !== "undefined" ? POSTES_JOUR : []).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.code; opt.textContent = p.label;
    spUnite.appendChild(opt);
  });
}

/* Cases à cocher des participants (tous les médecins planifiables). */
async function remplirParticipants() {
  spParticipants.innerHTML = "";
  const { data: meds } = await sb.from("doctors")
    .select("id, name").neq("role", "admin").order("name", { ascending: true });
  (meds || []).forEach((m) => {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.className = "sp-part"; cb.value = m.id;
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(" " + m.name));
    spParticipants.appendChild(lab);
  });
}

if (addPeriodeBtn) addPeriodeBtn.addEventListener("click", async () => {
  periodeForm.classList.remove("hidden");
  messagePeriode("");
  periodeForm.reset();
  remplirSelectUnites();
  await remplirParticipants();
  majChampsPeriode();
});
if (cancelPeriodeBtn) cancelPeriodeBtn.addEventListener("click", () => {
  periodeForm.classList.add("hidden");
});

/* Note utilisée pour retrouver les absences créées par un congrès. */
function notePourCongres(label) { return "Congrès : " + label; }

if (periodeForm) periodeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  messagePeriode("");

  const type = spType.value;
  const label = spLabel.value.trim();
  const start = spStart.value, end = spEnd.value;
  if (!label || !start || !end) return messagePeriode("Libellé et dates obligatoires.");
  if (end < start) return messagePeriode("La date de fin précède la date de début.");
  if (type === "fermeture" && !spUnite.value) return messagePeriode("Choisis l'unité à fermer.");

  const ligne = {
    type, label,
    unite: type === "fermeture" ? spUnite.value : null,
    start_date: start, end_date: end,
  };
  const { error } = await sb.from("special_periods").insert(ligne);
  if (error) return messagePeriode("Erreur : " + error.message);

  // CONGRÈS : on ne crée PLUS d'absences bloquantes pour les participants.
  // Tout le monde peut participer, mais un horaire DOIT pouvoir être généré :
  // pendant le congrès, l'algo produit une ÉQUIPE MINIMALE (2 gardes forcées en
  // 24 h + tolérance de stations vides) à partir de TOUS les médecins ; ceux qui
  // ne sont pas planifiés ce jour-là vont au congrès. La participation n'est donc
  // pas une absence (elle ne bloque pas le fait d'être dans l'horaire).

  periodeForm.classList.add("hidden");
  await chargerPeriodes();
  if (calendrier) calendrier.refetchEvents();
  rafraichirPanneauAdmin();
});

/* Supprime une période ; pour un congrès, propose de supprimer aussi les
   absences créées automatiquement (repérées par leur note + leurs dates). */
async function supprimerPeriode(p) {
  if (!window.confirm("Supprimer « " + p.label + " » (" + p.start_date + " → " + p.end_date + ") ?")) return;

  const { error } = await sb.from("special_periods").delete().eq("id", p.id);
  if (error) { window.alert("Erreur : " + error.message); return; }

  if (p.type === "congres") {
    const { data: liees } = await sb.from("preferences")
      .select("id")
      .eq("note", notePourCongres(p.label))
      .eq("start_date", p.start_date).eq("end_date", p.end_date);
    if (liees && liees.length &&
        window.confirm("Supprimer aussi les " + liees.length + " absence(s) de participants créée(s) pour ce congrès ?")) {
      await sb.from("preferences").delete().in("id", liees.map((x) => x.id));
    }
  }

  await chargerPeriodes();
  if (calendrier) calendrier.refetchEvents();
  rafraichirPanneauAdmin();
}

/* Périodes spéciales chevauchant [debut, fin] — pour la génération/validation.
   Renvoie [] si la table n'existe pas encore (module17 SQL non lancé). */
async function periodesSur(debut, fin) {
  const { data, error } = await sb.from("special_periods")
    .select("type, label, unite, start_date, end_date")
    .lte("start_date", fin).gte("end_date", debut);
  if (error) { console.warn("Périodes spéciales indisponibles :", error.message); return []; }
  return data || [];
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

/* Colonnes du tableau des compteurs. `num` = colonne numérique (tri arithmétique,
   ordre décroissant en premier clic) ; `tri:false` = colonne non triable (le #). */
const COMPTEURS_COLS = [
  { key: "num",      label: "#",            tri: false },
  { key: "name",     label: "Médecin",      num: false },
  { key: "grade",    label: "Grade",        num: false },
  { key: "heures",   label: "Heures",       num: true },
  { key: "cible",    label: "Cible",        num: true },
  // Moyenne horaire HEBDOMADAIRE EFFECTIVE : heures réelles ÷ semaines de
  // présence (les semaines de congé accepté sont déduites du dénominateur).
  { key: "moyHebdo", label: "Moy. h/sem",   num: true },
  { key: "gardes",   label: "Gardes",       num: true },
  { key: "weekends", label: "Week-ends",    num: true },
  { key: "tours",    label: "Tours",        num: true },
  // Diagnostic mi-temps : journées de STATION en semaine (hors gardes).
  { key: "joursSemaine", label: "Jours sem.", num: true },
  { key: "offs",     label: "Off",          num: true },
  // Compteurs INFORMATIFS (non limitants) :
  { key: "reposGarde",   label: "Repos g.",  num: true },
  { key: "nonPlanifies", label: "Non plan.", num: true },
];

/* État de tri du tableau des compteurs : colonne + direction (1 asc / -1 desc).
   Par défaut : tri alphabétique des médecins (croissant). */
let compteursTri = { col: "name", dir: 1 };

/* (Re)construit l'en-tête : libellés cliquables + flèche de tri sur la colonne active. */
function rendreEnteteCompteurs() {
  const thead = compteursTable.querySelector("thead");
  if (!thead) return;
  const tr = document.createElement("tr");
  COMPTEURS_COLS.forEach((c) => {
    const th = document.createElement("th");
    const actif = compteursTri.col === c.key;
    th.textContent = c.label + (actif ? (compteursTri.dir === 1 ? " ▲" : " ▼") : "");
    if (c.tri !== false) {
      th.classList.add("triable");
      if (actif) th.classList.add("tri-actif");
      th.addEventListener("click", () => {
        if (compteursTri.col === c.key) {
          compteursTri.dir *= -1;                 // même colonne → on inverse le sens
        } else {
          compteursTri.col = c.key;
          compteursTri.dir = c.num ? -1 : 1;       // numérique → décroissant d'abord ; texte → croissant
        }
        majCompteurs();
      });
    }
    tr.appendChild(th);
  });
  thead.innerHTML = "";
  thead.appendChild(tr);
}

/* PORTÉE des compteurs : « mois » (données du mois affiché) ou « trimestre »
   (cumul du trimestre civil du mois affiché, chargé à la demande). */
let compteursPortee = "mois";
let compteursTrimCache = null; // { cle, shifts, preferences, debut, fin }

async function chargerCompteursTrimestre() {
  const trimestre = Math.floor((planningMois.mois - 1) / 3) + 1;
  const cle = planningMois.annee + "-T" + trimestre;
  if (compteursTrimCache && compteursTrimCache.cle === cle) return compteursTrimCache;
  const m1 = (trimestre - 1) * 3 + 1;
  const debut = bornesMois(planningMois.annee, m1).debut;
  const fin = bornesMois(planningMois.annee, m1 + 2).fin;
  const { data: sh } = await sb.from("shifts")
    .select("date, shift_type, poste, doctor_id")
    .gte("date", debut).lte("date", fin);
  const { data: prefs } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, date_compensation")
    .eq("status", "approuve").lte("start_date", fin).gte("end_date", debut);
  compteursTrimCache = { cle, shifts: sh || [], preferences: prefs || [], debut, fin };
  return compteursTrimCache;
}

/* Tableau des compteurs heures / gardes / week-ends par médecin.
   Colonne « # » (numéro de liste → le dernier numéro = total de médecins),
   total affiché, et tri croissant/décroissant au clic sur chaque colonne.
   Portée MOIS (défaut) ou TRIMESTRE (sélecteur). */
async function majCompteurs() {
  // Source des données selon la portée.
  let srcShifts = planningMois.shifts, srcPrefs = planningMois.preferences || [];
  const nbJoursMois = new Date(planningMois.annee, planningMois.mois, 0).getDate();
  const ms0 = String(planningMois.mois).padStart(2, "0");
  let srcDebut = planningMois.annee + "-" + ms0 + "-01";
  let srcFin = planningMois.annee + "-" + ms0 + "-" + String(nbJoursMois).padStart(2, "0");
  if (compteursPortee === "trimestre") {
    try {
      const c = await chargerCompteursTrimestre();
      srcShifts = c.shifts; srcPrefs = c.preferences; srcDebut = c.debut; srcFin = c.fin;
    } catch (e) { /* repli silencieux sur le mois */ }
  }
  const titre = document.getElementById("compteurs-titre");
  if (titre) titre.textContent = compteursPortee === "trimestre" ? "Compteurs du trimestre" : "Compteurs du mois";

  const stats = compterParMedecin(srcShifts);
  const meds = planningMois.medecins;
  compteursTbody.innerHTML = "";

  const vide = srcShifts.length === 0;
  compteursTable.classList.toggle("hidden", vide);
  compteursEmpty.classList.toggle("hidden", !vide);
  if (compteursTotal) compteursTotal.classList.toggle("hidden", vide);
  if (vide) return;

  // Nombre de semaines (approx.) de la période pour estimer la cible.
  const nbJours = Math.round((new Date(srcFin + "T00:00:00Z") - new Date(srcDebut + "T00:00:00Z")) / 86400000) + 1;
  const semaines = nbJours / 7;

  // --- Congés ACCEPTÉS du mois → réduisent la cible horaire (révision) ---
  // Un jour de congé accepté retire au médecin sa charge quotidienne attendue
  // (= cible hebdo / nb de jours travaillables) : une semaine entière de congé
  // diminue donc la cible d'exactement une semaine. On rassemble les jours de
  // congé depuis les préférences APPROUVÉES et depuis les shifts d'absence
  // « congé » du planning (dédupliqués par date).
  const debutMois = srcDebut, finMois = srcFin; // bornes de la PÉRIODE (mois ou trimestre)
  // Absences qui RÉDUISENT la cible et la moyenne h/sem (le médecin n'était pas
  // disponible ces jours-là). Inclut le CONGÉ MALADIE (posé comme préférence par
  // l'assistant CM) + formation/autre, qui bloquent aussi la disponibilité à la
  // génération — sinon un médecin absent apparaît à tort très sous sa cible.
  const CONGE_SET = new Set(["conge", "conge_annuel", "conge_extralegal", "conge_scientifique", "conge_maladie", "formation", "autre"]);
  const congeJours = {}; // doctorId -> Set(dateISO) des jours de congé du mois
  const ajouterConge = (id, date) => {
    if (date < debutMois || date > finMois) return;
    (congeJours[id] = congeJours[id] || new Set()).add(date);
  };
  (srcPrefs || []).forEach((p) => {
    if (!CONGE_SET.has(p.pref_type)) return;
    const deb = p.start_date < debutMois ? debutMois : p.start_date;
    const fin = p.end_date > finMois ? finMois : p.end_date;
    const d = new Date(deb + "T00:00:00Z");
    const dFin = new Date(fin + "T00:00:00Z");
    while (d <= dFin) { ajouterConge(p.doctor_id, d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  });
  (srcShifts || []).forEach((s) => {
    if (CONGE_SET.has(s.shift_type)) ajouterConge(s.doctor_id, s.date);
  });

  // --- Jours NON PLANIFIÉS (informatif) : jours ouvrés sous contrat, jour
  //     travaillable, SANS aucun shift et hors congé accepté. ---
  const datesParMed = {}; // id -> Set(dates avec un shift, tous types)
  (srcShifts || []).forEach((s) => {
    (datesParMed[s.doctor_id] = datesParMed[s.doctor_id] || new Set()).add(s.date);
  });
  const joursOuvresPeriode = [];
  { let d = new Date(srcDebut + "T00:00:00Z");
    const fx = new Date(srcFin + "T00:00:00Z");
    while (d <= fx) {
      const iso = d.toISOString().slice(0, 10);
      if (typeof plEstWeekendOuFerie !== "function" || !plEstWeekendOuFerie(iso)) joursOuvresPeriode.push(iso);
      d.setUTCDate(d.getUTCDate() + 1);
    } }
  const compterNonPlanifies = (m) => {
    const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
    let n = 0;
    joursOuvresPeriode.forEach((d) => {
      const j = new Date(d + "T00:00:00Z").getUTCDay() || 7;
      if (!jt.includes(j)) return;
      if (m.contract_start && d < m.contract_start) return;
      if (m.contract_end && d > m.contract_end) return;
      if (datesParMed[m.id] && datesParMed[m.id].has(d)) return;
      if (congeJours[m.id] && congeJours[m.id].has(d)) return;
      n++;
    });
    return n;
  };

  // 1) Données par médecin (toutes les colonnes, prêtes au tri).
  const lignes = meds.map((m) => {
    const st = stats[m.id] || { heures: 0, gardes: 0, weekends: 0, tours: 0, offs: 0, repos: 0, reposGarde: 0, joursSemaine: 0 };
    const cibleHebdo = m.weekly_hours_target || 52;
    const jt = (m.jours_travailles && m.jours_travailles.length) ? m.jours_travailles : [1, 2, 3, 4, 5, 6, 7];
    // Jours de congé tombant sur un jour travaillable du médecin.
    let joursConge = 0;
    if (congeJours[m.id]) congeJours[m.id].forEach((date) => {
      const j = new Date(date + "T00:00:00Z").getUTCDay();
      if (jt.includes(j === 0 ? 7 : j)) joursConge++;
    });
    const cibleBrute = cibleHebdo * semaines;
    const reduction = joursConge * (cibleHebdo / jt.length);
    // Moyenne horaire hebdo EFFECTIVE : heures ÷ semaines de présence
    // (période − équivalent-semaines de congé accepté).
    const semainesEff = Math.max(semaines - joursConge / Math.max(jt.length, 1), 0);
    const moyHebdo = semainesEff > 0.2 ? Math.round((st.heures / semainesEff) * 10) / 10 : 0;
    return {
      name: m.name || "", grade: GRADE_LABELS[m.grade] || m.grade || "",
      gradeCode: m.grade, // pour la pastille colorée
      heures: st.heures, cible: Math.max(0, Math.round(cibleBrute - reduction)), moyHebdo,
      cibleBrute: Math.round(cibleBrute), reductionConge: Math.round(reduction), joursConge,
      gardes: st.gardes, weekends: st.weekends, tours: st.tours, joursSemaine: st.joursSemaine || 0, offs: st.offs, repos: st.repos,
      reposGarde: st.reposGarde || 0, nonPlanifies: compterNonPlanifies(m),
    };
  });

  // 2) Tri selon l'état courant (départage stable par nom).
  const col = COMPTEURS_COLS.find((c) => c.key === compteursTri.col) || COMPTEURS_COLS[1];
  lignes.sort((a, b) => {
    let r = col.num
      ? (a[col.key] || 0) - (b[col.key] || 0)
      : String(a[col.key]).localeCompare(String(b[col.key]), "fr");
    if (r === 0) r = String(a.name).localeCompare(String(b.name), "fr");
    return r * compteursTri.dir;
  });

  // 3) En-tête (flèche de tri) + corps (numéro de liste + valeurs).
  rendreEnteteCompteurs();
  lignes.forEach((lg, i) => {
    const tr = document.createElement("tr");
    const tdNum = document.createElement("td"); tdNum.textContent = i + 1; tdNum.className = "num-liste"; tr.appendChild(tdNum);
    const tdNom = document.createElement("td"); tdNom.textContent = lg.name; tr.appendChild(tdNom);
    // Grade en pastille colorée (résident = mauve, A/S = sarcelle).
    const tdGrade = document.createElement("td");
    const badgeG = document.createElement("span");
    badgeG.className = "badge " + (lg.gradeCode === "resident" ? "badge-grade-resident" : "badge-grade-as");
    badgeG.textContent = lg.grade;
    tdGrade.appendChild(badgeG);
    tr.appendChild(tdGrade);
    const tdH = document.createElement("td");
    tdH.textContent = lg.heures + " h";
    tdH.className = lg.heures > lg.cible ? "depasse" : "ok";
    tr.appendChild(tdH);
    const tdCible = document.createElement("td");
    tdCible.textContent = lg.cible + " h";
    if (lg.reductionConge > 0) {
      // Cible réduite par les congés acceptés : on l'indique (valeur + infobulle).
      tdCible.textContent = lg.cible + " h *";
      tdCible.title = "Cible brute " + lg.cibleBrute + " h − " + lg.reductionConge +
                      " h de congés acceptés (" + lg.joursConge + " j).";
      tdCible.classList.add("cible-reduite");
    }
    tr.appendChild(tdCible);
    const tdMoy = document.createElement("td");
    tdMoy.textContent = lg.moyHebdo ? lg.moyHebdo + " h" : "—";
    tdMoy.title = "Heures réelles ÷ semaines de présence (congés acceptés déduits).";
    tr.appendChild(tdMoy);
    [lg.gardes, lg.weekends, lg.tours, lg.joursSemaine, lg.offs, lg.reposGarde, lg.nonPlanifies].forEach((v) => {
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    });
    compteursTbody.appendChild(tr);
  });

  // 4) Total de médecins listés.
  if (compteursTotal) {
    compteursTotal.textContent = "Total : " + lignes.length + " médecin" + (lignes.length > 1 ? "s" : "");
  }
}

/* Liste des conflits du mois (via la fonction pure validerPlanning). */
function calculerConflitsMois(shifts) {
  return validerPlanning({
    annee: planningMois.annee, mois: planningMois.mois,
    shifts, medecins: planningMois.medecins, preferences: planningMois.preferences,
    periodes: planningMois.periodes, // congrès / fermetures (M17)
  });
}

function majConflits() {
  const conflits = calculerConflitsMois(planningMois.shifts);
  // §14 — alertes « absences simultanées » (informatif, sévérité colorée).
  const alertesAbs = (typeof alertesAbsences === "function")
    ? alertesAbsences({
        annee: planningMois.annee, mois: planningMois.mois,
        medecins: planningMois.medecins, preferences: planningMois.preferences,
        shifts: planningMois.shifts,
      })
    : [];
  if (planningMois.shifts.length === 0) {
    conflitsZone.textContent = "Aucun planning chargé pour ce mois.";
    conflitsZone.className = "zone-info";
    return;
  }
  if (conflits.length === 0 && alertesAbs.length === 0) {
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
  alertesAbs.forEach((a) => {
    const div = document.createElement("div");
    div.className = "conflit-ligne alerte-" + a.niveau;
    const sp = document.createElement("span");
    sp.className = "conflit-date"; sp.textContent = a.date + " — ";
    div.appendChild(sp);
    div.appendChild(document.createTextNode((a.niveau === "critique" ? "🔴 " : "🟠 ") + a.message));
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
  sEpingle.checked = !!shift.epingle;
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
  sEpingle.checked = false;
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
        doctor_id: propose.doctor_id, poste: propose.poste, epingle: sEpingle.checked,
      }).eq("id", propose.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("shifts").insert({
        date: propose.date, shift_type: propose.shift_type,
        doctor_id: propose.doctor_id, poste: propose.poste, schedule_id: scheduleId,
        epingle: sEpingle.checked,
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
  // Snapshot du mois publié → restaurable plus tard (Module 22).
  await sauvegarderHoraireMois("publication", planningMois.annee, planningMois.mois);
  const _sync = await pousserVersSheetAuto("publication"); // M27 — miroir Google Sheets
  const _okSync = (_sync && _sync.ok) ? " · miroir Sheet synchronisé ✅" : (_sync && _sync.skip ? "" : " · ⚠️ miroir Sheet non synchronisé");
  messageGeneration("Planning " + planningMois.mois + "/" + planningMois.annee + " publié. ✅" + _okSync, "info");
  rafraichirPanneauAdmin();
});

/* ----- Module 22 — Sauvegarde / suppression / restauration de l'horaire ----- */
/* Snapshot des shifts d'un mois dans schedule_backups (silencieux si vide). */
async function sauvegarderHoraireMois(type, annee, mois) {
  const b = bornesMois(annee, mois);
  const { data: shifts } = await sb.from("shifts")
    .select("date, shift_type, doctor_id, poste, epingle")
    .gte("date", b.debut).lte("date", b.fin);
  if (!shifts || !shifts.length) return;
  const { error } = await sb.from("schedule_backups").insert({ type, annee, mois, payload: shifts });
  if (error) console.warn("Sauvegarde horaire impossible (module22 SQL lancé ?) :", error.message);
}

/* Supprime TOUT le planning du trimestre affiché (les 3 mois), après une
   sauvegarde de sécurité. Le dernier publié reste restaurable. */
if (supprimerTrimBtn) supprimerTrimBtn.addEventListener("click", async () => {
  if (!medecinCourant || medecinCourant.role !== "admin" || !calendrier) return;
  const b = bornesTrimestreAffiche();
  if (!window.confirm(
    "Supprimer TOUT le planning du trimestre (mois " + b.moisTrim.join(", ") + " " + b.annee + ") ?\n" +
    "Les shifts et les statuts des 3 mois seront effacés.\n" +
    "Le dernier planning PUBLIÉ restera restaurable (bouton ♻).")) return;
  for (const m of b.moisTrim) await sauvegarderHoraireMois("avant_suppression", b.annee, m);
  await sb.from("shifts").delete().gte("date", b.debut).lte("date", b.fin);
  await sb.from("schedules").delete().eq("year", b.annee).in("month", b.moisTrim);
  messageGeneration("Trimestre " + b.trimestre + " " + b.annee + " supprimé. Restaurable via ♻.", "info");
  rafraichirPanneauAdmin();
});

/* Restaure, EN BROUILLON, le dernier planning PUBLIÉ de chaque mois du
   trimestre affiché (remplace le planning actuel des 3 mois). */
if (restaurerTrimBtn) restaurerTrimBtn.addEventListener("click", async () => {
  if (!medecinCourant || medecinCourant.role !== "admin" || !calendrier) return;
  const b = bornesTrimestreAffiche();
  if (!window.confirm(
    "Restaurer le DERNIER planning publié des mois " + b.moisTrim.join(", ") + " " + b.annee + " ?\n" +
    "Il revient en BROUILLON (modifiable) et REMPLACE le planning actuel de ces mois.")) return;
  let mois_ok = 0, mois_sans = 0;
  for (const m of b.moisTrim) {
    const { data } = await sb.from("schedule_backups")
      .select("payload").eq("type", "publication").eq("annee", b.annee).eq("mois", m)
      .order("created_at", { ascending: false }).limit(1);
    if (!data || !data.length) { mois_sans++; continue; }
    const payload = data[0].payload || [];
    const bm = bornesMois(b.annee, m);
    await sb.from("shifts").delete().gte("date", bm.debut).lte("date", bm.fin);
    await sb.from("schedules").delete().eq("year", b.annee).eq("month", m);
    const { data: sched } = await sb.from("schedules")
      .insert({ year: b.annee, month: m, status: "draft" }).select("id").maybeSingle();
    const rows = payload.map((s) => ({
      date: s.date, shift_type: s.shift_type, doctor_id: s.doctor_id,
      poste: s.poste || null, epingle: !!s.epingle, schedule_id: sched ? sched.id : null,
    }));
    if (rows.length) await sb.from("shifts").insert(rows);
    mois_ok++;
  }
  messageGeneration("Restauration (brouillon) : " + mois_ok + " mois restauré(s)" +
    (mois_sans ? ", " + mois_sans + " sans sauvegarde publiée." : "."), "info");
  await pousserVersSheetAuto("restauration"); // M27 — miroir Google Sheets
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

/* Définition des lignes de la grille (ordre d'affichage).
   Ordre demandé : les POSTÉS d'abord (stations USI 1 → Labo, puis gardes / TWE),
   ensuite OFF-CLINIC, RÉCUP, REPOS DE GARDE, puis les NON PLANIFIÉS (repos), et
   enfin les CONGÉS à part. */
function grilleLignes() {
  const postes = (typeof POSTES_JOUR !== "undefined" ? POSTES_JOUR : []);
  const lignes = postes.map((p) => ({ label: p.label, type: "station", code: p.code }));
  lignes.push({ label: "Garde de nuit", type: "garde_nuit" });
  lignes.push({ label: "Garde 24h (WE)", type: "garde_24h_we" });
  lignes.push({ label: "TWE", type: "twe" });
  // Repos / absences éclatés en lignes dédiées (Pt 5 — récup bien visible).
  lignes.push({ label: "Off-clinic", type: "off" });
  lignes.push({ label: "Récupération", type: "recup" });
  lignes.push({ label: "Repos de garde", type: "repos_garde" });
  lignes.push({ label: "Congés", type: "conges" });
  // Tous les médecins actifs NON postés et NON en congé (indispo / formation /
  // « autre » / récup férié + simplement libres) → « au repos ». EN DERNIER.
  lignes.push({ label: "Non planifiés (repos)", type: "non_planifie" });
  return lignes;
}

/* Week-end ou férié (réutilise joursFeriesBE de regles.js si dispo). */
/* estWeekendOuFerieISO définie plus haut (export Excel) */

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
  if (ligne.type === "recup") return duJour.filter((s) => s.shift_type === "recup");
  if (ligne.type === "repos_garde") return duJour.filter((s) => s.shift_type === "repos_garde");
  if (ligne.type === "off") return duJour.filter((s) => s.shift_type === "off");
  if (ligne.type === "conges") return duJour.filter((s) =>
    s.shift_type === "conge_annuel" || s.shift_type === "conge_extralegal" || s.shift_type === "conge_scientifique");
  // « non_planifie » est CALCULÉ (pas un type de shift) → géré dans construireGrille.
  return [];
}

/* Type de shift par défaut quand on clique une cellule vide d'une ligne. */
function typeDefautLigne(ligne) {
  if (ligne.type === "station") return { type: "jour", poste: ligne.code };
  if (ligne.type === "garde_nuit") return { type: "garde_nuit", poste: null };
  if (ligne.type === "garde_24h_we") return { type: "garde_24h", poste: null };
  if (ligne.type === "twe") return { type: "twe", poste: null };
  if (ligne.type === "recup") return { type: "recup", poste: null };
  if (ligne.type === "repos_garde") return { type: "repos_garde", poste: null };
  if (ligne.type === "off") return { type: "off", poste: null };
  if (ligne.type === "conges") return { type: "conge_annuel", poste: null };
  if (ligne.type === "non_planifie") return null; // ligne calculée, non éditable
  return { type: "jour", poste: null };
}

/* Congés (types de shift OU de préférence comptant comme « en congé »). */
const GRILLE_CONGES = ["conge", "conge_annuel", "conge_extralegal", "conge_scientifique"];

/* Médecin actif (sous contrat) à la date ISO donnée. Mirroir simplifié de
   plSousContrat : périodes contractuelles si présentes, sinon contract_start/end,
   sinon toujours actif. */
function medActifISO(m, iso) {
  const per = m.contract_periods;
  if (Array.isArray(per) && per.length) {
    return per.some((p) => (!p.start || p.start <= iso) && (!p.end || p.end >= iso));
  }
  if (!m.contract_start && !m.contract_end) return true;
  if (m.contract_start && iso < m.contract_start) return false;
  if (m.contract_end && iso > m.contract_end) return false;
  return true;
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
    .select("id, date, shift_type, doctor_id, poste, epingle")
    .gte("date", debut).lte("date", fin);
  if (error) { console.error("Erreur grille :", error); return; }

  grilleShiftsById = {};
  const parJour = {};
  (shifts || []).forEach((s) => {
    grilleShiftsById[s.id] = s;
    (parJour[s.date] = parJour[s.date] || []).push(s);
  });

  // Roster complet (contrats) + préférences du mois → pour la ligne « Non
  // planifiés (repos) » : tout médecin actif non posté et non en congé.
  const { data: roster } = await sb.from("doctors")
    .select("id, name, grade, role, contract_start, contract_end, contract_periods, jours_travailles");
  const rosterList = roster || [];
  const { data: prefsMois } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type, status")
    .lte("start_date", fin).gte("end_date", debut);
  // Index par jour : médecins ayant un shift, et médecins EN CONGÉ (shift congé
  // OU préférence de congé approuvée couvrant le jour).
  const shiftDocsJour = {};   // iso -> Set(doctor_id)
  const congeDocsJour = {};   // iso -> Set(doctor_id)
  (shifts || []).forEach((s) => {
    (shiftDocsJour[s.date] = shiftDocsJour[s.date] || new Set()).add(s.doctor_id);
    if (GRILLE_CONGES.includes(s.shift_type))
      (congeDocsJour[s.date] = congeDocsJour[s.date] || new Set()).add(s.doctor_id);
  });
  (prefsMois || []).forEach((p) => {
    if (!GRILLE_CONGES.includes(p.pref_type)) return;
    if (p.status && p.status !== "approuve") return; // seuls les congés validés « bloquent »
    for (let j = 1; j <= nbJours; j++) {
      const iso = annee + "-" + ms + "-" + String(j).padStart(2, "0");
      if (p.start_date <= iso && p.end_date >= iso)
        (congeDocsJour[iso] = congeDocsJour[iso] || new Set()).add(p.doctor_id);
    }
  });

  // Congrès & fermetures d'unités du mois (Module 17, visibles par tous).
  const periodesGrille = await periodesSur(debut, fin);

  const editable = medecinCourant && medecinCourant.role === "admin" && !planningVerrouille;
  const lignes = grilleLignes();

  // En-tête : coin + un th par jour (numéro + lettre du jour, congrès surligné).
  let html = "<thead><tr><th class='grille-coin'>Poste \\ Jour</th>";
  for (let j = 1; j <= nbJours; j++) {
    const iso = annee + "-" + ms + "-" + String(j).padStart(2, "0");
    const dd = new Date(iso + "T00:00:00Z");
    const congres = congresISO(iso, periodesGrille);
    const we = estWeekendOuFerieISO(iso) ? " grille-we" : "";
    const cg = congres ? " grille-congres' title='Congrès : " + escapeHtml(congres) : "";
    html += "<th class='grille-jour" + we + cg + "'><span class='gj-num'>" + j +
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

      // Ligne CALCULÉE « Non planifiés (repos) » : médecins actifs sans aucun
      // shift ce jour et non en congé (indispo / formation / autre / récup férié
      // + simplement libres). Non éditable.
      if (ligne.type === "non_planifie") {
        const aShift = shiftDocsJour[iso] || new Set();
        const enConge = congeDocsJour[iso] || new Set();
        // Pas de « repos » les week-ends / fériés (tout le monde est off).
        const repos = estWeekendOuFerieISO(iso) ? [] : rosterList.filter((m) =>
          m.role !== "admin" && medActifISO(m, iso) && jourTravaillableISO(m, iso) &&
          !aShift.has(m.id) && !enConge.has(m.id)); // jour non travaillable ≠ non planifié
        let contenuNP = "";
        repos.forEach((m) => {
          contenuNP += "<span class='grille-chip grille-chip-repos' title='" +
            escapeHtml((m.name || "?") + " — au repos (non planifié)") + "'>" +
            escapeHtml(nomCourt(m.id)) + "</span>";
        });
        html += "<td class='grille-cell" + we + "' data-date='" + iso + "'>" + contenuNP + "</td>";
        continue;
      }

      const correspondants = shiftsPourLigne(ligne, duJour);
      const cls = "grille-cell" + we + (editable ? " editable" : "");
      const defaut = typeDefautLigne(ligne);
      // Module 17 : unité fermée par l'admin → cellule « Fermé » (grisée).
      if (ligne.type === "station" && uniteFermeeISO(ligne.code, iso, periodesGrille)) {
        html += "<td class='grille-cell grille-ferme" + we + "' data-date='" + iso +
                "'><span class='grille-ferme-txt'>Fermé</span></td>";
        continue;
      }
      let contenu = "";
      correspondants.forEach((s) => {
        const suff = (s.shift_type === "garde_24h" && s.poste) ? " (24h)"
                   : (ligne.type === "conges") ? (" " + (SHIFT_CONFIG[s.shift_type] ? SHIFT_CONFIG[s.shift_type].court : ""))
                   : "";
        const couleur = SHIFT_CONFIG[s.shift_type] ? SHIFT_CONFIG[s.shift_type].couleur : "#57606a";
        contenu += "<span class='grille-chip" + (s.epingle ? " epingle" : "") + "' data-shiftid='" + s.id + "' " +
                   "style='background:" + couleur + "' title='" +
                   escapeHtml(nomCourt(s.doctor_id) + suff) + (s.epingle ? " (épinglé)" : "") + "'>" +
                   (s.epingle ? "📌 " : "") + escapeHtml(nomCourt(s.doctor_id)) + escapeHtml(suff) + "</span>";
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
    if (s) ouvrirEditionShift({ id: s.id, date: s.date, shift_type: s.shift_type, doctor_id: s.doctor_id, poste: s.poste, epingle: s.epingle });
    return;
  }
  const cell = e.target.closest(".grille-cell");
  if (cell) {
    // Lignes CALCULÉES (« Non planifiés ») : pas de data-type → cellule inerte.
    if (!cell.getAttribute("data-type")) return;
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
  const estGrille   = vue === "grille";
  const estSemaine  = vue === "semaine";
  const estCal      = vue === "calendrier";
  grilleWrapper.classList.toggle("hidden", !estGrille);
  if (semaineWrapper) semaineWrapper.classList.toggle("hidden", !estSemaine);
  calendarEl.classList.toggle("hidden", !estCal);
  vueGrilleBtn.classList.toggle("actif", estGrille);
  if (vueSemaineBtn) vueSemaineBtn.classList.toggle("actif", estSemaine);
  vueCalendrierBtn.classList.toggle("actif", estCal);
  if (estGrille) {
    construireGrille();
  } else if (estSemaine) {
    construireVueSemaine();
  } else if (calendrier) {
    calendrier.updateSize(); // recalcule la taille après réaffichage
  }
  majCompteurCongres(); // affiche/masque le compteur congrès selon la vue active
}
if (vueCalendrierBtn) vueCalendrierBtn.addEventListener("click", () => basculerVuePlanning("calendrier"));
if (vueGrilleBtn) vueGrilleBtn.addEventListener("click", () => basculerVuePlanning("grille"));


/* ===================================================================== */
/* Navigation par ONGLETS (refonte graphique)                            */
/* --------------------------------------------------------------------- */
/* Un seul panneau visible à la fois : Planning (tous), Demandes /        */
/* Congrès & fermetures / Médecins (admin), Mes préférences (médecin).   */
/* Les zones admin-zone / doctor-zone gardent le contrôle par RÔLE ;     */
/* les onglets ne gèrent que l'affichage.                                */
/* ===================================================================== */

const ONGLETS = ["planning", "cm", "doublures", "periodes", "medecins", "echanges-admin", "conges-admin", "prefs", "echanges"];

function basculerOnglet(nom) {
  ONGLETS.forEach((t) => {
    const p = document.getElementById("panel-" + t);
    if (p) p.classList.toggle("hidden", t !== nom);
  });
  document.querySelectorAll("#tabs-nav .tab").forEach((b) =>
    b.classList.toggle("actif", b.dataset.tab === nom));
  // Le calendrier, rendu dans un panneau parfois masqué, doit recalculer
  // sa taille quand on revient sur l'onglet Planning.
  if (nom === "planning" && calendrier) calendrier.updateSize();
  if (nom === "echanges-admin" && typeof chargerEchangesAdmin === "function") { chargerEchangesAdmin(); if (typeof echAdminCharger === "function") echAdminCharger(); }
  if (nom === "echanges" && typeof initEchanges === "function") { initEchanges(); }
  if (nom === "conges-admin" && typeof cgInit === "function") { cgInit(); chargerDemandes(); }
  if (nom === "cm" && typeof rbChargerHistorique === "function") { rbChargerHistorique(); }
  if (nom === "doublures" && typeof dbAnalyser === "function") { dbAnalyser(); }
}

document.querySelectorAll("#tabs-nav .tab").forEach((b) =>
  b.addEventListener("click", () => basculerOnglet(b.dataset.tab)));

/* Navigation mois dans la grille (pilote le calendrier ; datesSet
   reconstruit la grille automatiquement). */
if (grillePrev) grillePrev.addEventListener("click", () => { if (calendrier) calendrier.prev(); });
if (grilleNext) grilleNext.addEventListener("click", () => { if (calendrier) calendrier.next(); });


/* ===================================================================== */
/* MODULE 20 — Rotation trimestrielle des unités                          */
/* --------------------------------------------------------------------- */
/* Propose une unité de référence (station « maison ») par médecin pour le */
/* trimestre du mois affiché, en évitant l'unité du trimestre précédent    */
/* (dérivée des shifts passés). Éditable, puis enregistrée sur doctors     */
/* (unite_reference) → base de continuité à la génération (planning.js).   */
/* ===================================================================== */
const rotationProposerBtn    = document.getElementById("rotation-proposer-btn");
const rotationTableWrap      = document.getElementById("rotation-table-wrap");
const rotationActions        = document.getElementById("rotation-actions");
const rotationEnregistrerBtn = document.getElementById("rotation-enregistrer-btn");
const rotationMsg            = document.getElementById("rotation-msg");

/* Bornes ISO du trimestre civil contenant `mois` (1-12), et du précédent. */
function bornesTrimestrePlanning(annee, mois) {
  const t = Math.floor((mois - 1) / 3);
  const m = [t * 3 + 1, t * 3 + 2, t * 3 + 3];
  let pa = annee, pt = t - 1;
  if (pt < 0) { pt = 3; pa = annee - 1; }
  const pm = [pt * 3 + 1, pt * 3 + 2, pt * 3 + 3];
  return {
    debut: bornesMois(annee, m[0]).debut, fin: bornesMois(annee, m[2]).fin,
    prevDebut: bornesMois(pa, pm[0]).debut, prevFin: bornesMois(pa, pm[2]).fin,
  };
}

/* Unité la plus fréquente d'un médecin sur une liste de shifts (jour / 24h). */
function unitePrincipale(shifts, doctorId) {
  const c = {};
  shifts.forEach((s) => {
    if (s.doctor_id === doctorId && s.poste &&
        (s.shift_type === "jour" || s.shift_type === "garde_24h")) c[s.poste] = (c[s.poste] || 0) + 1;
  });
  let best = null, bn = 0;
  Object.keys(c).forEach((k) => { if (c[k] > bn) { bn = c[k]; best = k; } });
  return best;
}

/* Proposition équilibrée : station la moins chargée, ≠ unité précédente. */
function proposerUnites(medecins, prevById, stations) {
  const counts = {}; stations.forEach((c) => { counts[c] = 0; });
  const res = {};
  medecins.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach((m) => {
    const prev = prevById[m.id];
    const cand = stations.filter((c) => c !== prev)
      .sort((x, y) => counts[x] - counts[y] || stations.indexOf(x) - stations.indexOf(y));
    const pick = cand.length ? cand[0] : stations[0];
    res[m.id] = pick; counts[pick]++;
  });
  return res;
}

let rotationMedecins = [];
async function proposerRotation() {
  if (!calendrier) return;
  rotationMsg.textContent = ""; rotationMsg.className = "message";
  const d = calendrier.getDate();
  const b = bornesTrimestrePlanning(d.getFullYear(), d.getMonth() + 1);
  // Le Labo de choc n'est PAS une « unité maison » de trimestre (rotation libre,
  // pas de continuité) → on l'exclut des propositions de rotation.
  const stations = (typeof POSTES_JOUR !== "undefined" ? POSTES_JOUR : [])
    .map((p) => p.code).filter((c) => c !== "labo_choc");

  // Rotation réservée aux Assistants spécialistes / Résidents (pas les PG/Fellows ni admins).
  const { data: meds, error: e1 } = await sb.from("doctors")
    .select("id, name, grade, unite_reference")
    .neq("role", "admin")
    .in("grade", ["resident", "assistant_specialiste"])
    .order("name", { ascending: true });
  if (e1) { rotationMsg.textContent = "Erreur lecture médecins : " + e1.message; rotationMsg.className = "message error"; return; }
  rotationMedecins = meds || [];

  const { data: shiftsPrev } = await sb.from("shifts")
    .select("doctor_id, poste, shift_type").gte("date", b.prevDebut).lte("date", b.prevFin);
  const prevById = {};
  rotationMedecins.forEach((m) => { prevById[m.id] = unitePrincipale(shiftsPrev || [], m.id); });

  const propositions = proposerUnites(rotationMedecins, prevById, stations);
  rendreRotationTable(rotationMedecins, propositions, prevById, stations);
  rotationMsg.textContent = "Proposition générée (trimestre du " + b.debut + " au " + b.fin +
    "). Unité précédente dérivée du trimestre " + b.prevDebut + " → " + b.prevFin + ". Ajuste puis Enregistre.";
  rotationMsg.className = "message info";
}

function rendreRotationTable(medecins, propositions, prevById, stations) {
  const opt = (sel) => "<option value=''>— aucune —</option>" +
    stations.map((c) => "<option value='" + c + "'" + (sel === c ? " selected" : "") + ">" +
      escapeHtml(POSTE_LABELS[c] || c) + "</option>").join("");
  let html = "<table class='data-table'><thead><tr><th>Médecin</th>" +
    "<th>Unité précédente</th><th>Unité proposée (trimestre)</th></tr></thead><tbody>";
  medecins.forEach((m) => {
    const prev = prevById[m.id] ? (POSTE_LABELS[prevById[m.id]] || prevById[m.id]) : "—";
    html += "<tr><td>" + escapeHtml(m.name) + "</td><td>" + escapeHtml(prev) + "</td>" +
      "<td><select class='rotation-select' data-docid='" + escapeHtml(m.id) + "'>" + opt(propositions[m.id]) + "</select></td></tr>";
  });
  html += "</tbody></table>";
  rotationTableWrap.innerHTML = html;
  rotationActions.classList.remove("hidden");
}

async function enregistrerRotation() {
  const selects = rotationTableWrap.querySelectorAll(".rotation-select");
  if (!selects.length) return;
  rotationEnregistrerBtn.disabled = true;
  let ok = 0, err = 0;
  for (const sel of selects) {
    const id = sel.getAttribute("data-docid");
    const { error } = await sb.from("doctors").update({ unite_reference: sel.value || null }).eq("id", id);
    if (error) err++; else ok++;
  }
  rotationEnregistrerBtn.disabled = false;
  rotationMsg.textContent = err
    ? ("Enregistré : " + ok + " · erreurs : " + err)
    : ("Rotation enregistrée (" + ok + " médecins). Elle s'appliquera à la prochaine génération.");
  rotationMsg.className = err ? "message error" : "message info";
}

if (rotationProposerBtn) rotationProposerBtn.addEventListener("click", proposerRotation);
if (rotationEnregistrerBtn) rotationEnregistrerBtn.addEventListener("click", enregistrerRotation);


/* --------------------------------------------------------------------- */
/* Au chargement de la page : restaure la session si elle existe déjà    */
/* (évite de redemander le login à chaque rafraîchissement).             */
/* --------------------------------------------------------------------- */

/* ===================================================================== */
/* MODULE 26 — Jours fériés éditables par l'admin (table feries_admin)    */
/* --------------------------------------------------------------------- */
/* actif=true  -> AJOUTE une date (couverte comme un week-end) ;          */
/* actif=false -> RETIRE un férié belge calculé (redevient ouvré).        */
/* Au chargement, on alimente le moteur de règles via definirFeriesAdmin. */
/* ===================================================================== */
let feriesAdminRows = []; // cache local pour la génération côté admin

/* Charge les surcharges et les applique au moteur (regles.js, global). */
async function chargerFeriesAdmin() {
  const { data, error } = await sb.from("feries_admin")
    .select("date, actif, libelle").order("date", { ascending: true });
  if (error) { console.error("Fériés admin :", error); feriesAdminRows = []; }
  else feriesAdminRows = data || [];
  const ajouts = feriesAdminRows.filter((f) => f.actif).map((f) => f.date);
  const retraits = feriesAdminRows.filter((f) => !f.actif).map((f) => f.date);
  if (typeof definirFeriesAdmin === "function") definirFeriesAdmin(ajouts, retraits);
  rendreFeriesAdmin();
}

/* Objet { ajouts:[...], retraits:[...] } à passer aux générateurs (opts.feriesAdmin). */
function feriesAdminPourGeneration() {
  return {
    ajouts: feriesAdminRows.filter((f) => f.actif).map((f) => f.date),
    retraits: feriesAdminRows.filter((f) => !f.actif).map((f) => f.date),
  };
}

/* Rendu du tableau des surcharges (onglet Congrès & fermetures). */
function rendreFeriesAdmin() {
  const tbody = document.getElementById("feries-tbody");
  const table = document.getElementById("feries-table");
  const empty = document.getElementById("feries-empty");
  if (!tbody) return;
  tbody.innerHTML = "";
  const vide = feriesAdminRows.length === 0;
  if (table) table.classList.toggle("hidden", vide);
  if (empty) empty.classList.toggle("hidden", !vide);
  feriesAdminRows.forEach((f) => {
    const tr = document.createElement("tr");
    const action = f.actif ? "➕ Ajouté (férié)" : "➖ Retiré (jour ouvré)";
    [f.date, action, f.libelle || "—"].forEach((v) => {
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    });
    const tdA = document.createElement("td"); tdA.className = "actions-cell";
    const btn = document.createElement("button");
    btn.textContent = "Supprimer"; btn.className = "mini danger";
    btn.addEventListener("click", () => supprimerFerieAdmin(f.date));
    tdA.appendChild(btn); tr.appendChild(tdA);
    tbody.appendChild(tr);
  });
}

/* Enregistre (upsert) une surcharge de férié. */
async function enregistrerFerieAdmin(e) {
  if (e) e.preventDefault();
  const msg = document.getElementById("ferie-form-msg");
  const date = (document.getElementById("fa-date") || {}).value;
  const actif = (document.getElementById("fa-actif") || {}).value === "true";
  const libelle = ((document.getElementById("fa-label") || {}).value || "").trim() || null;
  if (msg) { msg.textContent = ""; msg.className = "message"; }
  if (!date) { if (msg) { msg.textContent = "Date manquante."; msg.className = "message error"; } return; }
  const { error } = await sb.from("feries_admin").upsert({ date, actif, libelle }, { onConflict: "date" });
  if (error) {
    console.error("Enregistrement férié :", error);
    if (msg) { msg.textContent = "Échec de l'enregistrement (droits admin ?)."; msg.className = "message error"; }
    return;
  }
  const f = document.getElementById("ferie-form"); if (f) f.reset();
  if (msg) { msg.textContent = "Férié enregistré. Régénère le trimestre pour l'appliquer."; msg.className = "message info"; }
  await chargerFeriesAdmin();
}

/* Supprime une surcharge (le jour reprend son statut belge calculé). */
async function supprimerFerieAdmin(date) {
  const { error } = await sb.from("feries_admin").delete().eq("date", date);
  if (error) { console.error("Suppression férié :", error); return; }
  await chargerFeriesAdmin();
}

const _ferieForm = document.getElementById("ferie-form");
if (_ferieForm) _ferieForm.addEventListener("submit", enregistrerFerieAdmin);

/* ===================================================================== */
/* MODULE 27 — Miroir Google Sheets (push lecture seule du planning publié) */
/* --------------------------------------------------------------------- */
/* Réglages admin (URL Web App Apps Script + jeton) stockés dans          */
/* app_settings. À chaque publication / échange accepté / modif-restau    */
/* admin, et via le bouton « Resynchroniser », on POSTe la grille hebdo   */
/* (mêmes lignes que l'export Excel) vers le Web App, qui écrit le Sheet.  */
/* POST « no-cors » (tire-et-oublie : on n'a pas d'accusé direct).         */
/* ===================================================================== */

/* Lit les réglages (URL + jeton) depuis la base. */
async function chargerReglagesSheetValeurs() {
  const { data } = await sb.from("app_settings").select("key, value").in("key", ["gsheet_url", "gsheet_token"]);
  const m = {}; (data || []).forEach((r) => { m[r.key] = r.value; });
  return { url: (m.gsheet_url || "").trim(), token: (m.gsheet_token || "").trim() };
}

/* Remplit le formulaire de réglages (admin). */
async function chargerReglagesSheet() {
  const u = document.getElementById("gs-url"), t = document.getElementById("gs-token");
  if (!u && !t) return;
  const v = await chargerReglagesSheetValeurs();
  if (u) u.value = v.url;
  if (t) t.value = v.token || "erasme2026";
}

/* Enregistre les réglages (upsert clé/valeur). */
async function enregistrerReglagesSheet(e) {
  if (e) e.preventDefault();
  const msg = document.getElementById("gs-msg");
  const url = ((document.getElementById("gs-url") || {}).value || "").trim();
  const token = ((document.getElementById("gs-token") || {}).value || "").trim();
  const { error } = await sb.from("app_settings").upsert([
    { key: "gsheet_url", value: url },
    { key: "gsheet_token", value: token },
  ], { onConflict: "key" });
  if (msg) {
    msg.textContent = error ? "Échec de l'enregistrement (droits admin ?)." : "Réglages enregistrés.";
    msg.className = "message " + (error ? "error" : "info");
  }
}

/* Construit les onglets hebdo (grille type export Excel) à partir des shifts.
   Renvoie [{ name (onglet = JJ-MM-AAAA du lundi), rows (2D) }]. */
function construireSemainesSheet(shifts, prefs) {
  const lundiDe = (iso) => { const d = new Date(iso + "T00:00:00Z"); const j = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - (j - 1)); return d.toISOString().slice(0, 10); };
  const addJ = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtJJMM = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const fmtTab = (iso) => iso.slice(8, 10) + "-" + iso.slice(5, 7) + "-" + iso.slice(0, 4);
  const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const noms = (typeof construireNomsCourts === "function") ? construireNomsCourts(carteMedecins) : {};
  const nom = (id) => noms[id] || (carteMedecins[id] && carteMedecins[id].name) || id;
  const cell = (date, filtre) => shifts.filter((s) => s.date === date && filtre(s)).map((s) => nom(s.doctor_id)).sort().join("\n");
  const cellConge = (date, types) => {
    const set = new Set();
    shifts.forEach((s) => { if (s.date === date && types.includes(s.shift_type)) set.add(nom(s.doctor_id)); });
    prefs.forEach((p) => { if (types.includes(p.pref_type) && p.start_date <= date && p.end_date >= date) set.add(nom(p.doctor_id)); });
    return [...set].sort().join("\n");
  };
  const stations = [["USI 1", "usi1"], ["USI 2", "usi2"], ["USI 3", "usi3"], ["USI 4", "usi4"], ["USI 5", "usi5"], ["USI Bordet", "bordet"], ["Labo de choc", "labo_choc"]];
  const semaines = {};
  shifts.forEach((s) => { semaines[lundiDe(s.date)] = true; });
  const weeks = [];
  Object.keys(semaines).sort().forEach((lundi) => {
    const jours = [0, 1, 2, 3, 4, 5, 6].map((k) => addJ(lundi, k));
    const rows = [["Poste"].concat(jours.map((iso, i) => JOURS[i] + " " + fmtJJMM(iso)))];
    stations.forEach(([lib, code]) => {
      rows.push([lib].concat(jours.map((iso) => cell(iso, (s) => s.poste === code &&
        (s.shift_type === "jour" || s.shift_type === "garde_24h" || s.shift_type === "pg_jour" || s.shift_type === "pg_twe" || s.shift_type === "twe")))));
    });
    rows.push(["Garde de nuit (17h-9h)"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "garde_nuit"))));
    rows.push(["Garde 24h"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "garde_24h"))));
    rows.push(["Tour (TWE)"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "twe"))));
    rows.push(["Tour PG (WE)"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "pg_twe"))));
    rows.push(["Garde PG (24h)"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "garde_pg"))));
    rows.push(["Off-clinic"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "off"))));
    rows.push(["Recuperation"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "recup"))));
    rows.push(["Repos de garde"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "repos_garde"))));
    rows.push(["Conge ferie (recup)"].concat(jours.map((iso) => cell(iso, (s) => s.shift_type === "conge_ferie"))));
    rows.push(["Conge annuel"].concat(jours.map((iso) => cellConge(iso, ["conge_annuel", "conge_extralegal"]))));
    rows.push(["Conge scientifique"].concat(jours.map((iso) => cellConge(iso, ["conge_scientifique"]))));
    weeks.push({ name: fmtTab(lundi), rows });
  });
  return weeks;
}

/* Pousse tout le planning PUBLIÉ vers le Google Sheet. Renvoie un statut.
   Silencieux (skip) si non configuré → utilisable en best-effort sur les hooks. */
async function pousserVersSheet(raison) {
  const cfg = await chargerReglagesSheetValeurs();
  if (!cfg.url) return { skip: true };
  if (!Object.keys(carteMedecins).length) await chargerCarteMedecins();
  // Lecture DIRECTE de tous les shifts générés (indépendant des lignes schedules) :
  // tout le planning présent en base part vers le Sheet (octobre + novembre + …).
  const { data: shifts } = await sb.from("shifts").select("date, shift_type, doctor_id, poste");
  if (!shifts || !shifts.length) return { vide: true };
  let dmin = shifts[0].date, dmax = shifts[0].date;
  shifts.forEach((s) => { if (s.date < dmin) dmin = s.date; if (s.date > dmax) dmax = s.date; });
  const { data: prefs } = await sb.from("preferences")
    .select("doctor_id, start_date, end_date, pref_type").eq("status", "approuve")
    .lte("start_date", dmax).gte("end_date", dmin);
  const weeks = construireSemainesSheet(shifts, prefs || []);
  if (!weeks.length) return { vide: true };
  // POST « no-cors » : la requête part mais la réponse n'est pas lisible (limite
  // Apps Script / CORS). On considère donc l'envoi comme « tire-et-oublie ».
  await fetch(cfg.url, {
    method: "POST", mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: cfg.token, weeks, raison: raison || "" }),
  });
  return { ok: true, weeks: weeks.length };
}

/* Best-effort : appelé sur les événements (publication / échange / restauration).
   N'interrompt JAMAIS l'action principale (erreurs avalées). */
async function pousserVersSheetAuto(raison) {
  // ATTENDU (await) : un fetch no-cors NON attendu peut être interrompu quand la
  // page se rafraîchit juste après (publication / échange) → la synchro ne
  // partait pas. On attend donc l'envoi avant de poursuivre. Best-effort.
  try { return await pousserVersSheet(raison); } catch (e) { return { erreur: true }; }
}

/* Bouton « Resynchroniser maintenant » (retour utilisateur best-effort). */
async function resyncSheet() {
  const msg = document.getElementById("gs-msg");
  if (msg) { msg.textContent = "Synchronisation en cours…"; msg.className = "message info"; }
  try {
    const r = await pousserVersSheet("manuel");
    if (msg) {
      if (r.skip) { msg.textContent = "Renseigne d'abord l'URL du Web App, puis Enregistre."; msg.className = "message error"; }
      else if (r.vide) { msg.textContent = "Aucun planning publié à synchroniser."; msg.className = "message error"; }
      else { msg.textContent = "Envoyé (" + r.weeks + " semaine(s)). Vérifie le Google Sheet (onglet _synchro = horodatage)."; msg.className = "message info"; }
    }
  } catch (err) {
    if (msg) { msg.textContent = "Erreur de synchro : " + (err.message || err); msg.className = "message error"; }
  }
}

const _gsForm = document.getElementById("gs-form");
if (_gsForm) _gsForm.addEventListener("submit", enregistrerReglagesSheet);
const _gsResync = document.getElementById("gs-resync-btn");
if (_gsResync) _gsResync.addEventListener("click", resyncSheet);

(async function init() {
  // Arrivée via un lien d'invitation / de réinitialisation reçu par email
  // (#...type=invite ou type=recovery) : on affiche la page « définir le mot de
  // passe » au lieu d'ouvrir directement l'espace.
  if (/type=(invite|recovery)/.test(URL_HASH_AU_CHARGEMENT)) {
    montrerDefinirMotDePasse();
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const profil = await chargerProfil(session.user);
    if (profil) afficherEspace(profil);
  }
})();


/* ===================================================================== */
/* MODULE 23 — Échanges de shifts : UI du workflow (médecin)              */
/* --------------------------------------------------------------------- */
/* Proposer (mes shifts publiés à venir ↔ shift d'un collègue de même     */
/* nature), lister reçues/émises, accepter (validerEchange + application  */
/* des changes : réaffectation / suppression / création de repos),        */
/* refuser, annuler. Tout se fait sur le planning PUBLIÉ uniquement.      */
/* ===================================================================== */
const echMienSel    = document.getElementById("ech-mien");
const echCibleSel   = document.getElementById("ech-cible");
const echNoteInput  = document.getElementById("ech-note");
const echForm       = document.getElementById("ech-form");
const echMsg        = document.getElementById("ech-msg");
const echRecuesBody = document.getElementById("ech-recues-tbody");
const echEmisesBody = document.getElementById("ech-emises-tbody");

const echMedecinSel = document.getElementById("ech-medecin");
let echDocteurs = {};   // id -> { name, grade }
let echMesShifts = {};  // id -> shift (mes shifts publiés à venir)
let echCibles = {};     // id -> shift (candidats du collègue)
let echAllShifts = [];  // tous les shifts PUBLIÉS (contexte de validerEchange)
let echDocsList = [];   // [{id,name,grade}] pour validerEchange

function echMessage(txt, type) {
  if (!echMsg) return;
  echMsg.textContent = txt || "";
  echMsg.className = "message" + (type ? " " + type : "");
}

function echAujourdhui() { return new Date().toISOString().slice(0, 10); }

const ECH_GROUPES = { garde_nuit: "garde", garde_24h: "garde", jour: "journee", twe: "tour" };
const ECH_TYPES_DU_GROUPE = { garde: ["garde_nuit", "garde_24h"], journee: ["jour"], tour: ["twe"] };

function echLibellePoste(code) {
  const p = (typeof POSTES_JOUR !== "undefined" ? POSTES_JOUR : []).find((x) => x.code === code);
  return p ? p.label : (code || "");
}

function echLibelleShift(s, avecNom) {
  const cfg = SHIFT_CONFIG[s.shift_type] || { label: s.shift_type };
  const d = s.date.split("-");
  let lib = d[2] + "/" + d[1] + "/" + d[0] + " — " + cfg.label;
  if (s.poste) lib += " (" + echLibellePoste(s.poste) + ")";
  if (avecNom) lib += " · " + ((echDocteurs[s.doctor_id] && echDocteurs[s.doctor_id].name) || s.doctor_id);
  return lib;
}

/* IDs des schedules PUBLIÉS (les échanges ne portent que sur du publié). */
async function echSchedulesPublies() {
  const { data, error } = await sb.from("schedules").select("id").eq("status", "published");
  if (error) throw error;
  return (data || []).map((s) => s.id);
}

async function echChargerDocteurs() {
  const { data, error } = await sb.from("doctors").select("id, name, grade, pg_type, role");
  if (error) throw error;
  echDocteurs = {}; (data || []).forEach((m) => { echDocteurs[m.id] = m; });
}
/* Catégorie d'échange : "clin" (résident/AS), "pg" (PG/Fellow) ou "autre" (admin).
   Un résident/AS ne peut s'échanger qu'avec un résident/AS ; un PG avec un PG. */
function echCategorie(doc) {
  if (!doc) return "autre";
  if (doc.role === "admin") return "autre";
  if (doc.grade === "pg") return "pg";
  if (doc.grade === "resident" || doc.grade === "assistant_specialiste") return "clin";
  return "autre";
}

/* Charge en MÉMOIRE tout le planning PUBLIÉ (contexte de validerEchange) +
   la liste des médecins (grades) pour valider les échanges côté client. */
async function echChargerContexte() {
  const pubIds = await echSchedulesPublies();
  echAllShifts = [];
  echDocsList = Object.keys(echDocteurs).map((id) => ({ id, name: echDocteurs[id].name, grade: echDocteurs[id].grade }));
  if (!pubIds.length) return;
  const { data, error } = await sb.from("shifts")
    .select("id, date, shift_type, poste, doctor_id, schedule_id")
    .in("schedule_id", pubIds);
  if (error) { echMessage("Erreur de lecture du planning publié : " + error.message, "error"); return; }
  echAllShifts = data || [];
}

/* Mes shifts échangeables à venir (publiés). */
function echMesShiftsList() {
  if (!medecinCourant) return [];
  return echAllShifts.filter((s) => s.doctor_id === medecinCourant.id && s.date >= echAujourdhui() && ECH_GROUPES[s.shift_type]);
}
/* Shifts échangeables à venir d'un collègue. */
function echShiftsDe(docId) {
  return echAllShifts.filter((s) => s.doctor_id === docId && s.date >= echAujourdhui() && ECH_GROUPES[s.shift_type]);
}

/* SÉLECTEUR « collègue d'abord » : on grise un médecin si AUCUN échange valide
   n'existe entre l'un de mes shifts et l'un des siens (validerEchange en mémoire
   → couvre le cas 2 A/S, jour déjà pris, repos, lendemain non résoluble…). */
function echRemplirMedecins() {
  if (!echMedecinSel) return;
  echMedecinSel.innerHTML = "<option value=''>— choisir un médecin —</option>";
  const mes = echMesShiftsList();
  const ids = Object.keys(echDocteurs).filter((id) => id !== (medecinCourant && medecinCourant.id));
  ids.sort((a, b) => (echDocteurs[a].name || "").localeCompare(echDocteurs[b].name || ""));
  ids.forEach((id) => {
    const leurs = echShiftsDe(id);
    if (!leurs.length) return;                 // rien d'échangeable : on n'affiche pas
    let valide = false;
    for (const m of mes) {
      for (const c of leurs) {
        if (ECH_GROUPES[m.shift_type] !== ECH_GROUPES[c.shift_type]) continue;
        if (validerEchange(echAllShifts, m.id, c.id, echDocsList).ok) { valide = true; break; }
      }
      if (valide) break;
    }
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = echDocteurs[id].name || id;
    if (!valide) { opt.disabled = true; opt.textContent += " — aucun échange possible"; }
    echMedecinSel.appendChild(opt);
  });
  // Réinitialise les sélecteurs en aval.
  if (echMienSel) { echMienSel.disabled = true; echMienSel.innerHTML = "<option value=''>— choisir d'abord un médecin —</option>"; }
  if (echCibleSel) { echCibleSel.disabled = true; echCibleSel.innerHTML = "<option value=''>— choisir d'abord mon shift —</option>"; }
  echApercu();
}

/* Mes shifts ayant une contrepartie de même nature chez le collègue choisi. */
function echRemplirMien() {
  if (!echMienSel) return;
  const colId = echMedecinSel ? echMedecinSel.value : "";
  echMesShifts = {};
  echMienSel.innerHTML = "<option value=''>— choisir —</option>";
  echMienSel.disabled = !colId;
  if (echCibleSel) { echCibleSel.disabled = true; echCibleSel.innerHTML = "<option value=''>— choisir d'abord mon shift —</option>"; }
  if (!colId) { echApercu(); return; }
  const leurs = echShiftsDe(colId);
  echMesShiftsList().forEach((s) => {
    if (!leurs.some((c) => ECH_GROUPES[c.shift_type] === ECH_GROUPES[s.shift_type])) return;
    echMesShifts[s.id] = s;
    const opt = document.createElement("option");
    opt.value = s.id; opt.textContent = echLibelleShift(s, false);
    echMienSel.appendChild(opt);
  });
  echApercu();
}

/* Shifts du collègue de même nature ; les paires invalides sont GRISÉES avec
   leur motif (p. ex. « 2 A/S de garde »). */
function echRemplirCibles() {
  if (!echCibleSel) return;
  const colId = echMedecinSel ? echMedecinSel.value : "";
  const mien = echMesShifts[echMienSel.value];
  echCibles = {};
  echCibleSel.innerHTML = "<option value=''>— choisir —</option>";
  echCibleSel.disabled = !mien;
  if (!mien || !colId) { echApercu(); return; }
  echShiftsDe(colId).forEach((c) => {
    if (ECH_GROUPES[c.shift_type] !== ECH_GROUPES[mien.shift_type]) return;
    echCibles[c.id] = c;
    const opt = document.createElement("option");
    opt.value = c.id; opt.textContent = echLibelleShift(c, true);
    const v = validerEchange(echAllShifts, mien.id, c.id, echDocsList);
    if (!v.ok) { opt.disabled = true; opt.textContent += " — " + v.message.replace(/^Échange refusé : /, ""); }
    echCibleSel.appendChild(opt);
  });
  echApercu();
}

/* Contexte d'analyse d'un échange : les 2 shifts (re-lus), les shifts
   alentour (±6 jours) et un contrôle propriétaires/publication.
   Renvoie { erreur } ou { sFrom, sTo, ctx }. */
async function echContexte(fromShiftId, toShiftId, fromDocAttendu, toDocAttendu) {
  const { data: paire, error: e1 } = await sb.from("shifts")
    .select("id, date, shift_type, poste, doctor_id, schedule_id")
    .in("id", [fromShiftId, toShiftId]);
  if (e1) return { erreur: e1.message };
  const sFrom = (paire || []).find((s) => String(s.id) === String(fromShiftId));
  const sTo   = (paire || []).find((s) => String(s.id) === String(toShiftId));
  if (!sFrom || !sTo) return { erreur: "Un des shifts n'existe plus (planning régénéré ?)." };
  if ((fromDocAttendu && sFrom.doctor_id !== fromDocAttendu) || (toDocAttendu && sTo.doctor_id !== toDocAttendu))
    return { erreur: "Le planning a changé depuis la proposition." };
  const pubIds = await echSchedulesPublies();
  if (!pubIds.includes(sFrom.schedule_id) || !pubIds.includes(sTo.schedule_id))
    return { erreur: "Le planning concerné n'est plus publié." };
  const dates = [sFrom.date, sTo.date].sort();
  const ajd = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const { data: ctx, error: e2 } = await sb.from("shifts")
    .select("id, date, shift_type, poste, doctor_id, schedule_id")
    .gte("date", ajd(dates[0], -6)).lte("date", ajd(dates[1], 6));
  if (e2) return { erreur: e2.message };
  return { sFrom, sTo, ctx: ctx || [] };
}

/* Résumé HUMAIN des conséquences d'un échange validé (repos transférés,
   récups couplées perdues/créées). N'inclut pas les 2 gardes elles-mêmes. */
function echResumeChanges(changes, ctx) {
  const byId = {}; (ctx || []).forEach((s) => { byId[String(s.id)] = s; });
  const nom = (id) => (echDocteurs[id] && echDocteurs[id].name) || id;
  const fmt = (d) => { const x = d.split("-"); return x[2] + "/" + x[1]; };
  const lignes = [];
  (changes || []).forEach((c) => {
    if (c.creer) {
      lignes.push("➕ " + nom(c.creer.doctor_id) + " gagne une récup de garde le " + fmt(c.creer.date) + " (couplage jeudi+samedi / vendredi+dimanche).");
    } else if (c.supprimer) {
      const s = byId[String(c.id)];
      if (s) lignes.push("➖ " + nom(s.doctor_id) + " perd sa récup du " + fmt(s.date) + " (couplage rompu — le jour redevient libre, sans remise au travail).");
    } else {
      const s = byId[String(c.id)];
      if (s && s.shift_type === "repos_garde") lignes.push("↪ Le repos de garde du " + fmt(s.date) + " passe à " + nom(c.doctor_id) + ".");
      else if (s && s.shift_type === "recup") lignes.push("↪ La récup de week-end du " + fmt(s.date) + " passe à " + nom(c.doctor_id) + ".");
      else if (s && s.shift_type === "jour") lignes.push("↪ La journée du " + fmt(s.date) + " passe à " + nom(c.doctor_id) + " (le receveur de la garde est en repos ce jour-là).");
    }
  });
  return lignes;
}

/* APERÇU EN DIRECT (proposant) : dès que les 2 shifts sont choisis, on
   valide l'échange à blanc et on affiche soit le refus (et sa raison —
   p. ex. « 2 A/S de garde »), soit les conséquences. */
function echApercu() {
  const zone = document.getElementById("ech-preview");
  const btn = document.getElementById("ech-proposer-btn");
  if (!zone) return;
  const mien = echMesShifts[echMienSel && echMienSel.value];
  const cible = echCibles[echCibleSel && echCibleSel.value];
  if (!mien || !cible) { zone.classList.add("hidden"); if (btn) btn.disabled = false; return; }
  zone.classList.remove("hidden");
  const r = validerEchange(echAllShifts, mien.id, cible.id, echDocsList);
  if (!r.ok) { zone.textContent = "❌ " + r.message; if (btn) btn.disabled = true; return; }
  const lignes = echResumeChanges(r.changes, echAllShifts);
  zone.innerHTML = "✅ Échange possible." + (lignes.length
    ? "<br>" + lignes.map((l) => "&nbsp;&nbsp;" + l).join("<br>")
    : " Aucun repos/récup impacté.");
  if (btn) btn.disabled = false;
}

/* Proposer un échange. */
if (echForm) echForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  echMessage("");
  const mien = echMesShifts[echMienSel.value];
  const cible = echCibles[echCibleSel.value];
  if (!mien || !cible) return echMessage("Choisis ton shift et celui du collègue.", "error");
  const { error } = await sb.from("shift_swaps").insert({
    from_doctor_id: medecinCourant.id,
    from_shift_id: String(mien.id),
    to_doctor_id: cible.doctor_id,
    to_shift_id: String(cible.id),
    note: (echNoteInput && echNoteInput.value.trim()) || null,
  });
  if (error) return echMessage("Erreur à la proposition : " + error.message, "error");
  echMessage("Proposition envoyée à " + ((echDocteurs[cible.doctor_id] || {}).name || "ton collègue") + ". ✅", "info");
  if (echNoteInput) echNoteInput.value = "";
  chargerEchanges();
});

/* Applique les `changes` du moteur (réaffecter / supprimer / créer). */
async function echAppliquerChanges(changes, shiftsContexte) {
  // schedule_id par mois (pour les repos créés), déduit du contexte chargé.
  const schedParMois = {};
  (shiftsContexte || []).forEach((s) => {
    if (s.schedule_id) schedParMois[s.date.slice(0, 7)] = s.schedule_id;
  });
  for (const c of changes) {
    if (c.creer) {
      let sid = schedParMois[c.creer.date.slice(0, 7)];
      if (!sid) {
        const [y, m] = c.creer.date.split("-").map(Number);
        const { data } = await sb.from("schedules").select("id").eq("year", y).eq("month", m).maybeSingle();
        sid = data && data.id;
      }
      if (!sid) continue; // pas de schedule pour ce mois → on n'invente pas
      const { error } = await sb.from("shifts").insert({
        date: c.creer.date, shift_type: c.creer.shift_type, poste: c.creer.poste,
        doctor_id: c.creer.doctor_id, schedule_id: sid,
      });
      if (error) throw error;
    } else if (c.supprimer) {
      const { error } = await sb.from("shifts").delete().eq("id", c.id);
      if (error) throw error;
    } else {
      const { data: maj, error } = await sb.from("shifts").update({ doctor_id: c.doctor_id }).eq("id", c.id).select("id");
      if (error) throw error;
      if (!maj || !maj.length) throw new Error("Mise à jour du shift refusée (droits insuffisants / RLS, ou shift introuvable — id=" + c.id + ").");
    }
  }
}

/* Accepter une proposition reçue : valider PUIS appliquer. */
async function echAccepter(swap) {
  echMessage("");
  try {
    // 1+2) Shifts re-lus + contexte ±6 jours + contrôles (propriétaires, publié).
    const c = await echContexte(swap.from_shift_id, swap.to_shift_id, swap.from_doctor_id, swap.to_doctor_id);
    if (c.erreur) return echMessage("Échange impossible : " + c.erreur, "error");
    const ctx = c.ctx;

    // 3) Validation par le moteur (planning.js, fonction pure).
    const docs = Object.keys(echDocteurs).map((id) => ({ id, name: echDocteurs[id].name, grade: echDocteurs[id].grade }));
    const r = validerEchange(ctx || [], swap.from_shift_id, swap.to_shift_id, docs);
    if (!r.ok) return echMessage(r.message, "error");

    // 3bis) CONFIRMATION INFORMÉE : on montre les conséquences (repos
    //       transférés, récups couplées perdues/créées) avant d'appliquer.
    const lignes = echResumeChanges(r.changes, ctx).map((l) => l.replace(/^[➕➖↪] /, "- "));
    const resume = "Accepter cet échange ?\n\n" +
      echLibelleShift(c.sFrom, true) + "  ⇄  " + echLibelleShift(c.sTo, true) +
      (lignes.length ? "\n\nConséquences :\n" + lignes.join("\n") : "\n\nAucun repos/récup impacté.");
    if (!window.confirm(resume)) return;

    // 4) Application + clôture de la proposition.
    await echAppliquerChanges(r.changes, ctx || []);
    const { error: e3 } = await sb.from("shift_swaps")
      .update({ status: "accepte", decided_at: new Date().toISOString() })
      .eq("id", swap.id);
    if (e3) throw e3;
    const _sync = await pousserVersSheetAuto("échange"); // M27 — miroir Google Sheets
    if (_sync && _sync.ok) echMessage("Échange appliqué et publié dans le Google Sheet. ✅", "info");
    else if (_sync && _sync.skip) echMessage("Échange appliqué. ⚠️ Miroir Google Sheet non configuré : la mise à jour du Sheet n'a pas été envoyée.", "info");
    else echMessage("Échange appliqué. ⚠️ Synchro Google Sheet non confirmée (vérifiez l'onglet _synchro du Sheet).", "info");
    if (calendrier) calendrier.refetchEvents();
    chargerEchanges();
    await echChargerContexte();
    echRemplirMedecins();
  } catch (err) {
    echMessage("Erreur à l'acceptation : " + (err.message || err), "error");
  }
}

async function echDecider(swap, statut) {
  const { error } = await sb.from("shift_swaps")
    .update({ status: statut, decided_at: new Date().toISOString() })
    .eq("id", swap.id);
  if (error) return echMessage("Erreur : " + error.message, "error");
  chargerEchanges();
}

const ECH_STATUTS = { en_attente: "⏳ En attente", accepte: "✅ Accepté", refuse: "❌ Refusé", annule: "🚫 Annulé" };

/* Listes reçues / émises + badge. */
async function chargerEchanges() {
  if (!echRecuesBody || !medecinCourant) return;
  const me = medecinCourant.id;
  const { data: swaps, error } = await sb.from("shift_swaps")
    .select("*")
    .or("from_doctor_id.eq." + me + ",to_doctor_id.eq." + me)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) { echMessage("Erreur de lecture des échanges : " + error.message, "error"); return; }

  // Détails des shifts référencés (pour l'affichage).
  const ids = []; (swaps || []).forEach((w) => { ids.push(w.from_shift_id, w.to_shift_id); });
  let parId = {};
  if (ids.length) {
    const { data: sh } = await sb.from("shifts")
      .select("id, date, shift_type, poste, doctor_id").in("id", ids);
    (sh || []).forEach((s) => { parId[String(s.id)] = s; });
  }
  const lib = (sid) => { const s = parId[String(sid)]; return s ? echLibelleShift(s, false) : "(shift disparu)"; };
  const nom = (did) => (echDocteurs[did] && echDocteurs[did].name) || did;

  const recues = (swaps || []).filter((w) => w.to_doctor_id === me);
  const emises = (swaps || []).filter((w) => w.from_doctor_id === me);

  const remplir = (tbody, liste, estRecue) => {
    tbody.innerHTML = "";
    liste.forEach((w) => {
      const tr = document.createElement("tr");
      const actions = document.createElement("td");
      if (w.status === "en_attente") {
        if (estRecue) {
          const ok = document.createElement("button");
          ok.type = "button"; ok.textContent = "Accepter"; ok.className = "mini";
          ok.addEventListener("click", () => echAccepter(w));
          const non = document.createElement("button");
          non.type = "button"; non.textContent = "Refuser"; non.className = "mini danger";
          non.addEventListener("click", () => echDecider(w, "refuse"));
          actions.appendChild(ok); actions.appendChild(non);
        } else {
          const ann = document.createElement("button");
          ann.type = "button"; ann.textContent = "Annuler"; ann.className = "mini danger";
          ann.addEventListener("click", () => echDecider(w, "annule"));
          actions.appendChild(ann);
        }
      }
      const cols = estRecue
        ? [nom(w.from_doctor_id), lib(w.from_shift_id), lib(w.to_shift_id), w.note || "", ECH_STATUTS[w.status] || w.status]
        : [nom(w.to_doctor_id), lib(w.from_shift_id), lib(w.to_shift_id), w.note || "", ECH_STATUTS[w.status] || w.status];
      cols.forEach((c) => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
  };
  remplir(echRecuesBody, recues, true);
  remplir(echEmisesBody, emises, false);
  document.getElementById("ech-recues-empty").classList.toggle("hidden", recues.length > 0);
  document.getElementById("ech-emises-empty").classList.toggle("hidden", emises.length > 0);

  // Badge : propositions reçues en attente.
  const badge = document.getElementById("tab-badge-echanges");
  const n = recues.filter((w) => w.status === "en_attente").length;
  if (badge) { badge.textContent = n; badge.classList.toggle("hidden", n === 0); }
}

/* Point d'entrée (appelé à la connexion d'un médecin). */
async function initEchanges() {
  if (!echMedecinSel && !echMienSel) return;
  try {
    await echChargerDocteurs();
    await echChargerContexte();
    echRemplirMedecins();
    await chargerEchanges();
  } catch (err) {
    echMessage("Erreur d'initialisation des échanges : " + (err.message || err), "error");
  }
}
if (echMedecinSel) echMedecinSel.addEventListener("change", () => { echRemplirMien(); });
if (echMienSel) echMienSel.addEventListener("change", () => { echRemplirCibles(); });
if (echCibleSel) echCibleSel.addEventListener("change", echApercu);

/* HISTORIQUE ADMIN (lecture seule) — tous les échanges, tous statuts. */
async function chargerEchangesAdmin() {
  const tbody = document.getElementById("ech-admin-tbody");
  if (!tbody) return;
  const { data: swaps, error } = await sb.from("shift_swaps")
    .select("*").order("created_at", { ascending: false }).limit(500);
  if (error) { return; }
  if (!Object.keys(echDocteurs).length) { try { await echChargerDocteurs(); } catch (e) {} }
  const ids = []; (swaps || []).forEach((w) => { ids.push(w.from_shift_id, w.to_shift_id); });
  let parId = {};
  if (ids.length) {
    const { data: sh } = await sb.from("shifts").select("id, date, shift_type, poste, doctor_id").in("id", ids);
    (sh || []).forEach((s) => { parId[String(s.id)] = s; });
  }
  const lib = (sid) => { const s = parId[String(sid)]; return s ? echLibelleShift(s, false) : "(shift supprimé)"; };
  const nom = (did) => (echDocteurs[did] && echDocteurs[did].name) || did;
  const fmt = (iso) => iso ? iso.slice(0, 10) : "";
  tbody.innerHTML = "";
  (swaps || []).forEach((w) => {
    const tr = document.createElement("tr");
    [fmt(w.created_at), nom(w.from_doctor_id), lib(w.from_shift_id), nom(w.to_doctor_id),
     lib(w.to_shift_id), w.note || "", ECH_STATUTS[w.status] || w.status, fmt(w.decided_at)]
      .forEach((c) => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
    // Actions admin : valider / refuser une proposition EN ATTENTE à la place du médecin.
    const act = document.createElement("td");
    if (w.status === "en_attente") {
      const ok = document.createElement("button");
      ok.type = "button"; ok.textContent = "Valider"; ok.className = "mini";
      ok.addEventListener("click", () => echAdminValiderProposition(w));
      const no = document.createElement("button");
      no.type = "button"; no.textContent = "Refuser"; no.className = "mini danger";
      no.addEventListener("click", () => echAdminRefuserProposition(w));
      act.appendChild(ok); act.appendChild(no);
    } else {
      // Échange clôturé (accepté / refusé / annulé) → suppression de l'historique.
      const del = document.createElement("button");
      del.type = "button"; del.textContent = "Supprimer"; del.className = "mini danger";
      del.addEventListener("click", () => echAdminSupprimer(w));
      act.appendChild(del);
    }
    tr.appendChild(act);
    tbody.appendChild(tr);
  });
  const empty = document.getElementById("ech-admin-empty");
  if (empty) empty.classList.toggle("hidden", (swaps || []).length > 0);
}
/* L'admin VALIDE une proposition en attente à la place du médecin (applique). */
async function echAdminValiderProposition(swap) {
  const msg = document.getElementById("echadm-msg");
  try {
    const c = await echContexte(swap.from_shift_id, swap.to_shift_id, swap.from_doctor_id, swap.to_doctor_id);
    if (c.erreur) { if (msg) { msg.textContent = "Validation impossible : " + c.erreur; msg.className = "message error"; } return; }
    const docs = Object.keys(echDocteurs).map((id) => ({ id, name: echDocteurs[id].name, grade: echDocteurs[id].grade }));
    const r = validerEchange(c.ctx || [], swap.from_shift_id, swap.to_shift_id, docs);
    if (!r.ok) { if (msg) { msg.textContent = "❌ " + r.message; msg.className = "message error"; } return; }
    if (!window.confirm("Valider cet échange à la place du médecin ?")) return;
    await echAppliquerChanges(r.changes, c.ctx || []);
    await sb.from("shift_swaps").update({ status: "accepte", decided_at: new Date().toISOString() }).eq("id", swap.id);
    const sync = await pousserVersSheetAuto("échange admin");
    if (msg) { msg.textContent = "Échange validé par l'admin." + (sync && sync.ok ? " Publié dans le Sheet. ✅" : (sync && sync.skip ? " ⚠️ Miroir Sheet non configuré." : " ⚠️ Synchro Sheet non confirmée.")); msg.className = "message info"; }
    if (calendrier) calendrier.refetchEvents();
    chargerEchangesAdmin();
  } catch (e) { if (msg) { msg.textContent = "Erreur : " + (e.message || e); msg.className = "message error"; } }
}
/* L'admin REFUSE une proposition en attente. */
async function echAdminRefuserProposition(swap) {
  await sb.from("shift_swaps").update({ status: "refuse", decided_at: new Date().toISOString() }).eq("id", swap.id);
  chargerEchangesAdmin();
}

const echAdminRefreshBtn = document.getElementById("ech-admin-refresh");
if (echAdminRefreshBtn) echAdminRefreshBtn.addEventListener("click", chargerEchangesAdmin);

/* Supprime un échange de l'historique (action admin, irréversible). */
async function echAdminSupprimer(swap) {
  if (!window.confirm("Supprimer définitivement cet échange de l'historique ?")) return;
  const { error } = await sb.from("shift_swaps").delete().eq("id", swap.id);
  if (error) { window.alert("Erreur : " + error.message); return; }
  chargerEchangesAdmin();
}
/* Purge les échanges REFUSÉS et ANNULÉS. */
const echSupprRefusesBtn = document.getElementById("ech-suppr-refuses");
if (echSupprRefusesBtn) echSupprRefusesBtn.addEventListener("click", async () => {
  if (!window.confirm("Supprimer tous les échanges REFUSÉS et ANNULÉS de l'historique ?")) return;
  const { error } = await sb.from("shift_swaps").delete().in("status", ["refuse", "annule"]);
  if (error) { window.alert("Erreur : " + error.message); return; }
  chargerEchangesAdmin();
});
/* Efface TOUT l'historique des échanges (les shifts déjà échangés ne changent pas). */
const echSupprToutBtn = document.getElementById("ech-suppr-tout");
if (echSupprToutBtn) echSupprToutBtn.addEventListener("click", async () => {
  if (!window.confirm("Tout effacer l'historique des échanges ?\n\nSupprime TOUS les échanges (y compris acceptés et en attente). Les shifts déjà échangés ne sont PAS modifiés. Action irréversible.")) return;
  const { error } = await sb.from("shift_swaps").delete().gte("created_at", "1970-01-01");
  if (error) { window.alert("Erreur : " + error.message); return; }
  chargerEchangesAdmin();
});

/* ÉCHANGE ADMIN (création directe, appliqué immédiatement). Réutilise le moteur
   validerEchange + l'application des changes (échAppliquerChanges). */
let echAdminShifts = [];
async function echAdminCharger() {
  const aMed = document.getElementById("echadm-a-med");
  if (!aMed) return;
  if (!Object.keys(echDocteurs).length) { try { await echChargerDocteurs(); } catch (e) {} }
  const pubIds = await echSchedulesPublies();
  echAdminShifts = [];
  if (pubIds.length) {
    const { data } = await sb.from("shifts")
      .select("id, date, shift_type, poste, doctor_id, schedule_id").in("schedule_id", pubIds);
    echAdminShifts = data || [];
  }
  const idsClin = Object.keys(echDocteurs)
    .filter((id) => echCategorie(echDocteurs[id]) !== "autre")
    .sort((a, b) => (echDocteurs[a].name || "").localeCompare(echDocteurs[b].name || ""));
  const aOpts = "<option value=''>— choisir —</option>" +
    idsClin.map((id) => "<option value='" + id + "'>" + ((echDocteurs[id].name) || id) + "</option>").join("");
  const _aEl = document.getElementById("echadm-a-med"); if (_aEl) _aEl.innerHTML = aOpts;
  const _bEl = document.getElementById("echadm-b-med"); if (_bEl) _bEl.innerHTML = "<option value=''>— choisir d'abord le médecin A —</option>";
  ["echadm-a-shift", "echadm-b-shift"].forEach((id) => { const el = document.getElementById(id); if (el) { el.innerHTML = "<option value=''>—</option>"; el.disabled = true; } });
  const msg = document.getElementById("echadm-msg"); if (msg) msg.textContent = "";
}
function echAdminShiftsDe(docId) {
  return echAdminShifts.filter((s) => s.doctor_id === docId && s.date >= echAujourdhui() && ECH_GROUPES[s.shift_type]);
}
/* Remplit la liste « Médecin B » avec les médecins de MÊME catégorie que A
   (résident/AS ↔ résident/AS, PG ↔ PG ; jamais de mélange, jamais d'admin). */
function echAdminRemplirMedB() {
  const aMed = document.getElementById("echadm-a-med");
  const bEl = document.getElementById("echadm-b-med");
  if (!aMed || !bEl) return;
  const catA = echCategorie(echDocteurs[aMed.value]);
  if (!aMed.value || catA === "autre") { bEl.innerHTML = "<option value=''>— choisir d'abord le médecin A —</option>"; return; }
  const ids = Object.keys(echDocteurs)
    .filter((id) => id !== aMed.value && echCategorie(echDocteurs[id]) === catA)
    .sort((a, b) => (echDocteurs[a].name || "").localeCompare(echDocteurs[b].name || ""));
  bEl.innerHTML = "<option value=''>— choisir —</option>" +
    ids.map((id) => "<option value='" + id + "'>" + ((echDocteurs[id].name) || id) + "</option>").join("");
}
function echAdminRemplirShifts(medSelId, shiftSelId, nature) {
  const med = document.getElementById(medSelId).value;
  const sel = document.getElementById(shiftSelId);
  sel.innerHTML = "<option value=''>—</option>"; sel.disabled = !med;
  if (!med) return;
  echAdminShiftsDe(med).forEach((s) => {
    if (nature && ECH_GROUPES[s.shift_type] !== nature) return;
    const o = document.createElement("option"); o.value = s.id; o.textContent = echLibelleShift(s, false); sel.appendChild(o);
  });
}
const _echadmAMed = document.getElementById("echadm-a-med");
const _echadmAShift = document.getElementById("echadm-a-shift");
const _echadmBMed = document.getElementById("echadm-b-med");
const _echadmBShift = document.getElementById("echadm-b-shift");
const _echadmApply = document.getElementById("echadm-apply");
if (_echadmAMed) _echadmAMed.addEventListener("change", () => { echAdminRemplirShifts("echadm-a-med", "echadm-a-shift"); echAdminRemplirMedB(); if (_echadmBShift) { _echadmBShift.innerHTML = "<option value=''>—</option>"; _echadmBShift.disabled = true; } });
if (_echadmAShift) _echadmAShift.addEventListener("change", () => {
  const s = echAdminShifts.find((x) => String(x.id) === String(_echadmAShift.value));
  const nature = s ? ECH_GROUPES[s.shift_type] : null;
  if (_echadmBMed && _echadmBMed.value) echAdminRemplirShifts("echadm-b-med", "echadm-b-shift", nature);
});
if (_echadmBMed) _echadmBMed.addEventListener("change", () => {
  const s = echAdminShifts.find((x) => String(x.id) === String(_echadmAShift && _echadmAShift.value));
  const nature = s ? ECH_GROUPES[s.shift_type] : null;
  echAdminRemplirShifts("echadm-b-med", "echadm-b-shift", nature);
});
if (_echadmApply) _echadmApply.addEventListener("click", async () => {
  const msg = document.getElementById("echadm-msg");
  const aId = _echadmAShift && _echadmAShift.value, bId = _echadmBShift && _echadmBShift.value;
  if (!aId || !bId) { msg.textContent = "Choisis les deux shifts."; msg.className = "message error"; return; }
  try {
    const docs = Object.keys(echDocteurs).map((id) => ({ id, name: echDocteurs[id].name, grade: echDocteurs[id].grade }));
    const r = validerEchange(echAdminShifts, aId, bId, docs);
    if (!r.ok) { msg.textContent = "❌ " + r.message; msg.className = "message error"; return; }
    if (!window.confirm("Appliquer cet échange ?")) return;
    await echAppliquerChanges(r.changes, echAdminShifts);
    const sA = echAdminShifts.find((s) => String(s.id) === String(aId));
    const sB = echAdminShifts.find((s) => String(s.id) === String(bId));
    await sb.from("shift_swaps").insert({
      from_doctor_id: sA.doctor_id, from_shift_id: String(aId),
      to_doctor_id: sB.doctor_id, to_shift_id: String(bId),
      note: "(échange admin)", status: "accepte", decided_at: new Date().toISOString(),
    });
    const sync = await pousserVersSheetAuto("échange admin");
    msg.textContent = "Échange appliqué." + (sync && sync.ok ? " Publié dans le Sheet. ✅" : (sync && sync.skip ? " ⚠️ Miroir Sheet non configuré." : " ⚠️ Synchro Sheet non confirmée."));
    msg.className = "message info";
    if (calendrier) calendrier.refetchEvents();
    await echAdminCharger(); chargerEchangesAdmin();
  } catch (e) { msg.textContent = "Erreur : " + (e.message || e); msg.className = "message error"; }
});
