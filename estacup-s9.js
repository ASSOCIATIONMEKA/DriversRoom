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

/* ======================== Tooltip pilote ======================== */
let pilotHoverTimeout = null;
let pilotTooltipEl = null;
let pilotTooltipAnchor = null;
let pilotTooltipCurrentUid = null;
const pilotInfoCache = new Map();

function computeAgeFromDob(dobField) {
  const d = toDate(dobField);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function ensurePilotTooltip() {
  if (pilotTooltipEl) return;
  pilotTooltipEl = document.createElement("div");
  pilotTooltipEl.id = "pilotTooltip";
  pilotTooltipEl.style.position = "fixed";
  pilotTooltipEl.style.zIndex = "9999";
  pilotTooltipEl.style.padding = "8px 10px";
  pilotTooltipEl.style.borderRadius = "8px";
  pilotTooltipEl.style.background = "#0b1220";
  pilotTooltipEl.style.border = "1px solid #38bdf8";
  pilotTooltipEl.style.color = "#e2e8f0";
  pilotTooltipEl.style.fontSize = "0.85rem";
  pilotTooltipEl.style.boxShadow = "0 10px 30px rgba(15,23,42,0.9)";
  pilotTooltipEl.style.display = "none";
  pilotTooltipEl.style.maxWidth = "260px";
  pilotTooltipEl.style.pointerEvents = "none";
  document.body.appendChild(pilotTooltipEl);
}

function hidePilotTooltip() {
  if (pilotTooltipEl) {
    pilotTooltipEl.style.display = "none";
  }
  pilotTooltipAnchor = null;
  pilotTooltipCurrentUid = null;
}

function positionPilotTooltip(anchorEl) {
  if (!pilotTooltipEl || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const tooltipWidth = pilotTooltipEl.offsetWidth || 220;
  const left = clamp(rect.left + rect.width / 2 - tooltipWidth / 2, 8, window.innerWidth - tooltipWidth - 8);
  const top = rect.bottom + 8;
  pilotTooltipEl.style.left = left + "px";
  pilotTooltipEl.style.top = top + "px";
}

async function showPilotTooltipFor(uid, fallbackName, anchorEl) {
  ensurePilotTooltip();
  pilotTooltipAnchor = anchorEl;
  pilotTooltipCurrentUid = uid;

  const safeName = (fallbackName || "Pilote").toString();
  pilotTooltipEl.innerHTML = `<strong>${escapeHtml(safeName)}</strong><br><span class="muted-note">Chargement…</span>`;
  pilotTooltipEl.style.display = "block";
  positionPilotTooltip(anchorEl);

  let info = pilotInfoCache.get(uid);
  if (!info) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const d = snap.data() || {};
        const dobRaw = firstDefined(d.dob, d.birthDate, d.birthday, d.dateNaissance, d.naissance);
        const age = computeAgeFromDob(dobRaw);
        const name = `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || safeName;
        const mRating = d.eloRating ?? 1000;
        const mSafety = d.licensePoints ?? 10;
        info = { name, age, mRating, mSafety };
      } else {
        info = { name: safeName, age: null, mRating: null, mSafety: null };
      }
      pilotInfoCache.set(uid, info);
    } catch (e) {
      console.warn("Erreur tooltip pilote:", e);
      info = pilotInfoCache.get(uid) || { name: safeName, age: null, mRating: null, mSafety: null };
    }
  }

  if (pilotTooltipCurrentUid !== uid || pilotTooltipAnchor !== anchorEl) return;

  const ageTxt = info.age != null ? `${info.age} ans` : "—";
  const mrTxt = info.mRating != null ? info.mRating : "—";
  const msTxt = info.mSafety != null ? info.mSafety : "—";

  pilotTooltipEl.innerHTML = `
    <strong>${escapeHtml(info.name || safeName)}</strong><br>
    <span class="muted-note">Âge : ${escapeHtml(String(ageTxt))}</span><br>
    <span class="muted-note">M-Rating : ${escapeHtml(String(mrTxt))}</span><br>
    <span class="muted-note">M-Safety : ${escapeHtml(String(msTxt))}</span>
  `;
  pilotTooltipEl.style.display = "block";
  positionPilotTooltip(anchorEl);
}

function attachPilotHover(el, uid, fallbackName) {
  if (!el || !uid) return;
  el.addEventListener("mouseenter", () => {
    clearTimeout(pilotHoverTimeout);
    pilotHoverTimeout = setTimeout(() => {
      showPilotTooltipFor(uid, fallbackName, el);
    }, 500);
  });
  el.addEventListener("mouseleave", () => {
    clearTimeout(pilotHoverTimeout);
    hidePilotTooltip();
  });
}

function setupPilotNameHover(root) {
  if (!root) return;
  const nodes = root.querySelectorAll(".pilot-name-cell[data-uid]");
  nodes.forEach(node => {
    const uid = node.getAttribute("data-uid");
    const name = node.getAttribute("data-name") || node.textContent || "";
    if (uid) {
      attachPilotHover(node, uid, name.trim());
    }
  });
}

/* ======================== État global / caches ======================== */
let currentUid   = null;
let lastUserData = null;

const signupCache = new Map();
const raceHistoryCache = new Map();
const helmetCache = new Map();
const pilotStatsCache = new Map();
const comparePilotMap = new Map();
let compareListInitialized = false;
let helmetDraft = null;
let helmetDesignerInitialized = false;

/* === Helmet design === */
function normalizeHelmet(raw) {
  const h = raw || {};
  const allowedStyles = ["stripe", "half", "diag", "clean"];
  let style = h.style;
  if (!allowedStyles.includes(style)) style = "stripe";
  const baseColor   = (typeof h.baseColor   === "string" && h.baseColor)   || "#0f172a";
  const stripeColor = (typeof h.stripeColor === "string" && h.stripeColor) || "#ffffff";
  const accentColor = (typeof h.accentColor === "string" && h.accentColor) || "#38bdf8";
  return { baseColor, stripeColor, accentColor, style };
}

function helmetSvgFor(hRaw) {
  const h = normalizeHelmet(hRaw);
  let stripeMarkup = "";
  if (h.style === "stripe") {
    stripeMarkup = `<rect x="45" y="8" width="20" height="64" rx="10" fill="${h.stripeColor}"/>`;
  } else if (h.style === "half") {
    stripeMarkup = `<rect x="4" y="8" width="58" height="64" rx="26" fill="${h.stripeColor}"/>`;
  } else if (h.style === "diag") {
    stripeMarkup = `<polygon points="0,60 0,30 80,8 80,38" fill="${h.stripeColor}" opacity="0.95"/>`;
  }
  return `
    <svg viewBox="0 0 120 80" class="helmet-svg" aria-hidden="true">
      <defs>
        <clipPath id="helmetClip">
          <path d="M12 30 Q30 5 70 5 Q105 5 112 38 Q115 50 110 63 Q107 72 98 75 L22 75 Q14 74 10 66 Q5 55 7 43 Z"/>
        </clipPath>
      </defs>
      <ellipse cx="60" cy="72" rx="38" ry="6" fill="rgba(0,0,0,0.65)"/>
      <g clip-path="url(#helmetClip)">
        <rect x="5" y="6" width="110" height="70" rx="32" fill="${h.baseColor}"/>
        ${stripeMarkup}
      </g>
      <path d="M62 32 H104 Q112 32 112 40 Q112 52 100 53 L62 53 Z" fill="${h.accentColor}"/>
      <path d="M20 26 Q36 12 60 10" stroke="rgba(255,255,255,0.35)" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M14 54 Q60 64 106 54" stroke="#020617" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.8"/>
    </svg>
  `;
}

async function getHelmetForUid(uid) {
  if (!uid) return null;
  if (helmetCache.has(uid)) return helmetCache.get(uid);
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const d = snap.data() || {};
      const h = d.helmet ? normalizeHelmet(d.helmet) : null;
      helmetCache.set(uid, h);
      return h;
    }
  } catch (e) { console.warn("Erreur lecture casque", e); }
  helmetCache.set(uid, null);
  return null;
}

async function applyHelmetsIn(root) {
  if (!root) return;
  const cells = root.querySelectorAll(".pilot-name-cell[data-uid]");
  for (const cell of cells) {
    const uid = cell.getAttribute("data-uid");
    if (!uid) continue;
    const labelNode = cell.querySelector(".pilot-name-label");
    const labelText = (labelNode ? labelNode.textContent : cell.textContent || "").trim();
    const helmet = await getHelmetForUid(uid);
    cell.textContent = "";
    const icon = document.createElement("span");
    icon.className = "helmet-inline" + (helmet ? "" : " helmet-inline-empty");
    if (helmet) icon.innerHTML = helmetSvgFor(helmet);
    const nameSpan = document.createElement("span");
    nameSpan.className = "pilot-name-label";
    nameSpan.textContent = labelText || uid;
    cell.appendChild(icon); cell.appendChild(nameSpan);
  }
}

function setupHelmetDesigner(userData) {
  const baseInput   = $("helmetBaseColor");
  const stripeInput = $("helmetStripeColor");
  const accentInput = $("helmetAccentColor");
  const styleSelect = $("helmetStyle");
  const preview     = $("helmetPreview");
  const saveBtn     = $("saveHelmetBtn");
  const statusEl    = $("helmetSaveStatus");

  if (!baseInput || !stripeInput || !accentInput || !styleSelect || !preview || !saveBtn) return;

  const fromUser = userData && userData.helmet ? normalizeHelmet(userData.helmet) : null;
  const initialHelmet = fromUser || normalizeHelmet(helmetDraft || {});
  helmetDraft = initialHelmet;
  if (currentUid) helmetCache.set(currentUid, helmetDraft);

  function syncInputsFromHelmet(h) {
    baseInput.value   = h.baseColor;
    stripeInput.value = h.stripeColor;
    accentInput.value = h.accentColor;
    styleSelect.value = h.style;
  }

  function refreshPreviewFromInputs() {
    helmetDraft = normalizeHelmet({
      baseColor: baseInput.value,
      stripeColor: stripeInput.value,
      accentColor: accentInput.value,
      style: styleSelect.value
    });
    preview.innerHTML = helmetSvgFor(helmetDraft);
    if (statusEl) statusEl.textContent = "";
  }

  syncInputsFromHelmet(initialHelmet);
  refreshPreviewFromInputs();

  if (helmetDesignerInitialized) return;
  helmetDesignerInitialized = true;

  baseInput.addEventListener("input", refreshPreviewFromInputs);
  stripeInput.addEventListener("input", refreshPreviewFromInputs);
  accentInput.addEventListener("input", refreshPreviewFromInputs);
  styleSelect.addEventListener("change", refreshPreviewFromInputs);

  saveBtn.addEventListener("click", async () => {
    if (!currentUid) return;
    const ref = doc(db, "users", currentUid);
    saveBtn.disabled = true;
    try {
      await updateDoc(ref, { helmet: helmetDraft });
      helmetCache.set(currentUid, helmetDraft);
      if (statusEl) statusEl.textContent = "Design de casque sauvegardé ✅";
      applyHelmetsIn(document);
    } catch (e) { if (statusEl) statusEl.textContent = "Erreur de sauvegarde."; }
    finally { saveBtn.disabled = false; }
  });
}

async function ensureSignupCache() {
  if (signupCache.size > 0) return;
  try {
    const snap = await getDocs(collection(db, "estacup_s9_signups"));
    snap.forEach(d => {
      const x = d.data() || {};
      if (!x.uid) return;
      signupCache.set(x.uid, {
        teamName: (x.teamName || "").toString(),
        raceNumber: x.raceNumber,
        carChoice: x.carChoice,
        steamID64: x.steamID64 || x.steamId || "",
        steamId: x.steamId || x.steamID64 || ""
      });
    });
  } catch (e) {}
}

async function getRaceHistoryEntry(uid, raceId) {
  const key = `${uid}::${raceId}`;
  if (raceHistoryCache.has(key)) return raceHistoryCache.get(key);
  try {
    const rs = await getDoc(doc(db, "users", uid, "raceHistory", raceId));
    if (rs.exists()) {
      const r = rs.data() || {};
      const out = {
        points: toFiniteNumber(firstDefined(r.points, r.score, r.pts, r.estacupPoints)),
        team: (firstDefined(r.team, r.teamName, r.equipe) || "").toString()
      };
      raceHistoryCache.set(key, out); return out;
    }
  } catch (e) {}
  const out = { points: null, team: "" };
  raceHistoryCache.set(key, out); return out;
}

function toFiniteNumber(v) {
  const n = Number(v); return Number.isFinite(n) ? n : null;
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
function setupNavigation(isAdmin = false) {
  const goToAdmin = $("goToAdmin");
  if (isAdmin && goToAdmin) goToAdmin.classList.remove("hidden");
  goToAdmin?.addEventListener("click", () => (window.location.href = "admin-s9.html"));

  const buttons  = document.querySelectorAll('.menu button[data-section]');
  const sections = document.querySelectorAll('.section');

  function showSection(key) {
    sections.forEach(s => s.classList.add("hidden"));
    const el = document.getElementById(`section-${key}`);
    if (el) el.classList.remove("hidden");

    if (key === "results"  && currentUid) loadResults(currentUid);
    if (key === "erating"  && currentUid) loadMRating(currentUid);
    if (key === "esafety"  && currentUid) loadMSafety(currentUid);
    if (key === "estacup"  && lastUserData) {
      setupEstacupSubnav();
      showEstacupSub("inscription");
    }
  }

  buttons.forEach(btn => btn.addEventListener("click", () => showSection(btn.getAttribute("data-section"))));
  showSection("infos");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { 
    localStorage.setItem("redirectAfterLogin", "estacup-s9.html");
    window.location.href = "login.html"; 
    return; 
  }

  try {
    let userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      const map = await getDoc(doc(db, "authMap", user.uid));
      if (map.exists()) userSnap = await getDoc(doc(db, "users", map.data().pilotUid));
    }
    
    if (!userSnap.exists()) { 
      console.error("Profil introuvable dans la base users.");
      window.location.href = "login.html"; 
      return; 
    }

    const data = userSnap.data();
    currentUid   = userSnap.id;
    lastUserData = data;

    $("fullName").textContent      = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "—";
    $("licenseId").textContent     = data.licenceId || data.licenseId || "-";
    $("eloRating").textContent     = data.eloRating ?? 1000;
    $("licensePoints").textContent = data.licensePoints ?? 10;
    $("licenseClass").textContent  = data.licenseClass || "Rookie";
    $("dob").textContent           = formatDateFR(firstDefined(data.dob, data.birthDate, data.birthday, data.dateNaissance, data.naissance)) || "Non renseignée";
    $("steamIdLine").textContent   = data.steamID64 || data.steamId || "—";

    setupHelmetDesigner(data);
    setupNavigation(data.admin === true);

    await ensureSignupCache();
    await loadResults(currentUid);
    await loadPilotStats(currentUid);
    await initInfoComparison(currentUid);

  } catch (err) {
    console.error("Erreur sécurité S9:", err);
  }
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

function splitNameParts(p) {
  const first = (pick(p, ["firstName","prenom","driver.firstName"]) ?? "").toString().trim();
  const last  = (pick(p, ["lastName","nom","driver.lastName"]) ?? "").toString().trim();
  if (first || last) return { first, last };
  const full = (pick(p, ["name","driver.name"]) ?? "").toString().trim();
  if (!full) return { first: "", last: "" };
  const parts = full.split(/\s+/);
  return parts.length === 1 ? { first: "", last: parts[0] } : { first: parts.slice(0, -1).join(" "), last: parts.slice(-1)[0] };
}

function pickCar(p) { return String(pick(p, ["car","carModel","voiture","model"]) ?? ""); }
function pickBestLapMs(p) { return anyNumberMs(pick(p, ["bestLapMs","bestLapTime","lapBest"])); }
function pickTotalTimeMs(p) { return anyNumberMs(pick(p, ["totalMs","totalTime","raceTime"])); }
function pickGapLeaderMsDirect(p) { return anyNumberMs(pick(p, ["gapToLeader","gapLeader"])); }
function pickPenaltyMs(p) { return anyNumberMs(pick(p, ["penaltyMs","basePenaltyMs","editPenaltyMs"])) || null; }

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

/* ======================== Résultats ======================== */
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
      html += `<tr class="${rowClass}"><td class="pilot-name-cell" data-uid="${escapeHtml(uid)}">${escapeHtml(last.toUpperCase())}</td><td>${escapeHtml(first)}</td><td>${escapeHtml(pickCar(p))}</td><td class="${globalBestMs && bestMs === globalBestMs ? 'bestlap-global':''}">${bestMs ? msToClock(bestMs) : '—'}</td><td>${escapeHtml(computeGapLeaderText(p, leader))}</td><td>${pts}</td></tr>`;
    });
    container.innerHTML = html + `</tbody></table></div>`; setupPilotNameHover(container); applyHelmetsIn(container);
  } catch (e) { container.innerHTML = "<em>Erreur.</em>"; }
}

async function computePilotStats(uid) {
  if (!uid) return { starts: 0, bestPos: null, wins: 0, top3: 0, top5: 0, top10: 0, avgPos: null };
  if (pilotStatsCache.has(uid)) return pilotStatsCache.get(uid);
  const stats = { starts: 0, bestPos: null, wins: 0, top3: 0, top5: 0, top10: 0, avgPos: null };
  try {
    const snap = await getDocs(collection(db, "users", uid, "raceHistory"));
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
    if ($("statBest"))   $("statBest").textContent   = stats.bestPos ? `${stats.bestPos}ᵉ` : "—";
    if ($("statWins"))   $("statWins").textContent   = String(stats.wins);
    if ($("statTop3"))   $("statTop3").textContent   = String(stats.top3);
    if ($("statTop5"))   $("statTop5").textContent   = String(stats.top5);
    if ($("statTop10"))  $("statTop10").textContent  = String(stats.top10);
    if ($("statAvg"))    $("statAvg").textContent    = stats.avgPos ? `${stats.avgPos.toFixed(1)}ᵉ` : "—";
  } catch {}
}

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
    const opts = q.options.map(o => `
        <label class="vote-option" for="vote_${q.key}_${o.value}">
          <input type="radio" name="${q.key}" id="vote_${q.key}_${o.value}" value="${o.value}" ${selected[q.key] === o.value ? "checked" : ""} ${locked ? "disabled" : ""} />
          <div class="vote-pill">
            <span class="fi fi-${o.cc} vote-flag"></span>
            <strong>${escapeHtml(o.label)}</strong>
          </div>
        </label>`).join("");
    return `<div class="vote-card"><div class="vote-title">${escapeHtml(q.title)}</div><div class="vote-options">${opts}</div></div>`;
  }).join("");

  host.innerHTML = `<div class="vote-grid">${cards}</div><div class="vote-actions">${locked ? `<p class="muted-note">✅ Votre vote a été validé.</p>` : `<button id="btnValidateVote" class="btn-validate">✅ Valider mon vote</button>`}</div>`;

  if (!locked) {
    questions.forEach(q => host.querySelectorAll(`input[name="${q.key}"]`).forEach(r => r.addEventListener("change", () => { selected[q.key] = r.value; })));
    $("btnValidateVote")?.addEventListener("click", async () => {
      if (!selected.round3 || !selected.round5) { alert("Répondez aux deux questions !"); return; }
      await setDoc(voteRef, { uid: currentUid, round3: selected.round3, round5: selected.round5, locked: true, updatedAt: new Date() });
      renderVoteCircuit();
    });
  }
}

/* ======================== LISTE DES ENGAGÉS S9 ======================== */
async function loadEstacupEngages() {
  const host = $("estacupEngagesHost") || $("estacupEngages");
  if (!host) return;
  host.innerHTML = "<p>Chargement des engagés…</p>";

  try {
    const snap = await getDocs(collection(db, "estacup_s9_signups"));
    const valid = snap.docs.filter(d => d.data() && d.data().validated);

    if (valid.length === 0) {
      host.innerHTML = "<p class='muted-note'>Aucun inscrit validé pour l'instant.</p>";
      return;
    }

    host.innerHTML = "";
    const mapCarImg = { "Acura NSX GT3 EVO 2":"cars/acura.png","Audi R8 LMS GT3 EVO II":"cars/audi.png","BMW M4 GT3":"cars/bmw.png","Ferrari 296 GT3":"cars/ferrari.png","Ford Mustang GT3":"cars/ford.png","Lamborghini Huracan GT3 EVO2":"cars/lamborghini.png","Lexus RC F GT3":"cars/lexus.png","McLaren 720S GT3 EVO":"cars/mclaren.png","Mercedes-AMG GT3 EVO":"cars/mercedes.png","Porsche 911 GT3 R":"cars/porsche.png" };

    valid.forEach(docu => {
      const d = docu.data();
      const src = mapCarImg[d.carChoice] || "";
      const box = document.createElement("div");
      box.className = "course-box engage-card";
      box.innerHTML = `
        <div class="engage-row">
          <div class="engage-text">
            <strong>${escapeHtml(`${d.firstName || ""} ${d.lastName || ""}`.trim())}</strong><br>
            Numéro : <b style="color:#38bdf8;">${d.raceNumber ?? "—"}</b><br>
            Équipe : ${escapeHtml(d.teamName || "—")} | Voiture : ${escapeHtml(d.carChoice || "—")}<br>
            Steam ID : <span class="muted-note">${escapeHtml(d.steamID64 || d.steamId || "—")}</span>
          </div>
          ${src ? `<img src="${src}" alt="${escapeHtml(d.carChoice)}" class="car-thumb">` : ""}
        </div>`;
      host.appendChild(box);
    });
  } catch (e) { host.innerHTML = "<p>Erreur liste engagés.</p>"; }
}

/* ======================== CLASSEMENT PILOTES S9 ======================== */
async function loadEstacupPilotStandings() {
  const host = $("estacupPilotStandingsHost") || $("estacupPilotStandings");
  if (!host) return;
  host.innerHTML = "<p>Calcul en cours…</p>";

  try {
    const useJoker = $("jokerTogglePilots")?.checked ?? false;
    const [raceHistorySnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "raceHistory")),
      getDocs(collection(db, "users"))
    ]);

    const pilotsMap = new Map();
    usersSnap.forEach(d => {
      const u = d.data();
      pilotsMap.set(d.id, { name: `${u.firstName || ""} ${u.lastName || ""}`.trim(), rounds: {}, total: 0, uid: d.id });
    });

    raceHistorySnap.forEach(docSnap => {
      const race = docSnap.data();
      if (!race || !race.participants) return;
      const roundKey = race.round || race.name || docSnap.id;
      const isSprint = (race.name || "").toLowerCase().includes("sprint") || (race.type || "").toLowerCase().includes("sprint");

      race.participants.forEach(p => {
        if (!p || !p.uid || !pilotsMap.has(p.uid)) return;
        const pilot = pilotsMap.get(p.uid);
        if (!pilot.rounds[roundKey]) pilot.rounds[roundKey] = { sprint: 0, main: 0 };
        const pts = parseInt(p.points || p.posPoints || 0, 10);
        if (isSprint) pilot.rounds[roundKey].sprint = pts; else pilot.rounds[roundKey].main = pts;
      });
    });

    const rows = Array.from(pilotsMap.values()).map(pilot => {
      let scores = Object.keys(pilot.rounds).map(r => pilot.rounds[r].sprint + pilot.rounds[r].main);
      let finalTotal = scores.reduce((a, b) => a + b, 0);
      if (useJoker && scores.length > 0) finalTotal -= Math.min(...scores);
      pilot.total = finalTotal; return pilot;
    }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

    if (rows.length === 0) { host.innerHTML = "<p>Aucun score trouvé pour la S9.</p>"; return; }

    let html = `<table class="race-table"><thead><tr><th>Pos</th><th>Pilote</th><th>Points</th></tr></thead><tbody>`;
    rows.forEach((r, idx) => { html += `<tr><td>${idx + 1}</td><td>${escapeHtml(r.name)}</td><td><strong>${r.total} pts</strong></td></tr>`; });
    host.innerHTML = html + "</tbody></table>"; setupPilotNameHover(host); applyHelmetsIn(host);
  } catch (err) { host.innerHTML = "<p>Erreur classement.</p>"; }
}

/* ======================== CLASSEMENT ÉQUIPES S9 ======================== */
async function loadEstacupTeamStandings() {
  const host = $("estacupTeamStandingsHost") || $("estacupTeamStandings");
  if (!host) return;
  host.innerHTML = "<p>Calcul en cours…</p>";

  try {
    const useJoker = $("jokerToggleTeams")?.checked ?? false;
    const [raceHistorySnap, signupsSnap] = await Promise.all([
      getDocs(collection(db, "raceHistory")),
      getDocs(collection(db, "estacup_s9_signups"))
    ]);

    const pilotToTeam = new Map();
    signupsSnap.forEach(d => { const s = d.data(); if (s && s.uid && s.teamName) pilotToTeam.set(s.uid, s.teamName.trim()); });

    const teamsMap = new Map();
    raceHistorySnap.forEach(docSnap => {
      const race = docSnap.data(); if (!race || !race.participants) return;
      const roundKey = race.round || race.name || docSnap.id;

      race.participants.forEach(p => {
        if (!p || !p.uid || !pilotToTeam.has(p.uid)) return;
        const teamName = pilotToTeam.get(p.uid);
        if (teamName === "(Sans équipe)") return;
        if (!teamsMap.has(teamName)) teamsMap.set(teamName, { name: teamName, rounds: {} });
        const team = teamsMap.get(teamName);
        if (!team.rounds[roundKey]) team.rounds[roundKey] = 0;
        team.rounds[roundKey] += parseInt(p.points || p.posPoints || 0, 10);
      });
    });

    const rows = Array.from(teamsMap.values()).map(team => {
      let scores = Object.values(team.rounds);
      let finalTotal = scores.reduce((a, b) => a + b, 0);
      if (useJoker && scores.length > 0) finalTotal -= Math.min(...scores);
      team.total = finalTotal; return team;
    }).filter(t => t.total > 0).sort((a, b) => b.total - a.total);

    if (rows.length === 0) { host.innerHTML = "<p>Aucune équipe trouvée.</p>"; return; }

    let html = `<table class="race-table"><thead><tr><th>Pos</th><th>Équipe</th><th>Points</th></tr></thead><tbody>`;
    rows.forEach((r, idx) => { html += `<tr><td>${idx + 1}</td><td>${escapeHtml(r.name)}</td><td><strong>${r.total} pts</strong></td></tr>`; });
    host.innerHTML = html + "</tbody></table>";
  } catch (err) { host.innerHTML = "<p>Erreur équipes.</p>"; }
}

async function initInfoComparison(currentUid) {}
async function renderComparison() {}
async function loadMRating(uid) {}
async function loadMSafety(uid) {}
function setupMekaQuestionnaire() {}
function loadReclamHistory() {}
