import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔧 Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDJ7uhvc31nyRB4bh9bVtkagaUksXG1fOo",
  authDomain: "estacupbymeka.firebaseapp.com",
  projectId: "estacupbymeka",
  storageBucket: "estacupbymeka.appspot.com",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🗺️ Fonction utilitaire d'aiguillage intelligent après connexion/inscription
function redirectUser(isAdmin) {
  const redirectPage = localStorage.getItem("redirectAfterLogin");
  
  if (redirectPage) {
    // Si l'utilisateur tentait d'accéder à une page précise (ex: S9 ou S10), on l'y envoie
    localStorage.removeItem("redirectAfterLogin"); // Nettoyage du témoin
    window.location.href = redirectPage;
  } else {
    // Sinon, redirection classique par défaut selon le rôle
    if (isAdmin) {
      window.location.href = "admin-s10.html"; // Panel d'administration de la saison en cours
    } else {
      window.location.href = "estacup-s10.html"; // Tableau de bord de la saison en cours
    }
  }
}

// 🔄 Redirection automatique si le pilote est déjà connecté globalement
onAuthStateChanged(auth, async (user) => {
  if (user) {
    localStorage.setItem("isLoggedIn", "true"); // Sauvegarde l'état pour la navbar
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const isAdmin = userDoc.exists() && userDoc.data().admin === true;
      redirectUser(isAdmin);
    } catch (err) {
      console.error("Erreur lors de la redirection automatique :", err);
    }
  } else {
    localStorage.removeItem("isLoggedIn");
  }
});

// Helpers UI
const $ = (id) => document.getElementById(id);
const errorBox = $("error");
const successBox = $("success");
function setError(msg = "") { if (errorBox) errorBox.textContent = msg; }
function setSuccess(msg = "") { if (successBox) successBox.textContent = msg; if (msg) setError(""); }

// Connexion
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  setError(""); setSuccess("");

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Mémorisation immédiate de la session pour devancer l'asynchronisme de Firebase
    localStorage.setItem("isLoggedIn", "true");

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      redirectUser(data.admin === true);
      return;
    }

    const mapDoc = await getDoc(doc(db, "authMap", user.uid));
    if (mapDoc.exists()) {
      redirectUser(false);
    } else {
      setError("Profil introuvable.");
    }
  } catch (err) {
    setError(normalizeAuthError(err));
  }
});

// Afficher / cacher section inscription
$("showRegister").addEventListener("click", () => {
  $("registerSection").classList.toggle("hidden");
  setError(""); setSuccess("");
});

// Inscription
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const rawFirstName = $("firstName").value;
  const rawLastName = $("lastName").value;
  const dob = $("dob").value;
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value;
  const confirm = $("confirmPassword").value;

  if (password !== confirm) {
    setError("Les mots de passe ne correspondent pas.");
    return;
  }

  const { firstName, lastName } = formatName(rawFirstName, rawLastName);
  setError(""); setSuccess("");

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    localStorage.setItem("isLoggedIn", "true");

    const allUsers = await getDocs(collection(db, "users"));
    const existing = allUsers.docs.find(docu => {
      const d = docu.data();
      return d.firstName === firstName && d.lastName === lastName;
    });

    if (existing) {
      await setDoc(doc(db, "authMap", firebaseUser.uid), { pilotUid: existing.id });
      await setDoc(doc(db, "users", existing.id), { ...existing.data(), email, uid: existing.id });
    } else {
      await setDoc(doc(db, "users", firebaseUser.uid), {
        uid: firebaseUser.uid,
        email,
        firstName,
        lastName,
        dob,
        licenseId: "PILOT-" + Math.random().toString(36).substring(2, 6).toUpperCase(),
        eloRating: 1000,
        licensePoints: 8,
        raceCount: 0,
        createdAt: new Date(),
        admin: false
      });
    }

    // Un nouvel inscrit n'est pas admin par défaut
    redirectUser(false);
  } catch (err) {
    setError(normalizeAuthError(err));
  }
});

// 🔁 Mot de passe oublié
$("forgotPassword").addEventListener("click", async () => {
  setError(""); setSuccess("");
  const email = $("loginEmail").value.trim();
  if (!email) {
    setError("Entre ton email dans le champ ‘Email’, puis clique à nouveau sur « Mot de passe oublié ? »");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setSuccess("Un email de réinitialisation vient d’être envoyé. Vérifie ta boîte de réception (ainsi que tes spams). L’envoi peut prendre jusqu’à une minute.");
  } catch (err) {
    setError(normalizeAuthError(err));
  }
});

// Formatage prénom/nom
function formatName(firstName, lastName) {
  const p = firstName.trim().toLowerCase();
  const n = lastName.trim().toLowerCase();
  return {
    firstName: p.charAt(0).toUpperCase() + p.slice(1),
    lastName: n.toUpperCase()
  };
}

// Nettoyage messages au input
["loginEmail","loginPassword","registerEmail","registerPassword","confirmPassword","firstName","lastName"].forEach(id=>{
  const el = $(id);
  if (el) el.addEventListener("input", () => { setError(""); setSuccess(""); });
});

// Normalisation erreurs Auth
function normalizeAuthError(err) {
  const code = (err && err.code) ? String(err.code) : "";
  switch (code) {
    case "auth/invalid-email":
      return "Adresse email invalide.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "Email ou mot de passe incorrect.";
    case "auth/wrong-password":
      return "Mot de passe incorrect.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessaie plus tard.";
    case "auth/email-not-found":
      return "Aucun compte avec cet email.";
    default:
      return err && err.message ? err.message : "Une erreur est survenue.";
  }
}
