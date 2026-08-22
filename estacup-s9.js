/* ======================== RÉSULTATS DES COURSES (VUE GROUPÉE) ======================== */

// Fonction pour attribuer le bon lien de rediffusion
function getReplayUrl(roundLabel) {
  const label = roundLabel.toLowerCase();
  if (label.includes("round 6")) return "https://www.youtube.com/watch?v=Zdd2wvV_Ewc";
  if (label.includes("round 5")) return "https://www.youtube.com/watch?v=GzZtTNRKzQs";
  if (label.includes("round 4")) return null; // null = non disponible
  if (label.includes("round 3")) return "https://www.youtube.com/watch?v=Tjr2BIrI3fI";
  if (label.includes("round 2")) return "https://www.youtube.com/watch?v=pR-R3fzxi10";
  if (label.includes("round 1")) return "https://www.youtube.com/watch?v=hXFsq0OeK0w";
  return undefined; // undefined = ne rien afficher
}

async function loadAllCoursesArchive() {
  const ul = $("raceHistory"); 
  if (!ul) return;

  try {
    ul.innerHTML = loaderHtml("Chargement des résultats…");
    const snap = await getDocs(collection(db, "courses"));
    if (snap.empty) { ul.innerHTML = "<p class='muted-note'>Aucun résultat pour l’instant.</p>"; return; }
    
    const rows = []; 
    snap.forEach(d => {
        const data = d.data();
        if (data.estacup === true) {
            rows.push({ id: d.id, ...data });
        }
    });
    
    // Tri global par date décroissante
    rows.sort((a, b) => (toDate(b.date) ?? 0) - (toDate(a.date) ?? 0));
    
    // 1. Groupement intelligent par Manche (Round)
    const roundsMap = new Map();

    rows.forEach(r => {
      const name = r.name || "Course inconnue";
      let roundLabel = "Autre Manche";
      let raceType = name;

      // Découpage du nom (ex: "ESTACUP • ROUND 6 • SPA-FRANCORCHAMPS • SPRINT S1")
      const parts = name.split("•").map(p => p.trim());
      
      const roundIndex = parts.findIndex(p => p.toLowerCase().includes("round"));
      if (roundIndex !== -1 && parts.length > roundIndex + 1) {
          roundLabel = `${parts[roundIndex]} - ${parts[roundIndex + 1]}`;
          raceType = parts.slice(roundIndex + 2).join(" • ") || "Classement";
      } else if (parts.length >= 2) {
          roundLabel = parts[0];
          raceType = parts.slice(1).join(" • ");
      }

      const dateStr = formatDateFR(r.date);
      const groupKey = `${roundLabel}_${dateStr}`; 

      if (!roundsMap.has(groupKey)) {
        roundsMap.set(groupKey, { roundLabel, dateStr, races: [] });
      }
      roundsMap.get(groupKey).races.push({ ...r, raceType });
    });

    // 2. Construction de l'interface (Création des cartes)
    ul.innerHTML = "";
    ul.style.listStyle = "none";
    ul.style.padding = "0";

    roundsMap.forEach((group) => {
      const card = document.createElement("li");
      card.className = "course-box";
      card.style.marginBottom = "1.5rem";
      card.style.padding = "1.5rem";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.borderBottom = "1px solid rgba(148, 163, 184, 0.2)";
      header.style.paddingBottom = "0.75rem";
      header.style.marginBottom = "1rem";
      header.innerHTML = `
          <h4 style="margin:0; font-size: 1.25rem; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px;">
            🏁 ${escapeHtml(group.roundLabel)}
          </h4>
          <span style="color: #94a3b8; font-weight: 600; font-size: 0.9rem;">${group.dateStr}</span>
      `;
      card.appendChild(header);

      const btnGroup = document.createElement("div");
      btnGroup.style.display = "flex";
      btnGroup.style.gap = "0.5rem";
      btnGroup.style.flexWrap = "wrap";

      const detailsContainer = document.createElement("div");
      detailsContainer.style.marginTop = "1rem";

      group.races.sort((a, b) => a.raceType.localeCompare(b.raceType));

      group.races.forEach(race => {
        const btn = document.createElement("button");
        btn.className = "race-btn";
        btn.style.flex = "1";
        btn.style.textAlign = "center";
        btn.style.fontWeight = "600";
        btn.textContent = escapeHtml(race.raceType);

        const raceDetails = document.createElement("div");
        raceDetails.className = "race-classification";
        raceDetails.style.display = "none";
        raceDetails.style.marginTop = "1rem";
        detailsContainer.appendChild(raceDetails);

        btn.addEventListener("click", async () => {
          const isOpening = raceDetails.style.display === "none";
          
          detailsContainer.querySelectorAll(".race-classification").forEach(d => d.style.display = "none");
          btnGroup.querySelectorAll(".race-btn").forEach(b => b.style.borderColor = "#1e293b");

          if (isOpening) {
            btn.style.borderColor = "#38bdf8"; 
            if (raceDetails.innerHTML === "") {
                raceDetails.innerHTML = loaderHtml("Chargement du classement...");
                raceDetails.style.display = "block";
                await renderRaceClassification(race.id, raceDetails, race);
            } else {
                raceDetails.style.display = "block";
            }
          }
        });

        btnGroup.appendChild(btn);
      });

      card.appendChild(btnGroup);
      card.appendChild(detailsContainer);

      // --- AJOUT DE LA REDIFFUSION SOUS LES RÉSULTATS ---
      const replayUrl = getReplayUrl(group.roundLabel);
      
      if (replayUrl !== undefined) {
        const replayContainer = document.createElement("div");
        replayContainer.className = "replay-container";
        // Ajout d'espacement et d'une ligne de séparation discrète
        replayContainer.style.marginTop = "20px";
        replayContainer.style.paddingTop = "15px";
        replayContainer.style.borderTop = "1px solid rgba(148, 163, 184, 0.2)";
        replayContainer.style.display = "flex";
        replayContainer.style.justifyContent = "center";

        if (replayUrl !== null) {
          const btn = document.createElement("a");
          btn.className = "btn-yt";
          btn.href = replayUrl;
          btn.target = "_blank";
          btn.innerHTML = "📺 Voir la rediffusion";
          replayContainer.appendChild(btn);
        } else {
          const note = document.createElement("span");
          note.className = "muted-note";
          note.style.fontStyle = "italic";
          note.innerHTML = "ℹ️ Rediffusion non disponible";
          replayContainer.appendChild(note);
        }
        
        card.appendChild(replayContainer);
      }
      // -------------------------------------------------

      ul.appendChild(card);
    });

  } catch (e) { 
    ul.innerHTML = `<li class="error">Erreur de chargement des courses.</li>`; 
    console.error("Erreur loadAllCoursesArchive:", e);
  }
}
