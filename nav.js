// nav.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔧 Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDJ7uhvc31nyRB4bh9bVtkagaUksXG1fOo",
  authDomain: "estacupbymeka.firebaseapp.com",
  projectId: "estacupbymeka",
  storageBucket: "estacupbymeka.appspot.com",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};

// 🛡️ SÉCURITÉ : Vérifie si Firebase est déjà initialisé
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// 🛠️ Fonction principale pour charger la Navbar
function initNavbar() {
  const navContainer = document.getElementById("global-navbar");

  // Sécurité : si la balise n'existe pas dans le HTML, on s'arrête et on prévient dans la console
  if (!navContainer) {
    console.error("❌ ERREUR nav.js : La balise <div id='global-navbar'></div> est introuvable sur cette page !");
    return;
  }

  // 1️⃣ INJECTION DU HTML DE LA NAVBAR
  navContainer.innerHTML = `
    <nav class="top-navbar">
      <a href="index.html" style="display: flex; align-items: center; text-decoration: none;">
        <img src="img/logo.png" alt="MEKA Logo" class="nav-logo" onerror="this.src='logo.png'; this.onerror=null;" style="height: 40px;">
      </a>
      
      <div class="nav-links">
        <a href="index.html">ACCUEIL</a>
        <a href="association.html">L'ASSOCIATION</a>
        
        <div class="dropdown">
          <a href="#" style="cursor: default;">NOS COMPÉTITIONS ▾</a>
          <div class="dropdown-content">
            <a href="estacup-s10.html">EstaCup Saison 10</a>
          </div>
        </div>
        
        <a href="#" onclick="alert('Page en construction 🚧'); return false;">ÉQUIPE ESPORT</a>
        <a href="#" onclick="alert('Page en construction 🚧'); return false;">NOS PARTENAIRES</a>
        
        <a href="https://discord.gg/meka" target="_blank">DISCORD</a>
        <a href="https://www.twitch.tv/mekaesport" target="_blank">TWITCH</a>
        
        <!-- Menu Utilisateur (Masqué par défaut) -->
        <div class="dropdown" id="userMenuDropdown" style="display: none;">
          <a href="#" id="navUserName" style="color: var(--accent-primary); font-weight: bold;">👤 PROFIL ▾</a>
          <div class="dropdown-content">
            <a href="estacup-s10.html">Driver's Room</a>
            <a href="admin-users.html" id="navAdminLink" style="display: none;">Administration</a>
            <a href="#" id="navLogoutBtn" style="color: #f87171;">Déconnexion</a>
          </div>
        </div>
        
        <!-- Bouton de connexion (Affiche si non connecté) -->
        <a href="login.html" id="navLoginBtn" class="nav-btn-login">CONNEXION</a>
      </div>
    </nav>
  `;

  // 2️⃣ GESTION DE L'AFFICHAGE DU COMPTE (CONNECTÉ / DÉCONNECTÉ)
  onAuthStateChanged(auth, async (user) => {
    const loginBtn = document.getElementById("navLoginBtn");
    const userMenu = document.getElementById("userMenuDropdown");
    const userNameDisplay = document.getElementById("navUserName");
    const adminLink = document.getElementById("navAdminLink");

    if (user) {
      if (loginBtn) loginBtn.style.display = "none";
      if (userMenu) userMenu.style.display = "inline-block";

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const firstName = data.firstName || "PILOTE";
          
          if (userNameDisplay) {
            userNameDisplay.innerHTML = `👤 ${firstName.toUpperCase()} ▾`;
          }
          
          if (data.admin && adminLink) {
            adminLink.style.display = "block";
          }
        }
      } catch (error) {
        console.error("Erreur de récupération utilisateur :", error);
      }
    } else {
      if (loginBtn) loginBtn.style.display = "inline-block";
      if (userMenu) userMenu.style.display = "none";
    }
  });

  // 3️⃣ GESTION DE LA DÉCONNEXION
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "navLogoutBtn") {
      e.preventDefault();
      signOut(auth).then(() => {
        window.location.href = "login.html";
      }).catch((error) => {
        console.error("Erreur lors de la déconnexion :", error);
      });
    }
  });
}

// ⏳ EXÉCUTION AU BON MOMENT (Une fois la page HTML chargée)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initNavbar);
} else {
  initNavbar();
}
