// estacup-s10.js — Driver's Room S10
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db   = getFirestore(app);

/* ======================== Utils ======================== */
const $ = (id) => document.getElementById(id);
const isNum = (x) => typeof x === "number" && isFinite(x);
const clamp = (x,min,max)=>Math.max(min,Math.min(max,x));

function toDate(value) {
  if (!value) return null;
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (value && typeof value.toDate === "function") { try { return value.toDate(); } catch {} }
  const d = new Date(value); return isNaN(d) ? null : d;
}
function formatDateFR(v) { const d = toDate(v); return d ? d.toLocaleDateString("fr-FR") : ""; }
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function msToClock(ms) {
  if (!isNum(ms)) return String(ms ?? "");
  const sign = ms < 0 ? "-" : "";
  const a = Math.abs(ms); const h = Math.floor(a / 3600000);
  const m = Math.floor((a % 3600000) / 60000); const s = Math.floor((a % 60000) / 1000);
  const ms3 = String(Math.floor(a % 1000)).padStart(3, "0");
  if (h > 0) return `${sign}${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${ms3}`;
  return `${sign}${m}:${String(s).padStart(2,"0")}.${ms3}`;
}
function firstDefined(...vals) { for (const v of vals) if (v !== undefined && v !== null && v !== "") return v; return undefined; }
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split("."); let cur = obj;
  for (const k of parts) { if (cur && Object.prototype.hasOwnProperty.call(cur, k)) { cur = cur[k]; } else { return undefined; } }
  return cur;
}
function pick(obj, paths) { for (const p of paths) { const val = getByPath(obj, p); if (val !== undefined && val !== null && val !== "") return val; } return undefined; }

/* ======================== Tooltip pilote ======================== */
let pilotHoverTimeout = null, pilotTooltipEl = null, pilotTooltipAnchor = null, pilotTooltipCurrentUid = null;
const pilotInfoCache = new Map();

function computeAgeFromDob(dobField) {
  const d = toDate(dobField); if (!d) return null;
  const now = new Date(); let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
function ensurePilotTooltip() {
  if (pilotTooltipEl) return;
  pilotTooltipEl = document.createElement("div"); pilotTooltipEl.id = "pilotTooltip";
  pilotTooltipEl.style.position = "fixed"; pilotTooltipEl.style.zIndex = "9999";
  pilotTooltipEl.style.padding = "8px 10px"; pilotTooltipEl.style.borderRadius = "8px";
  pilotTooltipEl.style.background = "#0b1220"; pilotTooltipEl.style.border = "1px solid #38bdf8";
  pilotTooltipEl.style.color = "#e2e8f0"; pilotTooltipEl.style.fontSize = "0.85rem";
  pilotTooltipEl.style.boxShadow = "0 10px 30px rgba(15,23,42,0.9)"; pilotTooltipEl.style.display = "none";
  pilotTooltipEl.style.maxWidth = "260px"; pilotTooltipEl.style.pointerEvents = "none";
  document.body.appendChild(pilotTooltipEl);
}
function hidePilotTooltip() { if (pilotTooltipEl) pilotTooltipEl.style.display = "none"; pilotTooltipAnchor = null; pilotTooltipCurrentUid = null; }
function positionPilotTooltip(anchorEl) {
  if (!pilotTooltipEl || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect(); const tooltipWidth = pilotTooltipEl.offsetWidth || 220;
  const left = clamp(rect.left + rect.width / 2 - tooltipWidth / 2, 8, window.innerWidth - tooltipWidth - 8);
  const top = rect.bottom + 8;
  pilotTooltipEl.style.left = left + "px"; pilotTooltipEl.style.top = top + "px";
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
        const dobRaw = firstDefined(d.dob, d.birthDate, d.birthday, d.dateNaissance, d.naissance);
        const age = computeAgeFromDob(dobRaw);
        const name = `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || safeName;
        const mRating = d.eloRating ?? 1000; const mSafety = d.licensePoints ?? 10;
        info = { name, age, mRating, mSafety };
      } else info = { name: safeName, age: null, mRating: null, mSafety: null };
      pilotInfoCache.set(uid, info);
    } catch (e) { info = pilotInfoCache.get(uid) || { name: safeName, age: null, mRating: null, mSafety: null }; }
  }
  if (pilotTooltipCurrentUid !== uid || pilotTooltipAnchor !== anchorEl) return;
  const ageTxt = info.age != null ? `${info.age} ans` : "—";
  const mrTxt = info.mRating != null ? info.mRating : "—";
  const msTxt = info.mSafety != null ? info.mSafety : "—";
  pilotTooltipEl.innerHTML = `<strong>${escapeHtml(info.name || safeName)}</strong><br><span class="muted-note">Âge : ${escapeHtml(String(ageTxt))}</span><br><span class="muted-note">M-Rating : ${escapeHtml(String(mrTxt))}</span><br><span class="muted-note">M-Safety : ${escapeHtml(String(msTxt))}</span>`;
  pilotTooltipEl.style.display = "block"; positionPilotTooltip(anchorEl);
}
function attachPilotHover(el, uid, fallbackName) {
  if (!el || !uid) return;
  el.addEventListener("mouseenter", () => { clearTimeout(pilotHoverTimeout); pilotHoverTimeout = setTimeout(() => { showPilotTooltipFor(uid, fallbackName, el); }, 500); });
  el.addEventListener("mouseleave", () => { clearTimeout(pilotHoverTimeout); hidePilotTooltip(); });
}
function setupPilotNameHover(root) {
  if (!root) return;
  root.querySelectorAll(".pilot-name-cell[data-uid]").forEach(node => {
    const uid = node.getAttribute("data-uid"); const name = node.getAttribute("data-name") || node.textContent || "";
    if (uid) attachPilotHover(node, uid, name.trim());
  });
}

/* ======================== État global / caches ======================== */
let currentUid = null; let lastUserData = null;
const signupCache = new Map(); const raceHistoryCache = new Map(); const helmetCache = new Map(); const pilotStatsCache = new Map();

/* === Helmet design === */
function normalizeHelmet(raw) {
  const h = raw || {}; const allowedStyles = ["stripe", "half", "diag", "clean"];
  let style = h.style; if (!allowedStyles.includes(style)) style = "stripe";
  const baseColor = (typeof h.baseColor === "string" && h.baseColor) || "#0f172a";
  const stripeColor = (typeof h.stripeColor === "string" && h.stripeColor) || "#ffffff";
  const accentColor = (typeof h.accentColor === "string" && h.accentColor) || "#38bdf8";
  return { baseColor, stripeColor, accentColor, style };
}
function helmetSvgFor(hRaw) {
  const h = normalizeHelmet(hRaw); let stripeMarkup = "";
  if (h.style === "stripe") stripeMarkup = `<rect x="45" y="8" width="20" height="64" rx="10" fill="${h.stripeColor}"/>`;
  else if (h.style === "half") stripeMarkup = `<rect x="4" y="8" width="58" height="64" rx="26" fill="${h.stripeColor}"/>`;
  else if (h.style === "diag") stripeMarkup = `<polygon points="0,60 0,30 80,8 80,38" fill="${h.stripeColor}" opacity="0.95"/>`;
  return `<svg viewBox="0 0 120 80" class="helmet-svg" aria-hidden="true" style="height: 1em; width: auto; vertical-align: middle; margin-right: 5px;"><defs><clipPath id="helmetClip"><path d="M12 30 Q30 5 70 5 Q105 5 112 38 Q115 50 110 63 Q107 72 98 75 L22 75 Q14 74 10 66 Q5 55 7 43 Z"/></clipPath></defs><ellipse cx="60" cy="72" rx="38" ry="6" fill="rgba(0,0,0,0.65)"/><g clip-path="url(#helmetClip)"><rect x="5" y="6" width="110" height="70" rx="32" fill="${h.baseColor}"/>${stripeMarkup}</g><path d="M62 32 H104 Q112 32 112 40 Q112 52 100 53 L62 53 Z" fill="${h.accentColor}"/><path d="M20 26 Q36 12 60 10" stroke="rgba(255,255,255,0.35)" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M14 54 Q60 64 106 54" stroke="#020617" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.8"/></svg>`;
}
async function getHelmetForUid(uid) {
  if (!uid) return null; if (helmetCache.has(uid)) return helmetCache.get(uid);
  try { const snap = await getDoc(doc(db, "users", uid)); if (snap.exists()) { const d = snap.data() || {}; const h = d.helmet ? normalizeHelmet(d.helmet) : null; helmetCache.set(uid, h); return h; } } catch (e) {}
  helmetCache.set(uid, null); return null;
}
async function applyHelmetsIn(root) {
  if (!root) return;
  const cells = root.querySelectorAll(".pilot-name-cell[data-uid]");
  for (const cell of cells) {
    const uid = cell.getAttribute("data-uid"); if (!uid) continue;
    const labelNode = cell.querySelector(".pilot-name-label"); const labelText = (labelNode ? labelNode.textContent : cell.textContent || "").trim();
    const helmet = await getHelmetForUid(uid); cell.textContent = "";
    if (helmet) cell.insertAdjacentHTML('beforeend', helmetSvgFor(helmet));
    const nameSpan = document.createElement("span"); nameSpan.className = "pilot-name-label"; nameSpan.textContent = labelText || uid; cell.appendChild(nameSpan);
  }
}
async function ensureSignupCache() {
  if (signupCache.size > 0) return;
  try {
    const snap = await getDocs(collection(db, "estacup_s10_signups"));
    snap.forEach(d => { const x = d.data() || {}; if (!x.uid) return; signupCache.set(x.uid, { teamName: (x.teamName || "").toString(), raceNumber: x.raceNumber, carChoice: x.carChoice, steamID64: x.steamID64 || x.steamId || "" }); });
  } catch (e) {}
}
async function getRaceHistoryEntry(uid, raceId) {
  const key = `${uid}::${raceId}`; if (raceHistoryCache.has(key)) return raceHistoryCache.get(key);
  try {
    const rs = await getDoc(doc(db, "users", uid, "raceHistory", raceId));
    if (rs.exists()) { const r = rs.data() || {}; const out = { points: toFiniteNumber(firstDefined(r.points, r.score, r.pts, r.estacupPoints)), team: (firstDefined(r.team, r.teamName, r.equipe) || "").toString() }; raceHistoryCache.set(key, out); return out; }
  } catch (e) {}
  const out = { points: null, team: "" }; raceHistoryCache.set(key, out); return out;
}
function toFiniteNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/* ======================== GESTION DES MENUS ======================== */
function setupNavigation(isAdmin = false) {
  const goToAdmin = $("goToAdmin");
  if (isAdmin && goToAdmin) goToAdmin.classList.remove("hidden");
  goToAdmin?.addEventListener("click", () => (window.location.href = "admin-s10.html"));

  const buttons  = document.querySelectorAll('.menu > button[data-section]');
  const sections = document.querySelectorAll('.section');

  function showSection(key) {
    sections.forEach(s => s.classList.add("hidden"));
    const el = document.getElementById(`section-${key}`);
    if (el) el.classList.remove("hidden");

    buttons.forEach(btn => {
      if (btn.getAttribute("data-section") === key) btn.classList.add("active");
      else btn.classList.remove("active");
    });

    // Aiguillage selon la section ouverte
    if (key === "championship" && lastUserData) {
      setupChampionshipSubnav();
      showChampionshipSub("reglement");
      setupMekaQuestionnaire(lastUserData);
      loadEstacupEngages();
      renderVoteCircuit();
    }
    else if (key === "paddock" && lastUserData) {
      setupPaddockSubnav();
      showPaddockSub("contenu");
      renderLiverySection(); 
    }
    else if (key === "results" && currentUid) {
      setupResultsSubnav();
      showResultsSub("courses");
      loadResults(currentUid);
    }
    else if (key === "reclamations") {
      if(typeof loadReclamHistory === "function") loadReclamHistory();
    }
    else if (key === "infos" && currentUid) {
      if(typeof loadMRating === "function") loadMRating(currentUid);
      if(typeof loadMSafety === "function") loadMSafety(currentUid);
    }
  }

  buttons.forEach(btn => btn.addEventListener("click", () => showSection(btn.getAttribute("data-section"))));
  showSection("infos"); 
}

/* --- Sous-menus Le Championnat --- */
function setupChampionshipSubnav() {
  const subs = document.querySelectorAll("#championshipSubnav .champ-sub-btn");
  subs.forEach(btn => { btn.onclick = () => showChampionshipSub(btn.dataset.sub); });
}
function showChampionshipSub(key) {
  document.querySelectorAll('.champ-subsection').forEach(b => b.classList.add("hidden"));
  const block = $("champ-sub-" + key);
  if (block) block.classList.remove("hidden");

  document.querySelectorAll("#championshipSubnav .champ-sub-btn").forEach(btn => {
    if (btn.dataset.sub === key) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  if (key === "circuits") {
    setTimeout(() => { if (typeof init3DGlobe === "function") init3DGlobe(); }, 50);
  }
}

/* --- Sous-menus Paddock --- */
function setupPaddockSubnav() {
  const subs = document.querySelectorAll("#paddockSubnav .pad-sub-btn");
  subs.forEach(btn => { btn.onclick = () => showPaddockSub(btn.dataset.sub); });
}
function showPaddockSub(key) {
  document.querySelectorAll('.pad-subsection').forEach(b => b.classList.add("hidden"));
  const block = $("pad-sub-" + key);
  if (block) block.classList.remove("hidden");

  document.querySelectorAll("#paddockSubnav .pad-sub-btn").forEach(btn => {
    if (btn.dataset.sub === key) btn.classList.add("active");
    else btn.classList.remove("active");
  });
}

/* --- Sous-menus Résultats --- */
function setupResultsSubnav() {
  const subs = document.querySelectorAll("#resultsSubnav .res-sub-btn");
  subs.forEach(btn => { btn.onclick = () => showResultsSub(btn.dataset.sub); });
  const chkP = $("jokerTogglePilots"); if (chkP) chkP.onchange = () => { if(typeof loadEstacupPilotStandings === "function") loadEstacupPilotStandings(); };
  const chkT = $("jokerToggleTeams"); if (chkT) chkT.onchange = () => { if(typeof loadEstacupTeamStandings === "function") loadEstacupTeamStandings(); };
}
function showResultsSub(key) {
  document.querySelectorAll('.res-subsection').forEach(b => b.classList.add("hidden"));
  const block = $("res-sub-" + key); if (block) block.classList.remove("hidden");

  document.querySelectorAll("#resultsSubnav .res-sub-btn").forEach(btn => {
    if (btn.dataset.sub === key) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  if (key === "rankpilots" && typeof loadEstacupPilotStandings === "function") loadEstacupPilotStandings();
  if (key === "rankteams" && typeof loadEstacupTeamStandings === "function") loadEstacupTeamStandings();
}

/* ======================== AUTHENTIFICATION ======================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) { localStorage.setItem("redirectAfterLogin", "estacup-s10.html"); window.location.href = "login.html"; return; }
  try {
    let userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      const map = await getDoc(doc(db, "authMap", user.uid));
      if (map.exists()) userSnap = await getDoc(doc(db, "users", map.data().pilotUid));
    }
    if (!userSnap.exists()) { window.location.href = "login.html"; return; }

    const data = userSnap.data(); currentUid = userSnap.id; lastUserData = data;

    $("fullName").textContent      = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "—";
    $("licenseId").textContent     = data.licenseId || data.licenceId || "-";
    $("eloRating").textContent     = data.eloRating ?? 1000;
    $("licensePoints").textContent = data.licensePoints ?? 10;
    $("licenseClass").textContent  = data.licenseClass || "Rookie";
    $("dob").textContent           = formatDateFR(firstDefined(data.dob, data.birthDate, data.birthday, data.dateNaissance, data.naissance)) || "Non renseignée";
    $("steamIdLine").textContent   = data.steamID64 || data.steamId || "—";

    setupNavigation(data.admin === true);
    await ensureSignupCache();
    await loadPilotStats(currentUid);
  } catch (err) { console.error("Erreur sécurité S10:", err); }
});

/* === Parse des temps === */
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
        if (!isFinite(sec)) return null; let total = sec;
        if (parts.length === 2) { total += Number(parts[0]) * 3600 + Number(parts[1]) * 60; } else if (parts.length === 1) { total += Number(parts[0]) * 60; }
        return total * 1000;
      }
    }
  }
  return null;
}
function anyNumberMs(...vals) { for (const v of vals) { const ms = parseTimeLikeToMs(v); if (ms != null && isFinite(ms)) return ms; } return null; }
function splitNameParts(p) {
  const first = (pick(p, ["firstName","prenom","driver.firstName"]) ?? "").toString().trim();
  const last  = (pick(p, ["lastName","nom","driver.lastName"]) ?? "").toString().trim();
  if (first || last) return { first, last };
  const full = (pick(p, ["name","driver.name"]) ?? "").toString().trim(); if (!full) return { first: "", last: "" };
  const parts = full.split(/\s+/); return parts.length === 1 ? { first: "", last: parts[0] } : { first: parts.slice(0, -1).join(" "), last: parts.slice(-1)[0] };
}
function pickCar(p) { return String(pick(p, ["car","carModel","voiture","model"]) ?? ""); }
function pickBestLapMs(p) { return anyNumberMs(pick(p, ["bestLapMs","bestLapTime","lapBest"])); }
function pickTotalTimeMs(p) { return anyNumberMs(pick(p, ["totalMs","totalTime","raceTime"])); }
function pickGapLeaderMsDirect(p) { return anyNumberMs(pick(p, ["gapToLeader","gapLeader"])); }
function pickPointsLocal(p) { const n = Number(pick(p, ["points","score","pts"])); return Number.isFinite(n) ? n : null; }
function pickTeamLocal(p) { return (pick(p, ["team","teamName","equipe"]) ?? "").toString(); }
function pickUid(p) { return (p.uid || p.id || p.steamId || p.driverId || p.name || "").toString(); }
async function resolvePoints(uid, courseId, participant) {
  if (participant && typeof participant.points === "number" && isFinite(participant.points)) return participant.points;
  const local = pickPointsLocal(participant); if (local !== null) return local;
  const rh = await getRaceHistoryEntry(uid, courseId); return rh.points !== null ? rh.points : 0;
}
async function resolveTeam(uid, courseId, participant) {
  const local = (pickTeamLocal(participant) || "").trim(); if (local) return local;
  const rh = await getRaceHistoryEntry(uid, courseId); if ((rh.team || "").trim()) return rh.team.trim();
  const sign = signupCache.get(uid); return sign && (sign.teamName || "").trim() ? sign.teamName.trim() : "(Sans équipe)";
}
function computeGapLeaderText(p, leader) {
  const direct = pickGapLeaderMsDirect(p); if (direct != null) return direct === 0 ? "Leader" : "+" + msToClock(direct);
  const leaderLaps = Number(pick(leader, ["laps","lapCount"])); const myLaps = Number(pick(p, ["laps","lapCount"]));
  if (Number.isFinite(leaderLaps) && Number.isFinite(myLaps) && myLaps < leaderLaps) { const diff = leaderLaps - myLaps; return `+${diff} tour${diff > 1 ? "s" : ""}`; }
  const leadMs = pickTotalTimeMs(leader); const meMs = pickTotalTimeMs(p);
  if (leadMs != null && meMs != null) { const raw = meMs - leadMs; return raw <= 0 ? "Leader" : "+" + msToClock(raw); }
  return "—";
}

/* ======================== RÉSULTATS ======================== */
async function loadResults(uid) {
  const ul = $("raceHistory"); if (!ul) return;
  try {
    ul.innerHTML = "<li>Chargement…</li>";
    const snap = await getDocs(collection(db, "users", uid, "raceHistory_s10"));
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
      html += `<tr class="${rowClass}"><td class="pilot-name-cell" data-uid="${escapeHtml(uid)}">${escapeHtml(last.toUpperCase())}</td><td>${escapeHtml(first)}</td><td>${escapeHtml(pickCar(p))}</td><td class="${globalBestMs && bestMs === globalBestMs ? 'bestlap-global':''}">${bestMs ? msToClock(bestMs) : '—'}</td><td>${escapeHtml(computeGapLeaderText(p, leader))}</td><td>${pts}</td></tr>`;
    });
    container.innerHTML = html + `</tbody></table></div>`; setupPilotNameHover(container); applyHelmetsIn(container);
  } catch (e) { container.innerHTML = "<em>Erreur.</em>"; }
}

/* ======================== STATS & INFOS ======================== */
async function computePilotStats(uid) {
  if (!uid) return { starts: 0, bestPos: null, wins: 0, top3: 0, top5: 0, top10: 0, avgPos: null };
  if (pilotStatsCache.has(uid)) return pilotStatsCache.get(uid);
  const stats = { starts: 0, bestPos: null, wins: 0, top3: 0, top5: 0, top10: 0, avgPos: null };
  try {
    const snap = await getDocs(collection(db, "users", uid, "raceHistory_s10"));
    const positions = []; snap.forEach(d => { const p = Number(d.data().position); if (p > 0) positions.push(p); });
    stats.starts = positions.length;
    if (positions.length) {
      stats.bestPos = Math.min(...positions); stats.wins = positions.filter(p => p === 1).length;
      stats.top3 = positions.filter(p => p <= 3).length; stats.top5 = positions.filter(p => p <= 5).length;
      stats.top10 = positions.filter(p => p <= 10).length; stats.avgPos = positions.reduce((a,b)=>a+b,0)/positions.length;
    }
  } catch {}
  pilotStatsCache.set(uid, stats); return stats;
}

async function loadPilotStats(uid) {
  try {
    const stats = await computePilotStats(uid);
    if ($("statStarts")) $("statStarts").textContent = String(stats.starts);
    if ($("statBest")) $("statBest").textContent = stats.bestPos ? `${stats.bestPos}ᵉ` : "—";
    if ($("statWins")) $("statWins").textContent = String(stats.wins);
    if ($("statTop3")) $("statTop3").textContent = String(stats.top3);
    if ($("statTop5")) $("statTop5").textContent = String(stats.top5);
    if ($("statTop10")) $("statTop10").textContent = String(stats.top10);
    if ($("statAvg")) $("statAvg").textContent = stats.avgPos ? `${stats.avgPos.toFixed(1)}ᵉ` : "—";
  } catch {}
}

/* ======================== FORMULAIRE D'INSCRIPTION ======================== */
function setupMekaQuestionnaire(userData) {
  const select = $("mekaPaid"); 
  const nextStep = $("mekaNextStep"); 
  const formContainer = $("estacupFormContainer");
  
  if (!select) return;

  const docRef = doc(db, "estacup_s10_signups", currentUid);
  getDoc(docRef).then((docSnap) => {
    const hasSignedUp = docSnap.exists();
    const parentQuestionBlock = select.closest("div") || select.parentElement.parentElement;

    if (hasSignedUp) {
      if (parentQuestionBlock) parentQuestionBlock.style.display = "none";
      if (formContainer) formContainer.classList.remove("hidden");
      loadEstacupForm(userData);
    } else {
      if (parentQuestionBlock) parentQuestionBlock.style.display = "block";
      nextStep.innerHTML = ""; 
      if (formContainer) { 
        formContainer.classList.add("hidden"); 
        formContainer.innerHTML = ""; 
      }

      select.onchange = () => {
        nextStep.innerHTML = ""; 
        if (formContainer) { 
          formContainer.classList.add("hidden"); 
          formContainer.innerHTML = ""; 
        }
        if (select.value === "yes") {
          if (formContainer) formContainer.classList.remove("hidden"); 
          loadEstacupForm(userData);
        } else if (select.value === "no") {
          nextStep.innerHTML = `<p style="margin-top:10px;">Vous devez choisir une option pour participer à l’ESTACUP :<br><br><a href="https://www.helloasso.com/associations/meka/adhesions/inscription-meka-2026-2027-1" target="_blank" style="color:#38bdf8;text-decoration:underline;display:block;margin-bottom:6px;">👉 Payer la cotisation MEKA (l’inscription ESTACUP sarà gratuite)</a><a href="https://www.helloasso.com/associations/meka/evenements/inscription-estacup-saison-10" target="_blank" style="color:#38bdf8;text-decoration:underline;display:block;">👉 Payer 5 € pour participer uniquement à l’ESTACUP</a></p>`;
        }
      };
    }
  });
}

async function loadEstacupForm(userData) {
  const container = $("estacupFormContainer");
  if (!container) return;

  try {
    const docRef = doc(db, "estacup_s10_signups", currentUid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      await ensureSignupCache();
      
      const allSignupsSnap = await getDocs(collection(db, "estacup_s10_signups"));
      const takenNumbers = [];
      allSignupsSnap.forEach(d => {
        const num = Number(d.data().raceNumber);
        if (num) takenNumbers.push(num);
      });
      takenNumbers.sort((a, b) => a - b);
      const takenStr = takenNumbers.length > 0 ? takenNumbers.join(", ") : "Aucun";

      const teamCounts = {};
      signupCache.forEach((data) => {
        const tName = data.teamName?.trim();
        if (tName) teamCounts[tName] = (teamCounts[tName] || 0) + 1;
      });

      let datalistOptions = "";
      for (const [t, count] of Object.entries(teamCounts)) {
        if (count < 3) datalistOptions += `<option value="${escapeHtml(t)}">`;
      }
      const datalistHtml = `<datalist id="teamSuggestions">${datalistOptions}</datalist>`;

      container.innerHTML = `
        <div class="course-box" style="margin-top: 20px;">
          <h4 style="color: var(--accent-primary); margin-bottom: 15px;">Formulaire d'inscription au championnat ESTACUP S10</h4>
          
          <label for="regFirstName">Prénom :</label>
          <input type="text" id="regFirstName" placeholder="Votre prénom" value="${escapeHtml(userData.firstName || "")}" required>

          <label for="regLastName">Nom :</label>
          <input type="text" id="regLastName" placeholder="Votre nom" value="${escapeHtml(userData.lastName || "")}" required>

          <label for="regStatus">Statut d'inscription :</label>
          <select id="regStatus" required style="margin-bottom: 1.5rem;">
            <option value="" disabled selected>-- Sélectionnez votre statut --</option>
            <option value="adherent">Je suis adhérent de l'association MEKA</option>
            <option value="paye_5e">J'ai payé les 5€ d'inscription</option>
          </select>

          <label for="regTeam">Nom de l'équipe (Laissez vide si vous roulez en indépendant) :</label>
          <input type="text" id="regTeam" list="teamSuggestions" placeholder="Ex: MEKA eSport">
          ${datalistHtml}

          <label for="regNumber">Numéro de course souhaité (Ex: 42) :</label>
          <input type="number" id="regNumber" placeholder="Entre 2 et 999" min="2" max="999" required>
          <p class="text-muted" style="font-size: 0.85rem; margin-top: 4px; margin-bottom: 1rem; color: #f59e0b;">
            🚫 <strong>Numéros déjà pris :</strong> ${escapeHtml(takenStr)}
          </p>

          <label for="regSteam">Steam ID (64) :</label>
          <input type="text" id="regSteam" placeholder="7656119..." value="${escapeHtml(userData.steamID64 || userData.steamId || "")}" required>

          <label for="regLiveryChoice">Choix de la livrée :</label>
          <select id="regLiveryChoice" required style="margin-bottom: 1.5rem;">
            <option value="" disabled selected>-- Sélectionnez une option --</option>
            <option value="personnelle">Je fournirai une livrée personnelle (dépôt sur OneDrive)</option>
            <option value="neutre">Je roulerai avec la livrée neutre par défaut de l'ESTACUP</option>
          </select>

          <button id="btnSubmitSignup" class="btn-validate" style="width: 100%; margin-top: 15px;">🏁 Valider mon inscription</button>
        </div>
      `;

      $("btnSubmitSignup").onclick = async () => {
        const fName = $("regFirstName").value.trim();
        const lName = $("regLastName").value.trim();
        const status = $("regStatus").value;
        const team = $("regTeam").value.trim();
        const num = parseInt($("regNumber").value, 10);
        const steam = $("regSteam").value.trim();
        const liveryChoice = $("regLiveryChoice").value;

        if (!fName || !lName || !status || isNaN(num) || !steam || !liveryChoice) {
          alert("Veuillez remplir tous les champs obligatoires correctement.");
          return;
        }

        const btn = $("btnSubmitSignup");
        btn.disabled = true;
        btn.textContent = "Enregistrement en cours...";

        try {
          const signupsRef = collection(db, "estacup_s10_signups");

          if (team !== "") {
            const qTeam = query(signupsRef, where("teamName", "==", team));
            const teamSnap = await getDocs(qTeam);
            let membersCount = 0;
            teamSnap.forEach(d => { if (d.id !== currentUid) membersCount++; });
            if (membersCount >= 3) {
              alert(`Désolé, l'équipe "${team}" est déjà complète (3 pilotes maximum).`);
              btn.disabled = false;
              btn.textContent = "🏁 Valider mon inscription";
              return;
            }
          }

          const qNum = query(signupsRef, where("raceNumber", "==", num));
          const numSnap = await getDocs(qNum);
          let numberTaken = false;
          numSnap.forEach(d => { if (d.id !== currentUid) numberTaken = true; });

          if (numberTaken) {
            alert(`Désolé, le numéro #${num} vient d'être réservé par un autre pilote ! Veuillez en choisir un autre.`);
            btn.disabled = false;
            btn.textContent = "🏁 Valider mon inscription";
            return;
          }

          await setDoc(docRef, {
            uid: currentUid,
            firstName: fName,
            lastName: lName,
            paymentStatus: status,
            teamName: team,
            raceNumber: num,
            carChoice: "Ligier JS P320",
            steamID64: steam,
            liveryChoice: liveryChoice,
            isValidated: false,
            updatedAt: new Date()
          });

          alert("✅ Inscription transmise avec succès ! En attente de validation par les administrateurs.");
          loadEstacupForm(userData);
          setupMekaQuestionnaire(userData);
        } catch (err) {
          console.error("Erreur inscription:", err);
          alert("Erreur lors de l'enregistrement.");
          btn.disabled = false;
          btn.textContent = "🏁 Valider mon inscription";
        }
      };
      return;
    }

    const data = docSnap.data();
    const isValidated = data.isValidated === true;
    
    let statusText = "Non renseigné";
    if (data.paymentStatus === "adherent") statusText = "Adhérent MEKA";
    if (data.paymentStatus === "paye_5e") statusText = "Frais d'inscription (5€) payés";

    let liveryText = data.liveryChoice === "personnelle" ? "Livrée personnelle (via OneDrive)" : (data.liveryChoice === "neutre" ? "Livrée neutre ESTACUP" : "Non renseigné");

    // STYLE UNIFORME ET PROPRE AVEC PADDING (Plus de texte collé aux bordures)
    const infoItemStyle = "padding: 10px 15px; margin: 8px 0; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px;";

    if (isValidated) {
      container.innerHTML = `
        <div class="course-box" style="margin-top: 20px; border-color: var(--accent-success); background: rgba(16, 185, 129, 0.05);">
          <h4 style="color: var(--accent-success); margin-bottom: 10px;">✅ Inscription validée !</h4>
          <p style="margin-bottom: 15px;">Vous êtes officiellement engagé pour la Saison 10 de l'ESTACUP.</p>
          <div style="display: flex; flex-direction: column;">
            <div style="${infoItemStyle}"><strong>Pilote :</strong> ${escapeHtml(data.firstName || userData.firstName)} ${escapeHtml(data.lastName || userData.lastName)}</div>
            <div style="${infoItemStyle}"><strong>Statut :</strong> ${statusText}</div>
            <div style="${infoItemStyle}"><strong>Équipe :</strong> ${escapeHtml(data.teamName || "Indépendant")}</div>
            <div style="${infoItemStyle}"><strong>Numéro :</strong> #${escapeHtml(String(data.raceNumber))}</div>
            <div style="${infoItemStyle}"><strong>Véhicule :</strong> Ligier JS P320 (LMP3)</div>
            <div style="${infoItemStyle}"><strong>Livrée :</strong> ${liveryText}</div>
          </div>
          <p style="margin-top: 20px; font-size: 0.85rem; color: var(--text-muted); font-style: italic; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
            💡 Pour toute modification de dernière minute, veuillez contacter directement l'administration sur Discord.
          </p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="course-box" style="margin-top: 20px; border-color: #f59e0b; background: rgba(245, 158, 11, 0.05);">
          <h4 style="color: #f59e0b; margin-bottom: 10px;">⏳ Inscription en attente de validation</h4>
          <p style="margin-bottom: 15px;">Votre dossier d'inscription a bien été transmis. Un administrateur va le vérifier sous peu.</p>
          <div style="display: flex; flex-direction: column;">
            <div style="${infoItemStyle}"><strong>Pilote :</strong> ${escapeHtml(data.firstName || userData.firstName)} ${escapeHtml(data.lastName || userData.lastName)}</div>
            <div style="${infoItemStyle}"><strong>Statut :</strong> ${statusText}</div>
            <div style="${infoItemStyle}"><strong>Équipe :</strong> ${escapeHtml(data.teamName || "Indépendant")}</div>
            <div style="${infoItemStyle}"><strong>Numéro :</strong> #${escapeHtml(String(data.raceNumber))}</div>
            <div style="${infoItemStyle}"><strong>Véhicule :</strong> Ligier JS P320 (LMP3)</div>
            <div style="${infoItemStyle}"><strong>Livrée :</strong> ${liveryText}</div>
          </div>
          <p style="margin-top: 20px; font-size: 0.85rem; color: var(--text-muted); font-style: italic;">
            🔒 Vos modifications sont verrouillées en attente de validation par le staff. Contactez-nous en cas de besoin.
          </p>
        </div>
      `;
    }

  } catch (err) {
    console.error("Erreur chargement formulaire:", err);
    container.innerHTML = `<div class="course-box"><p class="impact-bad">Erreur de connexion à la base de données.</p></div>`;
  }
}

/* ======================== LISTE DES ENGAGÉS (PUBLIQUE) ======================== */
async function loadEstacupEngages() {
  const targetArea = document.getElementById("champ-sub-engages");
  if (!targetArea) return;

  targetArea.innerHTML = `<div class="loading-inline" style="padding: 2rem; text-align: center;"><div class="spinner"></div> Chargement de la grille des engagés...</div>`;

  try {
    const signupsRef = collection(db, "estacup_s10_signups");
    const q = query(signupsRef, where("isValidated", "==", true));
    const [snap, usersSnap] = await Promise.all([
      getDocs(q),
      getDocs(collection(db, "users"))
    ]);

    const usersMap = new Map();
    usersSnap.forEach(u => usersMap.set(u.id, u.data()));

    if (snap.empty) {
      targetArea.innerHTML = `
        <h3 style="color: var(--accent-primary); margin-bottom: 1.5rem;">Liste des engagés</h3>
        <div class="course-box">
          <p class="muted-note">Aucun pilote validé pour le moment.</p>
        </div>
      `;
      return;
    }

    const engages = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const uid = data.uid || docSnap.id;
      const uData = usersMap.get(uid) || {};

      const licence = uData.licenseClass || uData.licenceClass || uData.license || "Rookie";
      let licColor = "#10b981"; 
      if (licence.toLowerCase() === "pro") licColor = "#ef4444"; 
      if (licence.toLowerCase() === "challenger") licColor = "#f59e0b"; 

      const mRating = uData.eloRating ?? 1000;

      engages.push({
        name: `${data.firstName || uData.firstName || ""} ${data.lastName || uData.lastName || ""}`.trim() || "Pilote",
        team: data.teamName || "Indépendant",
        number: Number(data.raceNumber) || 0,
        car: data.carChoice || "Ligier JS P320",
        licence: licence,
        licColor: licColor,
        mRating: mRating
      });
    });

    engages.sort((a, b) => a.number - b.number);

    let html = `
      <h3 style="color: var(--accent-primary); margin-bottom: 1.5rem;">Liste des engagés (${engages.length})</h3>
      <div style="overflow-x: auto; background: rgba(15,23,42,0.6); border-radius: 10px; border: 1px solid var(--border-primary);">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-primary); background: rgba(255,255,255,0.02);">
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">N°</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Pilote</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Licence</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">M-Rating</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Équipe</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Véhicule</th>
            </tr>
          </thead>
          <tbody>
    `;

    engages.forEach(p => {
      html += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 12px 15px; font-weight: bold; color: var(--accent-primary);">#${escapeHtml(String(p.number))}</td>
          <td style="padding: 12px 15px; color: var(--text-primary); font-weight: 600;">${escapeHtml(p.name)}</td>
          <td style="padding: 12px 15px;">
            <span style="font-size: 0.7rem; padding: 3px 8px; border-radius: 8px; border: 1px solid ${p.licColor}; color: ${p.licColor}; text-transform: uppercase; font-weight: bold;">
              ${escapeHtml(p.licence)}
            </span>
          </td>
          <td style="padding: 12px 15px; font-weight: bold; color: #38bdf8;">${p.mRating}</td>
          <td style="padding: 12px 15px; color: var(--text-secondary);">${escapeHtml(p.team)}</td>
          <td style="padding: 12px 15px; color: var(--text-secondary);">${escapeHtml(p.car)}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    targetArea.innerHTML = html;

  } catch (err) {
    console.error("Erreur chargement liste des engagés publique :", err);
    targetArea.innerHTML = `<p class="impact-bad">Erreur lors du chargement de la liste des engagés.</p>`;
  }
}

/* ======================== VOTES DES CIRCUITS (MANCHES 3 & 5) ======================== */
async function renderVoteCircuit() {
  const host = $("voteCircuitHost");
  if (!host) return;

  if (!currentUid) {
    host.innerHTML = `<div class="course-box"><p class="muted-note">Connectez-vous pour voter.</p></div>`;
    return;
  }

  host.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Chargement des votes...</div>`;

  try {
    const voteDocRef = doc(db, "estacup_s10_circuit_votes", currentUid);
    const voteSnap = await getDoc(voteDocRef);
    const userVotes = voteSnap.exists() ? voteSnap.data() : {};

    host.innerHTML = `
      <div class="course-box">
        <p class="muted-note" style="margin-bottom: 1.5rem;">
          Votez pour vos tracés préférés pour les manches 3 et 5. Vous pouvez modifier votre sélection à tout moment.
        </p>

        <!-- DUEL MANCHE 3 -->
        <div style="margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border-primary);">
          <h4 style="color: var(--accent-primary); margin-bottom: 0.5rem;">Manche 3 (24/11/2026)</h4>
          <p class="muted-note" style="margin-bottom: 1rem;">Choisissez entre les deux tracés américains :</p>
          
          <div class="vote-options" style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <label class="vote-option" style="flex: 1; min-width: 220px; padding: 12px; border-radius: 10px; cursor: pointer;">
              <input type="radio" name="vote_round_3" value="Indianapolis" ${userVotes.round3 === 'Indianapolis' ? 'checked' : ''}>
              <div class="vote-pill">
                <span class="fi fi-us"></span>
                <strong>Indianapolis</strong> (Road Course)
              </div>
            </label>

            <label class="vote-option" style="flex: 1; min-width: 220px; padding: 12px; border-radius: 10px; cursor: pointer;">
              <input type="radio" name="vote_round_3" value="Virginia" ${userVotes.round3 === 'Virginia' ? 'checked' : ''}>
              <div class="vote-pill">
                <span class="fi fi-us"></span>
                <strong>Virginia (VIR)</strong>
              </div>
            </label>
          </div>
        </div>

        <!-- DUEL MANCHE 5 -->
        <div style="margin-bottom: 2rem;">
          <h4 style="color: var(--accent-primary); margin-bottom: 0.5rem;">Manche 5 (19/01/2026)</h4>
          <p class="muted-note" style="margin-bottom: 1rem;">Choisissez votre destination européenne :</p>
          
          <div class="vote-options" style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <label class="vote-option" style="flex: 1; min-width: 220px; padding: 12px; border-radius: 10px; cursor: pointer;">
              <input type="radio" name="vote_round_5" value="Barcelone" ${userVotes.round5 === 'Barcelone' ? 'checked' : ''}>
              <div class="vote-pill">
                <span class="fi fi-es"></span>
                <strong>Barcelone-Catalunya</strong>
              </div>
            </label>

            <label class="vote-option" style="flex: 1; min-width: 220px; padding: 12px; border-radius: 10px; cursor: pointer;">
              <input type="radio" name="vote_round_5" value="Dijon-Prenois" ${userVotes.round5 === 'Dijon-Prenois' ? 'checked' : ''}>
              <div class="vote-pill">
                <span class="fi fi-fr"></span>
                <strong>Dijon-Prenois</strong>
              </div>
            </label>
          </div>
        </div>

        <div class="vote-actions" style="text-align: right;">
          <button id="btnSaveCircuitVotes" class="btn-validate">💾 Enregistrer mes votes</button>
        </div>
      </div>
    `;

    $("btnSaveCircuitVotes").onclick = async () => {
      const r3 = document.querySelector('input[name="vote_round_3"]:checked')?.value || null;
      const r5 = document.querySelector('input[name="vote_round_5"]:checked')?.value || null;

      if (!r3 || !r5) {
        alert("Veuillez faire un choix pour chaque manche avant de valider.");
        return;
      }

      try {
        const btn = $("btnSaveCircuitVotes");
        btn.disabled = true;
        btn.textContent = "Enregistrement...";

        await setDoc(doc(db, "estacup_s10_circuit_votes", currentUid), {
          round3: r3,
          round5: r5,
          userName: $("fullName")?.textContent || "Pilote",
          updatedAt: new Date()
        }, { merge: true });

        alert("✅ Vos votes ont été pris en compte avec succès !");
        btn.textContent = "💾 Votes enregistrés !";
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = "💾 Enregistrer mes votes";
        }, 2000);
      } catch (err) {
        console.error("Erreur enregistrement vote:", err);
        alert("Erreur lors de l'enregistrement du vote.");
        $("btnSaveCircuitVotes").disabled = false;
      }
    };

  } catch (e) {
    console.error("Erreur chargement vote:", e);
    host.innerHTML = `<div class="course-box"><p class="impact-bad">Impossible de charger le module de vote.</p></div>`;
  }
}

/* ======================== DÉPÔT DE LIVRÉE (ONEDRIVE) ======================== */
async function renderLiverySection() {
  const host = $("liveryUploadHost");
  if (!host) return;

  if (!currentUid) {
    host.innerHTML = `<div class="course-box"><p class="muted-note">Connectez-vous pour déposer une livrée.</p></div>`;
    return;
  }

  host.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Chargement...</div>`;

  try {
    const docSnap = await getDoc(doc(db, "estacup_s10_signups", currentUid));

    if (!docSnap.exists() || docSnap.data().isValidated !== true) {
      host.innerHTML = `
        <div class="course-box" style="border-color: #f59e0b; background: rgba(245, 158, 11, 0.05);">
          <h4 style="color: #f59e0b; margin-bottom: 10px;">⚠️ Inscription requise</h4>
          <p>Vous devez être inscrit et votre inscription doit être validée par le staff pour pouvoir envoyer votre livrée personnalisée.</p>
        </div>`;
      return;
    }

    const oneDriveLink = "https://estaca-my.sharepoint.com/:f:/g/personal/meka_estaca_eu/IgCF2GbO4jLTTpORWbPSETEVAcRha7yQfBo-45BFVAUlZEU?e=hJ4aAa";

    host.innerHTML = `
      <div class="course-box">
        <p class="muted-note" style="margin-bottom: 1.5rem; line-height: 1.6;">
          Le dépôt des livrées s'effectue désormais sur l'espace OneDrive officiel de l'association. Regroupez tous vos fichiers (textures, decals, fichiers .json) dans un seul fichier <strong>.ZIP</strong> (Max 25 Mo).<br><br>
          <span style="color: #f59e0b;">⚠️ <strong>TRÈS IMPORTANT :</strong></span> Le nom de votre fichier doit <strong>obligatoirement</strong> respecter ce format pour que le staff puisse l'attribuer à votre voiture :<br>
          <code style="display: inline-block; margin-top: 8px; font-size: 1.1rem; color: #38bdf8; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 6px; border: 1px solid #334155;">### - NOM_Prénom.zip</code><br>
          <em>(Où ### est votre numéro de course entre 2 et 999. Exemple : <strong>96 - TOMCZYK_Marin.zip</strong>)</em>
        </p>

        <div style="display: flex; flex-direction: column; gap: 15px; background: rgba(15,23,42,0.6); padding: 20px; border-radius: 10px; border: 1px dashed var(--border-secondary); text-align: center;">
          <h4 style="color: var(--accent-primary); margin-bottom: 0;">Dépôt OneDrive</h4>
          <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 15px;">Cliquez sur le bouton ci-dessous pour ouvrir le dossier partagé et y glisser/déposer votre fichier .ZIP.</p>
          
          <a href="${oneDriveLink}" target="_blank" style="text-decoration: none;">
            <button class="btn-validate" style="width: auto; padding: 12px 24px; font-size: 1.1rem;">
              📁 Accéder au dossier OneDrive
            </button>
          </a>
        </div>
      </div>
    `;

  } catch (e) {
    console.error("Erreur chargement section livrée:", e);
    host.innerHTML = `<div class="course-box"><p class="impact-bad">Impossible de charger la page.</p></div>`;
  }
}

/* ======================== GLOBE 3D & CALENDRIER ======================== */
let globeInitialized = false;

const circuitsSaison10 = [
  { round: "PROLOGUE", name: "Silverstone", country: "Royaume-Uni", flag: "gb", date: "15/09/2026", lat: 52.0786, lng: -1.0169, status: "confirm" },
  { round: "Manche 1", name: "Portimão (Algarve)", country: "Portugal", flag: "pt", date: "29/09/2026", lat: 37.2270, lng: -8.6267, status: "confirm" },
  { round: "Manche 2", name: "Dubaï Autodrome", country: "Émirats Arabes Unis", flag: "ae", date: "20/10/2026", lat: 25.0483, lng: 55.2346, status: "confirm" },
  { round: "Manche 3 (Vote)", name: "Indianapolis", country: "USA", flag: "us", date: "24/11/2026", lat: 39.7950, lng: -86.2348, status: "vote" },
  { round: "Manche 3 (Vote)", name: "Virginia (VIR)", country: "USA", flag: "us", date: "24/11/2026", lat: 36.5658, lng: -79.2069, status: "vote" },
  { round: "Manche 4", name: "Brno", country: "République Tchèque", flag: "cz", date: "08/12/2026", lat: 49.2031, lng: 16.4444, status: "confirm" },
  { round: "Manche 5 (Vote)", name: "Barcelone-Catalunya", country: "Espagne", flag: "es", date: "19/01/2026", lat: 41.5700, lng: 2.2611, status: "vote" },
  { round: "Manche 5 (Vote)", name: "Dijon-Prenois", country: "France", flag: "fr", date: "19/01/2026", lat: 47.3625, lng: 4.8986, status: "vote" },
  { round: "Manche 6", name: "Fuji Speedway", country: "Japon", flag: "jp", date: "35.3717", lng: 138.9267, status: "confirm" }
];

function init3DGlobe() {
  const container = document.getElementById('globeContainer');
  if (!container || globeInitialized) return;
  globeInitialized = true;

  const width = container.clientWidth;
  const height = container.clientHeight;

  const world = Globe()
    (container)
    .width(width)
    .height(height)
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundColor('#050810')
    .pointsData(circuitsSaison10)
    .pointLat('lat')
    .pointLng('lng')
    .pointColor(d => d.status === 'vote' ? '#f59e0b' : '#38bdf8')
    .pointAltitude(0.06)
    .pointRadius(0.9)
    .pointsMerge(true)
    .labelsData(circuitsSaison10)
    .labelLat('lat')
    .labelLng('lng')
    .labelText(d => `${d.name} (${d.round})`)
    .labelSize(1.3)
    .labelDotRadius(0.35)
    .labelColor(d => d.status === 'vote' ? '#fde68a' : '#ffffff')
    .labelResolution(2);

  world.controls().autoRotate = true;
  world.controls().autoRotateSpeed = 0.6;
  world.pointOfView({ lat: 46, lng: 2, altitude: 2.2 });

  const listContainer = document.getElementById('circuitTextList');
  if (listContainer) {
    listContainer.innerHTML = `
      <div style="background: rgba(15,23,42,0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-secondary);">
        <strong style="color: var(--accent-primary);">PROLOGUE — 15/09/2026</strong><br>
        <span class="fi fi-gb"></span> <strong>Silverstone</strong><br>
        <span style="font-size: 0.85rem; color: var(--text-muted);">Royaume-Uni</span>
      </div>

      <div style="background: rgba(15,23,42,0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-secondary);">
        <strong style="color: var(--accent-primary);">Manche 1 — 29/09/2026</strong><br>
        <span class="fi fi-pt"></span> <strong>Portimão</strong><br>
        <span style="font-size: 0.85rem; color: var(--text-muted);">Portugal</span>
      </div>

      <div style="background: rgba(15,23,42,0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-secondary);">
        <strong style="color: var(--accent-primary);">Manche 2 — 20/10/2026</strong><br>
        <span class="fi fi-ae"></span> <strong>Dubaï Autodrome</strong><br>
        <span style="font-size: 0.85rem; color: var(--text-muted);">Émirats Arabes Unis</span>
      </div>

      <div style="background: rgba(245,158,11,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(245,158,11,0.4);">
        <strong style="color: #f59e0b;">Manche 3 (Vote) — 24/11/2026</strong><br>
        <span class="fi fi-us"></span> <strong>Indianapolis</strong> <em>ou</em> <strong>Virginia</strong><br>
        <span style="font-size: 0.85rem; color: var(--text-muted);">États-Unis</span>
      </div>

      <div style="background: rgba(15,23,42,0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-secondary);">
        <strong style="color: var(--accent-primary);">Manche 4 — 08/12/2026</strong><br>
        <span class="fi fi-cz"></span> <strong>Brno</strong><br>
        <span style="font-size: 0.85rem; color: var(--text-muted);">République Tchèque</span>
      </div>

      <div style="background: rgba(245,158,11,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(245,158,11,0.4);">
        <strong style="color: #f59e0b;">Manche 5 (Vote) — 19/01/2026</strong><br>
        <span class="fi fi-es"></span> <strong>Barcelone</strong> <em>ou</em> <span class="fi fi-fr"></span> <strong>Dijon-Prenois</strong><br>
        <span style="font-size: 0.85rem; color: var(--text-muted);">Espagne / France</span>
      </div>

      <div style="background: rgba(15,23,42,0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-secondary);">
        <strong style="color: var(--accent-primary);">Manche 6 — 09/02/2026</strong><br>
        <span class="fi fi-jp"></span> <strong>Fuji Speedway</strong><br>
        <span style="font-size: 0.85rem; color: var(--text-muted);">Japon</span>
      </div>
    `;
  }
}
