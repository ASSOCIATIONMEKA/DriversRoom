// estacup-s9.js — Driver's Room S9 (Archives)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, getDocs, query, where, updateDoc, addDoc, setDoc
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

function loaderHtml(txt) {
  const text = txt === undefined ? "Chargement…" : txt;
  return `<div class="loading-inline"><div class="spinner"></div><div>${escapeHtml(text)}</div></div>`;
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

/* ======================== Tooltip pilote ======================== */
let pilotHoverTimeout = null; let pilotTooltipEl = null; let pilotTooltipAnchor = null; let pilotTooltipCurrentUid = null;
const pilotInfoCache = new Map();

function ensurePilotTooltip() {
  if (pilotTooltipEl) return;
  pilotTooltipEl = document.createElement("div"); pilotTooltipEl.id = "pilotTooltip";
  pilotTooltipEl.style = "position:fixed; z-index:9999; padding:8px 10px; border-radius:8px; background:#0b1220; border:1px solid #38bdf8; color:#e2e8f0; font-size:0.85rem; display:none; max-width:260px; pointer-events:none;";
  document.body.appendChild(pilotTooltipEl);
}

function hidePilotTooltip() { if (pilotTooltipEl) pilotTooltipEl.style.display = "none"; pilotTooltipAnchor = null; pilotTooltipCurrentUid = null; }

function positionPilotTooltip(anchorEl) {
  if (!pilotTooltipEl || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const left = clamp(rect.left + rect.width / 2 - (pilotTooltipEl.offsetWidth || 220) / 2, 8, window.innerWidth - (pilotTooltipEl.offsetWidth || 220) - 8);
  pilotTooltipEl.style.left = left + "px"; pilotTooltipEl.style.top = (rect.bottom + 8) + "px";
}

async function showPilotTooltipFor(uid, fallbackName, anchorEl) {
  ensurePilotTooltip(); pilotTooltipAnchor = anchorEl; pilotTooltipCurrentUid = uid;
  const safeName = (fallbackName || "Pilote").toString();
  pilotTooltipEl.innerHTML = `<strong>${escapeHtml(safeName)}</strong><br><span class="muted-note">Chargement…</span>`;
  pilotTooltipEl.style.display = "block"; positionPilotTooltip(anchorEl);

  let info = pilotInfoCache.get(uid);
  if (!info) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const d = snap.data() || {};
        const age = (d.dob || d.birthDate) ? (new Date().getFullYear() - toDate(d.dob || d.birthDate).getFullYear()) : null;
        info = { name: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || safeName, age, mRating: d.eloRating ?? 1000, mSafety: d.licensePoints ?? 10 };
      } else info = { name: safeName, age: null, mRating: null, mSafety: null };
      pilotInfoCache.set(uid, info);
    } catch { info = { name: safeName, age: null, mRating: null, mSafety: null }; }
  }
  if (pilotTooltipCurrentUid !== uid) return;
  pilotTooltipEl.innerHTML = `<strong>${escapeHtml(info.name)}</strong><br><span class="muted-note">Âge : ${info.age ?? "—"} ans</span><br><span class="muted-note">M-Rating : ${info.mRating ?? "—"}</span><br><span class="muted-note">M-Safety : ${info.mSafety ?? "—"}</span>`;
  positionPilotTooltip(anchorEl);
}

function setupPilotNameHover(root) {
  if (!root) return;
  root.querySelectorAll(".pilot-name-cell[data-uid]").forEach(node => {
    node.addEventListener("mouseenter", () => { clearTimeout(pilotHoverTimeout); pilotHoverTimeout = setTimeout(() => showPilotTooltipFor(node.getAttribute("data-uid"), node.textContent, node), 500); });
    node.addEventListener("mouseleave", () => { clearTimeout(pilotHoverTimeout); hidePilotTooltip(); });
  });
}

/* ======================== Caches & Synchronisation ======================== */
let currentUid = null;
let lastUserData = null;
const signupCache = new Map(); const raceHistoryCache = new Map();

async function ensureSignupCache() {
  if (signupCache.size > 0) return;
  const snap = await getDocs(collection(db, "estacup_signups"));
  snap.forEach(d => {
    const x = d.data(); if (x.uid) signupCache.set(x.uid, { teamName: x.teamName || "", raceNumber: x.raceNumber, carChoice: x.carChoice });
  });
}

async function getRaceHistoryEntry(uid, raceId) {
  const key = `${uid}::${raceId}`; if (raceHistoryCache.has(key)) return raceHistoryCache.get(key);
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

/* ======================== NAVIGATION SUB-MENU ======================== */
function setupEstacupSubnav() {
  const subnav = $("estacupSubnav"); if (!subnav) return;
  subnav.querySelectorAll(".estc-sub-btn").forEach(btn => {
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
    if (key === "rankpilots") loadEstacupPilotStandings();
    if (key === "rankteams") loadEstacupTeamStandings();
  }
}

function setupNavigation(isAdmin = false) {
  const goToAdmin = $("goToAdmin"); if (isAdmin && goToAdmin) goToAdmin.classList.remove("hidden");
  
  document.querySelectorAll('.menu button[data-section]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('.section').forEach(s => s.classList.add("hidden"));
      const target = $(`section-${btn.dataset.section}`);
      if (target) target.classList.remove("hidden");
      
      if (btn.dataset.section === "results" && currentUid) loadResults(currentUid);
      if (btn.dataset.section === "estacup") { setupEstacupSubnav(); showEstacupSub("inscription"); }
    });
  });

  // Activation du bouton Déconnexion
  const logoutBtn = document.getElementById("logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      signOut(auth).then(() => {
        window.location.href = "login.html";
      });
    });
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;
  currentUid = userSnap.id; lastUserData = userSnap.data();
  
  const fullNameEl = $("fullName");
  if (fullNameEl) fullNameEl.textContent = `${lastUserData.firstName ?? ""} ${lastUserData.lastName ?? ""}`.trim();
  
  setupNavigation(lastUserData.admin === true);
  await ensureSignupCache();
  await loadResults(currentUid);
  await loadPilotStats(currentUid);
});

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

/* ======================== RÉSULTATS (CORRIGÉ & RESTAURÉ) ======================== */
async function loadResults(uid) {
  const ul = $("raceHistory"); if (!ul) return;
  try {
    ul.innerHTML = "<li>Chargement…</li>";
    const snap = await getDocs(collection(db, "users", uid, "raceHistory"));
    if (snap.empty) { ul.innerHTML = "<li>Aucun résultat pour l’instant.</li>"; return; }
    const rows = []; snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (toDate(b.date) ?? 0) - (toDate(a.date) ?? 0));
    ul.innerHTML = "";
    for (const r of rows) {
      const d = formatDateFR(r.date) || ""; const title = [d, (r.name || "Course")].filter(Boolean).join(" – ");
      const li = document.createElement("li"); li.className = "race-item";
      const btn = document.createElement("button"); btn.className = "race-btn"; btn.textContent = title;
      const details = document.createElement("div"); details.id = `cls-${r.id}`; details.className = "race-classification"; details.style.display = "none";
      btn.addEventListener("click", async () => {
        if (details.style.display !== "none") { details.style.display = "none"; return; }
        await renderRaceClassification(r.id, details, r); details.style.display = "block";
      });
      li.appendChild(btn); li.appendChild(details); ul.appendChild(li);
    }
  } catch (e) { ul.innerHTML = `<li>Erreur de chargement.</li>`; }
}

async function renderRaceClassification(raceId, container, raceMeta) {
  try {
    const courseDoc = await getDoc(doc(db, "courses", raceId)); if (!courseDoc.exists()) { container.innerHTML = "<em>Aucune donnée.</em>"; return; }
    await ensureSignupCache(); const c = courseDoc.data() || {}; const participants = Array.isArray(c.participants) ? c.participants.slice() : [];
    if (!participants.length) { container.innerHTML = "<em>Aucun pilote.</em>"; return; }
    participants.sort((a, b) => (Number(pick(a, ["position"])) || 9999) - (Number(pick(b, ["position"])) || 9999));
    const leader = participants[0]; let globalBestMs = null;
    for (const p of participants) { const bm = pickBestLapMs(p); if (bm != null && (globalBestMs == null || bm < globalBestMs)) globalBestMs = bm; }
    let html = `<strong>Classement — ${escapeHtml(c.name || "Course")}</strong><br><br><div style="overflow:auto"><table class="race-table"><thead><tr><th>Nom</th><th>Prénom</th><th>Voiture</th><th>Best lap</th><th>Gap leader</th><th>Points</th></tr></thead><tbody>`;
    participants.forEach((p, index) => {
      const { first, last } = splitNameParts(p); const uid = pickUid(p); const bestMs = pickBestLapMs(p); const pts = p.points ?? 0;
      const rowClass = index === 0 ? "podium-1" : index === 1 ? "podium-2" : index === 2 ? "podium-3" : "";
      html += `<tr class="${rowClass}"><td>${escapeHtml(last.toUpperCase())}</td><td>${escapeHtml(first)}</td><td>${escapeHtml(pickCar(p))}</td><td class="${globalBestMs && bestMs === globalBestMs ? 'bestlap-global':''}">${bestMs ? msToClock(bestMs) : '—'}</td><td>${escapeHtml(computeGapLeaderText(p, leader))}</td><td>${pts}</td></tr>`;
    });
    container.innerHTML = html + `</tbody></table></div>`;
  } catch (e) { container.innerHTML = "<em>Erreur.</em>"; }
}

async function loadPilotStats(uid) {
  try {
    const snap = await getDocs(collection(db, "users", uid, "raceHistory"));
    const positions = []; snap.forEach(d => { const p = Number(d.data().position); if (p > 0) positions.push(p); });
    if ($("statStarts")) $("statStarts").textContent = String(positions.length);
    if ($("statBest"))   $("statBest").textContent   = positions.length ? `${Math.min(...positions)}ᵉ` : "—";
    if ($("statWins"))   $("statWins").textContent   = String(positions.filter(p => p === 1).length);
  } catch {}
}

/* ======================== VOTE CIRCUIT S9 ======================== */
async function renderVoteCircuit() {
  const host = $("voteCircuitHost"); if (!host || !currentUid) return;
  host.innerHTML = `<p>Chargement du vote…</p>`;
  const questions = [
    { key: "round3", title: "Round 3", options: [{ value: "shanghai", label: "Shanghaï", cc: "cn" }, { value: "sepang", label: "Sepang", cc: "my" }] },
    { key: "round5", title: "Round 5", options: [{ value: "bahrain", label: "Bahrain", cc: "bh" }, { value: "losail", label: "Losail", cc: "qa" }] }
  ];
  const voteRef = doc(db, "estacup_votes", currentUid); const snap = await getDoc(voteRef);
  const existing = snap.exists() ? snap.data() : null; const locked = existing?.locked === true;
  const selected = { round3: existing?.round3 ?? null, round5: existing?.round5 ?? null };

  const cards = questions.map(q => {
    const opts = q.options.map(o => `
      <label class="vote-option" for="vote_${q.key}_${o.value}">
        <input type="radio" name="${q.key}" id="vote_${q.key}_${o.value}" value="${o.value}" ${selected[q.key] === o.value ? "checked" : ""} ${locked ? "disabled" : ""} />
        <div class="vote-pill"><span class="fi fi-${o.cc} vote-flag"></span><strong>${escapeHtml(o.label)}</strong></div>
      </label>`).join("");
    return `<div class="vote-card"><div class="vote-title">${escapeHtml(q.title)}</div><div class="vote-options">${opts}</div></div>`;
  }).join("");

  host.innerHTML = `<div class="vote-grid">${cards}</div><div class="vote-actions">${locked ? `<p class="muted-note">✅ Votre vote a été validé.</p>` : `<button id="btnValidateVote" class="btn-validate">✅ Valider mon vote</button>`}</div>`;
  if (!locked) {
    questions.forEach(q => host.querySelectorAll(`input[name="${q.key}"]`).forEach(r => r.addEventListener("change", () => { selected[q.key] = r.value; })));
    $("btnValidateVote")?.addEventListener("click", async () => {
      if (!selected.round3 || !selected.round5) { alert("Répondez aux deux questions."); return; }
      await setDoc(voteRef, { uid: currentUid, round3: selected.round3, round5: selected.round5, locked: true, updatedAt: new Date() });
      renderVoteCircuit();
    });
  }
}

/* ======================== LISTE DES ENGAGÉS S9 ======================== */
async function loadEstacupEngages() {
  const container = $("estacupEngages"); if (!container) return;
  container.innerHTML = loaderHtml("Chargement des engagés…");
  try {
    const snap = await getDocs(collection(db, "estacup_signups"));
    const valid = snap.docs.filter(d => d.data() && d.data().validated);
    if (valid.length === 0) { container.innerHTML = "<p class='muted-note'>Aucun inscrit validé pour l'instant.</p>"; return; }
    container.innerHTML = "";
    valid.forEach(docu => {
      const d = docu.data();
      const box = document.createElement("div"); box.className = "course-box engage-card";
      box.innerHTML = `<div class="engage-text"><strong>${escapeHtml(`${d.firstName} ${d.lastName}`)}</strong><br>Numéro : ${d.raceNumber}<br>Équipe : ${escapeHtml(d.teamName || "")} | Voiture : ${escapeHtml(d.carChoice || "")}</div>`;
      container.appendChild(box);
    });
  } catch (e) { container.innerHTML = "<p>Erreur engagés.</p>"; }
}

/* ======================== CLASSEMENT PILOTES S9 ======================== */
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
    const useJoker = !!$("jokerTogglePilots")?.checked;
    const maxStarts = rows.reduce((m, r) => Math.max(m, r.starts || 0), 0);

    rows.forEach(r => {
      r.displayPoints = r.points;
      if (useJoker && allRounds.size > 1 && r.starts === maxStarts) {
        let worst = Infinity;
        for (const k in r.roundResults) { if (r.roundResults[k].points < worst) worst = r.roundResults[k].points; }
        if (worst !== Infinity) r.displayPoints = r.points - worst;
      }
    });

    rows.sort((a,b) => b.displayPoints - a.displayPoints || b.wins - a.wins || b.podiums - a.podiums);

    let html = `<table class="table-standings"><thead><tr><th>#</th><th>Pilote</th><th>Équipe</th><th>Points</th><th>Victoires</th><th>Podiums</th><th>Départs</th></tr></thead><tbody>`;
    rows.forEach((r, idx) => {
      const cleanName = `${r.last.toUpperCase()} ${r.first}`;
      const rank = idx + 1;
      html += `<tr class="${rank <= 3 ? `podium-${rank}` : ""}"><td><span class="rank-badge">${rank}</span></td><td class="pilot-name-cell" data-uid="${r.uid}">${escapeHtml(cleanName)}</td><td>${escapeHtml(r.team)}</td><td><strong>${r.displayPoints}</strong></td><td>${r.wins}</td><td>${r.podiums}</td><td>${r.starts}</td></tr>`;
    });
    host.innerHTML = html + "</tbody></table>"; setupPilotNameHover(host);
  } catch (e) { host.innerHTML = "<p>Erreur.</p>"; }
}

/* ======================== CLASSEMENT ÉQUIPES S9 ======================== */
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
    const useJoker = !!$("jokerToggleTeams")?.checked;
    const maxRounds = rows.reduce((m, r) => Math.max(m, Object.keys(r.roundResults).length), 0);

    rows.forEach(r => {
      r.displayPoints = r.points;
      if (useJoker && allRounds.size > 1 && Object.keys(r.roundResults).length === maxRounds) {
        let worst = Infinity;
        for (const k in r.roundResults) { if (r.roundResults[k].points < worst) worst = r.roundResults[k].points; }
        if (worst !== Infinity) r.displayPoints = r.points - worst;
      }
    });

    rows.sort((a,b) => b.displayPoints - a.displayPoints || b.wins - a.wins || b.podiums - a.podiums);

    let html = `<table class="table-standings"><thead><tr><th>#</th><th>Équipe</th><th>Points</th><th>Victoires (S1)</th><th>Podiums (S1)</th></tr></thead><tbody>`;
    rows.forEach((r, idx) => {
      const rank = idx + 1;
      html += `<tr class="${rank <= 3 ? `podium-${rank}` : ""}"><td><span class="rank-badge">${rank}</span></td><td><strong>${escapeHtml(r.team)}</strong></td><td><strong>${r.displayPoints}</strong></td><td>${r.wins}</td><td>${r.podiums}</td></tr>`;
    });
    host.innerHTML = html + "</tbody></table>";
  } catch (e) { host.innerHTML = "<p>Erreur.</p>"; }
}

function normTeamName(t) { const s = (t||"").toString().trim(); return s === "" ? "(Sans équipe)" : s; }
