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

// 🗺️ Fonction utilitaire d'aiguillage
function redirectUser(isAdmin) {
  const redirectPage = localStorage.getItem("redirectAfterLogin");
  
  if (redirectPage) {
    localStorage.removeItem("redirectAfterLogin");
    window.location.replace(redirectPage);
  } else {
    if (isAdmin) {
      window.location.replace("admin-s10.html");
    } else {
      window.location.replace("estacup-s10.html");
    }
  }
}

// Helpers UI
const $ = (id) => document.getElementById(id);
const loginSection = $("loginSection");
const registerSection = $("registerSection");
const btnShowRegister = $("showRegister");
const btnShowLogin = $("showLogin");
const formTitle = $("formTitle");

const loginForm = $("loginForm");
const registerForm = $("registerForm");
const errorBox = $("error");
const successBox = $("success");

function setError(msg) { if(errorBox) errorBox.textContent = msg; }
function setSuccess(msg) { if(successBox) successBox.textContent = msg; if(msg) setError(""); }

// ================= GESTION DE L'AFFICHAGE =================
if (btnShowRegister) {
  btnShowRegister.addEventListener("click", () => {
    loginSection.classList.add("hidden");
    registerSection.classList.remove("hidden");
    if(formTitle) formTitle.textContent = "Inscription";
    setError(""); setSuccess("");
  });
}

if (btnShowLogin) {
  btnShowLogin.addEventListener("click", () => {
    registerSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    if(formTitle) formTitle.textContent = "Connexion";
    setError(""); setSuccess("");
  });
}

// ================= NOUVEAU : GESTION DE L'ŒIL (AFFICHER/MASQUER MDP) =================
window.togglePasswordVisibility = function(fieldId, iconElement) {
  const inputField = document.getElementById(fieldId);
  if (!inputField) return;

  if (inputField.type === "password") {
    inputField.type = "text";
    iconElement.textContent = "👁️‍🗨️";
    iconElement.title = "Masquer le mot de passe";
  } else {
    inputField.type = "password";
    iconElement.textContent = "👁️";
    iconElement.title = "Afficher le mot de passe";
  }
};

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
    setError(""); setSuccess("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // La redirection est gérée plus bas par onAuthStateChanged
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
    const rawFirstName = $("firstName").value;
    const rawLastName = $("lastName").value;
    const dob = $("dob").value;
    const role = $("registerRole").value;
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;
    const confirm = $("confirmPassword").value;

    if (!rawFirstName || !rawLastName || !email || !password || !confirm) {
      return setError("Veuillez remplir tous les champs.");
    }
    if (password !== confirm) {
      return setError("Les mots de passe ne correspondent pas.");
    }

    const { firstName, lastName } = formatName(rawFirstName, rawLastName);
    const btn = registerForm.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "Création du compte...";
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
        await setDoc(doc(db, "users", existing.id), { 
          ...existing.data(), 
          email, 
          uid: existing.id,
          role: role
        });
      } else {
        await setDoc(doc(db, "users", firebaseUser.uid), {
          uid: firebaseUser.uid,
          email,
          firstName,
          lastName,
          dob,
          role: role,
          licenseId: "PILOT-" + Math.random().toString(36).substring(2, 6).toUpperCase(),
          eloRating: 1000,
          licensePoints: 8,
          raceCount: 0,
          createdAt: new Date(),
          admin: false
        });
      }

      setSuccess("Compte créé avec succès !");
      // La redirection est gérée plus bas
    } catch (err) {
      console.error(err);
      setError(normalizeAuthError(err));
      btn.disabled = false;
      btn.textContent = "Valider l'inscription";
    }
  });
}

// ================= MOT DE PASSE OUBLIÉ =================
const forgotBtn = $("forgotPassword");
const modalReset = $("forgotPasswordModal");
const btnCancelReset = $("btnCancelReset");
const btnConfirmReset = $("btnConfirmReset");
const resetEmailInput = $("resetEmailInput");
const resetMessage = $("resetMessage");

if (forgotBtn && modalReset) {
  forgotBtn.addEventListener("click", () => {
    modalReset.classList.remove("hidden");
    resetEmailInput.value = $("loginEmail").value.trim();
    if(resetMessage) resetMessage.textContent = "";
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
      if(resetMessage) {
        resetMessage.style.color = "#f87171";
        resetMessage.textContent = "Veuillez saisir une adresse email valide.";
      }
      return;
    }
    btnConfirmReset.disabled = true;
    btnConfirmReset.textContent = "Envoi...";
    try {
      await sendPasswordResetEmail(auth, email);
      if(resetMessage) {
        resetMessage.style.color = "#34d399";
        resetMessage.textContent = "Lien envoyé ! Vérifiez votre boîte de réception.";
      }
      setTimeout(() => {
        modalReset.classList.add("hidden");
        btnConfirmReset.disabled = false;
        btnConfirmReset.textContent = "Envoyer";
      }, 4000);
    } catch (err) {
      if(resetMessage) {
        resetMessage.style.color = "#f87171";
        resetMessage.textContent = normalizeAuthError(err);
      }
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
    case "auth/invalid-email": return "Adresse email invalide.";
    case "auth/user-not-found":
    case "auth/invalid-credential": return "Email ou mot de passe incorrect.";
    case "auth/wrong-password": return "Mot de passe incorrect.";
    case "auth/too-many-requests": return "Trop de tentatives. Réessaie plus tard.";
    case "auth/email-not-found": return "Aucun compte avec cet email.";
    case "auth/weak-password": return "Le mot de passe doit faire au moins 6 caractères.";
    case "auth/email-already-in-use": return "Cet email est déjà utilisé.";
    default: return "Une erreur est survenue (" + code + ").";
  }
}

// ================= GESTION DES REDIRECTIONS AVEC DÉLAI ANTI-BOUCLE =================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    localStorage.setItem("isLoggedIn", "true");
    try {
      let isAdmin = false;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        isAdmin = userData.admin === true;
      } else {
        const mapDoc = await getDoc(doc(db, "authMap", user.uid));
        if (mapDoc.exists()) {
          const mappedDoc = await getDoc(doc(db, "users", mapDoc.data().pilotUid));
          if(mappedDoc.exists()) isAdmin = mappedDoc.data().admin === true;
        }
      }
      
      const currentPath = window.location.pathname;
      if (currentPath.includes("login.html") || currentPath.endsWith("/")) {
        setTimeout(() => {
          redirectUser(isAdmin);
        }, 800);
      }
    } catch(err) {
      console.error("Erreur récupération données:", err);
    }
  } else {
    localStorage.removeItem("isLoggedIn");
  }
});
