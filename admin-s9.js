// admin-s9.js — Import JSON, pénalités (groupes), drag & drop inter-groupes — ARCHIVES SAISON 9
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  doc,
  deleteDoc,
  addDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------- Firebase ---------------- */
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

/* ---------------- State ---------------- */
let ranking = [];
let selectedPilots = [];
let courseMap = new Map();
const selectedUIDs = new Set();
const pilotLiByUid = new Map();

/* ---------------- Utils ---------------- */
const $ = (id) => document.getElementById(id);
const stripAccents = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normLower = s => stripAccents(s).toLowerCase().trim();
const buildKey = (lastName, firstName) => `${normLower(lastName)} ${normLower(firstName)}`.trim();
const escapeHtml = s => (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const firstInt = str => { const m = String(str || "").match(/-?\d+/); return m ? parseInt(m[0], 10) : NaN; };

function formatMs(ms) {
  if (!Number.isFinite(ms) && ms !== 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  const ms3 = String(ms % 1000).padStart(3, "0");
  return (h > 0 ? `${h}:${mm}:${ss}.${ms3}` : `${m}:${ss}.${ms3}`);
}

function toDateVal(v) {
  if (!v) return null;
  if (v?.seconds && typeof v.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v?.toDate === "function") { try { return v.toDate(); } catch {} }
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function parseTimeLooseToMs(v, cap=6*60*60*1000) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const suf = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i);
  if (suf) {
    const num = parseFloat(suf[1]);
    const ms = !suf[2] || suf[2].toLowerCase()==="s" ? Math.round(num*1000) : Math.round(num);
    return Math.min(ms, cap);
  }
  if (s.includes(":")) {
    const parts = s.replace(",", ".").split(":").map(x=>x.trim());
    const last = parseFloat(parts.pop());
    if (Number.isNaN(last)) return null;
    let mult = 1000, ms = Math.round(last*1000);
    while(parts.length){
      const n = parseInt(parts.pop(),10);
      if(Number.isNaN(n)) return null;
      ms += n*mult*60*1000;
      mult*=60;
    }
    return Math.min(ms, cap);
  }
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(s);
  if (iso) {
    const h=Number(iso[1]||0), m=Number(iso[2]||0), sec=Number(iso[3]||0);
    return Math.min(Math.round(((h*60+m)*60+sec)*1000), cap);
  }
  const f = parseFloat(s.replace(",", "."));
  if (Number.isFinite(f)) {
    const ms = f>10000 ? Math.round(f) : Math.round(f*1000);
    return Math.min(ms, cap);
  }
  return null;
}

/* ---------------- Import wizard state ---------------- */
const ImportState = {
  isEstacup: true,
  roundText: "",
  circuit: "",
  date: null,
  splitCount: 1,
  files: { sprintS1: null, mainS1: null, sprintS2: null, mainS2: null },
  parsed: { S1: { sprint: [], main: [] }, S2: { sprint: [], main: [] } },
  lapData: {},                 
  nameMap: new Map(),
  unmatched: [],
  usersCache: []
};

/* ---------------- Bootstrap S9 ---------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "login.html");
  
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || snap.data().admin !== true) {
      document.body.innerHTML = "<p>Accès refusé</p>"; return;
    }
    
    // Forçage de l'affichage du menu admin global S9
    const adminOnlyEl = document.getElementById("adminOnly");
    if (adminOnlyEl) {
      adminOnlyEl.classList.remove("hidden");
      adminOnlyEl.style.display = "block"; 
    }
    
    const adminNameEl = document.getElementById("adminName");
    if (adminNameEl) adminNameEl.textContent = snap.data().firstName || "";

    ensureDriversRoomButton();
    ensureRedLogoutButton();
    setupNavigation();
    setupPilotsSection();

    // Lancement asynchrone sécurisé pièce par pièce
    try { await loadPilots(); } catch (e) { console.error("Erreur S9 loadPilots:", e); }
    try { await loadCourses(); } catch (e) { console.error("Erreur S9 loadCourses:", e); }
    try { await loadIncidentHistory(); } catch (e) { console.error("Erreur S9 loadIncidentHistory:", e); }
    try { await loadEstacupSignups(); } catch (e) { console.error("Erreur S9 loadEstacupSignups:", e); }
    try { await loadReclamations(); } catch (e) { console.error("Erreur S9 loadReclamations:", e); }
    
    setupResultsUI();
    
  } catch (globalErr) {
    console.error("Erreur de bootstrap d'administration S9 :", globalErr);
  }
});

/* ---------------- UI helpers ---------------- */
function ensureDriversRoomButton() {
  document.getElementById("goToDashboard")?.remove();
  const menu = document.querySelector(".admin-menu");
  if (!menu || document.getElementById("backToDriversRoom")) return;
  const btn = document.createElement("button");
  btn.id = "backToDriversRoom"; btn.type = "button"; btn.textContent = "Archives Saison 9";
  btn.addEventListener("click", () => (window.location.href = "estacup-s9.html"));
  menu.appendChild(btn);
}

function ensureRedLogoutButton() {
  const btn = document.getElementById("logout"); if (!btn) return;
  Object.assign(btn.style, { backgroundColor: "#e53935", borderColor: "#e53935", color: "#fff", fontWeight: "600", padding: "8px 12px", borderRadius: "10px" });
  btn.addEventListener("click", () => signOut(auth).then(() => (window.location.href = "login.html")));
}

function setupNavigation() {
  const buttons = document.querySelectorAll(".admin-menu button[data-section]");
  const sections = document.querySelectorAll(".admin-section");
  function showSection(key) {
    sections.forEach((s) => s.classList.add("hidden"));
    document.getElementById(`section-${key}`)?.classList.remove("hidden");
    if (key === "incidents") { loadReclamations?.(); loadIncidentHistory?.(); loadCourses?.(); loadPilots?.(); }
    if (key === "estacup") loadEstacupSignups?.();
    if (key === "courses") loadCourses?.();
    if (key === "votes")   loadVotesResults?.();
  }
  buttons.forEach((btn) => btn.addEventListener("click", () => showSection(btn.dataset.section)));
  showSection("results");
}

function setupResultsUI() {
  const isEstacupSel = $("isEstacup");
  const roundWrap = $("roundWrap");
  const raceNameWrap = $("raceNameWrap");
  const splitCountWrap = $("splitCountWrap");
  if(isEstacupSel) isEstacupSel.value = "yes";
  if(roundWrap) roundWrap.style.display = "block";
  if(raceNameWrap) raceNameWrap.style.display = "none";

  isEstacupSel?.addEventListener("change", () => {
    const yes = isEstacupSel.value === "yes";
    if(splitCountWrap) splitCountWrap.style.display = $("modeJson")?.checked ? "block" : "none";
    if(roundWrap) roundWrap.style.display = yes ? "block" : "none";
    if(raceNameWrap) raceNameWrap.style.display = yes ? "none" : "block";
  });

  const manualBox = $("manualBox");
  const jsonBox = $("jsonImportBox");
  const modeRadios = document.querySelectorAll('input[name="inputMode"]');
  modeRadios.forEach(r =>
    r.addEventListener("change", () => {
      const mode = document.querySelector('input[name="inputMode"]:checked').value;
      if(manualBox) manualBox.style.display = (mode === "manual") ? "block" : "none";
      if(jsonBox) jsonBox.style.display = (mode === "json") ? "block" : "none";
      if($("splitCountWrap")) $("splitCountWrap").style.display = (mode === "json") ? "block" : "none";
    })
  );

  $("fileSprintS1")?.addEventListener("change", e => ImportState.files.sprintS1 = e.target.files?.[0] || null);
  $("fileMainS1")?.addEventListener("change", e => ImportState.files.mainS1 = e.target.files?.[0] || null);
  $("analyzeJson")?.addEventListener("click", handleAnalyzeJson);
  $("applyMatching")?.addEventListener("click", applyMatchingSelections);
  $("submitJsonResults")?.addEventListener("click", saveImportedResults);

  $("modeManual")?.dispatchEvent(new Event("change"));
}

function renderRanking() {
  const ol = document.getElementById("rankingList"); if (!ol) return;
  ol.innerHTML = "";
  ranking.forEach((p, idx) => {
    const li = document.createElement("li");
    li.textContent = `${idx + 1}. ${p.name}`;
    ol.appendChild(li);
  });
  updatePilotListSelections();
}
function removeFromRanking(uid) {
  const idx = ranking.findIndex(r => r.uid === uid);
  if (idx !== -1) { ranking.splice(idx, 1); selectedUIDs.delete(uid); renderRanking(); }
}

function computeEloUpdates(rankingArr, ratingsMap, K = 32) {
  const N = rankingArr.length;
  if (N < 2) return Object.fromEntries(rankingArr.map(p => [p.uid, ratingsMap[p.uid] ?? 1000]));
  const pos = Object.fromEntries(rankingArr.map((p, i) => [p.uid, p.position ?? (i + 1)]));
  const K_eff = K / (N - 1);
  const delta = Object.fromEntries(rankingArr.map(p => [p.uid, 0]));
  for (let i = 0; i < N; i++) {
    const ui = rankingArr[i].uid, Ri = ratingsMap[ui] ?? 1000;
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const uj = rankingArr[j].uid, Rj = ratingsMap[uj] ?? 1000;
      const Sij = pos[ui] < pos[uj] ? 1 : (pos[ui] > pos[uj] ? 0 : 0.5);
      const Eij = 1 / (1 + Math.pow(10, (Rj - Ri) / 400));
      delta[ui] += K_eff * (Sij - Eij);
    }
  }
  const CLAMP = 9999;
  const out = {};
  rankingArr.forEach(p => {
    const base = ratingsMap[p.uid] ?? 1000;
    const d = Math.max(-CLAMP, Math.min(CLAMP, delta[p.uid]));
    out[p.uid] = Math.round(base + d);
  });
  return out;
}

document.getElementById("addIncidentPilot")?.addEventListener("click", async () => {
  const select = document.getElementById("incidentPilotSelect");
  const uid = select?.value; if (!uid) return;
  const snap = await getDoc(doc(db, "users", uid)); if (!snap.exists()) return;
  const d = snap.data(); const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || uid;
  const before = d.licensePoints ?? 10; const after = before - 1;
  selectedPilots.push({ uid, name, before, after }); updateIncidentList();
});

function updateIncidentList() {
  const list = document.getElementById("incidentList"); if (!list) return;
  list.innerHTML = "";
  selectedPilots.forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${p.name}</strong> — Avant : ${p.before} → <input type="number" value="${p.after}" data-i="${i}" style="width:100px;text-align:center;" /> pts <button type="button" class="remove" data-i="${i}">✖</button>`;
    list.appendChild(li);
  });
}

document.getElementById("submitIncident")?.addEventListener("click", async () => {
  const description = document.getElementById("incidentDescription")?.value.trim();
  if (!description || selectedPilots.length === 0) return;
  const payload = { date: new Date(), description, pilotes: selectedPilots.map(p => ({ uid: p.uid, name: p.name, before: p.before, after: p.after })) };
  await addDoc(collection(db, "incidents"), payload);
  for (const p of selectedPilots) { await updateDoc(doc(db, "users", p.uid), { licensePoints: p.after }); }
  selectedPilots = []; updateIncidentList();
  if($("incidentDescription")) $("incidentDescription").value = "";
  alert("Incident enregistré.");
});

async function loadPilots() {
  const pilotList = document.getElementById("pilotList");
  const select = document.getElementById("incidentPilotSelect");
  const snap = await getDocs(collection(db, "users"));

  if (pilotList) pilotList.innerHTML = "";
  if (select) select.innerHTML = '<option value="">-- Sélectionner un pilote --</option>';

  pilotLiByUid.clear(); ImportState.usersCache = [];
  const users = snap.docs.map(docu => {
    const d = docu.data();
    return { id: docu.id, firstName: d.firstName || "", lastName: d.lastName || "", name: `${d.firstName || ""} ${d.lastName || ""}`.trim(), _k: buildKey(d.lastName, d.firstName) };
  }).sort((a,b)=> a.name.localeCompare(b.name));

  for (const u of users) {
    ImportState.usersCache.push(u);
    if (pilotList) {
      const li = document.createElement("li"); li.textContent = u.name;
      li.addEventListener("click", () => {
        if (selectedUIDs.has(u.id)) return;
        ranking.push({ uid: u.id, name: u.name }); selectedUIDs.add(u.id); renderRanking();
      });
      pilotList.appendChild(li);
      pilotLiByUid.set(u.id, { li });
    }
    if (select) {
      const opt = document.createElement("option"); opt.value = u.id; opt.textContent = u.name; select.appendChild(opt);
    }
  }
}

function updatePilotListSelections() {
  pilotLiByUid.forEach(({ li }, uid) => {
    const isSelected = selectedUIDs.has(uid);
    li.style.opacity = isSelected ? "0.6" : "1";
    li.style.fontWeight = isSelected ? "bold" : "normal";
  });
}

function setupPilotsSection() {}

function smartSplitName(full) {
  const s = String(full || "").trim().replace(/\s+/g, " ");
  const t = s.split(" ");
  return t.length === 2 ? { firstName: t[0], lastName: t[1] } : { firstName: "", lastName: s };
}

function extractResultsGeneric(json) {
  if (!json) return [];
  const rows = [];
  const list = json.Result || json.Results || json.LeaderboardLines || [];
  list.forEach((it, index) => {
    const rawName = it.DriverName || it.Name || (it.Driver && it.Driver.Name) || "";
    const { firstName, lastName } = smartSplitName(rawName);
    rows.push({ driverName: rawName, firstName, lastName, team: it.TeamName || it.Team || "", carBrand: it.CarModel || it.Car || "", bestLapMs: it.BestLap || it.BestLapTime || 0, totalMs: it.TotalTime || 0, basePenaltyMs: 0, editPenaltyMs: 0, laps: it.Laps || 0, positionHint: it.Position || (index + 1) });
  });
  recomputePositions(rows);
  return rows;
}

function renderPreviewTables() {
  const block = $("previewBlock"); const root = $("resultsPreview"); if (!block || !root) return;
  const titleBase = buildBaseName();
  let html = "";
  
  const makeTable = (title, rows) => {
    if (!rows || !rows.length) return "";
    let h = `<div class="course-box"><h4>${escapeHtml(title)}</h4><table class="race-table"><thead><tr><th>#</th><th>Nom</th><th>Points</th></tr></thead><tbody>`;
    rows.forEach(r => {
      const pts = getDefaultPoints(title.includes("Sprint"), 1, r.position);
      h += `<tr><td>${r.position}</td><td>${escapeHtml(r.lastName)}</td><td><input class="points-input" type="number" value="${pts}" style="width:70px;"></td></tr>`;
    });
    return h + `</tbody></table></div>`;
  };

  if (ImportState.parsed.S1.sprint.length) html += makeTable(`${titleBase} • Sprint S1`, ImportState.parsed.S1.sprint);
  if (ImportState.parsed.S1.main.length) html += makeTable(`${titleBase} • Principale S1`, ImportState.parsed.S1.main);
  root.innerHTML = html; block.style.display = "block";
}

async function handleAnalyzeJson() {
  ImportState.isEstacup = $("isEstacup")?.value === "yes";
  ImportState.roundText = $("estcRoundText")?.value?.trim() || "";
  ImportState.circuit = $("raceCircuit")?.value?.trim() || "";
  ImportState.date = $("raceDate")?.valueAsDate || new Date();

  const jSprintS1 = await readFileAsJson(ImportState.files.sprintS1).catch(() => null);
  const jMainS1 = await readFileAsJson(ImportState.files.mainS1).catch(() => null);
  
  ImportState.parsed.S1 = { sprint: extractResultsGeneric(jSprintS1), main: extractResultsGeneric(jMainS1) };
  renderPreviewTables();
}

async function saveImportedResults() {
  const baseName = buildBaseName(); const raceDate = $("raceDate")?.valueAsDate || new Date();
  if (!baseName) return;
  const races = [];
  if (ImportState.parsed.S1.sprint.length) races.push({ key: "S1_sprint", label: "Sprint S1", rows: ImportState.parsed.S1.sprint });
  if (ImportState.parsed.S1.main.length) races.push({ key: "S1_main", label: "Principale S1", rows: ImportState.parsed.S1.main });

  for (const race of races) {
    const withUid = [];
    for (const r of race.rows) {
      const match = ImportState.usersCache.find(u => normLower(u.lastName) === normLower(r.lastName));
      if (match) withUid.push({ uid: match.id, name: match.name, position: r.position, team: r.team, car: r.carBrand, bestLapMs: r.bestLapMs, totalMs: r.totalMs, penaltyMs: 0, laps: r.laps, points: getDefaultPoints(race.key.includes("sprint"), 1, r.position) });
    }
    const raceId = `${Date.now()}_${race.key}`;
    for (const p of withUid) {
      // 🟢 SAISON 9 ARCHIVES : Écrit bien dans la collection d'origine de l'an dernier ("raceHistory")
      await setDoc(doc(db, "users", p.uid, "raceHistory", raceId), { name: `${baseName} • ${race.label}`, date: raceDate, position: p.position, team: p.team || null, car: p.car || null, bestLapMs: p.bestLapMs, totalMs: p.totalMs, penaltyMs: 0, laps: p.laps, status: "OK", points: p.points, track: ImportState.circuit || null, split: 1, isSprint: race.key.includes("sprint"), estacup: ImportState.isEstacup });
    }
    await setDoc(doc(db, "courses", raceId), { id: raceId, name: `${baseName} • ${race.label}`, date: raceDate, estacup: ImportState.isEstacup, split: 1, participants: withUid, createdAt: new Date() });
  }
  await recalcAllEloFromCourses(); alert("Import S9 Archivélisé !"); loadCourses();
}

function buildBaseName() {
  const circuit = $("raceCircuit")?.value?.trim() || "";
  return $("isEstacup")?.value === "yes" ? `ESTACUP • Round ${$("estcRoundText")?.value?.trim()} • ${circuit}` : `${$("raceName")?.value?.trim()} • ${circuit}`;
}

async function loadCourses() {
  const courseList = document.getElementById("courseList"); if (!courseList) return;
  const snap = await getDocs(collection(db, "courses")); courseList.innerHTML = "";
  snap.forEach(d => {
    const c = d.data(); if (!c.name.includes("Saison 10")) {
      const box = document.createElement("div"); box.className = "course-box";
      box.innerHTML = `<h4>${escapeHtml(c.name)}</h4>`; courseList.appendChild(box);
    }
  });
}

async function loadIncidentHistory() {}
async function loadReclamations() {}

/* ---------------- ESTACUP S9 Signups ---------------- */
async function loadEstacupSignups() {
  const list = document.getElementById("estacupList"); if (!list) return;
  list.innerHTML = "<p>Chargement des archives engagés S9...</p>";
  const snap = await getDocs(collection(db, "estacup_s9_signups"));
  if (snap.empty) { list.innerHTML = "<p class='muted'>Aucun inscrit en S9.</p>"; return; }
  list.innerHTML = "";
  snap.forEach(docu => {
    const d = docu.data();
    list.insertAdjacentHTML("beforeend", `<div class="course-box"><h4>${escapeHtml(d.firstName)} ${escapeHtml(d.lastName)}</h4><p>Numéro : ${d.raceNumber} • Écurie : ${escapeHtml(d.teamName)}</p></div>`);
  });
}

async function loadVotesResults() {}
async function recalcAllEloFromCourses() {}
