// admin-s10.js — Import JSON, pénalités (groupes), drag & drop inter-groupes — SAISON 10
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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
  storageBucket: "estacupbymeka.firebasestorage.app",
  messagingSenderId: "1065406380441",
  appId: "1:1065406380441:web:55005f7d29290040c13b08"
};
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
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

/* ---------------- Bootstrap ---------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "login.html");
  
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || snap.data().admin !== true) {
      document.body.innerHTML = "<p>Accès refusé</p>"; return;
    }
    
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

    try { await loadPilots(); } catch (e) { console.error("Erreur loadPilots:", e); }
    try { await loadCourses(); } catch (e) { console.error("Erreur loadCourses:", e); }
    try { await loadIncidentHistory(); } catch (e) { console.error("Erreur loadIncidentHistory:", e); }
    try { await loadEstacupSignups(); } catch (e) { console.error("Erreur loadEstacupSignups:", e); }
    try { await loadReclamations(); } catch (e) { console.error("Erreur loadReclamations:", e); }
    
    setupResultsUI();
    
  } catch (globalErr) {
    console.error("Erreur globale au chargement admin S10 :", globalErr);
  }
});

/* ---------------- UI helpers ---------------- */
function ensureDriversRoomButton() {
  document.getElementById("goToDashboard")?.remove();
  const menu = document.querySelector(".admin-menu");
  if (!menu || document.getElementById("backToDriversRoom")) return;
  const btn = document.createElement("button");
  btn.id = "backToDriversRoom"; btn.type = "button"; btn.textContent = "EstaCup Saison 10";
  btn.addEventListener("click", () => (window.location.href = "estacup-s10.html"));
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

/* ---------------- Étapes UI (import résultats) ---------------- */
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
  $("fileSprintS2")?.addEventListener("change", e => ImportState.files.sprintS2 = e.target.files?.[0] || null);
  $("fileMainS2")?.addEventListener("change", e => ImportState.files.mainS2 = e.target.files?.[0] || null);
  $("splitCount")?.addEventListener("change", e => {
    ImportState.splitCount = parseInt(e.target.value, 10) || 1;
    if($("split2Wrap")) $("split2Wrap").style.display = (ImportState.splitCount === 2) ? "block" : "none";
  });

  $("analyzeJson")?.addEventListener("click", handleAnalyzeJson);
  $("applyMatching")?.addEventListener("click", applyMatchingSelections);
  $("submitJsonResults")?.addEventListener("click", saveImportedResults);

  $("modeManual")?.dispatchEvent(new Event("change"));
}

/* ---------------- Classement manuel (UI) ---------------- */
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

/* ---------------- ELO ---------------- */
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

/* ---------------- Incidents ---------------- */
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
    li.innerHTML = `<strong>${p.name}</strong> — Avant : ${p.before} → <input type="number" value="${p.after}" data-i="${i}" style="width:100px;text-align:center;font-size:1.1em;padding:4px;" /> pts
      <button type="button" class="remove" data-i="${i}" title="Retirer">✖</button>`;
    list.appendChild(li);
  });
  list.querySelectorAll("input").forEach(inp => inp.addEventListener("input", (e) => {
    const idx = parseInt(e.target.dataset.i, 10); const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) selectedPilots[idx].after = val;
  }));
  list.querySelectorAll(".remove").forEach(btn => btn.addEventListener("click", () => {
    const idx = parseInt(btn.dataset.i, 10); selectedPilots.splice(idx, 1); updateIncidentList();
  }));
}

document.getElementById("submitIncident")?.addEventListener("click", async () => {
  const description = document.getElementById("incidentDescription")?.value.trim();
  const raceId = document.getElementById("incidentRaceSelect")?.value || null;
  if (!description || selectedPilots.length === 0) { alert("Description et au moins un pilote requis."); return; }

  const adminName = (document.getElementById("adminName")?.textContent || "").trim();
  const payload = {
    date: new Date(),
    description,
    courseId: raceId || null,
    pilotes: selectedPilots.map(p => ({ uid: p.uid, name: p.name, before: p.before, after: p.after })),
    createdByUid: (auth.currentUser && auth.currentUser.uid) || null,
    createdByName: adminName || null,
  };

  await addDoc(collection(db, "incidents"), payload);

  for (const p of selectedPilots) {
    await updateDoc(doc(db, "users", p.uid), { licensePoints: p.after });
  }

  selectedPilots = [];
  updateIncidentList();
  document.getElementById("incidentDescription").value = "";
  alert("Incident enregistré.");
  await loadIncidentHistory();
});


/* ---------------- Pilotes (liste pour Résultats/Incidents) ---------------- */
async function loadPilots() {
  const pilotList = document.getElementById("pilotList");
  const select = document.getElementById("incidentPilotSelect");
  const snap = await getDocs(collection(db, "users"));

  if (pilotList) pilotList.innerHTML = "";
  if (select) {
    select.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = ""; opt0.textContent = "-- Sélectionner un pilote --";
    select.appendChild(opt0);
  }

  pilotLiByUid.clear();
  ImportState.usersCache = [];

  const users = snap.docs.map(docu => {
    const d = docu.data(), uid = docu.id;
    const firstName = d.firstName || "", lastName = d.lastName || "";
    const name = `${firstName} ${lastName}`.trim() || "(Sans nom)";
    return {
      id: uid, firstName, lastName, name,
      email: d.email || "",
      teamName: d.teamName || d.team || "",
      carChoice: d.carChoice || d.car || "",
      _k: buildKey(lastName, firstName)
    };
  }).sort((a,b)=> a.lastName.localeCompare(b.lastName, 'fr', {sensitivity:'base'}) || a.firstName.localeCompare(b.firstName, 'fr', {sensitivity:'base'}));

  for (const u of users) {
    ImportState.usersCache.push(u);

    if (pilotList) {
      const li = document.createElement("li"); li.dataset.uid = u.id;
      const nameSpan = document.createElement("span"); nameSpan.textContent = u.name;
      const minusBtn = document.createElement("button");
      minusBtn.textContent = "–"; minusBtn.title = "Retirer du classement";
      minusBtn.style.marginLeft = "8px"; minusBtn.style.display = "none";
      minusBtn.addEventListener("click", (e) => { e.stopPropagation(); removeFromRanking(u.id); });
      li.appendChild(nameSpan); li.appendChild(minusBtn);
      li.addEventListener("click", () => {
        if (selectedUIDs.has(u.id)) return;
        ranking.push({ uid: u.id, name: u.name }); selectedUIDs.add(u.id); renderRanking();
      });
      pilotList.appendChild(li);
      pilotLiByUid.set(u.id, { li, minusBtn });
    }
    if (select) {
      const opt = document.createElement("option");
      opt.value = u.id; opt.textContent = u.name; select.appendChild(opt);
    }
  }

  document.querySelectorAll('select[data-pilots="alpha"]').forEach(sel=>{
    const cur = sel.value;
    sel.innerHTML = `<option value="">-- Pilote --</option>` + users.map(u=>{
      const label = `${u.firstName} ${u.lastName}`.trim() || u.email || u.id;
      return `<option value="${u.id}">${escapeHtml(label)}</option>`;
    }).join("");
    if (cur && users.some(u=>u.id===cur)) sel.value = cur;
  });

  updatePilotListSelections();
}

function updatePilotListSelections() {
  pilotLiByUid.forEach(({ li, minusBtn }, uid) => {
    const isSelected = selectedUIDs.has(uid);
    li.style.opacity = isSelected ? "0.8" : "1";
    li.style.fontWeight = isSelected ? "600" : "400";
    if (minusBtn) minusBtn.style.display = isSelected ? "inline-block" : "none";
  });
}

/* ---------------- Pilotes — section (search/refresh) ---------------- */
function setupPilotsSection() {
  const search = document.getElementById("pilotSearch");
  const list = document.getElementById("pilotAdminList");
  const refresh = document.getElementById("refreshPilots");
  const form = document.getElementById("pilotForm");
  const formEmpty = document.getElementById("pilotFormEmpty");

  if (!list) return;

  const f_first = document.getElementById("pf_firstName");
  const f_last  = document.getElementById("pf_lastName");
  const f_email = document.getElementById("pf_email");
  const f_dob   = document.getElementById("pf_dob");
  const f_lid   = document.getElementById("pf_licenseId");
  const f_pts   = document.getElementById("pf_licensePoints");
  const f_cls   = document.getElementById("pf_licenseClass");
  const f_elo   = document.getElementById("pf_eloRating");
  const btnSave = document.getElementById("pf_save");
  const btnReset = document.getElementById("pf_reset");

  let allPilots = [];
  let current = null;

  async function fetchPilots() {
    list.innerHTML = "<li>Chargement…</li>";
    const snap = await getDocs(collection(db, "users"));
    allPilots = [];
    list.innerHTML = "";
    snap.forEach(d => { allPilots.push({ id: d.id, data: d.data() || {} }); });
    renderPilotList();
  }

  function match(p, q) {
    const txt = (q || "").trim().toLowerCase();
    if (!txt) return true;
    const d = p.data;
    const name = `${d.firstName || ""} ${d.lastName || ""}`.toLowerCase();
    const email = (d.email || "").toLowerCase();
    return name.includes(txt) || email.includes(txt);
  }

  function renderPilotList() {
    list.innerHTML = "";
    const q = search?.value || "";
    const items = allPilots
      .filter(p => match(p, q))
      .sort((a,b)=> {
        const an = `${a.data.firstName||""} ${a.data.lastName||""}`.trim().toLowerCase();
        const bn = `${b.data.firstName||""} ${b.data.lastName||""}`.trim().toLowerCase();
        return an.localeCompare(bn);
      });

    if (items.length === 0) { list.innerHTML = "<li>Aucun pilote.</li>"; return; }

    for (const p of items) {
      const li = document.createElement("li");
      const d = p.data;
      const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || "(Sans nom)";
      const cls = d.licenseClass || "Rookie";
      li.innerHTML = `<strong>${name}</strong><br><small>${d.email || ""}</small><br><small>Classe: ${cls} • E-Safety: ${d.licensePoints ?? 10} • E-Rating: ${d.eloRating ?? 1000}</small>`;
      li.style.cursor = "pointer";
      li.onclick = () => selectPilot(p);
      list.appendChild(li);
    }
  }

  function toDateInput(val) {
    try {
      if (!val) return "";
      if (val.seconds) {
        const d = new Date(val.seconds*1000);
        return d.toISOString().slice(0,10);
      }
      const d = new Date(val);
      if (!isNaN(d)) return d.toISOString().slice(0,10);
      return String(val);
    } catch { return ""; }
  }

  function selectPilot(p) {
    current = p;
    formEmpty?.classList.add("hidden");
    form?.classList.remove("hidden");

    const d = p.data || {};
    if(f_first) f_first.value = d.firstName || "";
    if(f_last) f_last.value  = d.lastName || "";
    if(f_email) f_email.value = d.email || "";
    if(f_dob) f_dob.value   = toDateInput(d.dob || d.birthDate || d.birthday || d.dateNaissance || d.naissance);
    if(f_lid) f_lid.value   = d.licenceId || d.licenseId || "";
    if(f_pts) f_pts.value   = (d.licensePoints ?? 10);
    if(f_cls) f_cls.value   = d.licenseClass || "Rookie";
    if(f_elo) f_elo.value   = d.eloRating ?? 1000;
  }

  btnSave?.addEventListener("click", async () => {
    if (!current) return;
    const ref = doc(db, "users", current.id);
    const prevSnap = await getDoc(ref);
    const prev = prevSnap.exists() ? prevSnap.data() : {};

    const payload = {
      ...prev,
      firstName: f_first.value.trim() || prev.firstName || "",
      lastName:  f_last.value.trim()  || prev.lastName  || "",
      email:     f_email.value.trim() || prev.email     || "",
      licenceId: f_lid.value.trim()   || prev.licenceId || prev.licenseId || "",
      licenseId: f_lid.value.trim()   || prev.licenseId || prev.licenceId || "",
      licensePoints: Number(f_pts.value) || 0,
      licenseClass: f_cls.value || "Rookie"
    };

    const dobStr = f_dob.value.trim();
    if (dobStr) payload.dob = dobStr;

    await setDoc(ref, payload);
    alert("Pilote mis à jour.");
    await fetchPilots();
    const again = allPilots.find(x => x.id === current.id);
    if (again) selectPilot(again);
  });

  btnReset?.addEventListener("click", () => {
    if (!current) return;
    selectPilot(current);
    alert("Formulaire réinitialisé.");
  });

  refresh?.addEventListener("click", fetchPilots);
  search?.addEventListener("input", renderPilotList);

  fetchPilots();
}

/* ========================= Import JSON (parse) ========================= */
function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const fr = new FileReader();
    fr.onload = () => { try { resolve(JSON.parse(fr.result)); } catch (e) { reject(new Error("JSON invalide")); } };
    fr.onerror = () => reject(new Error("Lecture fichier échouée"));
    fr.readAsText(file);
  });
}
function sanitizeTimeString(s) { return String(s || "").trim().split(/\s+/)[0]; }
function parseIsoDurationToMs(s) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(String(s || "").trim());
  if (!m) return null;
  const h = Number(m[1] || 0), min = Number(m[2] || 0), sec = Number(m[3] || 0);
  return Math.round(((h * 60 + min) * 60 + sec) * 1000);
}
function looksLikeTimestamp(s) {
  const v = String(s || "");
  return v.includes("T") || v.includes("-") || (/^\d{1,2}:\d{2}:\d{2}(\.\d+)?$/.test(v) && parseInt(v.split(":")[0], 10) >= 12);
}
function toMsDuration(val, capsMs) {
  if (val == null) return null;
  if (typeof val === "number" && isFinite(val)) {
    const ms = val > 10000 ? Math.round(val) : Math.round(val * 1000);
    return ms > capsMs ? null : ms;
  }
  let s = String(val).trim();
  if (!s) return null;
  if (looksLikeTimestamp(s)) return null;
  const iso = parseIsoDurationToMs(s);
  if (iso != null) return iso > capsMs ? null : iso;
  s = sanitizeTimeString(s);
  const cleaned = s.replace(/^\+/, "").replace(/[,]/g, ".").replace(/\s+/g, "");
  const suf = cleaned.match(/^(\d+(?:\.\d+)?)(ms|s)?$/i);
  if (suf) {
    const num = parseFloat(suf[1]);
    const ms = (!suf[2] || suf[2].toLowerCase() === "s") ? Math.round(num * 1000) : Math.round(num);
    return ms > capsMs ? null : ms;
  }
  if (s.includes(":")) {
    const parts = s.split(":");
    const last = parts.pop().replace(",", ".");
    const minsOrHours = parts.map(x => parseInt(x, 10));
    const sec = parseFloat(last);
    if (minsOrHours.some(isNaN) || Number.isNaN(sec)) return null;
    let ms = Math.round(sec * 1000), mult = 1;
    while (minsOrHours.length) {
      const v = minsOrHours.pop();
      ms += v * mult * 60 * 1000;
      mult *= 60;
    }
    return ms > capsMs ? null : ms;
  }
  const num = Number(s.replace(/[,]/g, "."));
  if (Number.isFinite(num)) {
    const ms = num > 10000 ? Math.round(num) : Math.round(num * 1000);
    return ms > capsMs ? null : ms;
  }
  return null;
}
function looksLikeTimeString(v) { const s = String(v || ""); return s.includes(":") || /^PT/i.test(s) || /^[+]?[\d.,]+\s*(ms|s)?$/i.test(s); }
function extractPenaltyMs(it) {
  let penMs = 0; const MAX_ENTRY = 30 * 60 * 1000;
  const addMs = (ms) => { if (ms == null || !isFinite(ms) || ms < 0) return; penMs += Math.min(ms, MAX_ENTRY); };
  const cap = 6 * 60 * 60 * 1000;
  const singleFields = ["PenaltyTime", "PenaltySeconds", "PenaltyMs", "PenaltyMS", "Penalty", "AddedTime", "AddTime", "TimeAdded", "TimePenalty", "RaceTimePenalty"];
  for (const k of singleFields) if (it[k] != null) addMs(toMsDuration(it[k], cap));
  const arrays = [];
  if (Array.isArray(it.Penalties)) arrays.push(it.Penalties);
  if (Array.isArray(it.PenaltyList)) arrays.push(it.PenaltyList);
  if (Array.isArray(it.PenaltyArray)) arrays.push(it.PenaltyArray);
  if (it.Timing?.Penalties && Array.isArray(it.Timing.Penalties)) arrays.push(it.Timing.Penalties);
  for (const arr of arrays) for (const p of arr) {
    const cand = [p?.ms, p?.Ms, p?.MS, p?.Seconds, p?.Secs, p?.Value, p?.Amount, p?.Time, p?.TimeStr, p?.AddedTime];
    for (const c of cand) {
      if (c == null) continue;
      const got = looksLikeTimeString(c) ? toMsDuration(c, cap) : toMsDuration(Number(c), cap);
      if (got != null) addMs(got);
    }
  }
  return penMs;
}
function extractLaps(it) {
  const candidates = [
    it.Laps, it.LapCount, it.CompletedLaps, it.NumLaps, it.NumOfLaps, it.NumberOfLaps, it.RaceLaps,
    it.LapsCompleted, it.Completed, it.Timing && (it.Timing.Laps ?? it.Timing.CompletedLaps)
  ];
  for (const raw of candidates) {
    if (typeof raw === "number" && isFinite(raw)) return raw;
    const n = firstInt(raw);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/* ================== CLASSEMENT + PÉNALITÉS + OVERRIDE (DnD) ================== */
function recomputePositions(rows) {
  if (!rows || rows.length === 0) return;

  rows.forEach(r => {
    r.adjTotalMs = Number.isFinite(r.totalMs)
      ? (r.totalMs + (r.basePenaltyMs || 0) + (r.editPenaltyMs || 0))
      : null;
  });

  const withTime = rows.filter(r => Number.isFinite(r.adjTotalMs));
  const noTime = rows.filter(r => !Number.isFinite(r.adjTotalMs));
  if (withTime.length === 0) return;

  const maxLaps = Math.max(...withTime.map(r => Math.max(0, r.laps || 0)));
  const contenders = withTime.filter(r => (r.laps || 0) === maxLaps);
  const leader = contenders.reduce((a, b) => (a.adjTotalMs <= b.adjTotalMs ? a : b));
  const leaderAdj = leader.adjTotalMs;
  const leaderLaps = maxLaps;

  const median = (arr) => { const a = arr.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN; };
  let lapRef = leaderLaps > 0 ? leaderAdj / leaderLaps : NaN;
  if (!Number.isFinite(lapRef) || lapRef <= 0) {
    const cands = withTime.filter(r => (r.laps || 0) > 0 && Number.isFinite(r.totalMs))
      .map(r => r.totalMs / (r.laps || 1))
      .filter(v => Number.isFinite(v) && v > 0);
    lapRef = median(cands);
  }
  if (!Number.isFinite(lapRef) || lapRef <= 0) lapRef = 60000;
  lapRef = Math.max(30000, Math.min(180000, Math.round(lapRef)));

  withTime.forEach(r => {
    const laps = Math.max(0, r.laps || 0);
    const baseDef = Math.max(0, leaderLaps - laps);
    const overMs = Math.max(0, r.adjTotalMs - leaderAdj);
    const extraDef = (laps >= leaderLaps) ? Math.floor(overMs / lapRef) : 0;
    let effDef = baseDef + extraDef;
    let effLaps = Math.max(0, leaderLaps - effDef);

    if (Number.isFinite(r._overrideGroup)) {
      effLaps = Math.max(0, Math.min(leaderLaps, Number(r._overrideGroup)));
      effDef = Math.max(0, leaderLaps - effLaps);
    }
    r._effDef = effDef;
    r._effLaps = effLaps;
  });

  const byGroup = new Map();
  withTime.forEach(r => {
    const g = r._effLaps || 0;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  });

  const groupsDesc = [...byGroup.keys()].sort((a, b) => b - a);
  const ordered = [];

  groupsDesc.forEach(g => {
    const arr = byGroup.get(g);
    arr.sort((a, b) => {
      const ma = Number.isFinite(a.manualOrder) ? a.manualOrder : null;
      const mb = Number.isFinite(b.manualOrder) ? b.manualOrder : null;
      if (ma !== null || mb !== null) {
        if (ma === null) return 1;
        if (mb === null) return -1;
        if (ma !== mb) return ma - mb;
      }
      const pa = a.positionHint || 9999, pb = b.positionHint || 9999;
      if (pa !== pb) return pa - pb;
      if (a.adjTotalMs !== b.adjTotalMs) return a.adjTotalMs - b.adjTotalMs;
      return 0;
    });
    ordered.push(...arr);
  });

  noTime.forEach(r => r._effLaps = Math.max(0, Math.min(leaderLaps, r.laps || 0)));
  noTime.sort((a, b) => {
    if ((a._effLaps || 0) !== (b._effLaps || 0)) return (b._effLaps || 0) - (a._effLaps || 0);
    const pa = a.positionHint || 9999, pb = b.positionHint || 9999;
    return pa - pb;
  });
  ordered.push(...noTime);

  ordered.forEach((r, i) => r.position = i + 1);

  const top = ordered[0];
  const topAdj = Number.isFinite(top?.adjTotalMs) ? top.adjTotalMs : null;
  const topDef = top?._effDef ?? 0;
  ordered.forEach(r => {
    if (!Number.isFinite(r.adjTotalMs)) { r._gapText = "—"; return; }
    if ((r._effDef || 0) !== topDef) {
      const lapsBehind = (r._effDef || 0) - topDef;
      r._gapText = `+${lapsBehind} lap${lapsBehind > 1 ? "s" : ""}`;
    } else {
      const diff = r.adjTotalMs - topAdj;
      r._gapText = diff === 0 ? "+0.000" : "+" + formatMs(diff);
    }
  });

  rows.splice(0, rows.length, ...ordered);
}

/* ---------- Extraction des résultats ---------- */
function smartSplitName(full) {
  const s = String(full || "").trim().replace(/_/g, " ").replace(/\s+/g, " ");
  if (!s) return { firstName: "", lastName: "" };
  if (s.includes(",")) { const [ln, fn] = s.split(",").map(x => x.trim()); return { firstName: fn || "", lastName: ln || "" }; }
  const t = s.split(" ");
  if (t.length === 1) return { firstName: "", lastName: t[0] };
  const isUpperLike = w => { const letters = (w.match(/[A-Z À-ÖØ-Ý]/gi) || []).join(""); return letters && letters === letters.toUpperCase(); };
  if (t.length === 2) {
    const [a, b] = t;
    if (isUpperLike(a) && !isUpperLike(b)) return { firstName: b, lastName: a };
    if (isUpperLike(b) && !isUpperLike(a)) return { firstName: a, lastName: b };
    return { firstName: a, lastName: b };
  }
  const lastName = t[t.length - 1]; const firstName = t.slice(0, -1).join(" ");
  return { firstName, lastName };
}
const CAR_NAME_MAP = {
  "estacup_acura_nsx_gt3_evo2": "Acura NSX GT3 EVO 2",
  "estacup_audi_r8_lms_gt3_evo_ii": "Audi R8 LMS GT3 EVO II",
  "estacup_bmw_m4_gt3": "BMW M4 GT3",
  "estacup_ferrari_296_gt3": "Ferrari 296 GT3",
  "estacup_ford_mustang_gt3": "Ford Mustang GT3",
  "estacup_lamborghini_huracan_gt3_evo2": "Lamborghini Huracan GT3 EVO2",
  "estacup_lexus_rc_f_gt3": "Lexus RC F GT3",
  "estacup_mclaren_720S_gt3_evo": "McLaren 720S GT3 EVO",
  "estacup_mercedes_amg_gt3_evo": "Mercedes-AMG GT3 EVO",
  "estacup_porsche_911_gt3_r": "Porsche 911 GT3 R",
};
function normalizeCarName(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (CAR_NAME_MAP[s]) return CAR_NAME_MAP[s];
  let key = s.replace(/^estacup_/i, "");
  if (CAR_NAME_MAP[key]) return CAR_NAME_MAP[key];
  key = key.replace(/_/g, " ").trim();
  key = key.replace(/\bgt3\b/ig, "GT3").replace(/\bevo ?ii\b/ig, "EVO II").replace(/\bevo\b/ig, "EVO");
  return key.charAt(0).toUpperCase() + key.slice(1);
}
function carBrandFromName(normalized) {
  const s = String(normalized || "").trim();
  if (!s) return "";
  if (/^Mercedes[- ]?AMG/i.test(s)) return "Mercedes-AMG";
  return s.split(/\s+/)[0];
}
function extractResultsGeneric(json) {
  if (!json) return [];
  const rows = [];
  const pushGeneric = (it = {}) => {
    const rawName =
      it.DriverName || it.Driver || it.Name ||
      (it.Driver && (it.Driver.Name || `${it.Driver.FirstName || ""} ${it.Driver.LastName || ""}`.trim())) ||
      (it.CurrentDriver && (it.CurrentDriver.DriverName || `${it.CurrentDriver.FirstName || ""} ${it.CurrentDriver.LastName || ""}`.trim())) || "";
    const { firstName, lastName } = smartSplitName(rawName);
    const team = it.Team || it.TeamName || (it.Driver && it.Driver.Team) || "";
    const carRaw = it.CarModel || it.Car || it.Model || it.CarModelShort || (it.Vehicle || "");
    const carFull = normalizeCarName(carRaw);
    const carBrand = carBrandFromName(carFull);

    const bestCandidates = [it.BestLapTime, it.BestLapMs, it.BestLapMS, it.BestLap].filter(Boolean);
    let bestLapMs = null;
    for (const c of bestCandidates) { bestLapMs = toMsDuration(c, 10 * 60 * 1000); if (bestLapMs != null) break; }

    const totalCandidates = [it.TotalTime, it.TotalMs, it.TotalMS, it.Total, it.RaceTime].filter(Boolean);
    let totalMs = null;
    for (const c of totalCandidates) { totalMs = toMsDuration(c, 6 * 60 * 60 * 1000); if (totalMs != null) break; }

    const laps = extractLaps(it);
    const basePenaltyMs = extractPenaltyMs(it) || 0;

    rows.push({
      driverName: rawName, firstName, lastName, team: team || "",
      car: carFull, carBrand, bestLapMs, totalMs,
      basePenaltyMs, editPenaltyMs: 0,
      adjTotalMs: Number.isFinite(totalMs) ? (totalMs + basePenaltyMs) : null,
      laps: Number(laps) || 0,
      positionHint: Number(it.Position ?? it.Pos ?? it.Rank) || 0
    });
  };

  if (Array.isArray(json?.Result)) json.Result.forEach(pushGeneric);
  if (rows.length === 0 && Array.isArray(json?.Results)) json.Results.forEach(pushGeneric);
  recomputePositions(rows);
  return rows;
}

const ESTACUP_POINTS = {
  sprint: { split1: [25, 22, 20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], split2: [6, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1] },
  main: { split1: [50, 46, 42, 38, 34, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], split2: [12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 1, 1, 1] }
};
function getDefaultPoints(isSprint, split, position) {
  const table = isSprint ? (split === 2 ? ESTACUP_POINTS.sprint.split2 : ESTACUP_POINTS.sprint.split1) : (split === 2 ? ESTACUP_POINTS.main.split2 : ESTACUP_POINTS.main.split1);
  return table[position - 1] || 0;
}

function renderPreviewTables() {
  const block = $("previewBlock"); const root = $("resultsPreview"); if (!block || !root) return;
  const titleBase = buildBaseName();
  const makeTitle = (label) => String(`${titleBase} • ${label}`).replace(/\bFinale\b/i, "Principale");

  const makeTable = (title, rows) => {
    if (!rows || !rows.length) return "";
    recomputePositions(rows);
    const isSprint = /Sprint/i.test(title);
    const splitNum = /S2/i.test(title) ? 2 : 1;
    const isEstacup = ($("isEstacup")?.value === "yes");

    let html = `<div class="course-box" style="margin-top:10px"><h4>${escapeHtml(title)}</h4><div style="overflow:auto"><table class="race-table"><thead><tr><th>#</th><th>Nom</th><th>Prénom</th><th>Équipe</th><th>Voiture</th><th>Points</th><th>Best lap</th><th>Laps</th><th>Gap leader</th><th>Total pénalité</th></tr></thead>`;
    const groups = new Map();
    rows.forEach((r, idx) => { const g = r._effLaps || 0; if (!groups.has(g)) groups.set(g, []); groups.get(g).push({ r, idx }); });
    
    [...groups.keys()].sort((a, b) => b - a).forEach(g => {
      html += `<tbody>`;
      groups.get(g).forEach(({ r, idx }) => {
        const pointsVal = Number.isFinite(r._pointsManual) ? r._pointsManual : (isEstacup ? getDefaultPoints(isSprint, splitNum, r.position) : 0);
        html += `<tr data-idx="${idx}"><td>${r.position}</td><td>${escapeHtml(r.lastName)}</td><td>${escapeHtml(r.firstName)}</td><td>${escapeHtml(r.team)}</td><td>${escapeHtml(r.carBrand)}</td><td><input class="points-input" type="number" style="width:80px;text-align:right" value="${pointsVal}"></td><td>${formatMs(r.bestLapMs)}</td><td>${g}</td><td>${r._gapText || "—"}</td><td>${formatMs(r.basePenaltyMs + (r.editPenaltyMs || 0))}</td></tr>`;
      });
      html += `</tbody>`;
    });
    return html + `</table></div></div>`;
  };

  let html = "";
  if (ImportState.parsed.S1.sprint.length) html += makeTable(makeTitle("Sprint S1"), ImportState.parsed.S1.sprint);
  if (ImportState.parsed.S1.main.length) html += makeTable(makeTitle("Principale S1"), ImportState.parsed.S1.main);
  root.innerHTML = html || `<p class="muted">Importer un fichier pour voir l'aperçu.</p>`;
  block.style.display = "block";
}

async function handleAnalyzeJson() {
  ImportState.isEstacup = $("isEstacup")?.value === "yes";
  ImportState.roundText = $("estcRoundText")?.value?.trim() || "";
  ImportState.circuit = $("raceCircuit")?.value?.trim() || "";
  ImportState.date = $("raceDate")?.valueAsDate || new Date();

  const jSprintS1 = await readFileAsJson(ImportState.files.sprintS1).catch(() => null);
  const jMainS1 = await readFileAsJson(ImportState.files.mainS1).catch(() => null);
  
  ImportState.parsed.S1 = { sprint: extractResultsGeneric(jSprintS1), main: extractResultsGeneric(jMainS1) };
  ImportState.nameMap.clear(); ImportState.unmatched = [];

  const allImported = [].concat(ImportState.parsed.S1.sprint, ImportState.parsed.S1.main);
  const seen = new Set();
  for (const r of allImported) {
    const key = buildKey(r.lastName, r.firstName); if (seen.has(key)) continue; seen.add(key);
    const match = suggestUserFor(r.lastName, r.firstName);
    if (match) ImportState.nameMap.set(key, { uid: match.id });
    else ImportState.unmatched.push({ key, lastName: r.lastName, firstName: r.firstName });
  }
  renderMatchingUI(); renderPreviewTables();
}

function suggestUserFor(lastName, firstName) {
  const ln = normLower(lastName);
  return ImportState.usersCache.find(u => normLower(u.lastName) === ln || normLower(u.lastName).includes(ln));
}

function renderMatchingUI() {
  const block = $("matchBlock"); const list = $("matchList"); if (!block || !list) return;
  if (!ImportState.unmatched.length) { block.style.display = "none"; return; }
  block.style.display = "block"; list.innerHTML = "";
  
  ImportState.unmatched.forEach(u => {
    const div = document.createElement("div"); div.style.marginBottom = "8px";
    div.innerHTML = `<label><strong>${escapeHtml(u.lastName)} ${escapeHtml(u.firstName)}</strong> : </label><select class="match-select" data-key="${u.key}"><option value="">-- Non assigné --</option>${ImportState.usersCache.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select>`;
    list.appendChild(div);
  });
}

function applyMatchingSelections() {
  document.querySelectorAll(".match-select").forEach(sel => { if(sel.value) ImportState.nameMap.set(sel.dataset.key, { uid: sel.value }); });
  renderPreviewTables(); alert("Assignations appliquées.");
}

async function saveImportedResults() {
  const baseName = buildBaseName(); const raceDate = $("raceDate")?.valueAsDate || new Date();
  if (!baseName) { alert("Formulaire incomplet."); return; }
  const races = [];
  if (ImportState.parsed.S1.sprint.length) races.push({ key: "S1_sprint", label: "Sprint S1", rows: ImportState.parsed.S1.sprint });
  if (ImportState.parsed.S1.main.length) races.push({ key: "S1_main", label: "Principale S1", rows: ImportState.parsed.S1.main });

  const baseTs = Date.now(); let incr = 0;
  for (const race of races) {
    recomputePositions(race.rows);
    const withUid = [];
    for (const r of race.rows) {
      const map = ImportState.nameMap.get(buildKey(r.lastName, r.firstName)); if (!map?.uid) continue;
      withUid.push({ uid: map.uid, name: `${r.firstName} ${r.lastName}`, position: r.position, team: r.team, car: r.car, bestLapMs: r.bestLapMs, totalMs: r.adjTotalMs, penaltyMs: r.basePenaltyMs, laps: r.laps, points: r._pointsManual ?? (ImportState.isEstacup ? getDefaultPoints(race.key.includes("sprint"), 1, r.position) : 0), status: "OK" });
    }

    const raceId = `${baseTs + (incr++)}_${race.key}`;
    const displayName = `${baseName} • ${race.label}`;

    for (const p of withUid) {
      await setDoc(doc(db, "users", p.uid, "raceHistory_s10", raceId), { name: displayName, date: raceDate, position: p.position, team: p.team || null, car: p.car || null, bestLapMs: p.bestLapMs, totalMs: p.totalMs, penaltyMs: p.penaltyMs, laps: p.laps, status: "OK", points: p.points, track: ImportState.circuit || null, split: 1, isSprint: race.key.includes("sprint"), estacup: ImportState.isEstacup });
    }

    await setDoc(doc(db, "courses", raceId), { id: raceId, name: displayName, date: raceDate, estacup: ImportState.isEstacup, split: 1, round: ImportState.roundText || null, track: ImportState.circuit || null, isSprint: race.key.includes("sprint"), participants: withUid, createdAt: new Date() });
  }
  alert("Importation terminée !"); await loadCourses();
}

function buildBaseName() {
  const circuit = $("raceCircuit")?.value?.trim() || "";
  return $("isEstacup")?.value === "yes" ? `ESTACUP • Round ${$("estcRoundText")?.value?.trim()} • ${circuit}` : `${$("raceName")?.value?.trim()} • ${circuit}`;
}

async function loadCourses() {
  const courseList = document.getElementById("courseList"); if (!courseList) return;
  const snap = await getDocs(collection(db, "courses")); courseList.innerHTML = "";
  snap.forEach(d => {
    const c = d.data(); const box = document.createElement("div"); box.className = "course-box";
    box.innerHTML = `<h4>${escapeHtml(c.name)}</h4><button class="delete-course" data-id="${d.id}">Supprimer</button>`;
    courseList.appendChild(box);
  });
  
  document.querySelectorAll(".delete-course").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer ?")) return;
      await deleteDoc(doc(db, "courses", btn.dataset.id)); loadCourses();
    });
  });
}

async function loadIncidentHistory() {
  const box = document.getElementById("incidentHistory"); if (box) box.innerHTML = "<p class='muted'>Aucun incident.</p>";
}

async function loadReclamations() {
  const box = document.getElementById("reclamationsBox"); if (box) box.innerHTML = "<p class='muted'>Aucune réclamation.</p>";
}

/* ---------------- ESTACUP : Listing inscriptions S10 ---------------- */
async function loadEstacupSignups() {
  const list = document.getElementById("estacupList"); 
  if (!list) return;
  
  list.innerHTML = `<div class="loading-inline"><div class="spinner"></div> Chargement des engagements S10...</div>`;
  
  try {
    const snap = await getDocs(collection(db, "estacup_s10_signups"));
    const usersSnap = await getDocs(collection(db, "users"));
    const usersById = new Map(); 
    usersSnap.forEach(u => usersById.set(u.id, u.data()));

    const pending = [];
    const validatedTodo = []; 
    const validatedDone = []; 

    snap.forEach(docu => {
      const sData = docu.data();
      const uid = sData.uid || docu.id;
      const uData = usersById.get(uid) || {};

      let ageText = "Âge inconnu";
      const dob = uData.dob || uData.birthDate || uData.dateNaissance;
      if (dob) {
        const d = new Date(dob);
        if (!isNaN(d)) {
          const now = new Date();
          let age = now.getFullYear() - d.getFullYear();
          if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
            age--;
          }
          ageText = `${age} ans`;
        }
      }

      let regDateText = "Date inconnue";
      if (sData.updatedAt) {
        const d = toDateVal(sData.updatedAt);
        if (d) {
          regDateText = d.toLocaleDateString("fr-FR", { day: '2-digit', month: '2-digit', year: 'numeric' }) + 
                        " à " + 
                        d.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
        }
      }

      const licence = uData.licenseClass || uData.licenceClass || uData.license || "Rookie";
      let licColor = "#10b981"; 
      if (licence.toLowerCase() === "pro") licColor = "#ef4444"; 
      if (licence.toLowerCase() === "challenger") licColor = "#f59e0b"; 

      let payStatus = "Non renseigné";
      if (sData.paymentStatus === "adherent") payStatus = "Adhérent MEKA";
      if (sData.paymentStatus === "paye_5e") payStatus = "Frais d'inscription (5€) payés";

      let liveryChoice = "Non renseigné";
      if (sData.liveryChoice === "personnelle") liveryChoice = "Personnelle (OneDrive)";
      if (sData.liveryChoice === "neutre") liveryChoice = "Neutre (Défaut)";
      const liveryImplemented = sData.liveryImplemented === true;

      const steamId = sData.steamID64 || sData.steamId || uData.steamID64 || uData.steamId || "—";

      const pilotObj = {
        docId: docu.id,
        fullName: `${sData.firstName || uData.firstName || ""} ${sData.lastName || uData.lastName || ""}`.trim() || "Pilote Inconnu",
        team: sData.teamName || "Indépendant",
        number: sData.raceNumber || "—",
        car: sData.carChoice || "Ligier JS P320",
        steam: steamId,
        age: ageText,
        regDate: regDateText, 
        licence: licence,
        licColor: licColor,
        payStatus: payStatus,
        liveryChoice: liveryChoice,
        liveryImplemented: liveryImplemented,
        isValidated: sData.isValidated === true
      };

      if (pilotObj.isValidated) {
        if (pilotObj.liveryImplemented) {
          validatedDone.push(pilotObj);
        } else {
          validatedTodo.push(pilotObj);
        }
      } else {
        pending.push(pilotObj);
      }
    });

    let html = `
      <div style="margin-bottom: 3rem;">
        <h3 style="color: #f59e0b; margin-bottom: 1.5rem; border-bottom: 2px solid rgba(245, 158, 11, 0.3); padding-bottom: 0.5rem; font-size: 1.5rem;">
          ⏳ En attente de validation (${pending.length})
        </h3>
        <div id="pendingSignupsGrid" class="cards-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem;"></div>
      </div>

      <div style="margin-bottom: 3rem;">
        <h3 style="color: #38bdf8; margin-bottom: 1.5rem; border-bottom: 2px solid rgba(56, 189, 248, 0.3); padding-bottom: 0.5rem; font-size: 1.5rem;">
          🎨 Livrées à intégrer (${validatedTodo.length})
        </h3>
        <div id="validatedTodoGrid"></div>
      </div>

      <div>
        <h3 style="color: #10b981; margin-bottom: 1.5rem; border-bottom: 2px solid rgba(16, 185, 129, 0.3); padding-bottom: 0.5rem; font-size: 1.5rem;">
          ✅ Inscriptions 100% complètes (${validatedDone.length})
        </h3>
        <div id="validatedDoneGrid"></div>
      </div>
    `;

    list.innerHTML = html;

    const renderPendingCard = (p) => `
      <div class="course-box" style="border-left: 4px solid #f59e0b; position: relative; padding: 1.5rem;">
        <h4 style="margin-top:0; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; font-size: 1.1rem;">
          ${escapeHtml(p.fullName)}
          <span style="font-size: 0.7rem; padding: 4px 8px; border-radius: 12px; border: 1px solid ${p.licColor}; color: ${p.licColor}; text-transform: uppercase; font-weight: bold;">
            ${escapeHtml(p.licence)}
          </span>
        </h4>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.9rem; color: var(--text-muted); line-height: 1.6;">
           <li><strong>Âge :</strong> ${escapeHtml(p.age)}</li>
           <li><strong>Numéro :</strong> #${escapeHtml(String(p.number))}</li>
           <li><strong>Équipe :</strong> ${escapeHtml(p.team)}</li>
           <li><strong>Livrée :</strong> ${escapeHtml(p.liveryChoice)}</li>
           <li><strong>Steam ID :</strong> <code style="font-family: monospace; color: var(--accent-primary); background: rgba(0,0,0,0.3); padding: 2px 5px; border-radius: 4px;">${escapeHtml(p.steam)}</code></li>
           <li><strong>Paiement :</strong> <span style="color: var(--text-primary);">${escapeHtml(p.payStatus)}</span></li>
           <li><strong>Inscrit le :</strong> ${escapeHtml(p.regDate)}</li>
        </ul>
        <div style="display: flex; gap: 10px; margin-top: 15px;">
          <button class="btn-validate-signup" data-id="${p.docId}" style="flex: 1; background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid #10b981; padding: 8px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s;">✔️ Valider</button>
          <button class="btn-delete-signup" data-id="${p.docId}" style="flex: 1; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; padding: 8px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s;">❌ Refuser</button>
        </div>
      </div>
    `;

    const pendingContainer = document.getElementById("pendingSignupsGrid");
    if (pending.length === 0) {
        pendingContainer.innerHTML = "<p class='muted-note'>Aucune inscription en attente.</p>";
        pendingContainer.style.display = "block";
    } else {
        pending.forEach(p => pendingContainer.insertAdjacentHTML("beforeend", renderPendingCard(p)));
    }

    const renderTable = (pilotsArray, containerId) => {
      const container = document.getElementById(containerId);
      if (pilotsArray.length === 0) {
          container.innerHTML = "<p class='muted-note'>Aucun pilote dans cette catégorie.</p>";
          return;
      }

      let tableHtml = `
      <div style="overflow-x: auto; background: rgba(15,23,42,0.6); border-radius: 10px; border: 1px solid var(--border-primary);">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-primary); background: rgba(255,255,255,0.02);">
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Pilote</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Numéro</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Équipe</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Steam ID</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600;">Paiement</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600; text-align: center;">Livrée</th>
              <th style="padding: 12px 15px; color: var(--text-muted); font-weight: 600; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
      `;

      pilotsArray.forEach(p => {
          tableHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
              <td style="padding: 12px 15px; vertical-align: middle;">
                  <strong style="color: var(--text-primary); display: block;">${escapeHtml(p.fullName)}</strong>
                  <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                      <span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 8px; border: 1px solid ${p.licColor}; color: ${p.licColor}; text-transform: uppercase; font-weight: bold;">${escapeHtml(p.licence)}</span>
                      <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(p.age)}</span>
                  </div>
                  <div style="font-size: 0.75rem; color: rgba(148, 163, 184, 0.8); margin-top: 6px;">📅 Inscrit le ${escapeHtml(p.regDate)}</div>
              </td>
              <td style="padding: 12px 15px; vertical-align: middle; font-weight: bold; color: var(--accent-primary);">#${escapeHtml(String(p.number))}</td>
              <td style="padding: 12px 15px; vertical-align: middle; color: var(--text-secondary);">${escapeHtml(p.team)}</td>
              <td style="padding: 12px 15px; vertical-align: middle;"><code style="font-family: monospace; color: var(--accent-primary); background: rgba(0,0,0,0.3); padding: 3px 6px; border-radius: 4px; font-size: 0.85rem;">${escapeHtml(p.steam)}</code></td>
              <td style="padding: 12px 15px; vertical-align: middle; color: var(--text-secondary);">${escapeHtml(p.payStatus)}</td>
              
              <td style="padding: 12px 15px; vertical-align: middle; text-align: center;">
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;">
                      <div style="font-size: 0.85rem; color: var(--text-primary); text-align: center;">${escapeHtml(p.liveryChoice)}</div>
                      <label style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; font-size: 0.8rem; padding: 4px 8px; border-radius: 6px; background: ${p.liveryImplemented ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)'}; color: ${p.liveryImplemented ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${p.liveryImplemented ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)'}; transition: all 0.2s; margin: 0;">
                          <input type="checkbox" class="cb-livery-implemented" data-id="${p.docId}" ${p.liveryImplemented ? 'checked' : ''} style="width: 14px; height: 14px; accent-color: #10b981; cursor: pointer; margin: 0;">
                          ${p.liveryImplemented ? 'Intégrée ✅' : 'À intégrer'}
                      </label>
                  </div>
              </td>

              <td style="padding: 12px 15px; vertical-align: middle; text-align: right;">
                  <button class="btn-delete-signup" data-id="${p.docId}" style="background: transparent; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='transparent'">
                      🗑️ Supprimer
                  </button>
              </td>
            </tr>
          `;
      });

      tableHtml += `
          </tbody>
        </table>
      </div>
      `;
      container.innerHTML = tableHtml;
    };

    renderTable(validatedTodo, "validatedTodoGrid");
    renderTable(validatedDone, "validatedDoneGrid");

    document.querySelectorAll('.btn-validate-signup').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        e.target.disabled = true;
        e.target.textContent = "Validation...";
        await updateDoc(doc(db, "estacup_s10_signups", id), { isValidated: true });
        loadEstacupSignups();
      });
    });

    document.querySelectorAll('.btn-delete-signup').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if(!confirm("Êtes-vous sûr de vouloir supprimer définitivement cette inscription ?")) return;
        const id = e.target.getAttribute('data-id');
        e.target.disabled = true;
        await deleteDoc(doc(db, "estacup_s10_signups", id));
        loadEstacupSignups();
      });
    });

    document.querySelectorAll('.cb-livery-implemented').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const id = e.target.getAttribute('data-id');
        const isChecked = e.target.checked;
        e.target.disabled = true;
        try {
          await updateDoc(doc(db, "estacup_s10_signups", id), { liveryImplemented: isChecked });
          loadEstacupSignups();
        } catch (err) {
          console.error("Erreur mise à jour livrée :", err);
          alert("Erreur lors de la mise à jour.");
          e.target.checked = !isChecked; 
          e.target.disabled = false;
        }
      });
    });

  } catch (err) {
    console.error("Erreur chargement des inscriptions :", err);
    list.innerHTML = "<p class='impact-bad'>Erreur de chargement de la liste des inscriptions.</p>";
  }
}

async function loadVotesResults() { if($("q3_total")) $("q3_total").textContent = "Total : 0"; }

/* ---------------- STATUT DU SERVEUR (LIVE) ---------------- */
async function loadServerStatusAdmin() {
  try {
    const snap = await getDoc(doc(db, "config", "server_s10"));
    if (snap.exists()) {
      const d = snap.data();
      if ($("adminSrvOpen")) $("adminSrvOpen").value = d.isOpen ? "true" : "false";
      if ($("adminSrvSession")) $("adminSrvSession").value = d.session || "";
      if ($("adminSrvTrack")) $("adminSrvTrack").value = d.track || "";
      if ($("adminSrvPwd")) $("adminSrvPwd").value = d.password || "";
    }
  } catch (err) {
    console.error("Erreur chargement statut serveur :", err);
  }
}

const btnSaveServer = document.getElementById("btnSaveServer");
if (btnSaveServer) {
  btnSaveServer.addEventListener("click", async () => {
    btnSaveServer.textContent = "⏳ Enregistrement...";
    try {
      await setDoc(doc(db, "config", "server_s10"), {
        isOpen: $("adminSrvOpen").value === "true",
        session: $("adminSrvSession").value.trim(),
        track: $("adminSrvTrack").value.trim(),
        password: $("adminSrvPwd").value.trim()
      });
      btnSaveServer.textContent = "✅ Mis à jour en direct !";
      setTimeout(() => btnSaveServer.textContent = "💾 Mettre à jour en direct", 2500);
    } catch (err) {
      console.error(err);
      btnSaveServer.textContent = "❌ Erreur";
    }
  });
}

window.loadCourses = loadCourses;
document.addEventListener("DOMContentLoaded", () => { 
  if ($("section-courses")) loadCourses(); 
  loadServerStatusAdmin();
});
