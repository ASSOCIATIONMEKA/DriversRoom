import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔧 Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDJ7uhvc31nyRB4bh9bVtkagaUksXG1fOo",
  authDomain: "estacupbymeka.firebaseapp.com",
  projectId: "estacupbymeka",
  storageBucket: "estacupbymeka.firebasestorage.app",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
let currentUser = null;

function showMsg(text, type = "success") {
  const box = $("msgBox");
  box.textContent = text;
  box.className = `msg-box msg-${type}`;
  box.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 🔐 SÉCURITÉ : Vérification des droits d'accès au chargement
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    // Vérification du rôle dans Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;

    if (!userData || userData.admin !== true) {
      // Si l'utilisateur n'est pas admin, redirection immédiate vers l'accueil
      console.warn("Accès refusé : vous n'êtes pas administrateur.");
      window.location.href = "index.html";
      return;
    }

    currentUser = user;
    // L'utilisateur est bien admin, on charge la liste
    await loadAllUsers();

  } catch (err) {
    console.error("Erreur de vérification des droits :", err);
    window.location.href = "index.html";
  }
});

// 👥 Chargement de tous les utilisateurs de la collection "users"
async function loadAllUsers() {
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    const tbody = $("usersTableBody");
    tbody.innerHTML = "";

    querySnapshot.forEach((userDoc) => {
      const uid = userDoc.id;
      const data = userDoc.data();
      
      const firstName = data.firstName || "Inconnu";
      const lastName = data.lastName || "";
      const email = data.email || "Non renseigné";
      const isAdmin = data.admin === true;

      // Création de la ligne du tableau
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border-primary)";
      
      // Style des badges de statut
      const badgeClass = isAdmin ? "badge-license licence-pro" : "badge-license licence-rookie";
      const badgeText = isAdmin ? "👑 Admin" : "📋 Pilote";

      // On empêche l'admin connecté de se retirer ses propres droits par accident
      const isSelf = (uid === currentUser.uid);
      const disabledAttribute = isSelf ? "disabled" : "";
      const buttonText = isAdmin ? "Retirer Admin" : "Rendre Admin";
      const buttonStyle = isAdmin ? "background: linear-gradient(135deg, var(--accent-danger), #dc2626); font-size: 0.8rem; padding: 0.5rem 1rem;" : "background: linear-gradient(135deg, var(--accent-success), #16a34a); font-size: 0.8rem; padding: 0.5rem 1rem;";

      tr.innerHTML = `
        <td style="padding: 1rem; font-weight: 600;">${firstName} ${lastName} ${isSelf ? '<span style="color:var(--accent-primary); font-size:0.8rem;">(Vous)</span>' : ''}</td>
        <td style="padding: 1rem; color: var(--text-secondary);">${email}</td>
        <td style="padding: 1rem; text-align: center;">
          <span class="${badgeClass}" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;">${badgeText}</span>
        </td>
        <td style="padding: 1rem; text-align: right;">
          <button class="btn-toggle-admin" data-uid="${uid}" data-status="${isAdmin}" ${disabledAttribute} style="${buttonStyle}">
            ${buttonText}
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Attacher les événements sur les boutons
    document.querySelectorAll(".btn-toggle-admin").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const targetUid = e.target.getAttribute("data-uid");
        const currentStatus = e.target.getAttribute("data-status") === "true";
        await toggleAdminStatus(targetUid, currentStatus);
      });
    });

    // Affichage de la section et masquage du chargement
    $("loading").classList.add("hidden");
    $("usersSection").classList.remove("hidden");

  } catch (err) {
    console.error("Erreur au chargement des utilisateurs :", err);
    showMsg("Impossible de charger la liste des utilisateurs.", "error");
  }
}

// 🔄 Fonction pour intervertir le rôle Admin / Pilote
async function toggleAdminStatus(uid, currentStatus) {
  try {
    const userRef = doc(db, "users", uid);
    
    // Inversion du statut
    await setDoc(userRef, {
      admin: !currentStatus
    }, { merge: true });

    showMsg("Droits d'accès mis à jour avec succès !");
    
    // Recharger la liste pour actualiser l'affichage
    await loadAllUsers();
  } catch (err) {
    console.error("Erreur lors de la modification des droits :", err);
    showMsg("Erreur lors de la mise à jour des droits.", "error");
  }
}