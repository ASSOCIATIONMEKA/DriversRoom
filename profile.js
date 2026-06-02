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

// DOM Elements
const $ = (id) => document.getElementById(id);
let currentUser = null;

// Messages UI
function showMsg(text, type = "success") {
  const box = $("msgBox");
  if (!box) return;
  box.textContent = text;
  box.className = `msg-box msg-${type}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Sécurité : Vérification de l'état connecté
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  $("profEmail").value = user.email;
  
  await loadUserProfile();
  await calculatePilotStats();
});

// 1. Chargement des données du profil
async function loadUserProfile() {
  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userDocRef);
    
    if (snap.exists()) {
      const data = snap.data();
      $("profFirstName").value = data.firstName || "";
      $("profLastName").value = data.lastName || "";
      $("profSteamId").value = data.steamId || data.steamID64 || "";
      
      const licence = data.licenceClass || data.licence || "Rookie";
      const licenceEl = $("profLicence");
      if (licenceEl) {
        licenceEl.textContent = licence;
        licenceEl.className = `badge-license licence-${licence.toLowerCase()}`;
      }
    }
  } catch (err) {
    console.error("Erreur chargement profil:", err);
    showMsg("Erreur lors du chargement des données du profil.", "error");
  }
}

// 2. Sauvegarde du profil
$("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const btn = $("btnSaveProfile");
  btn.disabled = true;
  btn.textContent = "Sauvegarde...";

  let rawSteam = $("profSteamId").value.trim();
  let cleanSteamId64 = "";

  if (rawSteam) {
    if (rawSteam.includes("steamcommunity.com/profiles/")) {
      const parts = rawSteam.split("profiles/");
      if (parts[1]) cleanSteamId64 = parts[1].replace(/\//g, "").trim();
    } else if (rawSteam.includes("steamcommunity.com/id/")) {
      cleanSteamId64 = rawSteam.trim();
    } else {
      cleanSteamId64 = rawSteam.replace(/[^0-9]/g, "").trim() || rawSteam;
    }
  }

  const p = $("profFirstName").value.trim();
  const n = $("profLastName").value.trim();
  const formattedFirstName = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  const formattedLastName = n.toUpperCase();

  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    await setDoc(userDocRef, {
      firstName: formattedFirstName,
      lastName: formattedLastName,
      steamId: cleanSteamId64,
      steamID64: cleanSteamId64,
      lastUpdate: new Date().toISOString()
    }, { merge: true });

    // Synchronisation S9
    const signupRefS9 = doc(db, "estacup_signups", currentUser.uid);
    const signupSnapS9 = await getDoc(signupRefS9);
    if (signupSnapS9.exists()) {
      await setDoc(signupRefS9, { steamId: cleanSteamId64, steamID64: cleanSteamId64 }, { merge: true });
    }

    // Synchronisation S10
    const signupRefS10 = doc(db, "estacup_s10_signups", currentUser.uid);
    const signupSnapS10 = await getDoc(signupRefS10);
    if (signupSnapS10.exists()) {
      await setDoc(signupRefS10, { steamId: cleanSteamId64, steamID64: cleanSteamId64 }, { merge: true });
    }

    showMsg("Profil mis à jour avec succès !");
    $("profSteamId").value = cleanSteamId64;
    await calculatePilotStats();
  } catch (err) {
    console.error("Erreur sauvegarde:", err);
    showMsg("Impossible de sauvegarder les modifications.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sauvegarder les modifications";
  }
});

// 3. Calcul dynamique des Statistiques globales (Cumul S9 + S10)
async function calculatePilotStats() {
  try {
    let racesCount = 0;
    let winsCount = 0;
    let podiumsCount = 0;
    let registeredChampionships = new Set();

    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    
    const pilotTargetName = (userData.firstName || "").trim().toUpperCase();
    const cleanTarget = pilotTargetName.replace(/[^A-Z0-9]/g, "");

    if (!cleanTarget) return;

    // 🟢 RÉCUPÉRATION DES DEUX SAISONS (S9 = "raceHistory", S10 = "raceHistory_s10")
    const [raceHistorySnapS9, raceHistorySnapS10] = await Promise.all([
        getDocs(collection(db, "raceHistory")), 
        getDocs(collection(db, "raceHistory_s10"))
    ]);

    const processRaces = (querySnapshot, defaultChampionshipName) => {
      querySnapshot.forEach((docSnap) => {
        const raceData = docSnap.data() || {};
        const participants = raceData.participants || [];
        let pilotInThisRace = false;

        participants.forEach((p) => {
          const pNameProperty = (p.name || p.driverName || p.firstName || "").trim().toUpperCase();
          const combinedParticipantText = pNameProperty.replace(/[^A-Z0-9]/g, "");

          if (combinedParticipantText.includes(cleanTarget)) {
            pilotInThisRace = true;
            racesCount++;
            const finalPos = parseInt(p.position || p.pos || p.finishPosition || 0, 10);
            if (finalPos === 1) winsCount++;
            if (finalPos >= 1 && finalPos <= 3) podiumsCount++;
          }
        });

        if (pilotInThisRace) {
          registeredChampionships.add(raceData.championship || defaultChampionshipName);
        }
      });
    };

    processRaces(raceHistorySnapS9, "EstaCup - Saison 9");
    processRaces(raceHistorySnapS10, "EstaCup - Saison 10");

    // Mise à jour UI
    if($("statRaces")) $("statRaces").textContent = racesCount;
    if($("statWins")) $("statWins").textContent = winsCount;
    if($("statPodiums")) $("statPodiums").textContent = podiumsCount;
    if($("statPoles")) $("statPoles").textContent = "0";

    const listEl = $("championshipList");
    if(listEl) {
        listEl.innerHTML = registeredChampionships.size === 0 
            ? `<li>Nouveau pilote — Aucun championnat enregistré</li>` 
            : Array.from(registeredChampionships).map(champ => `<li>🏎️ <strong>${champ}</strong> — Pilote Engagé</li>`).join("");
    }
  } catch (err) {
    console.error("Erreur calcul stats:", err);
  }
}

// Déconnexion
$("btnProfileLogout")?.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
});
