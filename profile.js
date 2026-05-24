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
    
    // Relancer le calcul des stats après modification du prénom/nom ou SteamID
    await calculatePilotStats();
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

    // 1. Récupération des infos du pilote connecté
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    
    // Normalisation des chaînes pour comparaison textuelle
    const firstName = (userData.firstName || "").trim().toUpperCase();
    const lastName = (userData.lastName || "").trim().toUpperCase();
    const fullName = `${firstName} ${lastName}`.trim();
    const cleanSteamId = (userData.steamId || userData.steamID64 || "").trim();

    // Crée une version du prénom sans les caractères spéciaux/tirets pour matcher avec les vieux pseudos S9 (ex: K_Z_A_H -> KZAH)
    const simplifiedFirstName = firstName.replace(/[^A-Z0-9]/g, "");

    // 2. Analyse de l'historique des courses (Collection raceHistory de la S9)
    const raceHistorySnap = await getDocs(collection(db, "raceHistory"));

    raceHistorySnap.forEach((docSnap) => {
      const raceData = docSnap.data() || {};
      const participants = raceData.participants || [];
      let pilotInThisRace = false;

      participants.forEach((p) => {
        const pFirstName = (p.firstName || "").trim().toUpperCase();
        const pLastName = (p.lastName || "").trim().toUpperCase();
        const pFullName = `${pFirstName} ${pLastName}`.trim();
        const pSteamId = (p.steamId || p.steamID64 || "").trim();

        // Version simplifiée du pseudo de course pour tolérer les tirets bas (ex: K_Z_A_H -> KZAH)
        const simplifiedPFullName = pFullName.replace(/[^A-Z0-9]/g, "");

        // 🔍 VÉRIFICATION MULTI-CRITÈRES (LIGNE CORRIGÉE SANS VARIABLE ABSENTE)
        const matchesName = (fullName && pFullName === fullName);
        const matchesSteam = (cleanSteamId && pSteamId === cleanSteamId);
        
        // Match si le prénom (ou pseudo) nettoyé correspond à celui présent dans le rapport de course
        const matchesPseudoS9 = (simplifiedFirstName && simplifiedPFullName.includes(simplifiedFirstName));

        if (matchesName || matchesSteam || matchesPseudoS9) {
          pilotInThisRace = true;
          racesCount++;
          
          // Récupération de la position numérique de fin de course
          const finalPos = parseInt(p.position || p.pos || 0, 10);
          
          if (finalPos === 1) winsCount++;
          if (finalPos >= 1 && finalPos <= 3) podiumsCount++;
          if (p.isPole || p.pole === true || p.qualifyingPosition === 1) polesCount++;
        }
      });

      if (pilotInThisRace) {
        registeredChampionships.add(raceData.championship || "EstaCup - Saison 9");
      }
    });

    // 3. Vérification additionnelle si inscrit en S9 mais n'a pas encore de fichier de course
    const s9Signup = await getDoc(doc(db, "estacup_signups", currentUser.uid));
    if (s9Signup.exists()) {
      registeredChampionships.add("EstaCup - Saison 9");
    }

    // 4. Mise à jour dynamique de l'affichage HTML
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
