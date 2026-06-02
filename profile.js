// profile.js — Gestion du profil et des statistiques cumulées S9 + S10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
      const licence = data.licenceClass || data.licence || "Rookie";
      if ($("profLicence")) {
        $("profLicence").textContent = licence;
        $("profLicence").className = `badge-license licence-${licence.toLowerCase()}`;
      }
    }
  } catch (err) { console.error("Erreur profil:", err); }
}

// 🟢 CALCUL DES STATS PAR UID (Fiable à 100%)
async function calculatePilotStats() {
  try {
    // On récupère le SteamID du profil utilisateur actuel
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const mySteamId = (userData.steamId || userData.steamID64 || "").toString().trim();

    if (!mySteamId) {
      console.warn("Aucun SteamID trouvé sur le profil.");
      return;
    }

    // Récupération des deux sources de données
    const [snapS9, snapS10] = await Promise.all([
      getDocs(collection(db, "raceHistory")), 
      getDocs(collection(db, "raceHistory_s10"))
    ]);

    let racesCount = 0, winsCount = 0, podiumsCount = 0;
    let championships = new Set();

    // Fonction de traitement basée UNIQUEMENT sur le SteamID
    const process = (snap, champName) => {
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const participants = data.participants || [];
        
        // On cherche le participant dont le steamId correspond au tien
        const p = participants.find(part => {
          const pSteam = (part.steamId || part.steamID || part.steamID64 || "").toString().trim();
          return pSteam === mySteamId;
        });
        
        if (p) {
          racesCount++;
          const pos = parseInt(p.position || 0, 10);
          if (pos === 1) winsCount++;
          if (pos >= 1 && pos <= 3) podiumsCount++;
          championships.add(champName);
        }
      });
    };

    process(snapS9, "EstaCup - Saison 9");
    process(snapS10, "EstaCup - Saison 10");

    // Mise à jour de l'affichage
    if($("statRaces")) $("statRaces").textContent = racesCount;
    if($("statWins")) $("statWins").textContent = winsCount;
    if($("statPodiums")) $("statPodiums").textContent = podiumsCount;
    if($("statPoles")) $("statPoles").textContent = "0";

    const listEl = $("championshipList");
    if(listEl) {
      listEl.innerHTML = championships.size === 0 
        ? `<li>Aucun historique trouvé pour votre SteamID</li>` 
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
      steamId: $("profSteamId").value.trim()
    }, { merge: true });
    await calculatePilotStats();
    alert("Profil mis à jour !");
  } catch(err) { alert("Erreur de sauvegarde."); }
  finally { if(btn) btn.textContent = "Sauvegarder les modifications"; }
});

$("btnProfileLogout")?.addEventListener("click", () => signOut(auth).then(() => window.location.href = "login.html"));
