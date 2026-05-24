document.addEventListener("DOMContentLoaded", function() {
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
              <a href="login.html">🟢 EstaCup S10 (Nouveau)</a>
              <a href="s9_archive.html">⚪ EstaCup S9 (Archives)</a>
            </div>
          </div>
          
          <a href="esport.html">ÉQUIPE ESPORT</a>
          <a href="https://discord.gg/jB6yDhQFyw" target="_blank">DISCORD</a>
          <a href="https://twitch.tv/asso_meka" target="_blank">TWITCH</a>
        </div>
    </nav>`;

    // On insère cette navbar juste après l'ouverture de la balise <body>
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
});
