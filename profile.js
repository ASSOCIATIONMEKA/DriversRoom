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
    // Si pas connecté, redirection immédiate vers login
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

// 2. Sauvegarde du profil (Prénom, Nom, Extraction propre du SteamID)
$("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const btn = $("btnSaveProfile");
  btn.disabled = true;
  btn.textContent = "Sauvegarde...";

  let rawSteam = $("profSteamId").value.trim();
  let cleanSteamId64 = "";

  // Logique d'extraction du SteamID64 (Ramenée depuis ton dashboard.js)
  if (rawSteam) {
    if (rawSteam.includes("steamcommunity.com/profiles/")) {
      const parts = rawSteam.split("profiles/");
      if (parts[1]) cleanSteamId64 = parts[1].replace(/\//g, "").trim();
    } else if (rawSteam.includes("steamcommunity.com/id/")) {
      // Si c'est un vanity URL personnalisé, on stocke la chaîne brute pour l'admin
      cleanSteamId64 = rawSteam.trim();
    } else {
      // ID64 numérique pur ou pseudonyme direct
      cleanSteamId64 = rawSteam.replace(/[^0-9]/g, "").trim() || rawSteam;
    }
  }

  // Nettoyage casse Prénom / Nom
  const p = $("profFirstName").value.trim();
  const n = $("profLastName").value.trim();
  const formattedFirstName = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  const formattedLastName = n.toUpperCase();

  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    // On fusionne (merge) pour ne pas écraser la licence existante créée par l'admin
    await setDoc(userDocRef, {
      firstName: formattedFirstName,
      lastName: formattedLastName,
      steamId: cleanSteamId64,
      steamID64: cleanSteamId64, // Double compatibilité
      lastUpdate: new Date().toISOString()
    }, { merge: true });

    // Si le pilote a un profil d'inscription EstaCup S9 actif, on met à jour son SteamID là-bas aussi
    const signupRef = doc(db, "estacup_signups", currentUser.uid);
    const signupSnap = await getDoc(signupRef);
    if (signupSnap.exists()) {
      await setDoc(signupRef, {
        steamId: cleanSteamId64,
        steamID64: cleanSteamId64
      }, { merge: true });
    }

    showMsg("Profil mis à jour avec succès !");
    $("profSteamId").value = cleanSteamId64; // Affiche la version propre
  } catch (err) {
    console.error("Erreur sauvegarde:", err);
    showMsg("Impossible de sauvegarder les modifications.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sauvegarde les modifications";
  }
});

// 3. Calcul dynamique des Statistiques globales & Championnats depuis les résultats passés
async function calculatePilotStats() {
  try {
    let racesCount = 0;
    let winsCount = 0;
    let podiumsCount = 0;
    let polesCount = 0;
    let registeredChampionships = new Set();

    // Analyse de l'historique des courses (Collection raceHistory de la S9)
    const raceHistorySnap = await getDocs(collection(db, "raceHistory"));
    
    // Pour l'analyse nominative (au cas où le SteamID ne soit pas encore lié)
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const fullName = `${userData.firstName || ""} ${userData.lastName || ""}`.trim().toUpperCase();

    raceHistorySnap.forEach((docSnap) => {
      const raceData = docSnap.data() || {};
      const participants = raceData.participants || [];
      
      // On sait que raceHistory S9 fait partie de l'EstaCup S9
      let pilotInThisRace = false;

      participants.forEach((p) => {
        const pName = `${p.firstName || ""} ${p.lastName || ""}`.trim().toUpperCase();
        const matchesName = (fullName && pName === fullName);
        const matchesSteam = (userData.steamId && p.steamId === userData.steamId);

        if (matchesName || matchesSteam) {
          pilotInThisRace = true;
          racesCount++;
          
          // Vérification de la position en course (Sprints ou Principales)
          // Si le classement contient une propriété position numérique
          if (p.position === 1 || p.pos === 1) winsCount++;
          if (p.position <= 3 || p.pos <= 3) podiumsCount++;
          if (p.isPole || p.pole === true) polesCount++;
        }
      });

      if (pilotInThisRace && raceData.championship) {
        registeredChampionships.add(raceData.championship);
      } else if (pilotInThisRace) {
        // Fallback par défaut pour la saison passée si le tag n'existait pas
        registeredChampionships.add("EstaCup - Saison 9");
      }
    });

    // Vérification additionnelle si la personne s'était inscrite mais n'a pas encore couru
    const s9Signup = await getDoc(doc(db, "estacup_signups", currentUser.uid));
    if (s9Signup.exists()) {
      registeredChampionships.add("EstaCup - Saison 9");
    }

    // Mise à jour de l'affichage HTML
    $("statRaces").textContent = racesCount;
    $("statWins").textContent = winsCount;
    $("statPodiums").textContent = podiumsCount;
    $("statPoles").textContent = polesCount;

    // Rendu de la liste des championnats
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