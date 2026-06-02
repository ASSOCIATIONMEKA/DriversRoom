// estacup-s9.js — Driver's Room S9 (Archives)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  addDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ======================== Firebase ======================== */
const firebaseConfig = {
  apiKey: "AIzaSyDJ7uhvc31nyRB4bh9bVtkagaUksXG1fOo",
  authDomain: "estacupbymeka.firebaseapp.com",
  projectId: "estacupbymeka",
  storageBucket: "estacupbymeka.appspot.com",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ======================== Utils ======================== */
const $ = (id) => document.getElementById(id);
const isNum = (x) => typeof x === "number" && isFinite(x);
const clamp = (x,min,max)=>Math.max(min,Math.min(max,x));

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
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
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

function extractSteam64(input) {
  const m = String(input || "").match(/765\d{14}/);
  return m ? m[0] : "";
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const k of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, k)) {
      cur = cur[k];
    } else {
      return undefined;
    }
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

/* ======================== Navigation ESTACUP ======================== */
function setupEstacupSubnav() {
  const subnav = $("estacupSubnav");
  if (!subnav) return;
  const subs = subnav.querySelectorAll(".estc-sub-btn");
  subs.forEach(btn => {
    btn.onclick = () => showEstacupSub(btn.dataset.sub);
  });
}

function showEstacupSub(key) {
  const blocks = {
    inscription: $("estacup-sub-inscription"),
    engages:     $("estacup-sub-engages"),
    votecircuit: $("estacup-sub-votecircuit"),
    reclam:      $("estacup-sub-reclam"),
    rankpilots:  $("estacup-sub-rankpilots"),
    rankteams:   $("estacup-sub-rankteams"),
  };
  
  Object.values(blocks).forEach(b => b && b.classList.add("hidden"));
  
  if (blocks[key]) {
    blocks[key].classList.remove("hidden");
    if (key === "votecircuit") renderVoteCircuit();
    if (key === "engages") loadEstacupEngages();
    if (key === "rankpilots") {
      const chkP = $("jokerTogglePilots");
      if (chkP) chkP.onchange = () => loadEstacupPilotStandings();
      loadEstacupPilotStandings();
    }
    if (key === "rankteams") {
      const chkT = $("jokerToggleTeams");
      if (chkT) chkT.onchange = () => loadEstacupTeamStandings();
      loadEstacupTeamStandings();
    }
  }
}

/* ======================== Navigation Globale ======================== */
let currentUid   = null;
let lastUserData = null;
const signupCache = new Map();

function setupNavigation(isAdmin = false) {
  const goToAdmin = $("goToAdmin");
  if (isAdmin && goToAdmin) goToAdmin.classList.remove("hidden");
  
  const buttons  = document.querySelectorAll('.menu button[data-section]');
  const sections = document.querySelectorAll('.section');

  function showSection(key) {
    sections.forEach(s => s.classList.add("hidden"));
    const el = document.getElementById(`section-${key}`);
    if (el) el.classList.remove("hidden");

    if (key === "estacup" && lastUserData) {
      setupEstacupSubnav();
      showEstacupSub("inscription");
    }
  }

  buttons.forEach(btn => btn.addEventListener("click", () => showSection(btn.getAttribute("data-section"))));
  showSection("infos");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) return;
    const data = userSnap.data();
    currentUid   = userSnap.id;
    lastUserData = data;
    $("fullName").textContent = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "—";
    setupNavigation(data.admin === true);
  } catch (err) { console.error(err); }
});

/* ======================== VOTE CIRCUIT S9 ======================== */
async function renderVoteCircuit() {
  const host = $("voteCircuitHost");
  if (!host || !currentUid) return;

  host.innerHTML = `<p>Chargement du vote...</p>`;

  const questions = [
    { key: "round3", title: "Round 3", options: [{ value: "shanghai", label: "Shanghaï", cc: "cn" }, { value: "sepang", label: "Sepang", cc: "my" }] },
    { key: "round5", title: "Round 5", options: [{ value: "bahrain", label: "Bahrain", cc: "bh" }, { value: "losail", label: "Losail", cc: "qa" }] }
  ];

  const voteRef = doc(db, "estacup_votes", currentUid);
  const snap = await getDoc(voteRef);
  const existing = snap.exists() ? snap.data() : null;
  const locked = existing?.locked === true;
  const selected = { round3: existing?.round3 ?? null, round5: existing?.round5 ?? null };

  const cards = questions.map(q => {
    const opts = q.options.map(o => {
      const id = `vote_${q.key}_${o.value}`;
      return `
        <label class="vote-option" for="${id}">
          <input type="radio" name="${q.key}" id="${id}" value="${o.value}" ${selected[q.key] === o.value ? "checked" : ""} ${locked ? "disabled" : ""} />
          <div class="vote-pill">
            <span class="fi fi-${o.cc} vote-flag"></span>
            <strong>${escapeHtml(o.label)}</strong>
          </div>
        </label>`;
    }).join("");
    return `<div class="vote-card"><div class="vote-title">${escapeHtml(q.title)}</div><div class="vote-options">${opts}</div></div>`;
  }).join("");

  host.innerHTML = `
    <div class="vote-grid">${cards}</div>
    <div class="vote-actions">
      ${locked ? `<p class="muted-note">✅ Votre vote a été validé.</p>` : `<button id="btnValidateVote" class="btn-validate">✅ Valider mon vote</button>`}
    </div>`;

  if (!locked) {
    questions.forEach(q => {
      host.querySelectorAll(`input[name="${q.key}"]`).forEach(r => r.addEventListener("change", () => { selected[q.key] = r.value; }));
    });
    $("btnValidateVote")?.addEventListener("click", async () => {
      if (!selected.round3 || !selected.round5) { alert("Répondez aux deux questions !"); return; }
      await setDoc(voteRef, { uid: currentUid, round3: selected.round3, round5: selected.round5, locked: true, updatedAt: new Date() });
      renderVoteCircuit();
    });
  }
}

/* ======================== LISTE DES ENGAGÉS S9 (AJOUTÉE) ======================== */
async function loadEstacupEngages() {
  const host = $("estacupEngagesHost") || $("estacup-sub-engages");
  if (!host) return;
  host.innerHTML = "<p>Chargement des engagés...</p>";

  try {
    const snap = await getDocs(collection(db, "estacup_s9_signups"));
    if (snap.empty) {
      host.innerHTML = "<p style='color:#94a3b8;'>Aucun pilote inscrit pour la Saison 9.</p>";
      return;
    }

    let html = `
      <div style="overflow:auto">
        <table class="race-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Pilote</th>
              <th>Équipe</th>
              <th>Voiture</th>
              <th>Livrée</th>
            </tr>
          </thead>
          <tbody>`;

    snap.forEach(docSnap => {
      const s = docSnap.data();
      if (!s) return;
      const name = `${s.firstName || ""} ${s.lastName || ""}`.trim();
      html += `
        <tr>
          <td><b style="color:#38bdf8;">${s.raceNumber ?? "—"}</b></td>
          <td><strong>${escapeHtml(name || "Pilote")}</strong></td>
          <td>${escapeHtml(s.teamName || "—")}</td>
          <td>${escapeHtml(s.carChoice || "—")}</td>
          <td><span class="muted-note">${escapeHtml(s.liveryChoice || "—")}</span></td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    host.innerHTML = html;
  } catch (err) {
    console.error("Erreur engagés S9:", err);
    host.innerHTML = "<p>Erreur lors de la récupération de la liste des engagés.</p>";
  }
}

/* ======================== CLASSEMENT PILOTES S9 ======================== */
async function loadEstacupPilotStandings() {
  const host = $("estacupPilotStandingsHost");
  if (!host) return;
  host.innerHTML = "<p>Chargement du classement pilotes...</p>";

  try {
    const useJoker = $("jokerTogglePilots")?.checked ?? false;
    const [raceHistorySnap, coursesSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "raceHistory")),
      getDocs(collection(db, "courses")),
      getDocs(collection(db, "users"))
    ]);

    const pilotsMap = new Map();
    usersSnap.forEach(d => {
      const u = d.data();
      if(u) {
        const pName = `${u.firstName || ""} ${u.lastName || ""}`.trim();
        pilotsMap.set(d.id, { name: pName || "Pilote Inconnu", rounds: {}, total: 0, uid: d.id });
      }
    });

    const processRaces = (snap) => {
      snap.forEach(docSnap => {
        try {
          const race = docSnap.data();
          if (!race || !race.participants) return;

          const roundKey = race.round || race.name || docSnap.id;
          const raceNameLower = (race.name || "").toLowerCase();
          const isSprint = raceNameLower.includes("sprint") || (race.type || "").toLowerCase().includes("sprint");

          race.participants.forEach(p => {
            if (!p || !p.uid || !pilotsMap.has(p.uid)) return;
            
            const pilot = pilotsMap.get(p.uid);
            if (!pilot.rounds[roundKey]) pilot.rounds[roundKey] = { sprint: 0, main: 0 };
            
            const pts = parseInt(p.points || p.posPoints || 0, 10);
            if (isSprint) pilot.rounds[roundKey].sprint = pts;
            else pilot.rounds[roundKey].main = pts;
          });
        } catch (err) {}
      });
    };

    processRaces(raceHistorySnap);
    processRaces(coursesSnap);

    const rows = Array.from(pilotsMap.values()).map(pilot => {
      let scores = [];
      Object.keys(pilot.rounds).forEach(r => { scores.push(pilot.rounds[r].sprint + pilot.rounds[r].main); });
      
      let finalTotal = scores.reduce((a, b) => a + b, 0);
      if (useJoker && scores.length > 0) finalTotal -= Math.min(...scores);
      pilot.total = finalTotal;
      return pilot;
    }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

    if (rows.length === 0) {
      host.innerHTML = "<p style='color:#94a3b8;'>Aucun score enregistré trouvé pour la Saison 9.</p>";
      return;
    }

    let html = `<table class="race-table"><thead><tr><th>Pos</th><th>Pilote</th><th>Points</th></tr></thead><tbody>`;
    rows.forEach((r, idx) => {
      html += `<tr><td>${idx + 1}</td><td>${escapeHtml(r.name)}</td><td><strong>${r.total} pts</strong></td></tr>`;
    });
    host.innerHTML = html + "</tbody></table>";
  } catch (err) { 
    host.innerHTML = "<p>Erreur lors du calcul du classement.</p>"; 
  }
}

/* ======================== CLASSEMENT ÉQUIPES S9 ======================== */
async function loadEstacupTeamStandings() {
  const host = $("estacupTeamStandingsHost");
  if (!host) return;
  host.innerHTML = "<p>Chargement du classement équipes...</p>";

  try {
    const useJoker = $("jokerToggleTeams")?.checked ?? false;
    const [raceHistorySnap, coursesSnap, signupsSnap] = await Promise.all([
      getDocs(collection(db, "raceHistory")),
      getDocs(collection(db, "courses")),
      getDocs(collection(db, "estacup_s9_signups"))
    ]);

    const pilotToTeam = new Map();
    signupsSnap.forEach(d => { 
      const s = d.data(); 
      if (s && s.uid && s.teamName) pilotToTeam.set(s.uid, s.teamName.trim()); 
    });

    const teamsMap = new Map();

    const processTeams = (snap) => {
      snap.forEach(docSnap => {
        try {
          const race = docSnap.data();
          if (!race || !race.participants) return;

          const roundKey = race.round || race.name || docSnap.id;
          race.participants.forEach(p => {
            if (!p || !p.uid || !pilotToTeam.has(p.uid)) return;
            const teamName = pilotToTeam.get(p.uid);
            
            if (!teamsMap.has(teamName)) teamsMap.set(teamName, { name: teamName, rounds: {} });
            
            const team = teamsMap.get(teamName);
            if (!team.rounds[roundKey]) team.rounds[roundKey] = 0;
            team.rounds[roundKey] += parseInt(p.points || p.posPoints || 0, 10);
          });
        } catch (err) {}
      });
    };

    processTeams(raceHistorySnap);
    processTeams(coursesSnap);

    const rows = Array.from(teamsMap.values()).map(team => {
      let scores = Object.values(team.rounds);
      let finalTotal = scores.reduce((a, b) => a + b, 0);
      if (useJoker && scores.length > 0) finalTotal -= Math.min(...scores);
      team.total = finalTotal;
      return team;
    }).filter(t => t.total > 0).sort((a, b) => b.total - a.total);

    if (rows.length === 0) {
      host.innerHTML = "<p style='color:#94a3b8;'>Aucune donnée d'équipe enregistrée pour la Saison 9.</p>";
      return;
    }

    let html = `<table class="race-table"><thead><tr><th>Pos</th><th>Équipe</th><th>Points</th></tr></thead><tbody>`;
    rows.forEach((r, idx) => {
      html += `<tr><td>${idx + 1}</td><td>${escapeHtml(r.name)}</td><td><strong>${r.total} pts</strong></td></tr>`;
    });
    host.innerHTML = html + "</tbody></table>";
  } catch (err) { 
    host.innerHTML = "<p>Erreur classement équipes.</p>"; 
  }
}

function setupMekaQuestionnaire() {}
function loadReclamHistory() {}
