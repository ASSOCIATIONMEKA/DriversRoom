import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔧 Config Firebase (Strictement identique à tes autres fichiers)
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

// 1. Chargement des données du profil utilisateur
async function loadUserProfile() {
  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userDocRef);
    
    if (snap.exists()) {
      const data = snap.data();
      $("profFirstName").value = data.firstName || "";
      $("profLastName").value = data.lastName || "";
      $("profSteamId").value = data.steamId || data.steamID64 || "";
      
      // Gestion de la licence visuelle
      const licence = data.licence || "Rookie";
      const licenceEl = $("profLicence");
      licenceEl.textContent = licence;
      licenceEl.className = `badge-license licence-${licence.toLowerCase()}`;
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

    const signupRef = doc(db, "estacup_signups", currentUser.uid);
    const signupSnap = await getDoc(signupRef);
    if (signupSnap.exists()) {
      await setDoc(signupRef, {
        steamId: cleanSteamId64,
        steamID64: cleanSteamId64
      }, { merge: true });
    }

    showMsg("Profil mis à jour avec succès !");
    $("profSteamId").value = cleanSteamId64;
    
    await calculatePilotStats();
  } catch (err) {
    console.error("Erreur sauvegarde:", err);
    showMsg("Impossible de sauvegarder les modifications.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sauvegarde les modifications";
  }
});

// 3. Calcul dynamique des Statistiques globales basé UNIQUEMENT sur le pseudo de course S9
async function calculatePilotStats() {
  try {
    let racesCount = 0;
    let winsCount = 0;
    let podiumsCount = 0;
    let registeredChampionships = new Set();

    // Récupération du Prénom saisi dans le formulaire
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    
    // On prend le prénom (ex: K_Z_A_H ou Kzah) nettoyé de ses espaces et mis en majuscules
    const pilotTargetName = (userData.firstName || "").trim().toUpperCase();
    const cleanTarget = pilotTargetName.replace(/[^A-Z0-9]/g, ""); // "KZAH"

    if (!cleanTarget) {
      console.log("Prénom vide, calcul ignoré.");
      return;
    }

    // Récupération de tous les rapports de course de la base
    const raceHistorySnap = await getDocs(collection(db, "raceHistory"));

    raceHistorySnap.forEach((docSnap) => {
      const raceData = docSnap.data() || {};
      const participants = raceData.participants || [];
      let pilotInThisRace = false;

      participants.forEach((p) => {
        // Extraction de n'importe quel texte identifiant le participant (name, firstName, etc.)
        const pFirstName = (p.firstName || "").trim().toUpperCase();
        const pLastName = (p.lastName || "").trim().toUpperCase();
        const pNameProperty = (p.name || p.driverName || "").trim().toUpperCase();
        
        // On fusionne tout pour être sûr de ne rien rater
        const combinedParticipantText = `${pFirstName} ${pLastName} ${pNameProperty}`.replace(/[^A-Z0-9]/g, "");

        // Si "KZAH" se trouve dans le texte du participant, on valide !
        if (combinedParticipantText.includes(cleanTarget)) {
          pilotInThisRace = true;
          racesCount++;
          
          // Lecture ultra-simple de la position finale
          const finalPos = parseInt(p.position || p.pos || p.finishPosition || 0, 10);
          
          if (finalPos === 1) winsCount++;
          if (finalPos >= 1 && finalPos <= 3) podiumsCount++;
        }
      });

      if (pilotInThisRace) {
        registeredChampionships.add(raceData.championship || "EstaCup - Saison 9");
      }
    });

    // Sauvegarde de secours via l'inscription
    const s9Signup = await getDoc(doc(db, "estacup_signups", currentUser.uid));
    if (s9Signup.exists()) {
      registeredChampionships.add("EstaCup - Saison 9");
    }

    // Mise à jour de l'affichage HTML
    $("statRaces").textContent = racesCount;
    $("statWins").textContent = winsCount;
    $("statPodiums").textContent = podiumsCount;
    
    // Sécurité au cas où l'élément des poles existe encore dans le HTML
    if ($("statPoles")) $("statPoles").textContent = "0";

    const listEl = $("championshipList");
    listEl.innerHTML = "";

    if (registeredChampionships.size === 0) {
      listEl.innerHTML = `<li>Nouveau pilote — Aucun championnat enregistré</li>`;
    } else {
      registeredChampionships.forEach((champ) => {
        listEl.innerHTML += `<li>🏎️ <strong>${champ}</strong> — Pilote Engagé</li>`;
      });
    }

  } catch (err) {
    console.error("Erreur calcul stats:", err);
    $("championshipList").innerHTML = `<li>Erreur au chargement de l'historique</li>`;
  }
}

// Déconnexion
$("btnProfileLogout").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
});
