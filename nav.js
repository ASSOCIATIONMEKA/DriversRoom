import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔧 Configuration Firebase (Identique à ton projet)
const firebaseConfig = {
  apiKey: "AIzaSyDJ7uhvc31nyRB4bh9bVtkagaUksXG1fOo",
  authDomain: "estacupbymeka.firebaseapp.com",
  projectId: "estacupbymeka",
  storageBucket: "estacupbymeka.appspot.com",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", function() {
    // 1. Structure de base de la barre de navigation
    const navbarHTML = `
    <nav class="top-navbar">
        <a href="index.html">
          <img src="meka.svg" alt="Logo MEKA" class="nav-logo" />
        </a>
        
        <div class="nav-links">
          <a href="index.html">ACCUEIL</a>
          <a href="index.html#presentation">PRÉSENTATION</a>
          
          <div class="dropdown">
            <a href="index.html#competitions" class="dropbtn">NOS COMPÉTITIONS ▾</a>
            <div class="dropdown-content">
              <a href="estacups10.html">🟢 EstaCup S10</a>
              <a href="login.html">⚪ EstaCup S9</a>
            </div>
          </div>
          
          <a href="esport.html">ÉQUIPE ESPORT</a>
          <a href="https://discord.gg/jB6yDhQFyw" target="_blank">DISCORD</a>
          <a href="https://twitch.tv/asso_meka" target="_blank">TWITCH</a>
          
          <div id="nav-auth-zone" style="display: inline-block; margin-left: 1rem;">
             <span class="muted-note">Vérification...</span>
          </div>
        </div>
    </nav>`;

    document.body.insertAdjacentHTML('afterbegin', navbarHTML);

    // 2. Écouteur Firebase pour modifier dynamiquement la zone de droite
    const authZone = document.getElementById("nav-auth-zone");

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                // Récupération du prénom du pilote pour l'afficher
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const userData = userDoc.data();
                const firstName = userData ? userData.firstName : "Pilote";
                const isAdmin = userData && userData.admin === true;

                authZone.innerHTML = `
                  <div class="dropdown">
                    <a href="#" class="dropbtn" style="color: #10B981; font-weight: 700;">👤 ${firstName.toUpperCase()} ▾</a>
                    <div class="dropdown-content" style="min-width: 160px;">
                      <a href="dashboard.html">🎛️ Mon Espace</a>
                      ${isAdmin ? '<a href="admin.html">🛠️ Panel Admin</a>' : ''}
                      <a href="#" id="nav-logout-btn" style="color: #EF4444;">✖ Déconnexion</a>
                    </div>
                  </div>
                `;

                // Écouteur pour le bouton déconnexion du menu
                document.getElementById("nav-logout-btn").addEventListener("click", (e) => {
                    e.preventDefault();
                    signOut(auth).then(() => {
                        window.location.href = "index.html";
                    });
                });

            } catch (error) {
                console.error("Erreur navbar:", error);
            }
        } else {
            // Si pas connecté : on affiche un bouton de connexion universel épuré
            authZone.innerHTML = `<a href="login.html" class="nav-btn-login">CONNEXION</a>`;
        }
    });
});
