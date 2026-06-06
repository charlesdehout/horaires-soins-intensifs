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
    .select("name, role")
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
  const estAdmin = profil.role === "admin";

  welcomeText.textContent = "Connecté en tant que " + (profil.name || "");
  roleText.textContent = estAdmin ? "Administrateur (chef de service)" : "Médecin";

  // On montre uniquement la zone correspondant au rôle.
  adminZone.classList.toggle("hidden", !estAdmin);
  doctorZone.classList.toggle("hidden", estAdmin);

  basculerVue(true);
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
