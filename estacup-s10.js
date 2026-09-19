// estacup-s10.js — Driver's Room S10
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, getDocs, query, where, updateDoc, addDoc, setDoc, onSnapshot
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
        const mRating = d.eloRating ?? 1000; 
        const mSafety = d.licensePoints ?? 8;
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
  return `<svg viewBox="0 0 120 80" class="helmet-svg" aria-hidden="true" style="height: 1em; width: auto; vertical-align: middle; margin-right: 5px;"><defs><clipPath id="helmetClip"><path d="M12 30 Q30 5 70 5 105 5 112 38 Q115 50 110 63 Q107 72 98 75 L22 75 Q14 74 10 66 Q5 55 7 43 Z"/></clipPath></defs><ellipse cx="60" cy="72" rx="38" ry="6" fill="rgba(0,0,0,0.65)"/><g clip-path="url(#helmetClip)"><rect x="5" y="6" width="110" height="70" rx="32" fill="${h.baseColor}"/>${stripeMarkup}</g><path d="M62 32 H104 Q112 32 112 40 Q112 52 100 53 L62 53 Z" fill="${h.accentColor}"/><path d="M20 26 Q36 12 60 10" stroke="rgba(255,255,255,0.35)" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M14 54 Q60 64 106 54" stroke="#020617" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.8"/></svg>`;
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

/* ======================== GESTION DES MENUS (NOUVELLE STRUCTURE) ======================== */
function setupNavigation(isAdmin = false) {
  const goToAdmin = $("goToAdmin");
  if (goToAdmin) {
    if (isAdmin) goToAdmin.classList.remove("hidden");
    else goToAdmin.classList.add("hidden");
  }

  goToAdmin?.addEventListener("click", () => (window.location.href = "admin-s10.html"));

  const buttons  = document.querySelectorAll('#mainNav > button[data-section]');
  const sections = document.querySelectorAll('.section');

  function showSection(key) {
    sections.forEach(s => s.classList.add("hidden"));
    const el = document.getElementById(`section-${key}`);
    if (el) el.classList.remove("hidden");

    buttons.forEach(btn => {
      if (btn.getAttribute("data-section") === key) btn.classList.add("active");
      else btn.classList.remove("active");
    });

    if (key === "championship" && lastUserData) {
      setupChampCategories();
      showChampCategory("admin");
      setupMekaQuestionnaire(lastUserData);
      loadEstacupEngages();
      loadEstacupEquipes();
      renderVoteCircuit();
    }
  }

  buttons.forEach(btn => btn.addEventListener("click", () => showSection(btn.dataset.section)));
  showSection("infos"); 
  
  setupInfosCategories();
}

function setupInfosCategories() {
  const btns = document.querySelectorAll(".infos-sub-btn");
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".infos-subsection").forEach(s => s.classList.add("hidden"));
      document.querySelectorAll(".infos-sub-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById("infos-sub-" + btn.dataset.infosub);
      if (target) target.classList.remove("hidden");
    });
  });
}

/* --- Gestion à 2 Niveaux pour "Le Championnat" --- */
function setupChampCategories() {
  const catBtns = document.querySelectorAll("#champCategoryNav button[data-cat]");
  catBtns.forEach(btn => {
    btn.onclick = () => showChampCategory(btn.dataset.cat);
  });
  
  const subBtns = document.querySelectorAll(".champ-sub-btn");
  subBtns.forEach(btn => {
    btn.onclick = () => showChampionshipSub(btn.dataset.sub);
  });

  const chkP = $("jokerTogglePilots"); if (chkP) chkP.onchange = () => { if(typeof loadEstacupPilotStandings === "function") loadEstacupPilotStandings(); };
  const chkT = $("jokerToggleTeams"); if (chkT) chkT.onchange = () => { if(typeof loadEstacupTeamStandings === "function") loadEstacupTeamStandings(); };
}

function showChampCategory(catKey) {
  document.querySelectorAll("#champCategoryNav button[data-cat]").forEach(btn => {
    if (btn.dataset.cat === catKey) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  document.querySelectorAll(".champ-cat-container").forEach(c => c.classList.add("hidden"));
  const activeNav = document.getElementById("cat-" + catKey);
  
  if (activeNav) {
    activeNav.classList.remove("hidden");
    const visibleBtns = Array.from(activeNav.querySelectorAll(".champ-sub-btn")).filter(b => b.style.display !== "none");
    if (visibleBtns.length > 0) {
      showChampionshipSub(visibleBtns[0].dataset.sub);
    }
  }
}

function showChampionshipSub(subKey) {
  document.querySelectorAll('.champ-subsection').forEach(b => b.classList.add("hidden"));
  const block = $("champ-sub-" + subKey);
  if (block) block.classList.remove("hidden");

  document.querySelectorAll(".champ-sub-btn").forEach(btn => {
    if (btn.dataset.sub === subKey) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  if (subKey === "reglement" && typeof loadReglement === "function") loadReglement();
  if (subKey === "circuits") setTimeout(() => { if (typeof init3DGlobe === "function") init3DGlobe(); }, 50);
  if (subKey === "monequipe") loadMyTeamSection();
  if (subKey === "livree") renderLiverySection();
  if (subKey === "courses") loadResults(currentUid);
  if (subKey === "equipes") loadEstacupEquipes();
  if (subKey === "reclamations" && typeof loadReclamHistory === "function") loadReclamHistory();
  if (subKey === "rankpilots" && typeof loadEstacupPilotStandings === "function") loadEstacupPilotStandings();
  if (subKey === "rankteams" && typeof loadEstacupTeamStandings === "function") loadEstacupTeamStandings();
  if (typeof renderAllBadges === "function") renderAllBadges();
}

/* ======================== CHARGEMENT DYNAMIQUE DU RÈGLEMENT (AVEC MARKDOWN) ======================== */
async function loadReglement() {
  const container = document.querySelector("#champ-sub-reglement .reglement-content #reglementContent");
  if (!container) return;
  if (container.dataset.loaded) return; 

  container.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Chargement du règlement...</div>`;
  
  try {
    const snap = await getDoc(doc(db, "config", "reglement_s10"));
    if (snap.exists() && snap.data().content) {
      const rawMarkdown = snap.data().content;
      container.dataset.rawMarkdown = rawMarkdown; // Sauvegarde la version brute pour l'éditeur
      if (typeof marked !== 'undefined') {
        container.innerHTML = marked.parse(rawMarkdown);
      } else {
        container.innerHTML = rawMarkdown;
      }
    } else {
      container.innerHTML = `<p class="muted-note">Le règlement n'a pas encore été publié par l'organisation.</p>`;
      container.dataset.rawMarkdown = "";
    }
    container.dataset.loaded = "true";
  } catch (e) {
    console.error("Erreur de chargement du règlement:", e);
    container.innerHTML = `<p class="impact-bad">Erreur de chargement du règlement.</p>`;
  }
}

/* ======================== AUTHENTIFICATION ======================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) { 
    // CORRECTION BOUCLE: Délai de sécurité pour laisser IndexedDB se charger 
    setTimeout(() => {
      if (!auth.currentUser) {
        localStorage.setItem("redirectAfterLogin", "estacup-s10.html"); 
        window.location.replace("login.html"); 
      }
    }, 1000);
    return; 
  }
  
  try {
    let userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      const map = await getDoc(doc(db, "authMap", user.uid));
      if (map.exists()) userSnap = await getDoc(doc(db, "users", map.data().pilotUid));
    }
    
    if (!userSnap.exists()) { 
      window.location.replace("login.html"); 
      return; 
    }

    const data = userSnap.data(); 
    currentUid = userSnap.id; 
    lastUserData = data;

    // ✅ VRAIE VÉRIFICATION ADMIN SÉCURISÉE ET RÔLES
    const isAdmin = data.admin === true;
    const userRole = data.role || "Pilote";
    
    // Droit d'accès à la page Média
    const isMediaAllowed = isAdmin || userRole === "Staff / Orga" || userRole === "Streamer / Commentateur";

    // Affichage ou masquage de l'onglet Média
    const navMediaBtn = $("navMediaBtn");
    if (navMediaBtn) {
      if (isMediaAllowed) {
        navMediaBtn.classList.remove("hidden");
      } else {
        navMediaBtn.classList.add("hidden");
      }
    }

    if ($("fullName")) $("fullName").textContent = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "—";
    if ($("licenseId")) $("licenseId").textContent = data.licenseId || data.licenceId || "-";
    if ($("licenseClass")) $("licenseClass").textContent = data.licenseClass || "Rookie";
    if ($("dob")) $("dob").textContent = formatDateFR(firstDefined(data.dob, data.birthDate, data.birthday, data.dateNaissance, data.naissance)) || "Non renseignée";
    if ($("steamIdLine")) $("steamIdLine").textContent = data.steamID64 || data.steamId || "—";

    // ✅ ON RESTAURE LES APPELS DOM QUI FONCTIONNENT VRAIMENT SUR TA PAGE
    setupNavigation(isAdmin);
    await ensureSignupCache();
    await loadPilotStats(currentUid);
    await loadAdvancedMRatingAndSafety(currentUid, data.eloRating, data.licensePoints);
    await loadMyIncidents(currentUid);
    setupCompareTool();
    initNotifications(currentUid, isAdmin); // 🔔 Lancement des notifications !
    
  } catch (err) { 
    console.error("Erreur sécurité S10:", err); 
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

/* ======================== NOUVEAU : CHARGEMENT M-RATING / M-SAFETY AVANCÉ ======================== */
let mRatingChartInstance = null;
let mSafetyChartInstance = null;

async function loadAdvancedMRatingAndSafety(uid, currentElo, currentSafety) {
   const safeElo = currentElo ?? 1000;
   const safeSafety = currentSafety ?? 8;

   if ($("eloRating")) $("eloRating").textContent = safeElo;
   if ($("licensePoints")) $("licensePoints").textContent = safeSafety;

   // 1. Calcul du classement parmi tous les inscrits validés
   const signupsSnap = await getDocs(query(collection(db, "estacup_s10_signups"), where("isValidated", "==", true)));
   const validatedUids = new Set();
   signupsSnap.forEach(d => validatedUids.add(d.id));

   const usersSnap = await getDocs(collection(db, "users"));
   const elos = [];
   const safeties = [];
   
   usersSnap.forEach(d => {
     if (validatedUids.has(d.id)) {
       const u = d.data();
       elos.push(u.eloRating ?? 1000);
       safeties.push(u.licensePoints ?? 8);
     }
   });

   elos.sort((a,b) => b - a);
   safeties.sort((a,b) => b - a);

   if (!validatedUids.has(uid)) {
     elos.push(safeElo);
     elos.sort((a,b) => b - a);
     safeties.push(safeSafety);
     safeties.sort((a,b) => b - a);
   }

   const eloRank = elos.indexOf(safeElo) + 1;
   const safetyRank = safeties.indexOf(safeSafety) + 1;
   const totalUsers = elos.length;

   if ($("eloRankLine")) $("eloRankLine").textContent = `${eloRank}e / ${totalUsers}`;
   if ($("safetyRankLine")) $("safetyRankLine").textContent = `${safetyRank}e / ${totalUsers}`;

   if ($("eloTopPctLine")) {
     const topPct = Math.max(1, Math.round((eloRank / totalUsers) * 100));
     $("eloTopPctLine").textContent = `Top ${topPct}% des pilotes`;
   }

   if ($("safetyStatusLine")) {
     if (safeSafety >= 8) $("safetyStatusLine").innerHTML = `<span style="color:#34d399">Exemplaire</span>`;
     else if (safeSafety >= 5) $("safetyStatusLine").innerHTML = `<span style="color:#f59e0b">Sous surveillance</span>`;
     else $("safetyStatusLine").innerHTML = `<span style="color:#ef4444">Critique</span>`;
   }

   // 2. Construction de l'historique visuel (Simplifié : Base S10 -> Actuel)
   const labels = ["Début S10", "Actuel"];
   const eloData = [1000, safeElo];
   const safetyData = [8, safeSafety];

   if (typeof Chart !== 'undefined') {
     renderChart("chartMRating", "M-Rating", labels, eloData, "#38bdf8", "rgba(56, 189, 248, 0.15)");
     renderChart("chartMSafety", "M-Safety", labels, safetyData, "#34d399", "rgba(52, 211, 153, 0.15)");
   }
}

function renderChart(canvasId, label, labels, data, borderColor, bgColor) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (canvasId === "chartMRating" && mRatingChartInstance) mRatingChartInstance.destroy();
  if (canvasId === "chartMSafety" && mSafetyChartInstance) mSafetyChartInstance.destroy();

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        borderColor: borderColor,
        backgroundColor: bgColor,
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: borderColor,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#fff',
          bodyColor: borderColor,
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' },
          suggestedMin: label === "M-Safety" ? 0 : 900,
          suggestedMax: label === "M-Safety" ? 10 : 1100
        },
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });

  if (canvasId === "chartMRating") mRatingChartInstance = chart;
  if (canvasId === "chartMSafety") mSafetyChartInstance = chart;
}

/* ======================== MES INCIDENTS ======================== */
async function loadMyIncidents(uid) {
  const container = $("myIncidentsList");
  if (!container) return;

  try {
    const snap = await getDocs(collection(db, "incidents"));
    let myIncidents = [];
    
    snap.forEach(d => {
      const data = d.data();
      const pilotes = data.pilotes || [];
      const myData = pilotes.find(p => p.uid === uid);
      if (myData) {
        myIncidents.push({ id: d.id, data, myData });
      }
    });

    if (myIncidents.length === 0) {
      container.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 1.5rem; text-align: center;">
          <p class="muted-note" style="margin: 0; font-size: 1rem;">Aucun incident enregistré à votre encontre. Continuez comme ça ! 👏</p>
        </div>`;
      return;
    }

    myIncidents.sort((a, b) => (toDate(b.data.date) || 0) - (toDate(a.data.date) || 0));

    let html = "";
    for (const inc of myIncidents) {
      const d = inc.data;
      const m = inc.myData;
      const dateObj = toDate(d.date);
      
      const dateStr = dateObj ? dateObj.toLocaleString("fr-FR", {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit', second:'2-digit'}) : "Date inconnue";
      
      const diff = m.after - m.before;
      const diffColor = diff < 0 ? "#ef4444" : (diff > 0 ? "#10b981" : "#94a3b8");
      const diffSign = diff > 0 ? "+" : "";

      let courseName = "Non spécifiée";
      if (d.courseId) {
         try {
           const cSnap = await getDoc(doc(db, "courses", d.courseId));
           if (cSnap.exists()) courseName = cSnap.data().name || d.courseId;
         } catch(e) {}
      }

      html += `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 1.5rem;">
          <p style="margin: 0 0 4px 0; font-size: 0.85rem; color: #94a3b8; font-weight: bold;">Date et heure de la décision</p>
          <p style="margin: 0 0 12px 0; color: #e2e8f0; font-size: 0.95rem;">${dateStr}</p>

          <p style="margin: 0 0 4px 0; font-size: 0.85rem; color: #94a3b8; font-weight: bold;">Course</p>
          <p style="margin: 0 0 12px 0; color: #e2e8f0; font-size: 0.95rem;">${escapeHtml(courseName)}</p>

          <p style="margin: 0 0 4px 0; font-size: 0.85rem; color: #94a3b8; font-weight: bold;">Description de l'incident</p>
          <p style="margin: 0 0 12px 0; color: #e2e8f0; font-size: 0.95rem;">${escapeHtml(d.description)}</p>

          <p style="margin: 0 0 4px 0; font-size: 0.85rem; color: #94a3b8; font-weight: bold;">Incidence M-Safety</p>
          <p style="margin: 0; color: ${diffColor}; font-weight: bold; font-size: 1.1rem;">${diffSign}${diff}</p>
        </div>
      `;
    }
    container.innerHTML = html;

  } catch (e) {
    console.error("Erreur chargement incidents", e);
    container.innerHTML = `<p class="impact-bad">Erreur de chargement des incidents.</p>`;
  }
}

/* ======================== MON ÉQUIPE ======================== */
window.teamViewState = { showGlobal: false };

async function loadMyTeamSection() {
  const container = $("myTeamContainer");
  if (!container) return;

  if (!currentUid) {
    container.innerHTML = `<p class="muted-note">Connectez-vous pour voir votre équipe.</p>`;
    return;
  }
  container.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Analyse des données de l'équipe...</div>`;

  try {
    await refreshTeamDashboard();
  } catch (e) {
    console.error("Erreur loadMyTeamSection:", e);
    container.innerHTML = `<p class="impact-bad">Erreur de chargement des données de l'équipe.</p>`;
  }
}

async function refreshTeamDashboard() {
  const container = $("myTeamContainer");
  
  // 1. Récupérer l'inscription
  const mySignup = await getDoc(doc(db, "estacup_s10_signups", currentUid));
  if (!mySignup.exists() || !mySignup.data().teamName || mySignup.data().teamName.trim().toLowerCase() === "indépendant" || mySignup.data().teamName.trim().toLowerCase() === "sans équipe") {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <h4 style="color: #94a3b8; font-size: 1.5rem; margin-bottom: 1rem;">🐺 Loup Solitaire</h4>
        <p style="color: #cbd5e1;">Vous êtes inscrit en tant que pilote Indépendant pour cette saison. Rejoignez une structure pour débloquer le classement d'équipe !</p>
      </div>`;
    return;
  }

  const myTeam = mySignup.data().teamName.trim();

  // --- Récupérer toutes les équipes uniques existantes ---
  const allSignupsSnap = await getDocs(collection(db, "estacup_s10_signups"));
  const allTeamsSet = new Set();
  allSignupsSnap.forEach(d => {
    const t = d.data().teamName;
    if (t && t.trim() !== "" && t.toLowerCase() !== "indépendant" && t.toLowerCase() !== "sans équipe" && t.trim() !== myTeam) {
      allTeamsSet.add(t.trim());
    }
  });
  const availableTeams = Array.from(allTeamsSet).sort();

  // 2. Récupérer les équipes sœurs
  const configRef = doc(db, "estacup_s10_teams_config", myTeam);
  const configSnap = await getDoc(configRef);
  const sisterTeams = configSnap.exists() && configSnap.data().sisterTeams ? configSnap.data().sisterTeams : [];

  // 3. Déterminer les équipes à charger
  let targetTeams = [myTeam];
  if (window.teamViewState.showGlobal && sisterTeams.length > 0) {
    targetTeams = targetTeams.concat(sisterTeams);
  }

  // 4. Récupérer les équipiers
  const teamQuery = query(collection(db, "estacup_s10_signups"), where("teamName", "in", targetTeams));
  const teamSnap = await getDocs(teamQuery);

  const teammates = [];
  let totalTeamPoints = 0;

  for (const d of teamSnap.docs) {
    const data = d.data();
    const uid = d.id;

    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const historySnap = await getDocs(collection(db, "users", uid, "raceHistory_s10"));
    let pilotPoints = 0;
    let pilotWins = 0;
    let pilotPodiums = 0;

    historySnap.forEach(h => {
      const hData = h.data();
      pilotPoints += (hData.points || 0);
      const pos = Number(hData.position) || 999;
      if (pos === 1) pilotWins++;
      if (pos >= 1 && pos <= 3) pilotPodiums++;
    });

    totalTeamPoints += pilotPoints;

    teammates.push({
      uid,
      name: `${data.firstName} ${data.lastName}`,
      number: data.raceNumber,
      teamName: data.teamName.trim(), 
      elo: userData.eloRating || 1000,
      safety: userData.licensePoints || 8,
      license: userData.licenseClass || userData.licenceClass || "Rookie",
      points: pilotPoints,
      wins: pilotWins,
      podiums: pilotPodiums,
      isMe: uid === currentUid,
      isSister: data.teamName.trim() !== myTeam
    });
  }

  teammates.sort((a, b) => b.points - a.points);

  // --- Construction HTML ---
  const hasSisters = sisterTeams.length > 0;
  const titleDisplay = window.teamViewState.showGlobal && hasSisters ? `Structure Globale (${myTeam} & co.)` : myTeam;

  let html = `
    <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 2rem;">
      
      <div style="flex: 1; min-width: 300px;">
        <h4 style="font-size: 2.2rem; color: #fde68a; text-transform: uppercase; letter-spacing: 2px; margin-top: 0; margin-bottom: 0.5rem; text-shadow: 0 0 15px rgba(245, 158, 11, 0.3);">
          ${escapeHtml(titleDisplay)}
        </h4>
        <p style="color: #94a3b8; font-size: 1.1rem; margin-bottom: 1rem;">Total cumulé : <strong style="color: #38bdf8; font-size: 1.3rem;">${totalTeamPoints} pts</strong></p>
        
        ${hasSisters ? `
          <div class="joker-toggle" style="display: inline-flex; margin-bottom: 0;">
            <label for="toggleGlobalStruct">
              <input type="checkbox" id="toggleGlobalStruct" ${window.teamViewState.showGlobal ? 'checked' : ''}>
              <span>Inclure les <strong>équipes sœurs</strong> dans l'affichage</span>
            </label>
          </div>
        ` : ''}
      </div>

      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1.2rem; flex: 1; min-width: 300px;">
        <h5 style="margin-top: 0; color: #38bdf8; margin-bottom: 0.8rem; font-size: 1rem;">🔗 Alliances & Équipes Sœurs</h5>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1rem;">Liez votre équipe à d'autres structures (ex: SRT 1 avec SRT 2) pour comparer vos performances globales.</p>
        
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
          <select id="inputSisterTeam" style="flex: 1; padding: 0.5rem; border-radius: 6px; border: 1px solid #334155; background: #020617; color: white;">
            <option value="" disabled selected>-- Sélectionner une équipe --</option>
            ${availableTeams.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
          </select>
          <button id="btnAddSister" class="btn-validate" style="padding: 0.5rem 1rem; height: auto;">Lier</button>
        </div>
        
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
          ${sisterTeams.map(st => `
            <span style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fde68a; padding: 4px 10px; border-radius: 999px; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
              ${escapeHtml(st)} 
              <button class="btn-remove-sister" data-team="${escapeHtml(st)}" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.9rem; padding: 0;">✖</button>
            </span>
          `).join('')}
          ${sisterTeams.length === 0 ? '<span style="font-size: 0.85rem; color: #64748b; font-style: italic;">Aucune équipe sœur liée.</span>' : ''}
        </div>
      </div>

    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
  `;

  teammates.forEach((t, index) => {
    const rankColor = index === 0 ? "#fde68a" : (index === 1 ? "#cbd5e1" : "#cd7f32");
    const rankMedal = index === 0 ? "🥇" : (index === 1 ? "🥈" : "🥉");
    const borderColor = t.isMe ? '#38bdf8' : (t.isSister ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.1)');
    
    html += `
      <div style="background: rgba(2, 6, 23, 0.6); border: 1px solid ${borderColor}; border-radius: 12px; padding: 1.5rem; position: relative; overflow: hidden; box-shadow: ${t.isMe ? '0 0 15px rgba(56, 189, 248, 0.2)' : 'none'};">
        ${t.isMe ? '<div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: #38bdf8;"></div>' : ''}
        ${t.isSister ? '<div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: #f59e0b;"></div>' : ''}
        
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
          <div>
            <h5 style="margin: 0; font-size: 1.15rem; color: #fff;">${escapeHtml(t.name)} ${t.isMe ? '<span style="font-size:0.8rem; color:#38bdf8;">(Vous)</span>' : ''}</h5>
            <span style="font-size: 0.75rem; padding: 3px 8px; border-radius: 6px; background: rgba(255,255,255,0.1); color: #cbd5e1; margin-top: 8px; display: inline-block; text-transform: uppercase; font-weight: bold;">#${t.number} • ${t.license}</span>
            ${t.isSister ? `<div style="font-size: 0.75rem; color: #f59e0b; margin-top: 6px; font-weight: bold;">🤝 ${escapeHtml(t.teamName)}</div>` : ''}
          </div>
          <div style="font-size: 1.8rem; line-height: 1;" title="Classement interne">${rankMedal}</div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 1rem; text-align: center;">
          <div style="background: rgba(255,255,255,0.03); padding: 12px 5px; border-radius: 8px;">
            <div style="font-size: 1.6rem; font-weight: 900; color: ${rankColor};">${t.points}</div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-top: 2px;">Points</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); padding: 12px 5px; border-radius: 8px;">
            <div style="font-size: 1.6rem; font-weight: 900; color: #34d399;">${t.safety}</div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-top: 2px;">M-Safety</div>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-around; font-size: 0.95rem; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
          <span title="Victoires">🏆 ${t.wins}</span>
          <span title="Podiums">🍾 ${t.podiums}</span>
          <span title="M-Rating">📈 ${t.elo}</span>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;

  const toggle = $("toggleGlobalStruct");
  if (toggle) {
    toggle.addEventListener("change", (e) => {
      window.teamViewState.showGlobal = e.target.checked;
      container.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Actualisation...</div>`;
      refreshTeamDashboard();
    });
  }

  const btnAdd = $("btnAddSister");
  if (btnAdd) {
    btnAdd.addEventListener("click", async () => {
      const selectEl = $("inputSisterTeam");
      const input = selectEl.value;
      
      if (!input) {
        if (window.showToast) window.showToast("⚠️ Veuillez sélectionner une équipe dans la liste.", "warning");
        return;
      }
      if (sisterTeams.map(s => s.toLowerCase()).includes(input.toLowerCase())) {
        if (window.showToast) window.showToast("⚠️ Cette équipe est déjà liée.", "warning");
        return;
      }
      
      btnAdd.disabled = true;
      const newSisterTeams = [...sisterTeams, input];
      await setDoc(doc(db, "estacup_s10_teams_config", myTeam), { sisterTeams: newSisterTeams }, { merge: true });
      
      container.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Actualisation...</div>`;
      refreshTeamDashboard();
    });
  }

  document.querySelectorAll(".btn-remove-sister").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const teamToRemove = e.target.getAttribute("data-team");
      if (window.showConfirm) {
        if (!(await window.showConfirm(`Retirer l'équipe sœur "${teamToRemove}" ?`))) return;
      } else {
        if (!confirm(`Retirer l'équipe sœur "${teamToRemove}" ?`)) return;
      }

      const newSisterTeams = sisterTeams.filter(st => st !== teamToRemove);
      await setDoc(doc(db, "estacup_s10_teams_config", myTeam), { sisterTeams: newSisterTeams }, { merge: true });
      
      container.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Actualisation...</div>`;
      refreshTeamDashboard();
    });
  });

}
window.loadMyTeamSection = loadMyTeamSection;
window.refreshTeamDashboard = refreshTeamDashboard;

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
          nextStep.innerHTML = `<p style="margin-top:10px;">Vous devez choisir une option pour participer à l’ESTACUP :<br><br><a href="https://www.helloasso.com/associations/meka/adhesions/inscription-meka-2026-2027-1" target="_blank" style="color:#38bdf8;text-decoration:underline;display:block;margin-bottom:6px;">👉 Payer la cotisation MEKA (l’inscription ESTACUP sera gratuite)</a><a href="https://www.helloasso.com/associations/meka/evenements/inscription-estacup-saison-10" target="_blank" style="color:#38bdf8;text-decoration:underline;display:block;">👉 Payer 5 € pour participer uniquement à l’ESTACUP</a></p>`;
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

      // Comptage des équipes pour le menu déroulant
      const teamCounts = {};
      signupCache.forEach((data) => {
        const tName = data.teamName?.trim();
        // On exclut "Indépendant" du comptage
        if (tName && tName.toLowerCase() !== "indépendant" && tName.toLowerCase() !== "sans équipe") {
          teamCounts[tName] = (teamCounts[tName] || 0) + 1;
        }
      });

      // Construction des options du menu déroulant
      let selectOptions = `<option value="" selected>🐺 Indépendant (Sans équipe)</option>`;
      for (const [t, count] of Object.entries(teamCounts).sort()) {
        if (count < 3) {
          selectOptions += `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${count}/3 pilotes)</option>`;
        }
      }
      selectOptions += `<option value="__NEW__">➕ Créer une nouvelle équipe...</option>`;

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

          <!-- NOUVEAU SYSTÈME DE SÉLECTION D'ÉQUIPE -->
          <label for="regTeamSelect">Choix de l'équipe :</label>
          <select id="regTeamSelect" style="margin-bottom: 10px;">
            ${selectOptions}
          </select>
          <input type="text" id="regTeam" placeholder="Nom de votre nouvelle équipe" style="display: none; margin-bottom: 1.5rem;">

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
            <option value="licence">Je roulerai avec la livrée neutre aux couleurs de ma licence</option>
          </select>

          <button id="btnSubmitSignup" class="btn-validate" style="width: 100%; margin-top: 15px;">🏁 Valider mon inscription</button>
        </div>
      `;

      // Gestion de l'affichage du champ "Nouvelle équipe"
      $("regTeamSelect").addEventListener("change", (e) => {
        if (e.target.value === "__NEW__") {
          $("regTeam").style.display = "block";
          $("regTeam").focus();
        } else {
          $("regTeam").style.display = "none";
          $("regTeam").value = "";
        }
      });

      $("btnSubmitSignup").onclick = async () => {
        const fName = $("regFirstName").value.trim();
        const lName = $("regLastName").value.trim();
        const status = $("regStatus").value;
        
        // Récupération intelligente du nom d'équipe
        let team = $("regTeamSelect").value;
        if (team === "__NEW__") {
          team = $("regTeam").value.trim();
          if (!team) {
            if (window.showToast) window.showToast("⚠️ Veuillez saisir le nom de votre nouvelle équipe.", "warning");
            return;
          }
        } else {
          team = team.trim();
        }

        const num = parseInt($("regNumber").value, 10);
        const steam = $("regSteam").value.trim();
        const liveryChoice = $("regLiveryChoice").value;

        if (!fName || !lName || !status || isNaN(num) || !steam || !liveryChoice) {
          if (window.showToast) window.showToast("⚠️ Veuillez remplir tous champs obligatoires correctement.", "warning");
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
              if (window.showToast) window.showToast(`❌ L'équipe "${team}" est déjà complète (3 pilotes max).`, "error");
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
            if (window.showToast) window.showToast(`❌ Le numéro #${num} vient d'être réservé par un autre pilote !`, "error");
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
            carChoice: "FIA F3 2026",
            steamID64: steam,
            liveryChoice: liveryChoice,
            isValidated: false,
            updatedAt: new Date()
          });

          if (window.showToast) window.showToast("✅ Inscription transmise avec succès ! En attente de validation.", "success");
          loadEstacupForm(userData);
          setupMekaQuestionnaire(userData);
        } catch (err) {
          console.error("Erreur inscription:", err);
          if (window.showToast) window.showToast("❌ Erreur lors de l'enregistrement.", "error");
          btn.disabled = false;
          btn.textContent = "🏁 Valider mon inscription";
        }
      };
      return;
    }

    // --- AFFICHAGE DE L'INSCRIPTION VALIDÉE ---
    const data = docSnap.data();
    const isValidated = data.isValidated === true;
    
    let statusText = "Non renseigné";
    if (data.paymentStatus === "adherent") statusText = "Adhérent MEKA";
    if (data.paymentStatus === "paye_5e") statusText = "Frais d'inscription (5€) payés";

    let liveryText = "Non renseigné";
    if (data.liveryChoice === "personnelle") liveryText = "Livrée personnelle (via OneDrive)";
    else if (data.liveryChoice === "neutre") liveryText = "Livrée neutre ESTACUP";
    else if (data.liveryChoice === "licence") liveryText = "Livrée neutre (Couleur Licence)";

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
            <div style="${infoItemStyle}"><strong>Véhicule :</strong> FIA F3 2026</div>
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
            <div style="${infoItemStyle}"><strong>Véhicule :</strong> FIA F3 2026</div>
            <div style="${infoItemStyle}"><strong>Livrée :</strong> ${liveryText}</div>
          </div>
          
          <div style="margin-top: 20px; padding: 12px 15px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px;">
            <p style="margin: 0; color: #38bdf8; font-size: 0.95rem;">
              <strong>ℹ️ Où sont les mods (voitures et circuits) ?</strong><br>
              L'accès au téléchargement du pack et au dépôt de votre livrée sera débloqué dans l'onglet <em>"Paddock & Mods"</em> <strong>dès que l'administration aura validé votre inscription</strong>.
            </p>
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
let engagesDataCache = [];
let engagesSortCol = "number";
let engagesSortDir = "asc";

window.handleEngagesSort = function(col) {
  if (engagesSortCol === col) {
    engagesSortDir = engagesSortDir === "asc" ? "desc" : "asc";
  } else {
    engagesSortCol = col;
    engagesSortDir = "asc";
  }
  updateEngagesTable();
};

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

    engagesDataCache = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const uid = data.uid || docSnap.id;
      const uData = usersMap.get(uid) || {};

      const licence = uData.licenseClass || uData.licenceClass || uData.license || "Rookie";
      let licColor = "#10b981"; 
      if (licence.toLowerCase() === "pro") licColor = "#ef4444"; 
      if (licence.toLowerCase() === "challenger") licColor = "#f59e0b"; 

      const mRating = uData.eloRating ?? 1000;

      engagesDataCache.push({
        rawFirstName: data.firstName || uData.firstName || "",
        rawLastName: data.lastName || uData.lastName || "",
        name: `${data.firstName || uData.firstName || ""} ${data.lastName || uData.lastName || ""}`.trim() || "Pilote",
        team: data.teamName || "Indépendant",
        number: Number(data.raceNumber) || 0,
        car: "FIA F3 2026",
        licence: licence,
        licColor: licColor,
        mRating: mRating,
        liveryChoice: data.liveryChoice || "personnelle"
      });
    });

    renderEstacupEngagesUI();

  } catch (err) {
    console.error("Erreur chargement liste des engagés publique :", err);
    targetArea.innerHTML = "<p class='impact-bad'>Erreur lors du chargement de la liste des engagés.</p>";
  }
}

function renderEstacupEngagesUI() {
  const targetArea = document.getElementById("champ-sub-engages");
  if (!targetArea) return;

  if (!document.getElementById("engagesTableContainer")) {
    targetArea.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1.5rem;">
        <h3 style="color: var(--accent-primary); margin: 0;">Liste des engagés (<span id="engagesCount">${engagesDataCache.length}</span>)</h3>
      </div>
      
      <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
        <input type="text" id="engagesSearch" placeholder="Rechercher (Nom, N°, Équipe...)" style="flex: 1; padding: 0.6rem; border-radius: 6px; border: 1px solid #334155; background: #020617; color: white;">
      </div>

      <div id="engagesTableContainer" style="overflow-x: auto; background: rgba(15,23,42,0.6); border-radius: 10px; border: 1px solid var(--border-primary); padding: 1rem;">
      </div>
    `;

    document.getElementById("engagesSearch").addEventListener("input", updateEngagesTable);
  }

  updateEngagesTable();
}

function updateEngagesTable() {
  const searchVal = (document.getElementById("engagesSearch").value || "").toLowerCase();
  const container = document.getElementById("engagesTableContainer");
  const countEl = document.getElementById("engagesCount");

  let filtered = engagesDataCache.filter(p => {
    const str = `${p.name} ${p.number} ${p.team} ${p.licence}`.toLowerCase();
    return str.includes(searchVal);
  });

  filtered.sort((a, b) => {
    let res = 0;
    if (engagesSortCol === "number") res = a.number - b.number;
    else if (engagesSortCol === "name") res = a.name.localeCompare(b.name);
    else if (engagesSortCol === "rating") res = a.mRating - b.mRating;
    else if (engagesSortCol === "team") res = a.team.localeCompare(b.team);
    else if (engagesSortCol === "licence") res = a.licence.localeCompare(b.licence);
    else if (engagesSortCol === "livery") res = a.liveryChoice.localeCompare(b.liveryChoice);

    return engagesSortDir === "asc" ? res : -res;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `<p class="muted-note" style="text-align: center; padding: 1rem;">Aucun pilote ne correspond à votre recherche.</p>`;
    return;
  }

  const getIcon = (col) => engagesSortCol === col ? (engagesSortDir === "asc" ? " ▴" : " ▾") : "";
  const thStyle = "padding: 12px 15px; color: var(--text-muted); font-weight: 600; cursor: pointer; user-select: none; transition: color 0.2s;";
  const hoverIn = "this.style.color='#fff'";
  const hoverOut = "this.style.color='var(--text-muted)'";

  let html = `
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; min-width: 900px;">
      <thead>
        <tr style="border-bottom: 1px solid var(--border-primary); background: rgba(255,255,255,0.02);">
          <th style="${thStyle} width: 70px;" onclick="handleEngagesSort('number')" onmouseover="${hoverIn}" onmouseout="${hoverOut}">N°<span style="color:#38bdf8">${getIcon('number')}</span></th>
          <th style="${thStyle}" onclick="handleEngagesSort('name')" onmouseover="${hoverIn}" onmouseout="${hoverOut}">Pilote<span style="color:#38bdf8">${getIcon('name')}</span></th>
          <th style="${thStyle}" onclick="handleEngagesSort('licence')" onmouseover="${hoverIn}" onmouseout="${hoverOut}">Licence<span style="color:#38bdf8">${getIcon('licence')}</span></th>
          <th style="${thStyle}" onclick="handleEngagesSort('rating')" onmouseover="${hoverIn}" onmouseout="${hoverOut}">M-Rating<span style="color:#38bdf8">${getIcon('rating')}</span></th>
          <th style="${thStyle} width: 180px; text-align: center;" onclick="handleEngagesSort('livery')" onmouseover="${hoverIn}" onmouseout="${hoverOut}">Livrée<span style="color:#38bdf8">${getIcon('livery')}</span></th>
          <th style="${thStyle}" onclick="handleEngagesSort('team')" onmouseover="${hoverIn}" onmouseout="${hoverOut}">Équipe<span style="color:#38bdf8">${getIcon('team')}</span></th>
          <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Véhicule</th>
        </tr>
      </thead>
      <tbody>
  `;

  filtered.forEach(p => {
    let liverySrc = "";
    let fallbackSrc1 = "";
    let fallbackSrc2 = "";

    if (p.liveryChoice === "neutre") {
      liverySrc = "Livrées/000 - Template MEKA.png";
      fallbackSrc1 = "Livrées/000 - Template MEKA.PNG";
      fallbackSrc2 = "Livrées/000 - Template MEKA.jpg";
    } else if (p.liveryChoice === "licence") {
      let safeLicence = "Rookie";
      const lic = p.licence.trim().toLowerCase();
      if (lic === "pro") safeLicence = "Pro"; 
      else if (lic === "challenger") safeLicence = "Challenger";
      liverySrc = `Livrées/000 - Template MEKA ${safeLicence}.png`;
      fallbackSrc1 = `Livrées/000 - Template MEKA ${safeLicence}.PNG`;
      fallbackSrc2 = `Livrées/000 - Template MEKA ${safeLicence}.jpg`;
    } else {
      const safeLastName = (p.rawLastName || "").trim().toUpperCase();
      const safeFirstName = (p.rawFirstName || "").trim();
      liverySrc = `Livrées/${p.number} - ${safeLastName}_${safeFirstName}.png`;
      fallbackSrc1 = `Livrées/${p.number} - ${safeLastName}_${safeFirstName}.PNG`;
      fallbackSrc2 = `Livrées/${p.number} - ${safeLastName}_${safeFirstName}.jpg`;
    }

    html += `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
        <td style="padding: 12px 15px; font-weight: 900; font-size: 1.3rem; color: var(--accent-primary);">#${escapeHtml(String(p.number))}</td>
        <td style="padding: 12px 15px; color: var(--text-primary); font-weight: 700; font-size: 1.05rem;">${escapeHtml(p.name)}</td>
        <td style="padding: 12px 15px;">
          <span style="font-size: 0.7rem; padding: 4px 10px; border-radius: 8px; border: 1px solid ${p.licColor}; color: ${p.licColor}; text-transform: uppercase; font-weight: bold;">
            ${escapeHtml(p.licence)}
          </span>
        </td>
        <td style="padding: 12px 15px; font-weight: bold; color: #38bdf8;">${p.mRating}</td>
        <td style="padding: 12px 15px; text-align: center;">
          <img src="${escapeHtml(liverySrc)}" 
               data-fb1="${escapeHtml(fallbackSrc1)}"
               data-fb2="${escapeHtml(fallbackSrc2)}"
               onerror="if(!this.dataset.f1){this.dataset.f1='1';this.src=this.dataset.fb1;}else if(!this.dataset.f2){this.dataset.f2='1';this.src=this.dataset.fb2;}else{this.onerror=null;this.src='Livrées/En attente.png';}" 
               alt="Livrée" 
               style="width: 150px; height: auto; object-fit: contain; background: transparent; border: none; box-shadow: none; transform: translateY(12px);">
        </td>
        <td style="padding: 12px 15px; color: var(--text-secondary); font-weight: 500;">${escapeHtml(p.team)}</td>
        <td style="padding: 12px 15px; color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(p.car)}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
  `;

  container.innerHTML = html;
}

/* ======================== LISTE DES ÉQUIPES (PUBLIQUE) ======================== */
async function loadEstacupEquipes() {
  const targetArea = document.getElementById("estacupEquipes");
  if (!targetArea) return;
  
  targetArea.innerHTML = `<div class="loading-inline" style="padding: 2rem; text-align: center; justify-content: center;"><div class="spinner"></div> Chargement des écuries et alliances...</div>`;
  
  try {
    const signupsRef = collection(db, "estacup_s10_signups");
    const q = query(signupsRef, where("isValidated", "==", true));
    
    // On ajoute la récupération de la configuration des équipes (pour les alliances)
    const [snap, usersSnap, configSnap] = await Promise.all([
      getDocs(q),
      getDocs(collection(db, "users")),
      getDocs(collection(db, "estacup_s10_teams_config"))
    ]);

    const usersMap = new Map();
    usersSnap.forEach(u => usersMap.set(u.id, u.data()));

    const teamsMap = new Map();

    // 1. Groupement des pilotes par équipe
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const uid = data.uid || docSnap.id;
      const uData = usersMap.get(uid) || {};

      let teamName = (data.teamName || "").trim();
      if (!teamName || teamName.toLowerCase() === "indépendant" || teamName.toLowerCase() === "sans équipe") {
        return; 
      }

      const licence = uData.licenseClass || uData.licenceClass || uData.license || "Rookie";
      let licColor = "#10b981"; 
      if (licence.toLowerCase() === "pro") licColor = "#ef4444"; 
      if (licence.toLowerCase() === "challenger") licColor = "#f59e0b"; 

      const driver = {
        name: `${data.firstName || uData.firstName || ""} ${data.lastName || uData.lastName || ""}`.trim() || "Pilote",
        number: Number(data.raceNumber) || 0,
        licence: licence,
        licColor: licColor,
        mRating: uData.eloRating ?? 1000,
        safety: uData.licensePoints ?? 8
      };

      if (!teamsMap.has(teamName)) teamsMap.set(teamName, []);
      teamsMap.get(teamName).push(driver);
    });

    // 2. Création des liens d'alliance bidirectionnels
    const alliancesMap = new Map();
    configSnap.forEach(c => {
      const teamA = c.id.trim();
      const data = c.data();
      if (data.sisterTeams && Array.isArray(data.sisterTeams)) {
        data.sisterTeams.forEach(teamB => {
          const tB = teamB.trim();
          if (!alliancesMap.has(teamA)) alliancesMap.set(teamA, new Set());
          alliancesMap.get(teamA).add(tB);
          
          if (!alliancesMap.has(tB)) alliancesMap.set(tB, new Set());
          alliancesMap.get(tB).add(teamA);
        });
      }
    });

    const sortedTeams = Array.from(teamsMap.keys()).sort();

    if (sortedTeams.length === 0) {
      targetArea.innerHTML = `<p class="muted-note" style="text-align:center; padding: 2rem; background: rgba(15,23,42,0.6); border-radius: 8px;">Aucune équipe enregistrée pour le moment.</p>`;
      return;
    }

    let html = `<div style="display: flex; flex-direction: column; gap: 1.5rem;">`;

    sortedTeams.forEach(teamName => {
      const drivers = teamsMap.get(teamName);
      drivers.sort((a, b) => b.mRating - a.mRating); // Tri par M-Rating interne

      const avgRating = Math.round(drivers.reduce((acc, d) => acc + d.mRating, 0) / drivers.length);

      // 3. Construction du badge d'alliance
      let alliancesHtml = "";
      if (alliancesMap.has(teamName) && alliancesMap.get(teamName).size > 0) {
        // On ne liste que les équipes sœurs qui participent réellement (présentes dans teamsMap)
        const sisters = Array.from(alliancesMap.get(teamName))
          .filter(t => teamsMap.has(t))
          .map(t => `<span style="color: #fde68a; font-weight: 600;">${escapeHtml(t)}</span>`)
          .sort()
          .join('<span style="color:#475569; margin: 0 4px;">•</span>');

        if (sisters.length > 0) {
          alliancesHtml = `
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.5px; line-height: 1;">🤝 Alliance</span>
              <div style="font-size: 0.8rem;">${sisters}</div>
            </div>
          `;
        }
      }

      html += `
        <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; transition: all 0.2s ease; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" onmouseover="this.style.borderColor='rgba(56,189,248,0.4)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.4)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.1)'">
          
          <!-- En-tête de l'équipe -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding: 1.2rem 1.5rem; background: linear-gradient(90deg, rgba(255,255,255,0.03), transparent); border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 15px;">
              <div style="width: 42px; height: 42px; border-radius: 8px; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;">🛡️</div>
              <div style="display: flex; flex-direction: column; justify-content: center;">
                <h4 style="margin: 0; color: #f8fafc; font-size: 1.3rem; font-weight: 700; letter-spacing: 0.5px; line-height: 1.2;">${escapeHtml(teamName)}</h4>
                ${alliancesHtml}
              </div>
            </div>
            
            <div style="display: flex; gap: 10px; align-items: center;">
              <span style="font-size: 0.85rem; color: #94a3b8; background: rgba(0,0,0,0.3); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">📈 Moyenne M-Rating : <strong style="color: #38bdf8; font-size: 0.95rem;">${avgRating}</strong></span>
              <span style="font-size: 0.85rem; color: #cbd5e1; background: rgba(0,0,0,0.3); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">👥 <strong>${drivers.length} / 3</strong> Pilote(s)</span>
            </div>
          </div>

          <!-- Liste des pilotes -->
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; min-width: 600px;">
              <tbody>
      `;

      drivers.forEach((d, i) => {
        const isLast = i === drivers.length - 1;
        const borderBottom = !isLast ? 'border-bottom: 1px solid rgba(255,255,255,0.03);' : '';
        
        html += `
                <tr style="${borderBottom} transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                  <td style="padding: 12px 1.5rem; width: 80px;">
                    <span style="font-size: 1.15rem; font-weight: 900; color: var(--accent-primary);">#${d.number}</span>
                  </td>
                  <td style="padding: 12px 1rem; font-weight: 600; color: #e2e8f0; font-size: 1.05rem;">
                    ${escapeHtml(d.name)}
                  </td>
                  <td style="padding: 12px 1rem; width: 140px;">
                    <span style="font-size: 0.7rem; padding: 4px 10px; border-radius: 6px; border: 1px solid ${d.licColor}; color: ${d.licColor}; text-transform: uppercase; font-weight: bold; background: rgba(0,0,0,0.2);">
                      ${escapeHtml(d.licence)}
                    </span>
                  </td>
                  <td style="padding: 12px 1rem; text-align: right; width: 140px; font-size: 0.95rem; color: #94a3b8;">
                    M-Rating: <strong style="color: #38bdf8;">${d.mRating}</strong>
                  </td>
                  <td style="padding: 12px 1.5rem; text-align: right; width: 140px; font-size: 0.95rem; color: #94a3b8;">
                    M-Safety: <strong style="color: #34d399;">${d.safety}</strong>
                  </td>
                </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    targetArea.innerHTML = html;

  } catch (err) {
    console.error("Erreur chargement équipes :", err);
    targetArea.innerHTML = "<p class='impact-bad'>Erreur lors du chargement de la liste des équipes.</p>";
  }
}

/* ======================== VOTES DES CIRCUITS (MANCHES 2 & 5) ======================== */
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
    const hasVoted = !!(userVotes.round2 && userVotes.round5);

    host.innerHTML = `
      <div class="course-box">
        <div id="voteSuccessBanner" style="display: ${hasVoted ? 'flex' : 'none'}; align-items: center; gap: 10px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; padding: 12px 15px; border-radius: 8px; margin-bottom: 1.5rem; color: #10b981; font-weight: bold; transition: all 0.3s ease;">
          <span style="font-size: 1.2rem;">✅</span> 
          <span>Vos votes actuels sont bien enregistrés et pris en compte dans les statistiques !</span>
        </div>

        <p class="muted-note" style="margin-bottom: 1.5rem;">
          Votez pour vos tracés préférés pour les manches 2 et 5. Les pourcentages s'actualisent en direct avec les votes des autres pilotes.
        </p>

        <!-- DUEL MANCHE 2 -->
        <div style="margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border-primary);">
          <h4 style="color: var(--accent-primary); margin-bottom: 0.5rem;">Manche 2 (20/10/2026)</h4>
          <p class="muted-note" style="margin-bottom: 1rem;">Choisissez votre tracé japonais :</p>
          
          <div class="vote-options" style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <label id="label-Fuji" style="flex: 1; min-width: 220px; padding: 16px; border-radius: 10px; cursor: pointer; border: 1px solid ${userVotes.round2 === 'Fuji' ? '#10b981' : 'rgba(255,255,255,0.1)'}; background: ${userVotes.round2 === 'Fuji' ? 'rgba(16, 185, 129, 0.05)' : 'transparent'}; transition: all 0.2s ease;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <input type="radio" name="vote_round_2" value="Fuji" ${userVotes.round2 === 'Fuji' ? 'checked' : ''} style="width: auto; margin: 0; flex-shrink: 0; transform: scale(1.2); accent-color: #10b981;">
                <span class="fi fi-jp" style="font-size: 1.2rem;"></span>
                <strong style="font-size: 1.1rem; color: #fff;">Fuji Speedway</strong>
              </div>
              <div style="height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
                <div id="bar-Fuji" style="width: 0%; height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8); transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);"></div>
              </div>
              <div id="count-Fuji" style="text-align: right; font-size: 0.85rem; margin-top: 6px; color: #94a3b8; font-weight: 600;">Chargement...</div>
            </label>

            <label id="label-Okayama" style="flex: 1; min-width: 220px; padding: 16px; border-radius: 10px; cursor: pointer; border: 1px solid ${userVotes.round2 === 'Okayama' ? '#10b981' : 'rgba(255,255,255,0.1)'}; background: ${userVotes.round2 === 'Okayama' ? 'rgba(16, 185, 129, 0.05)' : 'transparent'}; transition: all 0.2s ease;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <input type="radio" name="vote_round_2" value="Okayama" ${userVotes.round2 === 'Okayama' ? 'checked' : ''} style="width: auto; margin: 0; flex-shrink: 0; transform: scale(1.2); accent-color: #10b981;">
                <span class="fi fi-jp" style="font-size: 1.2rem;"></span>
                <strong style="font-size: 1.1rem; color: #fff;">Okayama</strong>
              </div>
              <div style="height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
                <div id="bar-Okayama" style="width: 0%; height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8); transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);"></div>
              </div>
              <div id="count-Okayama" style="text-align: right; font-size: 0.85rem; margin-top: 6px; color: #94a3b8; font-weight: 600;">Chargement...</div>
            </label>
          </div>
        </div>

        <!-- DUEL MANCHE 5 -->
        <div style="margin-bottom: 2rem;">
          <h4 style="color: var(--accent-primary); margin-bottom: 0.5rem;">Manche 5 (19/01/2027)</h4>
          <p class="muted-note" style="margin-bottom: 1rem;">Choisissez votre tracé américain :</p>
          
          <div class="vote-options" style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <label id="label-RA" style="flex: 1; min-width: 220px; padding: 16px; border-radius: 10px; cursor: pointer; border: 1px solid ${userVotes.round5 === 'Road America' ? '#10b981' : 'rgba(255,255,255,0.1)'}; background: ${userVotes.round5 === 'Road America' ? 'rgba(16, 185, 129, 0.05)' : 'transparent'}; transition: all 0.2s ease;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <input type="radio" name="vote_round_5" value="Road America" ${userVotes.round5 === 'Road America' ? 'checked' : ''} style="width: auto; margin: 0; flex-shrink: 0; transform: scale(1.2); accent-color: #10b981;">
                <span class="fi fi-us" style="font-size: 1.2rem;"></span>
                <strong style="font-size: 1.1rem; color: #fff;">Road America</strong>
              </div>
              <div style="height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
                <div id="bar-RA" style="width: 0%; height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8); transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);"></div>
              </div>
              <div id="count-RA" style="text-align: right; font-size: 0.85rem; margin-top: 6px; color: #94a3b8; font-weight: 600;">Chargement...</div>
            </label>

            <label id="label-Mont" style="flex: 1; min-width: 220px; padding: 16px; border-radius: 10px; cursor: pointer; border: 1px solid ${userVotes.round5 === 'Montréal' ? '#10b981' : 'rgba(255,255,255,0.1)'}; background: ${userVotes.round5 === 'Montréal' ? 'rgba(16, 185, 129, 0.05)' : 'transparent'}; transition: all 0.2s ease;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <input type="radio" name="vote_round_5" value="Montréal" ${userVotes.round5 === 'Montréal' ? 'checked' : ''} style="width: auto; margin: 0; flex-shrink: 0; transform: scale(1.2); accent-color: #10b981;">
                <span class="fi fi-ca" style="font-size: 1.2rem;"></span>
                <strong style="font-size: 1.1rem; color: #fff;">Circuit Gilles Villeneuve</strong>
              </div>
              <div style="height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
                <div id="bar-Mont" style="width: 0%; height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8); transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);"></div>
              </div>
              <div id="count-Mont" style="text-align: right; font-size: 0.85rem; margin-top: 6px; color: #94a3b8; font-weight: 600;">Chargement...</div>
            </label>
          </div>
        </div>

        <div class="vote-actions" style="text-align: right; margin-top: 2rem;">
          <button id="btnSaveCircuitVotes" class="btn-validate" style="padding: 12px 24px; font-size: 1.05rem; transition: all 0.3s ease;">
            ${hasVoted ? '💾 Mettre à jour mes votes' : '💾 Enregistrer mes votes'}
          </button>
        </div>
      </div>
    `;

    // Met à jour visuellement les bordures/fonds lors du changement de radio
    const radios = host.querySelectorAll('input[type="radio"]');
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.name === 'vote_round_2') {
          const isFuji = radio.value === 'Fuji';
          $("label-Fuji").style.borderColor = isFuji ? '#10b981' : 'rgba(255,255,255,0.1)';
          $("label-Fuji").style.background = isFuji ? 'rgba(16, 185, 129, 0.05)' : 'transparent';
          $("label-Okayama").style.borderColor = !isFuji ? '#10b981' : 'rgba(255,255,255,0.1)';
          $("label-Okayama").style.background = !isFuji ? 'rgba(16, 185, 129, 0.05)' : 'transparent';
        }
        if (radio.name === 'vote_round_5') {
          const isRA = radio.value === 'Road America';
          $("label-RA").style.borderColor = isRA ? '#10b981' : 'rgba(255,255,255,0.1)';
          $("label-RA").style.background = isRA ? 'rgba(16, 185, 129, 0.05)' : 'transparent';
          $("label-Mont").style.borderColor = !isRA ? '#10b981' : 'rgba(255,255,255,0.1)';
          $("label-Mont").style.background = !isRA ? 'rgba(16, 185, 129, 0.05)' : 'transparent';
        }
      });
    });

    // Écouteur en temps réel pour actualiser les barres de progression
    onSnapshot(collection(db, "estacup_s10_circuit_votes"), (snapshot) => {
      let votesFuji = 0, votesOkayama = 0, votesRA = 0, votesMont = 0;
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        if (d.round2 === 'Fuji') votesFuji++;
        if (d.round2 === 'Okayama') votesOkayama++;
        if (d.round5 === 'Road America') votesRA++;
        if (d.round5 === 'Montréal') votesMont++;
      });
      
      const totalR2 = votesFuji + votesOkayama;
      const totalR5 = votesRA + votesMont;

      const updateStatUI = (id, votes, total) => {
        const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
        const bar = $(`bar-${id}`);
        const countStr = $(`count-${id}`);
        if(bar) bar.style.width = `${pct}%`;
        if(countStr) countStr.innerHTML = `<span style="color: #fff;">${votes}</span> vote${votes > 1 ? 's' : ''} (${pct}%)`;
      };

      setTimeout(() => {
        updateStatUI('Fuji', votesFuji, totalR2);
        updateStatUI('Okayama', votesOkayama, totalR2);
        updateStatUI('RA', votesRA, totalR5);
        updateStatUI('Mont', votesMont, totalR5);
      }, 100);
    });

    $("btnSaveCircuitVotes").onclick = async () => {
      const r2 = document.querySelector('input[name="vote_round_2"]:checked')?.value || null;
      const r5 = document.querySelector('input[name="vote_round_5"]:checked')?.value || null;

      if (!r2 || !r5) {
        if (window.showToast) window.showToast("⚠️ Veuillez faire un choix pour chaque manche avant de valider.", "warning");
        return;
      }

      const btn = $("btnSaveCircuitVotes");
      const originalText = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = "Enregistrement en cours...";

        await setDoc(doc(db, "estacup_s10_circuit_votes", currentUid), {
          round2: r2,
          round5: r5,
          userName: $("fullName")?.textContent || "Pilote",
          updatedAt: new Date()
        }, { merge: true });

        const banner = $("voteSuccessBanner");
        if (banner) {
          banner.style.display = "flex";
          banner.innerHTML = `<span style="font-size: 1.2rem;">✅</span> <span>Nouveaux votes enregistrés avec succès !</span>`;
          banner.style.transform = "scale(1.02)";
          setTimeout(() => banner.style.transform = "scale(1)", 200);
        }

        btn.textContent = "✅ VOTES ENREGISTRÉS !";
        btn.style.background = "#10b981";
        btn.style.borderColor = "#059669";
        
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = "💾 Mettre à jour mes votes";
          btn.style.background = ""; 
          btn.style.borderColor = "";
        }, 3000);

      } catch (err) {
        console.error("Erreur enregistrement vote:", err);
        if (window.showToast) window.showToast("❌ Erreur lors de l'enregistrement du vote.", "error");
        btn.disabled = false;
        btn.textContent = originalText;
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
    const docRef = doc(db, "estacup_s10_signups", currentUid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().isValidated !== true) {
      host.innerHTML = `
        <div class="course-box" style="border-color: #f59e0b; background: rgba(245, 158, 11, 0.05);">
          <h4 style="color: #f59e0b; margin-bottom: 10px;">⚠️ Inscription requise</h4>
          <p>Vous devez être inscrit et votre inscription doit être validée par le staff pour pouvoir gérer votre livrée.</p>
        </div>`;
      return;
    }

    const data = docSnap.data();
    const liveryChoice = data.liveryChoice || "personnelle";
    const isImplemented = data.liveryImplemented === true;

    // 1. Si le pilote a choisi "neutre" ou "licence" (pas besoin de déposer de fichier)
    if (liveryChoice === "neutre" || liveryChoice === "licence") {
      host.innerHTML = `
        <div class="course-box" style="border-color: var(--accent-success); background: rgba(16, 185, 129, 0.05); text-align: center; padding: 2.5rem;">
          <h4 style="color: var(--accent-success); margin-bottom: 10px;">🛡️ Aucune action requise</h4>
          <p style="font-size: 1.05rem; color: var(--text-primary); max-width: 600px; margin: 0 auto;">
            Lors de votre inscription, vous avez choisi de rouler avec une <strong>livrée officielle / neutre</strong> de l'ESTACUP. Votre véhicule sera configuré automatiquement par l'organisation.
          </p>
        </div>`;
      return;
    }

    // 2. Si le pilote a choisi une livrée PERSONNELLE
    const oneDriveLink = "https://estaca-my.sharepoint.com/:f:/g/personal/meka_estaca_eu/IgCF2GbO4jLTTpORWbPSETEVAcRha7yQfBo-45BFVAUlZEU?e=hJ4aAa";

    host.innerHTML = `
      <div class="course-box">
        
        <!-- RÈGLES DE NOMMAGE -->
        <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 2rem; border-radius: 0 8px 8px 0;">
          <h4 style="color: #f59e0b; margin-top: 0; margin-bottom: 8px;">⚠️ TRÈS IMPORTANT : Format du fichier</h4>
          <p style="margin: 0; font-size: 0.95rem; color: #cbd5e1; line-height: 1.6;">
            Regroupez tous vos fichiers dans un seul fichier <strong>.ZIP</strong> (Max 25 Mo). Le nom de votre fichier doit <strong>obligatoirement</strong> respecter ce format :<br>
            <code style="display: inline-block; margin-top: 8px; margin-bottom: 4px; font-size: 1.1rem; color: #38bdf8; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 6px; border: 1px solid #334155;">### - NOM_Prénom.zip</code><br>
            <em style="font-size: 0.85rem; color: #94a3b8;">(Où ### est votre numéro de course. Exemple : <strong>96 - TOMCZYK_Marin.zip</strong>)</em>
          </p>
        </div>

        <!-- RÈGLEMENT DES LIVRÉES -->
        <div style="margin-bottom: 2.5rem; background: rgba(15, 23, 42, 0.4); padding: 20px; border-radius: 10px; border: 1px solid var(--border-primary);">
          <h4 style="color: var(--accent-primary); margin-top: 0; margin-bottom: 10px;">Livrées semi-personnalisables MEKA</h4>
          <p style="color: #cbd5e1; font-size: 0.95rem; margin-bottom: 20px;">
            MEKA met à disposition des livrées semi-personnalisables pour les pilotes ne souhaitant ou ne pouvant pas créer les leurs. Le modèle est unique, seules les couleurs sont libres, et seront à renseigner au moment de l’inscription.
          </p>

          <h4 style="color: var(--accent-primary); margin-bottom: 10px;">Règles pour les livrées personnalisées</h4>
          <p style="color: #cbd5e1; font-size: 0.95rem; margin-bottom: 10px;">L’utilisation de livrées personnalisées est acceptée et même encouragée. Néanmoins, les règles suivantes sont à respecter :</p>
          <ul style="color: #94a3b8; font-size: 0.9rem; list-style-type: disc; padding-left: 1.5rem; margin-bottom: 0; line-height: 1.6;">
            <li style="margin-bottom: 8px;"><strong style="color: #e2e8f0;">Respect du règlement Twitch :</strong> Pas de contenus pornographiques, racistes, injurieux, xénophobes, etc.</li>
            <li style="margin-bottom: 8px;"><strong style="color: #e2e8f0;">Plaques de numéros (Art. 2.5.1) :</strong> Les plaques de numéros seront ajoutées par le CO. Nous vous demandons de ne pas rajouter vos plaques personnalisées sur votre livrée ou dans votre dossier. <em>Pour cette année, ce ne seront pas des packs DCP mais juste les numéros en eux-mêmes. La livrée DCP ne doit pas contenir de logos et avoir un espace vide afin d'accueillir ce logo sans qu'il y ait des sponsors ou décos dérangeantes sur cet emplacement.</em></li>
            <li style="margin-bottom: 8px;"><strong style="color: #e2e8f0;">Pare-soleil (Art. 2.5.2) :</strong> Utilisation du bandeau de pare-soleil fourni par le CO.</li>
            <li style="margin-bottom: 8px;"><strong style="color: #e2e8f0;">Délai limite :</strong> Toute livrée non-rendue avant le <strong>samedi précédent la course à 23h59</strong> ne sera pas intégrée au Skin Pack de la course à venir.</li>
            <li><strong style="color: #e2e8f0;">Validation :</strong> Le CO se réserve le droit de refuser une livrée pour des raisons non-citées ci-dessus, avec justification auprès du pilote.</li>
          </ul>
        </div>

        <!-- BOUTON ONEDRIVE -->
        <div style="display: flex; flex-direction: column; gap: 15px; background: rgba(15,23,42,0.6); padding: 20px; border-radius: 10px; border: 1px dashed var(--border-secondary); text-align: center; margin-bottom: 2rem;">
          <h4 style="color: var(--accent-primary); margin-bottom: 0;">Dépôt OneDrive</h4>
          <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 15px;">Cliquez sur le bouton pour ouvrir le dossier partagé et y glisser/déposer votre fichier .ZIP.</p>
          
          <a href="${oneDriveLink}" target="_blank" style="text-decoration: none;">
            <button class="btn-validate" style="width: auto; padding: 12px 24px; font-size: 1.1rem;">
              📁 Accéder au dossier OneDrive
            </button>
          </a>
        </div>

        <!-- ZONE DE CONFIRMATION / CASE À COCHER -->
        <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid ${isImplemented ? 'var(--accent-success)' : 'var(--border-primary)'}; padding: 20px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; transition: border-color 0.3s ease;">
          <div>
            <h5 style="margin: 0 0 5px 0; color: #fff; font-size: 1.1rem;">Confirmation de dépôt</h5>
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">Cochez cette case une fois que votre fichier .zip est correctement mis en ligne sur le OneDrive.</p>
          </div>
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin: 0; background: rgba(255,255,255,0.05); padding: 10px 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); transition: background 0.2s ease;">
            <input type="checkbox" id="chkLiveryDone" ${isImplemented ? 'checked' : ''} style="width: 20px; height: 20px; margin: 0; cursor: pointer; accent-color: #10b981;">
            <span style="font-weight: 600; color: ${isImplemented ? 'var(--accent-success)' : '#fff'};">J'ai déposé ma livrée</span>
          </label>
        </div>
      </div>
    `;

    // Écouteur pour enregistrer l'état dans Firebase instantanément
    const checkbox = $("chkLiveryDone");
    if (checkbox) {
      checkbox.addEventListener("change", async (e) => {
        const checked = e.target.checked;
        try {
          await updateDoc(docRef, { liveryImplemented: checked });
          if (window.showToast) {
            window.showToast(checked ? "✅ Livrée marquée comme déposée !" : "🔄 Statut mis à jour.", "success");
          }
          renderLiverySection(); // Actualise l'encadré
        } catch (err) {
          console.error("Erreur mise à jour livrée:", err);
          if (window.showToast) window.showToast("❌ Erreur lors de l'enregistrement.", "error");
        }
      });
    }

  } catch (e) {
    console.error("Erreur chargement section livrée:", e);
    host.innerHTML = `<div class="course-box"><p class="impact-bad">Impossible de charger la page.</p></div>`;
  }
}

/* ======================== RÉCLAMATIONS ======================== */

// 1. Écouteur pour l'envoi du formulaire
const btnSubmitReclam = document.getElementById("submitReclam");
if (btnSubmitReclam) {
  btnSubmitReclam.addEventListener("click", async () => {
    const rDate = document.getElementById("reclamDate").value;
    const rSplit = document.getElementById("reclamSplit").value;
    const rDesc = document.getElementById("reclamDesc").value.trim();
    const rVideo = document.getElementById("reclamVideo").value.trim();

    // Vérification des champs
    if (!rDate || !rSplit || !rDesc || !rVideo) {
      if (window.showToast) window.showToast("⚠️ Veuillez remplir tous les champs obligatoires.", "warning");
      return;
    }

    // Vérification basique du lien YouTube
    if (!rVideo.includes("youtube.com") && !rVideo.includes("youtu.be")) {
      if (window.showToast) window.showToast("⚠️ Le lien vidéo doit être une URL YouTube valide.", "warning");
      return;
    }

    btnSubmitReclam.disabled = true;
    btnSubmitReclam.textContent = "Envoi en cours...";

    try {
      // Ajout dans la collection Firebase
      await addDoc(collection(db, "estacup_s10_reclamations"), {
        uid: currentUid,
        piloteName: document.getElementById("fullName")?.textContent || "Pilote inconnu",
        dateCourse: rDate,
        split: rSplit,
        description: rDesc,
        videoUrl: rVideo,
        status: "en attente", // Statut par défaut
        isTreated: false,
        createdAt: new Date()
      });

      if (window.showToast) window.showToast("✅ Réclamation envoyée avec succès !", "success");
      
      // Réinitialisation du formulaire
      document.getElementById("reclamDate").value = "";
      document.getElementById("reclamSplit").value = "";
      document.getElementById("reclamDesc").value = "";
      document.getElementById("reclamVideo").value = "";

      // Rechargement immédiat de l'historique
      if (typeof loadReclamHistory === "function") loadReclamHistory();

    } catch (error) {
      console.error("Erreur lors de l'envoi de la réclamation:", error);
      if (window.showToast) window.showToast("❌ Erreur lors de l'envoi.", "error");
    } finally {
      btnSubmitReclam.disabled = false;
      btnSubmitReclam.textContent = "📨 Envoyer la réclamation";
    }
  });
}

// 2. Affichage de l'historique personnel du pilote
window.loadReclamHistory = async function() {
  const container = document.getElementById("reclamHistory");
  if (!container || !currentUid) return;

  container.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Chargement de vos réclamations...</div>`;

  try {
    // On ne récupère que les réclamations de l'utilisateur connecté
    const q = query(collection(db, "estacup_s10_reclamations"), where("uid", "==", currentUid));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `<p class="muted-note">Vous n'avez soumis aucune réclamation.</p>`;
      return;
    }

    const reclamations = [];
    snap.forEach(doc => reclamations.push({ id: doc.id, ...doc.data() }));
    
    // Tri par date de création (les plus récentes en haut)
    reclamations.sort((a, b) => b.createdAt - a.createdAt);

    let html = `<h4 style="color: var(--accent-primary); margin-top: 2rem; margin-bottom: 1rem;">Vos réclamations envoyées</h4><div style="display: flex; flex-direction: column; gap: 1rem;">`;

    reclamations.forEach(r => {
      const isTreated = r.status === "traité" || r.isTreated;
      const statusColor = isTreated ? "#10b981" : "#f59e0b";
      const statusText = isTreated ? "Traitée" : "En attente";
      const dCourse = new Date(r.dateCourse).toLocaleDateString("fr-FR");

      html += `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-left: 4px solid ${statusColor}; border-radius: 8px; padding: 15px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <strong style="color: #fff; font-size: 1.05rem;">Course du ${dCourse} (Split ${r.split})</strong>
            <span style="background: ${isTreated ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; color: ${statusColor}; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; border: 1px solid ${statusColor};">${statusText}</span>
          </div>
          <p style="margin: 0 0 10px 0; color: #cbd5e1; font-size: 0.95rem;">${escapeHtml(r.description)}</p>
          <a href="${escapeHtml(r.videoUrl)}" target="_blank" style="color: #38bdf8; font-size: 0.85rem; text-decoration: underline;">📺 Voir la vidéo fournie</a>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

  } catch (error) {
    console.error("Erreur chargement historique réclamations:", error);
    container.innerHTML = `<p class="impact-bad">Erreur lors du chargement de l'historique.</p>`;
  }
};

/* ======================== GLOBE 3D & CALENDRIER ======================== */
let globeInitialized = false;

// Ce tableau sert de fallback, mais les données principales sont maintenant dans la fonction
const circuitsSaison10 = [
  { round: "PROLOGUE", name: "Silverstone", country: "Royaume-Uni", flag: "gb", date: "22/09/2026", lat: 52.0786, lng: -1.0169, status: "confirm" },
  { round: "Manche 1", name: "Brno", country: "République Tchèque", flag: "cz", date: "06/10/2026", lat: 49.2019, lng: 16.5456, status: "confirm" },
  { round: "Manche 2 (Vote)", name: "Fuji / Okayama", country: "Japon", flag: "jp", date: "20/10/2026", lat: 35.0, lng: 136.0, status: "vote" },
  { round: "Manche 3", name: "Valence", country: "Espagne", flag: "es", date: "24/11/2026", lat: 39.4851, lng: -0.6277, status: "confirm" },
  { round: "Manche 4", name: "Sydney", country: "Australie", flag: "au", date: "08/12/2026", lat: -33.8038, lng: 150.8679, status: "confirm" },
  { round: "Manche 5 (Vote)", name: "Road America / Montréal", country: "USA / Canada", flag: "us", date: "19/01/2027", lat: 44.5, lng: -80.0, status: "vote" },
  { round: "Manche 6", name: "Interlagos", country: "Brésil", flag: "br", date: "02/02/2027", lat: -23.7011, lng: -46.6966, status: "confirm" }
];

function init3DGlobe() {
  // Remplacé par le design World Tour Grid moderne
}

/* ======================== LIVE SERVER STATUS ======================== */
function listenServerStatus() {
  const box = $("srvBox");
  const title = $("srvTitle");
  const roundEl = $("srvRound");
  const sess = $("srvSession");
  const track = $("srvTrack");
  const pwd = $("srvPwd");
  const btn = $("btnJoinServer");
  const liveBtnContainer = $("btnLiveTiming");
  
  if (!box || !title) return;

  onSnapshot(doc(db, "config", "server_s10"), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      roundEl.textContent = data.round || "—";
      sess.textContent = data.session || "—";
      track.textContent = data.track || "—";
      
      // Gestion de l'affichage et du lien du Live Timing
      if (data.liveUrl && data.liveUrl.trim() !== "") {
        liveBtnContainer.href = data.liveUrl;
        liveBtnContainer.style.display = "inline-block";
      } else {
        liveBtnContainer.style.display = "none";
      }
      
      if (data.isOpen) {
        box.style.borderColor = "#34d399";
        box.style.background = "rgba(16, 185, 129, 0.05)";
        title.innerHTML = `Statut du Serveur : <span style="color: #34d399;">🟢 OUVERT</span>`;
        
        // NOUVEAU CODE : Bouton copier
        const pass = data.password || "Aucun";
        pwd.innerHTML = `<span>${pass}</span> <span style="cursor:pointer; font-size:1.1rem; margin-left:8px;" title="Copier le mot de passe" onclick="navigator.clipboard.writeText('${pass}').then(()=>window.showToast('✅ Mot de passe copié !', 'success'))">📋</span>`;
        
        pwd.style.color = "#34d399";
        
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.textContent = "🚀 Rejoindre via Content Manager";
        // Utilisation de window.open pour ouvrir dans un nouvel onglet sans quitter le site
        btn.onclick = () => window.open("https://acstuff.ru/s/q:race/online/join?httpPort=18078&ip=157.90.3.32", "_blank");
      } else {
        box.style.borderColor = "#f59e0b";
        box.style.background = "rgba(245, 158, 11, 0.05)";
        title.innerHTML = `Statut du Serveur : <span style="color: #f59e0b;">🔴 FERMÉ</span>`;
        pwd.textContent = "***";
        pwd.style.color = "#f87171";
        
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.textContent = "🚀 Serveur fermé";
        btn.onclick = null;
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", listenServerStatus);

/* ======================== CLASSEMENT PILOTES ======================== */
window.activeRankTab = window.activeRankTab || "general";
window.switchRankTab = function(tab) {
  window.activeRankTab = tab;
  if(typeof loadEstacupPilotStandings === "function") loadEstacupPilotStandings();
};

async function loadEstacupPilotStandings() {
  const container = $("estacupPilotStandings");
  if (!container) return;
  container.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Calcul du classement...</div>`;

  const useJoker = $("jokerTogglePilots")?.checked || false;

  try {
    // 1. Récupérer les pilotes validés ET leurs licences (via la collection users)
    const [signupsSnap, usersSnap] = await Promise.all([
      getDocs(query(collection(db, "estacup_s10_signups"), where("isValidated", "==", true))),
      getDocs(collection(db, "users"))
    ]);

    const usersMap = new Map();
    usersSnap.forEach(u => usersMap.set(u.id, u.data()));

    const pilots = new Map();
    signupsSnap.forEach(d => {
      const data = d.data();
      const uid = data.uid || d.id;
      const uData = usersMap.get(uid) || {};
      
      const licence = (uData.licenseClass || uData.licenceClass || uData.license || "Rookie").trim();
      let licColor = "#10b981"; // Rookie
      if (licence.toLowerCase() === "pro") licColor = "#ef4444"; 
      if (licence.toLowerCase() === "challenger") licColor = "#f59e0b"; 

      pilots.set(uid, {
        uid: uid,
        name: `${data.firstName} ${data.lastName}`.trim(),
        lastName: data.lastName || "",
        team: data.teamName || "Indépendant",
        number: data.raceNumber || "—",
        licence: licence,
        licColor: licColor,
        scores: {}, 
        totalPoints: 0,
        droppedRound: null
      });
    });

    // 2. Récupérer les résultats de course (hors prologue)
    const coursesSnap = await getDocs(query(collection(db, "courses"), where("estacup", "==", true)));
    const races = [];
    coursesSnap.forEach(d => {
      const c = d.data();
      if (c.name && c.name.toLowerCase().includes("prologue")) return; 
      races.push({ id: d.id, ...c });
    });

    // 3. Déterminer les manches ayant été courues
    const roundsSet = new Set();
    races.forEach(r => {
      let rName = r.round || "Inconnu";
      if (r.name.toLowerCase().includes("manche 1")) rName = "Manche 1";
      else if (r.name.toLowerCase().includes("manche 2")) rName = "Manche 2";
      else if (r.name.toLowerCase().includes("manche 3")) rName = "Manche 3";
      else if (r.name.toLowerCase().includes("manche 4")) rName = "Manche 4";
      else if (r.name.toLowerCase().includes("manche 5")) rName = "Manche 5";
      else if (r.name.toLowerCase().includes("manche 6")) rName = "Manche 6";
      r.cleanRound = rName;
      roundsSet.add(rName);
    });

    const standardRounds = ["Manche 1", "Manche 2", "Manche 3", "Manche 4", "Manche 5", "Manche 6"];

    // 4. Assigner les points
    races.forEach(r => {
      if (Array.isArray(r.participants)) {
        r.participants.forEach(p => {
          if (pilots.has(p.uid)) {
            const pilot = pilots.get(p.uid);
            const pts = Number(p.points) || 0;
            pilot.scores[r.cleanRound] = (pilot.scores[r.cleanRound] || 0) + pts;
          }
        });
      }
    });

    // 5. Calcul des totaux et gestion du Joker
    const pilotList = Array.from(pilots.values());
    let hasAnyRaces = roundsSet.size > 0;

    pilotList.forEach(p => {
      let total = 0;
      let minScore = Infinity;
      let minRound = null;

      standardRounds.forEach(rnd => {
        const pts = p.scores[rnd] || 0;
        total += pts;
        
        if (roundsSet.has(rnd)) {
          if (pts < minScore) {
            minScore = pts;
            minRound = rnd;
          }
        }
      });

      if (useJoker && minRound !== null && minScore !== Infinity) {
        total -= minScore;
        p.droppedRound = minRound;
      }
      p.totalPoints = total;
    });

    // 6. Tri et répartition des listes
    if (!hasAnyRaces) {
      pilotList.sort((a, b) => a.lastName.localeCompare(b.lastName));
    } else {
      pilotList.sort((a, b) => b.totalPoints - a.totalPoints || a.lastName.localeCompare(b.lastName));
    }

    const listGeneral = pilotList;
    const listChallenger = pilotList.filter(p => p.licence.toLowerCase() === "challenger");
    const listRookie = pilotList.filter(p => p.licence.toLowerCase() === "rookie");

    // 7. Fonction de génération du tableau HTML
    const generateTable = (list) => {
      let html = `
        <div style="overflow-x: auto; background: rgba(15,23,42,0.6); border-radius: 10px; border: 1px solid var(--border-primary); margin-top: 1rem;">
          <table class="table-standings" style="width: 100%; min-width: 800px; margin: 0; border: none;">
            <thead>
              <tr>
                <th style="width: 50px;">Pos</th>
                <th>Pilote</th>
                <th>Licence</th>
                <th>Équipe</th>
                <th style="text-align: center;">N°</th>
      `;
      
      standardRounds.forEach(rnd => {
        let shortRnd = rnd.replace("Manche ", "M");
        html += `<th style="text-align: center; width: 60px;">${escapeHtml(shortRnd)}</th>`;
      });

      html += `
                <th style="text-align: right; width: 80px; color: #38bdf8; font-size: 1.05rem;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
      `;

      if (list.length === 0) {
        html += `<tr><td colspan="${5 + standardRounds.length + 1}" style="text-align:center; padding: 2rem; color: var(--text-muted);">Aucun pilote dans cette catégorie.</td></tr>`;
      } else {
        list.forEach((p, idx) => {
          const pos = hasAnyRaces ? (idx + 1) : "-";
          html += `
            <tr style="transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
              <td style="font-size: 1.1rem; color: var(--text-primary);"><strong>${pos}</strong></td>
              <td style="font-size: 1.05rem; font-weight: 700;">${escapeHtml(p.name)}</td>
              <td><span style="font-size: 0.7rem; padding: 3px 8px; border-radius: 6px; border: 1px solid ${p.licColor}; color: ${p.licColor}; text-transform: uppercase; font-weight: bold;">${escapeHtml(p.licence)}</span></td>
              <td style="color: var(--text-secondary); font-size: 0.9rem;">${escapeHtml(p.team)}</td>
              <td style="text-align: center; font-weight: bold; color: var(--accent-primary);">#${p.number}</td>
          `;

          standardRounds.forEach(rnd => {
            const pts = p.scores[rnd] || 0;
            let displayPts = roundsSet.has(rnd) ? pts : "-";
            
            if (useJoker && p.droppedRound === rnd) {
              displayPts = `<span style="color: #f87171; text-decoration: line-through; font-weight: bold;" title="Résultat Joker (Retiré)">${pts}</span>`;
            } else if (roundsSet.has(rnd)) {
              displayPts = `<span style="color: #cbd5e1; font-weight: 500;">${pts}</span>`;
            }

            html += `<td style="text-align: center;">${displayPts}</td>`;
          });

          html += `
              <td style="text-align: right; font-weight: 900; font-size: 1.2rem; color: #38bdf8;">${p.totalPoints}</td>
            </tr>
          `;
        });
      }

      html += `</tbody></table></div>`;
      return html;
    };

    // 8. Rendu de l'interface (Onglets + Tableau sélectionné)
    const activeTab = window.activeRankTab;

    let finalHtml = `
      <div style="display: flex; gap: 0.8rem; margin-bottom: 1rem; flex-wrap: wrap;">
        <button onclick="window.switchRankTab('general')" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid ${activeTab === 'general' ? '#38bdf8' : 'rgba(255,255,255,0.1)'}; background: ${activeTab === 'general' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(15,23,42,0.6)'}; color: ${activeTab === 'general' ? '#38bdf8' : '#e2e8f0'}; cursor: pointer; font-weight: 600; transition: all 0.2s;">Global</button>
        
        <button onclick="window.switchRankTab('challenger')" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid ${activeTab === 'challenger' ? '#f59e0b' : 'rgba(255,255,255,0.1)'}; background: ${activeTab === 'challenger' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(15,23,42,0.6)'}; color: ${activeTab === 'challenger' ? '#f59e0b' : '#e2e8f0'}; cursor: pointer; font-weight: 600; transition: all 0.2s;">Catégorie Challenger</button>
        
        <button onclick="window.switchRankTab('rookie')" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid ${activeTab === 'rookie' ? '#10b981' : 'rgba(255,255,255,0.1)'}; background: ${activeTab === 'rookie' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15,23,42,0.6)'}; color: ${activeTab === 'rookie' ? '#10b981' : '#e2e8f0'}; cursor: pointer; font-weight: 600; transition: all 0.2s;">Catégorie Rookie</button>
      </div>
    `;

    if (activeTab === "general") finalHtml += generateTable(listGeneral);
    if (activeTab === "challenger") finalHtml += generateTable(listChallenger);
    if (activeTab === "rookie") finalHtml += generateTable(listRookie);

    container.innerHTML = finalHtml;

  } catch (err) {
    console.error("Erreur loadEstacupPilotStandings:", err);
    container.innerHTML = `<p class="impact-bad">Erreur lors du chargement du classement.</p>`;
  }
}
window.loadEstacupPilotStandings = loadEstacupPilotStandings;

/* ======================== CLASSEMENT ÉQUIPES ======================== */
async function loadEstacupTeamStandings() {
  const container = $("estacupTeamStandings");
  if (!container) return;
  container.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Calcul du classement par équipes...</div>`;

  const useJoker = $("jokerToggleTeams")?.checked || false;

  try {
    const signupsSnap = await getDocs(query(collection(db, "estacup_s10_signups"), where("isValidated", "==", true)));
    const teamMap = new Map();

    signupsSnap.forEach(d => {
      const data = d.data();
      const teamName = (data.teamName || "").trim();
      if (!teamName || teamName.toLowerCase() === "indépendant" || teamName.toLowerCase() === "sans équipe") return;

      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, { name: teamName, scores: {}, totalPoints: 0, droppedRound: null, pilots: new Set() });
      }
      teamMap.get(teamName).pilots.add(data.uid || d.id);
    });

    const coursesSnap = await getDocs(query(collection(db, "courses"), where("estacup", "==", true)));
    const roundsSet = new Set();
    const roundResults = {}; 

    coursesSnap.forEach(d => {
      const c = d.data();
      if (c.name && c.name.toLowerCase().includes("prologue")) return;

      let rName = c.round || "Inconnu";
      if (c.name.toLowerCase().includes("manche 1")) rName = "Manche 1";
      else if (c.name.toLowerCase().includes("manche 2")) rName = "Manche 2";
      else if (c.name.toLowerCase().includes("manche 3")) rName = "Manche 3";
      else if (c.name.toLowerCase().includes("manche 4")) rName = "Manche 4";
      else if (c.name.toLowerCase().includes("manche 5")) rName = "Manche 5";
      else if (c.name.toLowerCase().includes("manche 6")) rName = "Manche 6";
      roundsSet.add(rName);

      if (!roundResults[rName]) roundResults[rName] = {};

      if (Array.isArray(c.participants)) {
        c.participants.forEach(p => {
          roundResults[rName][p.uid] = (roundResults[rName][p.uid] || 0) + (Number(p.points) || 0);
        });
      }
    });

    const standardRounds = ["Manche 1", "Manche 2", "Manche 3", "Manche 4", "Manche 5", "Manche 6"];
    const teamList = Array.from(teamMap.values());

    teamList.forEach(t => {
      standardRounds.forEach(rnd => {
        if (!roundResults[rnd]) {
          t.scores[rnd] = 0;
          return;
        }
        const pilotPts = [];
        t.pilots.forEach(uid => {
          if (roundResults[rnd][uid]) pilotPts.push(roundResults[rnd][uid]);
        });
        pilotPts.sort((a,b) => b-a);
        
        // Seuls les 2 meilleurs résultats par manche comptent pour l'équipe
        const pts = (pilotPts[0] || 0) + (pilotPts[1] || 0);
        t.scores[rnd] = pts;
      });
    });

    let hasAnyRaces = roundsSet.size > 0;

    teamList.forEach(t => {
      let total = 0;
      let minScore = Infinity;
      let minRound = null;

      standardRounds.forEach(rnd => {
        const pts = t.scores[rnd] || 0;
        total += pts;
        
        if (roundsSet.has(rnd)) {
          if (pts < minScore) {
            minScore = pts;
            minRound = rnd;
          }
        }
      });

      if (useJoker && minRound !== null && minScore !== Infinity) {
        total -= minScore;
        t.droppedRound = minRound;
      }
      t.totalPoints = total;
    });

    if (!hasAnyRaces) {
      teamList.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      teamList.sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
    }

    let html = `
      <div style="overflow-x: auto; background: rgba(15,23,42,0.6); border-radius: 10px; border: 1px solid var(--border-primary); margin-top: 1rem;">
        <table class="table-standings" style="width: 100%; min-width: 800px; margin: 0; border: none;">
          <thead>
            <tr>
              <th style="width: 50px;">Pos</th>
              <th>Équipe</th>
    `;
    
    standardRounds.forEach(rnd => {
      let shortRnd = rnd.replace("Manche ", "M");
      html += `<th style="text-align: center; width: 60px;">${escapeHtml(shortRnd)}</th>`;
    });

    html += `
              <th style="text-align: right; width: 80px; color: #fde68a; font-size: 1.05rem;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (teamList.length === 0) {
      html += `<tr><td colspan="${2 + standardRounds.length + 1}" style="text-align:center; padding: 2rem; color: var(--text-muted);">Aucune équipe enregistrée pour le moment.</td></tr>`;
    } else {
      teamList.forEach((t, idx) => {
        const pos = hasAnyRaces ? (idx + 1) : "-";
        html += `
          <tr style="transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
            <td style="font-size: 1.1rem; color: var(--text-primary);"><strong>${pos}</strong></td>
            <td style="font-size: 1.05rem; font-weight: 700;">${escapeHtml(t.name)}</td>
        `;

        standardRounds.forEach(rnd => {
          const pts = t.scores[rnd] || 0;
          let displayPts = roundsSet.has(rnd) ? pts : "-";
          
          if (useJoker && t.droppedRound === rnd) {
            displayPts = `<span style="color: #f87171; text-decoration: line-through; font-weight: bold;" title="Résultat Joker (Retiré)">${pts}</span>`;
          } else if (roundsSet.has(rnd)) {
            displayPts = `<span style="color: #cbd5e1; font-weight: 500;">${pts}</span>`;
          }

          html += `<td style="text-align: center;">${displayPts}</td>`;
        });

        html += `
            <td style="text-align: right; font-weight: 900; font-size: 1.2rem; color: #fde68a;">${t.totalPoints}</td>
          </tr>
        `;
      });
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;

  } catch (err) {
    console.error("Erreur loadEstacupTeamStandings:", err);
    container.innerHTML = `<p class="impact-bad">Erreur lors du chargement du classement par équipe.</p>`;
  }
}
window.loadEstacupTeamStandings = loadEstacupTeamStandings;

/* ======================== OUTIL DE COMPARAISON PILOTES ======================== */
async function setupCompareTool() {
  const container = $("compareSelectContainer");
  if (!container) return;

  try {
    const signupsSnap = await getDocs(query(collection(db, "estacup_s10_signups"), where("isValidated", "==", true)));
    const pilots = [];
    
    signupsSnap.forEach(d => {
      if (d.id !== currentUid) {
        pilots.push({ uid: d.id, name: `${d.data().firstName} ${d.data().lastName}` });
      }
    });

    pilots.sort((a,b) => a.name.localeCompare(b.name));

    // Création des cases à cocher stylisées
    container.innerHTML = pilots.map(p => `
      <label class="compare-pilot-option">
        <input type="checkbox" value="${p.uid}" data-name="${escapeHtml(p.name)}" class="compare-chk">
        <span>${escapeHtml(p.name)}</span>
      </label>
    `).join("");

    // Écouteur sur chaque case à cocher
    container.querySelectorAll(".compare-chk").forEach(chk => {
      chk.addEventListener("change", renderCompareTable);
    });
  } catch (e) {
    console.error("Erreur setupCompareTool:", e);
  }
}

async function renderCompareTable() {
  const container = $("compareSelectContainer");
  const resultsDiv = $("compareResults");
  if (!container || !resultsDiv) return;

  // Récupérer uniquement les cases qui sont cochées
  const checkedBoxes = Array.from(container.querySelectorAll(".compare-chk:checked"));
  
  if (checkedBoxes.length === 0) {
    resultsDiv.innerHTML = "";
    return;
  }

  resultsDiv.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Calcul en cours...</div>`;

  const uidsToCompare = [currentUid, ...checkedBoxes.map(chk => chk.value)];
  const names = ["Moi", ...checkedBoxes.map(chk => chk.getAttribute("data-name"))];

  try {
    const statsArray = await Promise.all(uidsToCompare.map(uid => computePilotStats(uid)));
    
    const usersData = await Promise.all(uidsToCompare.map(async uid => {
       const snap = await getDoc(doc(db, "users", uid));
       return snap.exists() ? snap.data() : {};
    }));

    statsArray.forEach((s, i) => {
       s.eloRating = usersData[i].eloRating ?? 1000;
       s.licensePoints = usersData[i].licensePoints ?? 8;
    });

    let html = `<div style="overflow-x:auto; margin-top: 15px;">
      <table class="reglement-table compare-table" style="width:100%; border: 1px solid var(--border-primary);">
        <thead>
          <tr>
            <th style="background: rgba(15,23,42,0.8);">Statistique</th>
            ${names.map((n, i) => `<th class="${i===0 ? 'compare-self' : ''}" style="text-align:center;">${escapeHtml(n)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>`;

    const rowsToBuild = [
      { label: "📈 M-Rating", key: "eloRating", higherIsBetter: true },
      { label: "🛡️ M-Safety", key: "licensePoints", higherIsBetter: true },
      { label: "🏁 Départs", key: "starts", higherIsBetter: true },
      { label: "🏆 Victoires", key: "wins", higherIsBetter: true },
      { label: "🍾 Podiums (Top 3)", key: "top3", higherIsBetter: true },
      { label: "⭐ Top 5", key: "top5", higherIsBetter: true },
      { label: "👍 Top 10", key: "top10", higherIsBetter: true },
      { label: "🥇 Meilleur résultat", key: "bestPos", higherIsBetter: false, format: v => v ? `${v}ᵉ` : "-" },
      { label: "📊 Position moyenne", key: "avgPos", higherIsBetter: false, format: v => v ? `${v.toFixed(1)}ᵉ` : "-" }
    ];

    rowsToBuild.forEach(row => {
      html += `<tr><td style="font-weight:600; color:var(--text-secondary);">${row.label}</td>`;

      let validVals = statsArray.map(s => s[row.key]).filter(v => v !== null && v !== undefined && !isNaN(v));
      let bestVal = null, worstVal = null;
      if (validVals.length > 1) {
          bestVal = row.higherIsBetter ? Math.max(...validVals) : Math.min(...validVals);
          worstVal = row.higherIsBetter ? Math.min(...validVals) : Math.max(...validVals);
      }

      statsArray.forEach((stats, i) => {
         let val = stats[row.key];
         let displayVal = row.format ? row.format(val) : (val !== null ? val : "0");
         let cssClass = (i === 0) ? "compare-self " : "";

         if (val !== null && validVals.length > 1 && bestVal !== worstVal) {
             if (val === bestVal) cssClass += "compare-best";
             else if (val === worstVal) cssClass += "compare-worst";
         }

         html += `<td class="${cssClass.trim()}" style="text-align:center;">${displayVal}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    resultsDiv.innerHTML = html;

  } catch (e) {
    console.error("Erreur comparateur:", e);
    resultsDiv.innerHTML = `<p class="impact-bad">Erreur lors de la comparaison.</p>`;
  }
}

/* ======================== SYSTÈME DE NOTIFICATIONS ======================== */

window.dismissedAlerts = window.dismissedAlerts || new Set();

// État centralisé des alertes pour gérer la hiérarchie
window.appAlerts = {
  inscription: null,
  livree: null,
  votecircuit: null,
  presence: null,
  adminValidation: null,
  adminReclamations: null // Nouvelle clé pour les réclamations Admin
};

// Affiche un Toast pop-up
function showPersistentAlert(message, alertId, type = "warning") {
  if (window.dismissedAlerts.has(alertId)) return;
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  if (document.getElementById("alert-" + alertId)) return;

  const toast = document.createElement("div");
  toast.id = "alert-" + alertId;
  toast.className = `toast toast-${type}`;
  toast.style.position = "relative";
  toast.style.paddingRight = "40px"; 

  toast.innerHTML = `
    <span style="display: block; padding-right: 10px; line-height: 1.4;">${message}</span>
    <button onclick="
      window.dismissedAlerts.add('${alertId}');
      this.parentElement.classList.add('fade-out');
      setTimeout(() => this.parentElement.remove(), 300);
    " style="
      position: absolute; top: 8px; right: 10px;
      background: none; border: none; color: var(--text-muted);
      font-size: 1.5rem; cursor: pointer; padding: 0;
      line-height: 1; box-shadow: none; transition: color 0.2s;
    " onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--text-muted)'">&times;</button>
  `;
  container.appendChild(toast);
}

// Met à jour l'état, redessine tous les badges et nettoie les pop-ups résolus
function setAlertState(key, type, message, alertId) {
  window.appAlerts[key] = type;
  
  if (type && message && alertId) {
    let toastType = 'warning';
    if (type === 'red') toastType = 'error';
    if (type === 'admin') toastType = 'admin'; // Utilise le style violet pour les admins
    
    showPersistentAlert(message, alertId, toastType);
  } else if (!type && alertId) {
    const existingToast = document.getElementById("alert-" + alertId);
    if (existingToast) {
      existingToast.classList.add('fade-out');
      setTimeout(() => existingToast.remove(), 300);
    }
  }
  
  renderAllBadges();
}

// Applique visuellement les bordures (enfants) et les puces (parents)
function renderAllBadges() {
  const applyDot = (selector, hasAlert) => {
    const btns = document.querySelectorAll(selector);
    btns.forEach(btn => {
      let dot = btn.querySelector('.notify-dot-parent');
      if (hasAlert) {
        if (!dot) {
          btn.classList.add('btn-has-notification');
          btn.style.position = "relative"; 
          dot = document.createElement('span');
          dot.className = 'notify-dot-parent';
          btn.appendChild(dot);
        }
      } else {
        if (dot) dot.remove();
        btn.classList.remove('btn-has-notification');
      }
    });
  };

  const applyAlert = (selector, type) => {
    const btns = document.querySelectorAll(selector);
    btns.forEach(btn => {
      btn.classList.remove('btn-notify-red', 'btn-notify-orange');
      if (type) btn.classList.add(`btn-notify-${type}`);
    });
    applyDot(selector, type != null);
  };

  // 1. Boutons de sous-catégories
  applyAlert('button[data-sub="inscription"]', window.appAlerts.inscription);
  applyAlert('button[data-sub="livree"]', window.appAlerts.livree);
  applyAlert('button[data-sub="votecircuit"]', window.appAlerts.votecircuit);
  applyAlert('button[data-sub="presence"], button[data-sub="presences"]', window.appAlerts.presence);

  // 2. Boutons parents de navigation Pilote
  const adminAlert = window.appAlerts.inscription || window.appAlerts.presence;
  const paddockAlert = window.appAlerts.livree;
  const pisteAlert = window.appAlerts.votecircuit;

  applyDot('button[data-cat="admin"]', adminAlert);
  applyDot('button[data-cat="paddock"]', paddockAlert);
  applyDot('button[data-cat="piste"]', pisteAlert);
  applyDot('button[data-section="championship"]', adminAlert || paddockAlert || pisteAlert);

  // 3. Bouton Espace Admin (S'allume si Validation OU Réclamation en attente)
  applyDot('#goToAdmin', window.appAlerts.adminValidation || window.appAlerts.adminReclamations);
}

// --- 3. Logique d'analyse Firebase en temps réel ---
async function initNotifications(uid, isAdmin) {
  let currentUserIsValidated = false;
  let userVotesData = null;
  let userPresenceData = null;

  const racesList = [
    { id: "prologue", dateObj: new Date("2026-09-22T20:00:00") },
    { id: "manche1", dateObj: new Date("2026-10-06T20:00:00") },
    { id: "manche2", dateObj: new Date("2026-10-20T20:00:00") },
    { id: "manche3", dateObj: new Date("2026-11-24T20:00:00") },
    { id: "manche4", dateObj: new Date("2026-12-08T20:00:00") },
    { id: "manche5", dateObj: new Date("2027-01-19T20:00:00") },
    { id: "manche6", dateObj: new Date("2027-02-02T20:00:00") }
  ];
  const nextRace = racesList.find(r => r.dateObj >= new Date());

  const evaluateSecondaryAlerts = () => {
    if (isAdmin && window.adminViewActive) {
      setAlertState('votecircuit', null, null, "user-votes");
      setAlertState('presence', null, null, "user-presence");
      return;
    }

    if (!currentUserIsValidated) {
      setAlertState('votecircuit', null, null, "user-votes");
      setAlertState('presence', null, null, "user-presence");
      return;
    }

    if (!userVotesData || !userVotesData.round3 || !userVotesData.round5) {
      setAlertState('votecircuit', 'orange', "🗳️ <strong>Votes :</strong> Votre avis compte ! Choisissez les circuits des manches 3 et 5.", "user-votes");
    } else {
      setAlertState('votecircuit', null, null, "user-votes");
    }

    if (nextRace) {
      const diffDays = (nextRace.dateObj - new Date()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7 && !userPresenceData) {
        setAlertState('presence', 'red', `📅 <strong>Course imminente :</strong> Pensez à indiquer votre présence pour la course à venir !`, "user-presence");
      } else {
        setAlertState('presence', null, null, "user-presence");
      }
    }
  };

  // A. Écoute globale : Inscriptions & Livrées
  onSnapshot(collection(db, "estacup_s10_signups"), (snap) => {
    let pendingAdminValidation = 0;
    let isUserSignedUp = false;
    currentUserIsValidated = false;
    let userLiveryDone = false;
    let userLiveryChoice = "personnelle";

    snap.forEach(d => {
      const data = d.data();
      if (!data.isValidated) pendingAdminValidation++;
      
      if (d.id === uid) {
        isUserSignedUp = true;
        currentUserIsValidated = data.isValidated === true;
        userLiveryDone = data.liveryImplemented === true;
        userLiveryChoice = data.liveryChoice || "personnelle";
      }
    });

    // 🔴 NOTIFICATIONS ADMIN : VALIDATION DES INSCRIPTIONS
    if (isAdmin) {
      if (pendingAdminValidation > 0) {
        setAlertState('adminValidation', 'admin', `🛡️ <strong>Espace Admin :</strong> Il y a ${pendingAdminValidation} inscription(s) en attente.`, "admin-val-popup");
      } else {
        setAlertState('adminValidation', null, null, "admin-val-popup");
      }
    }

    // 🟢 NOTIFICATIONS PILOTE
    if (isAdmin && window.adminViewActive) {
      setAlertState('inscription', null, null, "user-signup");
      setAlertState('livree', null, null, "user-livery");
    } else {
      if (!isUserSignedUp) {
        setAlertState('inscription', 'red', "⚠️ <strong>Inscription requise :</strong> Remplissez votre formulaire d'engagement à l'ESTACUP !", "user-signup");
        setAlertState('livree', null, null, "user-livery");
      } else if (!currentUserIsValidated) {
        setAlertState('inscription', 'orange', null, "user-signup");
        setAlertState('livree', null, null, "user-livery");
      } else {
        setAlertState('inscription', null, null, "user-signup");
        
        if (userLiveryChoice === "personnelle" && !userLiveryDone) {
          setAlertState('livree', 'orange', "🎨 <strong>Livrée :</strong> N'oubliez pas de déposer votre fichier .zip sur le OneDrive !", "user-livery");
        } else {
          setAlertState('livree', null, null, "user-livery");
        }
      }
    }

    evaluateSecondaryAlerts();
  });

  // B. Écoute locale : Votes Circuits
  onSnapshot(doc(db, "estacup_s10_circuit_votes", uid), (docSnap) => {
    userVotesData = docSnap.exists() ? docSnap.data() : null;
    evaluateSecondaryAlerts();
  });

  // C. Écoute locale : Présence Course
  if (nextRace) {
    onSnapshot(doc(db, `attendances_${nextRace.id}`, uid), (docSnap) => {
      userPresenceData = docSnap.exists() ? docSnap.data() : null;
      evaluateSecondaryAlerts();
    });
  }

  // D. 🔴 NOTIFICATIONS ADMIN : RÉCLAMATIONS
  if (isAdmin) {
    onSnapshot(collection(db, "estacup_s10_reclamations"), (snap) => {
      let pendingReclamations = 0;
      snap.forEach(d => {
        const data = d.data();
        // On vérifie que la réclamation n'a pas été traitée
        if (data.status !== "traité" && data.status !== "resolved" && !data.isTreated) {
          pendingReclamations++;
        }
      });

      if (pendingReclamations > 0) {
        setAlertState('adminReclamations', 'admin', `⚖️ <strong>Espace Admin :</strong> Il y a ${pendingReclamations} réclamation(s) en attente.`, "admin-reclam-popup");
      } else {
        setAlertState('adminReclamations', null, null, "admin-reclam-popup");
      }
    });
  }
}
