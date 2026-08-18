import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔧 Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDJ7uhvc31nyRB4bh9bVtkagaUksXG1fOo",
  authDomain: "estacupbymeka.firebaseapp.com",
  projectId: "estacupbymeka",
  storageBucket: "estacupbymeka.appspot.com",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};

// 🛡️ Sécurité : On initialise Firebase SEULEMENT s'il n'existe pas déjà sur la page
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

function injectNavbar() {
    // Évite les doublons d'injection si la fonction est appelée deux fois
    if (document.querySelector(".top-navbar")) return;

    const fastCheckLoggedIn = localStorage.getItem("isLoggedIn") === "true";

    const navbarHTML = `
    <nav class="top-navbar">
        <a href="index.html">
          <img src="meka.svg" alt="Logo MEKA" class="nav-logo" />
        </a>
        
        <div class="nav-links">
          <a href="index.html">ACCUEIL</a>
          <a href="https://www.helloasso.com/associations/meka" target="_blank" rel="noopener noreferrer">L'ASSOCIATION</a>
          
          <div class="dropdown">
            <!-- Le bouton principal ne recharge pas la page, il sert juste de survol -->
            <a href="#" class="dropbtn" onclick="return false;">NOS COMPÉTITIONS ▾</a>
            <div class="dropdown-content">
            <a href="estacup-s10.html">🟢 EstaCup S10</a>
            <a href="estacup-s9.html">⚪ EstaCup S9</a>
          </div>
        </div>
          
          <a href="esport.html">ÉQUIPE ESPORT</a>
          <a href="https://discord.gg/jB6yDhQFyw" target="_blank">DISCORD</a>
          <a href="https://twitch.tv/asso_meka" target="_blank">TWITCH</a>
          
          <div id="nav-auth-zone" style="display: inline-block; margin-left: 1rem;">
             ${fastCheckLoggedIn 
               ? `<span style="color: #10B981; font-weight: 600; font-size: 0.9rem;">⏳ CHARGEMENT...</span>` 
               : `<a href="login.html" class="nav-btn-login">CONNEXION</a>`}
          </div>
        </div>
    </nav>`;

    // Ciblage intelligent de l'élément de réception ou repli sur le haut du body
    const targetDiv = document.getElementById("global-navbar");
    if (targetDiv) {
        targetDiv.innerHTML = navbarHTML;
    } else {
        document.body.insertAdjacentHTML('afterbegin', navbarHTML);
    }

    const authZone = document.getElementById("nav-auth-zone");

    // Écouteur de session Firebase
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            localStorage.setItem("isLoggedIn", "true");
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const userData = userDoc.data();
                
                const firstName = userData ? userData.firstName : "Pilote";
                const lastName = userData ? userData.lastName : "";
                const isAdmin = userData && userData.admin === true;

                authZone.innerHTML = `
                  <div class="dropdown">
                    <a href="#" class="dropbtn" style="color: #10B981; font-weight: 700;">👤 ${firstName.toUpperCase()} ▾</a>
                    <div class="dropdown-content" style="min-width: 180px;">
                      
                      <div class="dropdown-user-name" style="padding: 12px 16px; font-weight: 700; color: var(--accent-primary); border-bottom: 1px solid var(--border-primary); font-size: 0.85rem; cursor: default; user-select: none; background: rgba(255, 255, 255, 0.02);">
                        ${firstName.toUpperCase()} ${lastName.toUpperCase()}
                      </div>
                      
                      <a href="profile.html">Mon Profil</a>
                      
                      ${isAdmin ? '<a href="admin-s10.html" style="color: var(--accent-success); font-weight: 600;">⚙️ Panel Admin S10</a>' : ''}
                      ${isAdmin ? '<a href="admin-users.html" style="color: var(--accent-tertiary); font-weight: 600; border-top: 1px dashed var(--border-primary);">🛠️ Gestion Droits</a>' : ''}
                      
                      <a href="#" id="nav-logout-btn" style="color: #EF4444;">✖ Déconnexion</a>
                    </div>
                  </div>
                `;

                document.getElementById("nav-logout-btn").addEventListener("click", (e) => {
                    e.preventDefault();
                    localStorage.removeItem("isLoggedIn");
                    signOut(auth).then(() => {
                        window.location.href = "index.html";
                    });
                });

            } catch (error) {
                console.error("Erreur navbar:", error);
            }
        } else {
            localStorage.removeItem("isLoggedIn");
            authZone.innerHTML = `<a href="login.html" class="nav-btn-login">CONNEXION</a>`;
        }
    });
}

// Lancement de l'injection
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectNavbar);
} else {
    injectNavbar();
}
