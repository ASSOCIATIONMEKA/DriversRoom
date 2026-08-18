import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
  
  setTimeout(() => {
    box.classList.add("hidden");
  }, 4000);
}

// 🎨 Fonction pour générer le style du menu déroulant selon la licence
function getLicenseStyle(license) {
  if (license === "Pro") {
    return "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444; font-weight: 600;";
  } else if (license === "Challenger") {
    return "background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid #f59e0b; font-weight: 600;";
  } else {
    return "background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid #10b981; font-weight: 600;";
  }
}

// 🔐 SÉCURITÉ
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
      const role = data.role || "Pilote"; // Récupération du rôle
      const license = data.licenseClass || data.licenceClass || data.licence || "Rookie";
      const licenseStyle = getLicenseStyle(license);

      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border-primary)";

      const isSelf = (uid === currentUser.uid);
      const disabledAttribute = isSelf ? "disabled" : "";
      
      const buttonText = isAdmin ? "Retirer Admin" : "Rendre Admin";
      const buttonStyle = isAdmin 
        ? "background: linear-gradient(135deg, var(--accent-danger), #dc2626); font-size: 0.8rem; padding: 0.5rem 1rem;" 
        : "background: linear-gradient(135deg, var(--accent-success), #16a34a); font-size: 0.8rem; padding: 0.5rem 1rem;";

      const deleteButtonHtml = isSelf ? '' : `
        <button class="btn-delete-user" data-uid="${uid}" data-name="${firstName} ${lastName}" style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; cursor: pointer; padding: 0.4rem 0.6rem; transition: 0.2s; font-size: 1.1rem; display: inline-flex; align-items: center; justify-content: center; height: 35px;" title="Supprimer le compte">
          🗑️
        </button>
      `;

      tr.innerHTML = `
        <td style="padding: 1rem 1rem 1rem 0;">
          <div style="display: flex; align-items: center; height: 100%; font-weight: 600;">
            ${firstName} ${lastName} 
            ${isAdmin ? '<span title="Administrateur" style="margin-left: 6px; font-size: 1.1rem;">👑</span>' : ''}
            ${isSelf ? '<span style="color:var(--accent-primary); font-size:0.8rem; margin-left: 8px;">(Vous)</span>' : ''}
          </div>
        </td>
        <td style="padding: 1rem;">
          <div style="display: flex; align-items: center; height: 100%; color: var(--text-secondary); font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">
            ${email}
          </div>
        </td>
        <td style="padding: 1rem;">
          <div style="display: flex; align-items: center; height: 100%;">
            <select class="role-select" data-uid="${uid}" style="padding: 0.4rem; border-radius: 6px; background: #0f172a; color: var(--text-secondary); border: 1px solid var(--border-primary); cursor: pointer; outline: none; margin: 0; width: 100%;">
              <option value="Pilote" ${role === 'Pilote' ? 'selected' : ''}>🏎️ Pilote</option>
              <option value="Ingénieur / Stratège" ${role === 'Ingénieur / Stratège' ? 'selected' : ''}>💻 Ingénieur</option>
              <option value="Spectateur / Fan" ${role === 'Spectateur / Fan' ? 'selected' : ''}>🏁 Spectateur</option>
              <option value="Streamer / Commentateur" ${role === 'Streamer / Commentateur' ? 'selected' : ''}>🎙️ Streamer</option>
              <option value="Staff / Orga" ${role === 'Staff / Orga' ? 'selected' : ''}>🛠️ Staff</option>
              <option value="Autre" ${role === 'Autre' ? 'selected' : ''}>Autre</option>
            </select>
          </div>
        </td>
        <td style="padding: 1rem;">
          <div style="display: flex; align-items: center; height: 100%;">
            <select class="license-select" data-uid="${uid}" style="padding: 0.4rem; border-radius: 6px; cursor: pointer; outline: none; margin: 0; width: 140px; ${licenseStyle}">
              <option value="Rookie" style="background: #0f172a; color: #34d399;" ${license === 'Rookie' ? 'selected' : ''}>Rookie</option>
              <option value="Challenger" style="background: #0f172a; color: #fbbf24;" ${license === 'Challenger' ? 'selected' : ''}>Challenger</option>
              <option value="Pro" style="background: #0f172a; color: #f87171;" ${license === 'Pro' ? 'selected' : ''}>Pro</option>
            </select>
          </div>
        </td>
        <td style="padding: 1rem 0 1rem 1rem; text-align: right;">
          <div style="display: flex; gap: 10px; justify-content: flex-end; align-items: center; height: 100%;">
            <button class="btn-toggle-admin" data-uid="${uid}" data-status="${isAdmin}" ${disabledAttribute} style="${buttonStyle}; margin: 0; height: 35px; display: flex; align-items: center;">
              ${buttonText}
            </button>
            ${deleteButtonHtml}
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // 1️⃣ Écouteurs pour le bouton "Rendre Admin"
    document.querySelectorAll(".btn-toggle-admin").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const targetUid = e.target.getAttribute("data-uid");
        const currentStatus = e.target.getAttribute("data-status") === "true";
        await toggleAdminStatus(targetUid, currentStatus);
      });
    });

    // 2️⃣ Écouteurs pour la modification du Rôle
    document.querySelectorAll(".role-select").forEach(select => {
      select.addEventListener("change", async (e) => {
        const targetUid = e.target.getAttribute("data-uid");
        const newRole = e.target.value;
        await updateRole(targetUid, newRole);
      });
    });

    // 3️⃣ Écouteurs pour la modification de la licence
    document.querySelectorAll(".license-select").forEach(select => {
      select.addEventListener("change", async (e) => {
        const targetUid = e.target.getAttribute("data-uid");
        const newLicense = e.target.value;
        
        e.target.style.cssText = `padding: 0.4rem; border-radius: 6px; cursor: pointer; outline: none; margin: 0; width: 140px; ${getLicenseStyle(newLicense)}`;
        
        await updateLicense(targetUid, newLicense);
      });
    });

    // 4️⃣ Écouteurs pour le bouton de suppression (Poubelle)
    document.querySelectorAll(".btn-delete-user").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const targetUid = e.currentTarget.getAttribute("data-uid");
        const pilotName = e.currentTarget.getAttribute("data-name");
        
        const confirmation = confirm(`⚠️ ATTENTION ⚠️\n\nÊtes-vous sûr de vouloir supprimer DÉFINITIVEMENT le profil de ${pilotName} de la base de données ?\n\nCette action est irréversible.`);
        
        if (confirmation) {
          await deleteUserAccount(targetUid);
        }
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

// 🔄 Modifier le Rôle (Pilote, Ingé, etc.)
async function updateRole(uid, newRole) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      role: newRole
    });
    showMsg(`Rôle mis à jour avec succès : ${newRole}`);
  } catch (err) {
    console.error("Erreur lors de la modification du rôle :", err);
    showMsg("Erreur lors de la mise à jour du rôle.", "error");
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

// 🗑️ Supprimer un membre de la base de données
async function deleteUserAccount(uid) {
  try {
    await deleteDoc(doc(db, "users", uid));
    showMsg("Le profil a été supprimé avec succès.");
    await loadAllUsers();
  } catch (err) {
    console.error("Erreur lors de la suppression :", err);
    showMsg("Erreur lors de la suppression du compte.", "error");
  }
}
