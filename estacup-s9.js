// estacup-s9.js — Archives S9 (Résultats groupés et classements finaux uniquement)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ======================== Firebase ======================== */
const firebaseConfig = {
  apiKey: "AIzaSyDJ7uhvc31nyRB4bh9bVtkagaUksXG1fOo",
  authDomain: "estacupbymeka.firebaseapp.com",
  projectId: "estacupbymeka",
  storageBucket: "estacupbymeka.appspot.com",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ======================== Utils ======================== */
const $ = (id) => document.getElementById(id);
const isNum = (x) => typeof x === "number" && isFinite(x);

function toDate(value) {
  if (!value) return null;
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (value && typeof value.toDate === "function") {
    try { return value.toDate(); } catch {}
  }
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

function formatDateFR(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString("fr-FR") : "";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function msToClock(ms) {
  if (!isNum(ms)) return String(ms ?? "");
  const sign = ms < 0 ? "-" : "";
  const a = Math.abs(ms);
  const h = Math.floor(a / 3600000);
  const m = Math.floor((a % 3600000) / 60000);
  const s = Math.floor((a % 60000) / 1000);
  const ms3 = String(Math.floor(a % 1000)).padStart(3, "0");
  if (h > 0) return `${sign}${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${ms3}`;
  return `${sign}${m}:${String(s).padStart(2,"0")}.${ms3}`;
}

function firstDefined(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return undefined;
}

function loaderHtml(txt) {
  const text = txt === undefined ? "Chargement…" : txt;
  return `<div class="loading-inline"><div class="spinner"></div><div>${escapeHtml(text)}</div></div>`;
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const k of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k];
    else return undefined;
  }
  return cur;
}

function pick(obj, paths) {
  for (const p of paths) {
    const val = getByPath(obj, p);
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return undefined;
}

/* ======================== Caches & Synchronisation ======================== */
const signupCache = new Map(); 
const raceHistoryCache = new Map();

async function ensureSignupCache() {
  if (signupCache.size > 0) return;
  const snap = await getDocs(collection(db, "estacup_signups"));
  snap.forEach(d => {
    const x = d.data(); 
    if (x.uid) signupCache.set(x.uid, { teamName: x.teamName || "", raceNumber: x.raceNumber, carChoice: x.carChoice });
  });
}

async function getRaceHistoryEntry(uid, raceId) {
  const key = `${uid}::${raceId}`; 
  if (raceHistoryCache.has(key)) return raceHistoryCache.get(key);
  try {
    const rs = await getDoc(doc(db, "users", uid, "raceHistory", raceId));
    if (rs.exists()) {
      const r = rs.data();
      const out = { points: toFiniteNumber(firstDefined(r.points, r.score, r.pts)), team: (firstDefined(r.team, r.teamName) || "").toString() };
      raceHistoryCache.set(key, out); return out;
    }
  } catch {}
  return { points: null, team: "" };
}

function toFiniteNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/* ======================== Parsers Originaux ======================== */
function splitNameParts(p) {
  const first = (pick(p, ["firstName","prenom","driver.firstName"]) ?? "").toString().trim();
  const last  = (pick(p, ["lastName","nom","driver.lastName"]) ?? "").toString().trim();
  if (first || last) return { first, last };
  const parts = (pick(p, ["name","driver.name"]) || "").toString().split(/\s+/);
  return parts.length === 1 ? { first: "", last: parts[0] } : { first: parts.slice(0, -1).join(" "), last: parts.slice(-1)[0] };
}
function pickCar(p) { return String(pick(p, ["car","carModel","voiture","model"]) ?? ""); }
function pickBestLapMs(p) { return anyNumberMs(pick(p, ["bestLapMs","bestLapTime"])); }
function pickTotalTimeMs(p) { return anyNumberMs(pick(p, ["totalMs","totalTime"])); }
function pickGapLeaderMsDirect(p) { return anyNumberMs(pick(p, ["gapToLeader","gapLeader"])); }
function pickPointsLocal(p) { const n = Number(pick(p, ["points","score"])); return Number.isFinite(n) ? n : null; }
function pickUid(p) { return (p.uid || p.id || p.steamId || p.name || "").toString(); }

async function resolvePoints(uid, courseId, participant) {
  const local = pickPointsLocal(participant); if (local !== null) return local;
  const rh = await getRaceHistoryEntry(uid, courseId); return rh.points !== null ? rh.points : 0;
}
async function resolveTeam(uid, courseId, participant) {
  const local = (firstDefined(pick(participant, ["team","teamName"]), (await getRaceHistoryEntry(uid, courseId)).team) || "").trim();
  if (local) return local;
  return signupCache.get(uid)?.teamName || "(Sans équipe)";
}

function getCourseRoundKey(c) { return c.round || c.name || "round"; }
function getCourseRoundLabel(c) { return c.round ? `Round ${c.round}` : (c.name || "Round"); }
function getRaceKind(c) { const b = (c.name || "").toLowerCase(); return b.includes("sprint") ? "sprint" : b.includes("main") || b.includes("principale") ? "main" : "other"; }

function parseTimeLikeToMs(val) {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return isFinite(val) ? (val > 5000 ? val : val * 1000) : null;
  if (typeof val === "string") {
    const s = val.trim(); if (!s) return null;
    const num = Number(s.replace(",", ".")); if (isFinite(num)) return num > 5000 ? num : num * 1000;
    if (s.includes(":")) {
      const parts = s.split(":");
      if (parts.length === 2 || parts.length === 3) {
        const secStr = parts.pop(); const sec = Number(secStr.replace(",", "."));
        if (!isFinite(sec)) return null;
        let total = sec;
        if (parts.length === 2) { total += Number(parts[0]) * 3600 + Number(parts[1]) * 60; }
        else if (parts.length === 1) { total += Number(parts[0]) * 60; }
        return total * 1000;
      }
    }
  }
  return null;
}

function anyNumberMs(...vals) {
  for (const v of vals) { const ms = parseTimeLikeToMs(v); if (ms != null && isFinite(ms)) return ms; }
  return null;
}

function computeGapLeaderText(p, leader) {
  const direct = pickGapLeaderMsDirect(p); if (direct != null) return direct === 0 ? "Leader" : "+" + msToClock(direct);
  const leaderLaps = Number(pick(leader, ["laps","lapCount"])); const myLaps = Number(pick(p, ["laps","lapCount"]));
  if (Number.isFinite(leaderLaps) && Number.isFinite(myLaps) && myLaps < leaderLaps) { const diff = leaderLaps - myLaps; return `+${diff} tour${diff > 1 ? "s" : ""}`; }
  const leadMs = pickTotalTimeMs(leader); const meMs = pickTotalTimeMs(p);
  if (leadMs != null && meMs != null) { const raw = meMs - leadMs; return raw <= 0 ? "Leader" : "+" + msToClock(raw); }
  return "—";
}

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

    // 2. Construction de l'interface
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

      // --- AJOUT DE LA REDIFFUSION ---
      const replayUrl = getReplayUrl(group.roundLabel);
      
      if (replayUrl !== undefined) {
        const replayContainer = document.createElement("div");
        replayContainer.className = "replay-container";
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

      ul.appendChild(card);
    });

  } catch (e) { 
    ul.innerHTML = `<li class="error">Erreur de chargement des courses.</li>`; 
    console.error("Erreur loadAllCoursesArchive:", e);
  }
}

// === ATTENTION: CETTE FONCTION EST VITALE POUR L'AFFICHAGE ===
async function renderRaceClassification(raceId, container, raceMeta) {
  try {
    const courseDoc = await getDoc(doc(db, "courses", raceId)); 
    if (!courseDoc.exists()) { container.innerHTML = "<em>Aucune donnée.</em>"; return; }
    
    await ensureSignupCache(); 
    const c = courseDoc.data() || {}; 
    const participants = Array.isArray(c.participants) ? c.participants.slice() : [];
    
    if (!participants.length) { container.innerHTML = "<em>Aucun pilote.</em>"; return; }
    participants.sort((a, b) => (Number(pick(a, ["position"])) || 9999) - (Number(pick(b, ["position"])) || 9999));
    
    const leader = participants[0]; 
    let globalBestMs = null;
    for (const p of participants) { const bm = pickBestLapMs(p); if (bm != null && (globalBestMs == null || bm < globalBestMs)) globalBestMs = bm; }
    
    let html = `<strong>Classement final </strong><br><br><div style="overflow:auto"><table class="race-table"><thead><tr><th>Nom</th><th>Prénom</th><th>Voiture</th><th>Best lap</th><th>Gap leader</th><th>Points</th></tr></thead><tbody>`;
    participants.forEach((p, index) => {
      const { first, last } = splitNameParts(p); 
      const bestMs = pickBestLapMs(p); 
      const pts = p.points ?? 0;
      const rowClass = index === 0 ? "podium-1" : index === 1 ? "podium-2" : index === 2 ? "podium-3" : "";
      html += `<tr class="${rowClass}"><td>${escapeHtml(last.toUpperCase())}</td><td>${escapeHtml(first)}</td><td>${escapeHtml(pickCar(p))}</td><td class="${globalBestMs && bestMs === globalBestMs ? 'bestlap-global':''}">${bestMs ? msToClock(bestMs) : '—'}</td><td>${escapeHtml(computeGapLeaderText(p, leader))}</td><td>${pts}</td></tr>`;
    });
    container.innerHTML = html + `</tbody></table></div>`;
  } catch (e) { container.innerHTML = "<em>Erreur.</em>"; }
}

/* ======================== CLASSEMENT FINAL PILOTES S9 ======================== */
async function loadEstacupPilotStandings() {
  const host = $("estacupPilotStandings"); if (!host) return;
  host.innerHTML = loaderHtml("Calcul en cours…");
  try {
    await ensureSignupCache(); const snap = await getDocs(collection(db, "courses"));
    const courses = []; snap.forEach(d => { if (d.data().estacup === true) courses.push({ id: d.id, ...d.data() }); });
    courses.sort((a, b) => (toDate(a.date) ?? 0) - (toDate(b.date) ?? 0));

    const perPilot = new Map(); const allRounds = new Set(); const roundLabels = new Map();

    for (const c of courses) {
      const parts = Array.isArray(c.participants) ? c.participants : [];
      const isSplit1 = Number(c.split) === 1 || c.split == null;
      const roundKey = getCourseRoundKey(c); const roundLabel = getCourseRoundLabel(c);
      allRounds.add(roundKey); if (!roundLabels.has(roundKey)) roundLabels.set(roundKey, roundLabel);
      const raceKind = getRaceKind(c);

      for (const p of parts) {
        const uid = pickUid(p); if (!uid) continue;
        const { first, last } = splitNameParts(p);
        const pts = await resolvePoints(uid, c.id, p);
        const team = await resolveTeam(uid, c.id, p);

        if (!perPilot.has(uid)) perPilot.set(uid, { uid, first, last, name: `${first} ${last}`.trim(), team, points: 0, starts: 0, wins: 0, podiums: 0, roundResults: {} });
        const row = perPilot.get(uid); row.points += pts; row.starts += 1;

        if (!row.roundResults[roundKey]) row.roundResults[roundKey] = { points: 0, sprintPoints: 0, mainPoints: 0 };
        if (raceKind === "sprint") row.roundResults[roundKey].sprintPoints += pts; else if (raceKind === "main") row.roundResults[roundKey].mainPoints += pts;
        row.roundResults[roundKey].points += pts;

        const pos = Number(p.position);
        if (isSplit1 && Number.isFinite(pos)) {
          if (pos === 1) row.wins += 1;
          if (pos >= 1 && pos <= 3) row.podiums += 1;
        }
        if (team && team !== "(Sans équipe)") row.team = team;
      }
    }

    const rows = [...perPilot.values()];
    const maxStarts = rows.reduce((m, r) => Math.max(m, r.starts || 0), 0);

    rows.forEach(r => {
      r.displayPoints = r.points;
      if (allRounds.size > 1 && r.starts === maxStarts) {
        let worst = Infinity;
        for (const k in r.roundResults) { if (r.roundResults[k].points < worst) worst = r.roundResults[k].points; }
        if (worst !== Infinity) r.displayPoints = r.points - worst;
      }
    });

    rows.sort((a,b) => b.displayPoints - a.displayPoints || b.wins - a.wins || b.podiums - a.podiums);

    let html = `<table class="table-standings"><thead><tr><th>#</th><th>Pilote</th><th>Équipe</th><th>Points (Joker inclus)</th><th>Victoires</th><th>Podiums</th><th>Départs</th></tr></thead><tbody>`;
    rows.forEach((r, idx) => {
      const cleanName = `${r.last.toUpperCase()} ${r.first}`;
      const rank = idx + 1;
      html += `<tr class="${rank <= 3 ? `podium-${rank}` : ""}"><td><span class="rank-badge">${rank}</span></td><td class="pilot-name-cell" data-uid="${r.uid}">${escapeHtml(cleanName)}</td><td>${escapeHtml(r.team)}</td><td><strong>${r.displayPoints}</strong></td><td>${r.wins}</td><td>${r.podiums}</td><td>${r.starts}</td></tr>`;
    });
    host.innerHTML = html + "</tbody></table>"; 
  } catch (e) { host.innerHTML = "<p>Erreur.</p>"; }
}

/* ======================== CLASSEMENT FINAL ÉQUIPES S9 ======================== */
async function loadEstacupTeamStandings() {
  const host = $("estacupTeamStandings"); if (!host) return;
  host.innerHTML = loaderHtml("Calcul en cours…");
  try {
    await ensureSignupCache(); const snap = await getDocs(collection(db, "courses"));
    const courses = []; snap.forEach(d => { if (d.data().estacup === true) courses.push({ id: d.id, ...d.data() }); });
    courses.sort((a, b) => (toDate(a.date) ?? 0) - (toDate(b.date) ?? 0));

    const perTeam = new Map(); const allRounds = new Set();

    for (const c of courses) {
      const parts = Array.isArray(c.participants) ? c.participants : [];
      const byTeam = new Map(); const isSplit1 = Number(c.split) === 1 || c.split == null;
      const roundKey = getCourseRoundKey(c); allRounds.add(roundKey);

      for (const p of parts) {
        const uid = pickUid(p); if (!uid) continue;
        const team = normTeamName(await resolveTeam(uid, c.id, p));
        if (team === "(Sans équipe)") continue;
        const pts = await resolvePoints(uid, c.id, p);
        if (!byTeam.has(team)) byTeam.set(team, []);
        byTeam.get(team).push({ pts: Number.isFinite(pts) ? pts : 0, pos: Number(p.position) || 9999 });
      }

      byTeam.forEach((arr, team) => {
        arr.sort((a,b) => b.pts - a.pts || a.pos - b.pos);
        const score = (arr[0]?.pts ?? 0) + (arr[1]?.pts ?? 0);
        if (!perTeam.has(team)) perTeam.set(team, { team, points: 0, wins: 0, podiums: 0, roundResults: {} });
        const agg = perTeam.get(team); agg.points += score;
        if (!agg.roundResults[roundKey]) agg.roundResults[roundKey] = { points: 0 };
        agg.roundResults[roundKey].points += score;

        if (isSplit1) {
          arr.forEach(r => {
            if (r.pos === 1) agg.wins += 1;
            if (r.pos >= 1 && r.pos <= 3) agg.podiums += 1;
          });
        }
      });
    }

    const rows = [...perTeam.values()]; if (rows.length === 0) { host.innerHTML = "<p>Aucune équipe.</p>"; return; }
    const maxRounds = rows.reduce((m, r) => Math.max(m, Object.keys(r.roundResults).length), 0);

    rows.forEach(r => {
      r.displayPoints = r.points;
      if (allRounds.size > 1 && Object.keys(r.roundResults).length === maxRounds) {
        let worst = Infinity;
        for (const k in r.roundResults) { if (r.roundResults[k].points < worst) worst = r.roundResults[k].points; }
        if (worst !== Infinity) r.displayPoints = r.points - worst;
      }
    });

    rows.sort((a,b) => b.displayPoints - a.displayPoints || b.wins - a.wins || b.podiums - a.podiums);

    let html = `<table class="table-standings"><thead><tr><th>#</th><th>Équipe</th><th>Points (Joker inclus)</th><th>Victoires (S1)</th><th>Podiums (S1)</th></tr></thead><tbody>`;
    rows.forEach((r, idx) => {
      const rank = idx + 1;
      html += `<tr class="${rank <= 3 ? `podium-${rank}` : ""}"><td><span class="rank-badge">${rank}</span></td><td><strong>${escapeHtml(r.team)}</strong></td><td><strong>${r.displayPoints}</strong></td><td>${r.wins}</td><td>${r.podiums}</td></tr>`;
    });
    host.innerHTML = html + "</tbody></table>";
  } catch (e) { host.innerHTML = "<p>Erreur.</p>"; }
}

function normTeamName(t) { const s = (t||"").toString().trim(); return s === "" ? "(Sans équipe)" : s; }

/* ======================== NAVIGATION ET INITIALISATION ======================== */
function setupNavigationArchive() {
  document.querySelectorAll('.menu button[data-section]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('.section').forEach(s => s.classList.add("hidden"));
      const target = $(`section-${btn.dataset.section}`);
      if (target) target.classList.remove("hidden");
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupNavigationArchive();
  await loadAllCoursesArchive();
  await loadEstacupPilotStandings();
  await loadEstacupTeamStandings();
});
