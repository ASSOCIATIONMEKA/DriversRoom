// profile.js — Gestion du profil et des statistiques cumulées S9 + S10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
  if (!box) return;
  box.textContent = text;
  box.className = `msg-box msg-${type}`;
  box.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => box.classList.add("hidden"), 4000);
}

// Outil de calcul de l'âge
function computeAge(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d)) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return `(${age} ans)`;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  currentUser = user;
  if ($("profEmail")) $("profEmail").value = user.email;
  await loadUserProfile();
  await calculatePilotStats();
});

async function loadUserProfile() {
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    if (snap.exists()) {
      const data = snap.data();
      if ($("profFirstName")) $("profFirstName").value = data.firstName || "";
      if ($("profLastName")) $("profLastName").value = data.lastName || "";
      if ($("profSteamId")) $("profSteamId").value = data.steamId || data.steamID64 || "";
      
      // Chargement du Rôle
      if ($("profRole")) {
        $("profRole").value = data.role || "Pilote"; // "Pilote" par défaut si vide
      }

      // Gestion de la Date de Naissance
      const dob = data.dob || data.birthDate || "";
      if ($("profDob")) {
        $("profDob").value = dob;
        if ($("profAge")) $("profAge").textContent = computeAge(dob);
        
        // Mettre à jour l'âge dynamiquement quand l'utilisateur change la date
        $("profDob").addEventListener("change", (e) => {
           if ($("profAge")) $("profAge").textContent = computeAge(e.target.value);
        });
      }

      // Gestion de la Licence
      const licence = data.licenseClass || data.licenceClass || data.license || data.licence || "Rookie";
      
      if ($("profLicence")) {
        $("profLicence").textContent = licence;
        $("profLicence").className = `badge-license licence-${licence.toLowerCase()}`;
      }
    }
  } catch (err) { console.error("Erreur profil:", err); }
}

// Calcul des stats via sous-collections personnelles
async function calculatePilotStats() {
  try {
    let racesCount = 0, winsCount = 0, podiumsCount = 0, polesCount = 0;
    let championships = new Set();

    const s9Ref = collection(db, "users", currentUser.uid, "raceHistory");
    const s10Ref = collection(db, "users", currentUser.uid, "raceHistory_s10");

    const [snapS9, snapS10] = await Promise.all([getDocs(s9Ref), getDocs(s10Ref)]);

    const processUserHistory = (snap, champName) => {
      if (!snap.empty) championships.add(champName);
      
      snap.forEach(docSnap => {
        racesCount++;
        const data = docSnap.data();
        
        const pos = Number(data.position) || 999;
        const grid = Number(data.grid) || Number(data.startPosition) || 999;

        if (pos === 1) winsCount++;
        if (pos >= 1 && pos <= 3) podiumsCount++;
        if (grid === 1) polesCount++;
      });
    };

    processUserHistory(snapS9, "EstaCup - Saison 9");
    processUserHistory(snapS10, "EstaCup - Saison 10");

    // Mise à jour UI
    if($("statRaces")) $("statRaces").textContent = racesCount;
    if($("statWins")) $("statWins").textContent = winsCount;
    if($("statPodiums")) $("statPodiums").textContent = podiumsCount;
    if($("statPoles")) $("statPoles").textContent = polesCount;
    
    const listEl = $("championshipList");
    if(listEl) {
      listEl.innerHTML = championships.size === 0 
        ? `<li style="color: var(--text-muted); font-style: italic; background: none; border: none; padding: 0;">Aucun historique de course trouvé.</li>` 
        : Array.from(championships).map(c => `<li>🏎️ <strong>${c}</strong></li>`).join("");
    }
  } catch (err) { console.error("Erreur stats:", err); }
}

$("profileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("btnSaveProfile");
  if(btn) btn.textContent = "Sauvegarde...";
  
  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      firstName: $("profFirstName").value.trim(),
      lastName: $("profLastName").value.trim(),
      steamId: $("profSteamId").value.trim(),
      dob: $("profDob").value,
      role: $("profRole").value // Sauvegarde du nouveau rôle
    }, { merge: true });
    
    await calculatePilotStats();
    showMsg("Profil mis à jour !");
  } catch(err) { 
    showMsg("Erreur de sauvegarde.", "error"); 
  }
  finally { 
    if(btn) btn.textContent = "Sauvegarder les modifications"; 
  }
});

$("btnProfileLogout")?.addEventListener("click", () => signOut(auth).then(() => window.location.href = "login.html"));
