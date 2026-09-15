import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
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

// 🛡️ CORRECTION DU BUG DE BOUCLE : Forcer la persistance locale
setPersistence(auth, browserLocalPersistence).catch(console.error);

// 🗺️ Fonction utilitaire d'alias d'éléments
const $ = (id) => document.getElementById(id);

const loginSection = $("loginSection");
const registerSection = $("registerSection");
const btnShowRegister = $("btnShowRegister");
const btnShowLogin = $("btnShowLogin");
const formTitle = $("formTitle");

const loginForm = $("loginForm");
const registerForm = $("registerForm");
const errorMsg = $("errorMsg");
const successMsg = $("successMsg");

// Bascules entre Connexion / Inscription
if (btnShowRegister) {
  btnShowRegister.addEventListener("click", () => {
    loginSection.classList.add("hidden");
    registerSection.classList.remove("hidden");
    formTitle.textContent = "Inscription";
    setError("");
    setSuccess("");
  });
}

if (btnShowLogin) {
  btnShowLogin.addEventListener("click", () => {
    registerSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    formTitle.textContent = "Connexion";
    setError("");
    setSuccess("");
  });
}

function setError(msg) { if(errorMsg) errorMsg.textContent = msg; }
function setSuccess(msg) { if(successMsg) successMsg.textContent = msg; }

// ================= CONNEXION =================
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    
    if (!email || !password) return setError("Veuillez remplir tous les champs.");
    
    const btn = loginForm.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "Connexion...";

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // La redirection est gérée par onAuthStateChanged
    } catch (err) {
      console.error(err);
      setError(normalizeAuthError(err));
      btn.disabled = false;
      btn.textContent = "Se connecter";
    }
  });
}

// ================= INSCRIPTION =================
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const firstNameRaw = $("firstName").value;
    const lastNameRaw = $("lastName").value;
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;
    const confirm = $("confirmPassword").value;

    if (!firstNameRaw || !lastNameRaw || !email || !password || !confirm) {
      return setError("Veuillez remplir tous les champs.");
    }
    if (password !== confirm) {
      return setError("Les mots de passe ne correspondent pas.");
    }

    const { firstName, lastName } = formatName(firstNameRaw, lastNameRaw);

    const btn = registerForm.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "Création du compte...";

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        firstName: firstName,
        lastName: lastName,
        email: email,
        role: "visitor",
        licenseClass: "Rookie",
        irating: 0,
        safetyRating: "N/A",
        createdAt: new Date()
      });

      setSuccess("Compte créé avec succès !");
      setTimeout(() => {
        window.location.replace("index.html");
      }, 1500);

    } catch (err) {
      console.error(err);
      setError(normalizeAuthError(err));
      btn.disabled = false;
      btn.textContent = "S'inscrire";
    }
  });
}

// ================= MOT DE PASSE OUBLIÉ =================
const forgotBtn = $("forgotPassword");
const modalReset = $("forgotPasswordModal");
const btnCancelReset = $("btnCancelReset");
const btnConfirmReset = $("btnConfirmReset");
const resetEmailInput = $("resetEmailInput");

if (forgotBtn && modalReset) {
  forgotBtn.addEventListener("click", () => {
    modalReset.classList.remove("hidden");
    resetEmailInput.value = $("loginEmail").value;
  });
}
if (btnCancelReset && modalReset) {
  btnCancelReset.addEventListener("click", () => {
    modalReset.classList.add("hidden");
    resetEmailInput.value = "";
  });
}
if (btnConfirmReset) {
  btnConfirmReset.addEventListener("click", async () => {
    const email = resetEmailInput.value.trim();
    if (!email) {
      alert("Veuillez saisir une adresse email.");
      return;
    }
    btnConfirmReset.disabled = true;
    btnConfirmReset.textContent = "Envoi...";
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Un lien de réinitialisation a été envoyé à " + email);
      modalReset.classList.add("hidden");
    } catch (err) {
      alert("Erreur : " + normalizeAuthError(err));
    } finally {
      btnConfirmReset.disabled = false;
      btnConfirmReset.textContent = "Envoyer";
    }
  });
}

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
    case "auth/weak-password":
      return "Le mot de passe doit faire au moins 6 caractères.";
    case "auth/email-already-in-use":
      return "Cet email est déjà utilisé.";
    default:
      return "Une erreur est survenue (" + code + ").";
  }
}

// ================= GESTION DES REDIRECTIONS =================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("Utilisateur connecté:", user.email);
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const role = userData.role || "visitor";
        
        const currentPath = window.location.pathname;
        if (currentPath.includes("login.html") || currentPath.endsWith("/")) {
          
          // ⏳ CORRECTION DU BUG DE BOUCLE : Délai de 800ms
          // Cela permet à IndexedDB (la mémoire du tel) de terminer la sauvegarde avant de changer de page
          setTimeout(() => {
            if (role === "admin") {
              window.location.replace("admin-s10.html");
            } else if (role === "pilote") {
               window.location.replace("estacup-s10.html");
            } else {
               window.location.replace("index.html");
            }
          }, 800);
        }
      }
    } catch(err) {
      console.error("Erreur récupération rôle:", err);
    }
  } else {
      console.log("Aucun utilisateur connecté.");
  }
});
