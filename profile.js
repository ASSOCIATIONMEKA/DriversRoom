async function calculatePilotStats() {
  try {
    let racesCount = 0;
    let winsCount = 0;
    let podiumsCount = 0;
    let registeredChampionships = new Set();

    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    
    // On récupère les différentes versions du nom pour maximiser les chances de correspondance
    const firstName = (userData.firstName || "").trim().toUpperCase();
    const lastName = (userData.lastName || "").trim().toUpperCase();
    const fullName = `${firstName} ${lastName}`.trim();

    if (!firstName && !lastName) return;

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
          const pName = (p.name || "").trim().toUpperCase();
          const pFirst = (p.firstName || "").trim().toUpperCase();
          const pLast = (p.lastName || "").trim().toUpperCase();
          
          // Vérifie si le nom du pilote dans la course correspond au tien
          const match = (pName === fullName) || (pFirst === firstName && pLast === lastName);
          
          if (match) {
            pilotInThisRace = true;
            racesCount++;
            const finalPos = parseInt(p.position || p.pos || 0, 10);
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
    
    const listEl = $("championshipList");
    if(listEl) {
        listEl.innerHTML = registeredChampionships.size === 0 
            ? `<li>Nouveau pilote — Aucun championnat enregistré</li>` 
            : Array.from(registeredChampionships).map(champ => `<li>🏎️ <strong>${champ}</strong></li>`).join("");
    }
  } catch (err) {
    console.error("Erreur critique stats:", err);
  }
}
