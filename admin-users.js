import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔧 Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDJ7uhvc31nyRB4bh9bVtkagaUksXG1fOo",
  authDomain: "estacupbymeka.firebaseapp.com",
  projectId: "estacupbymeka",
  storageBucket: "estacupbymeka.firebasestorage.app",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};

// 🛡️ Sécurité de double initialisation
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
let currentUser = null;

function showMsg(text, type = "success") {
  const box = $("msgBox");
  box.textContent = text;
  box.className = `msg-box msg-${type}`;
  box.classList.remove("hidden");
  
  // Cache le message après 4 secondes
  setTimeout(() => {
    box.classList.add("hidden");
  }, 4000);
}

// 🔐 SÉCURITÉ : Vérification des droits d'accès au chargement
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;

    if (!userData || userData.admin !== true) {
      console.warn("Accès refusé : vous n'êtes pas administrateur.");
      window.location.href = "index.html";
      return;
    }

    currentUser = user;
    await loadAllUsers();

  } catch (err) {
    console.error("Erreur de vérification des droits :", err);
    window.location.href = "index.html";
  }
});

// 👥 Chargement de tous les utilisateurs
async function loadAllUsers() {
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    const tbody = $("usersTableBody");
    tbody.innerHTML = "";

    // Trier les utilisateurs par ordre alphabétique (Nom)
    const usersList = [];
    querySnapshot.forEach((doc) => {
      usersList.push({ uid: doc.id, ...doc.data() });
    });
    usersList.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));

    usersList.forEach((data) => {
      const uid = data.uid;
      
      const firstName = data.firstName || "Inconnu";
      const lastName = data.lastName || "";
      const email = data.email || "Non renseigné";
      const isAdmin = data.admin === true;
      const license = data.licenseClass || data.licenceClass || data.licence || "Rookie";

      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border-primary)";
      
      const badgeClass = isAdmin ? "badge-license licence-pro" : "badge-license licence-rookie";
      const badgeText = isAdmin ? "👑 Admin" : "📋 Pilote";

      const isSelf = (uid === currentUser.uid);
      const disabledAttribute = isSelf ? "disabled" : "";
      const buttonText = isAdmin ? "Retirer Admin" : "Rendre Admin";
      const buttonStyle = isAdmin 
        ? "background: linear-gradient(135deg, var(--accent-danger), #dc2626); font-size: 0.8rem; padding: 0.5rem 1rem;" 
        : "background: linear-gradient(135deg, var(--accent-success), #16a34a); font-size: 0.8rem; padding: 0.5rem 1rem;";

      tr.innerHTML = `
        <td style="padding: 1rem; font-weight: 600;">${firstName} ${lastName} ${isSelf ? '<span style="color:var(--accent-primary); font-size:0.8rem;"><br>(Vous)</span>' : ''}</td>
        <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.9rem;">${email}</td>
        <td style="padding: 1rem; text-align: center;">
          <span class="${badgeClass}" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;">${badgeText}</span>
        </td>
        <td style="padding: 1rem; text-align: center;">
          <select class="license-select" data-uid="${uid}" style="padding: 0.4rem; border-radius: 6px; background: #0f172a; color: white; border: 1px solid var(--border-primary); cursor: pointer; outline: none;">
            <option value="Rookie" ${license === 'Rookie' ? 'selected' : ''}>Rookie</option>
            <option value="Challenger" ${license === 'Challenger' ? 'selected' : ''}>Challenger</option>
            <option value="Pro" ${license === 'Pro' ? 'selected' : ''}>Pro</option>
          </select>
        </td>
        <td style="padding: 1rem; text-align: right;">
          <button class="btn-toggle-admin" data-uid="${uid}" data-status="${isAdmin}" ${disabledAttribute} style="${buttonStyle}">
            ${buttonText}
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Écouteurs pour le bouton "Rendre Admin"
    document.querySelectorAll(".btn-toggle-admin").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const targetUid = e.target.getAttribute("data-uid");
        const currentStatus = e.target.getAttribute("data-status") === "true";
        await toggleAdminStatus(targetUid, currentStatus);
      });
    });

    // Écouteurs pour la modification de la licence
    document.querySelectorAll(".license-select").forEach(select => {
      select.addEventListener("change", async (e) => {
        const targetUid = e.target.getAttribute("data-uid");
        const newLicense = e.target.value;
        await updateLicense(targetUid, newLicense);
      });
    });

    $("loading").classList.add("hidden");
    $("usersSection").classList.remove("hidden");

  } catch (err) {
    console.error("Erreur au chargement des utilisateurs :", err);
    showMsg("Impossible de charger la liste des utilisateurs.", "error");
  }
}

// 🔄 Modifier le rôle administrateur
async function toggleAdminStatus(uid, currentStatus) {
  try {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
      admin: !currentStatus
    }, { merge: true });

    showMsg("Droits d'accès mis à jour avec succès !");
    await loadAllUsers();
  } catch (err) {
    console.error("Erreur lors de la modification des droits :", err);
    showMsg("Erreur lors de la mise à jour des droits.", "error");
  }
}

// 🔄 Modifier la licence du pilote
async function updateLicense(uid, newLicense) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      licenseClass: newLicense
    });
    showMsg(`Licence mise à jour avec succès : ${newLicense}`);
  } catch (err) {
    console.error("Erreur lors de la modification de la licence :", err);
    showMsg("Erreur lors de la mise à jour de la licence.", "error");
  }
}
