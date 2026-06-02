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
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
      const licence = data.licenceClass || data.licence || "Rookie";
      if ($("profLicence")) {
        $("profLicence").textContent = licence;
        $("profLicence").className = `badge-license licence-${licence.toLowerCase()}`;
      }
    }
  } catch (err) { console.error("Erreur profil:", err); }
}

// 🟢 CALCUL DES STATS : Scan global (collections racines) + Sous-collections (users/{uid}/)
async function calculatePilotStats() {
  try {
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const mySteamId = (userData.steamId || userData.steamID64 || "").toString().trim();

    let racesCount = 0, winsCount = 0, podiumsCount = 0;
    let championships = new Set();

    // 1. Liste des endroits où tes données peuvent être cachées
    const sources = [
        { col: collection(db, "raceHistory"), name: "EstaCup - Saison 9" },
        { col: collection(db, "raceHistory_s10"), name: "EstaCup - Saison 10" },
        { col: collection(db, "users", currentUser.uid, "raceHistory"), name: "EstaCup - Saison 9 (Perso)" },
        { col: collection(db, "users", currentUser.uid, "raceHistory_s10"), name: "EstaCup - Saison 10 (Perso)" }
    ];

    // 2. Scan de toutes les sources
    for (const src of sources) {
        try {
            const snap = await getDocs(src.col);
            snap.forEach(docSnap => {
                const data = docSnap.data();
                // Gestion des listes de participants (cas collections racines)
                const participants = data.participants || [data]; 
                
                const found = participants.find(p => {
                    const pSteam = (p.steamId || p.steamID || p.steamID64 || "").toString().trim();
                    return pSteam === mySteamId && mySteamId !== "";
                });
                
                if (found) {
                    racesCount++;
                    const pos = parseInt(found.position || 0, 10);
                    if (pos === 1) winsCount++;
                    if (pos >= 1 && pos <= 3) podiumsCount++;
                    championships.add(src.name);
                }
            });
        } catch (e) { /* Collection vide ou inexistante, on ignore */ }
    }

    // 3. Mise à jour UI
    if($("statRaces")) $("statRaces").textContent = racesCount;
    if($("statWins")) $("statWins").textContent = winsCount;
    if($("statPodiums")) $("statPodiums").textContent = podiumsCount;
    if($("statPoles")) $("statPoles").textContent = "0";

    const listEl = $("championshipList");
    if(listEl) {
      listEl.innerHTML = championships.size === 0 
        ? `<li>Aucun historique trouvé. Vérifiez votre SteamID.</li>` 
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
