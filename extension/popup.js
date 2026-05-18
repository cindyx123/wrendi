// ─── Wrendi Extension Popup ────────────────────────────────────────────────────
"use strict";

const $ = id => document.getElementById(id);
const setStatus = (id, msg, type="") => { const el=$(id); if(el){el.textContent=msg; el.className=`status-row ${type}`;} };

const ST = {
  new:"tag-blue", tailoring:"tag-blue", scored:"tag-amber",
  ready:"tag-green", flagged:"tag-amber", applied:"tag-green", skipped:"tag-gray"
};
const ST_LABEL = {
  new:"New", tailoring:"Tailoring", scored:"Scored",
  ready:"Ready ✓", flagged:"Review", applied:"Applied", skipped:"Skipped"
};

let state = { jobs:[], profile:{}, workerUrl:"", token:"" };

// ── Worker fetch (all calls proxied through background for token) ──────────────
function bgMsg(msg) {
  return new Promise(r => chrome.runtime.sendMessage(msg, res => r(res || {})));
}

async function loadState() {
  const data = await bgMsg({ type:"GET_ALL" });
  state.jobs      = data.jobs      || [];
  state.profile   = data.profile   || {};
  state.workerUrl = data.workerUrl || "";
  state.token     = (await new Promise(r => chrome.storage.local.get(["wrendi_token"], d => r(d.wrendi_token||""))));
}

// ── Auth check ────────────────────────────────────────────────────────────────
function isAuthed() { return !!state.token; }

function showView(authed) {
  $("view-unauthed").style.display = authed ? "none" : "block";
  $("view-authed").style.display   = authed ? "block" : "none";
}

// ── Render queue ──────────────────────────────────────────────────────────────
function renderQueue() {
  const list = $("queue-list");
  const count = state.jobs.filter(j=>j.status!=="applied").length;
  $("queue-count").textContent = count;
  $("queue-label").textContent = `${state.jobs.length} jobs · ${state.jobs.filter(j=>j.flags?.length).length} flagged`;
  list.innerHTML = "";

  if (!state.jobs.length) {
    list.innerHTML = `<div class="info-box info-blue">No jobs yet. Scrape a listing to get started.</div>`;
    return;
  }

  state.jobs.forEach(job => {
    const d = document.createElement("div");
    d.className = `job-item ${job.flags?.length?"flagged":""} ${job.status==="applied"?"applied":""}`;
    const score = job.ats_score ? `<span class="tag ${job.ats_score>=80?"tag-green":job.ats_score>=60?"tag-amber":"tag-red"}">${job.ats_score}</span>` : "";
    d.innerHTML = `
      <div class="job-item-title">${job.title||"Untitled"}</div>
      <div class="job-item-sub">${job.company||""}${job.location?" · "+job.location:""}</div>
      <div class="job-item-tags">
        <span class="tag ${ST[job.status]||"tag-gray"}">${ST_LABEL[job.status]||job.status}</span>
        <span class="tag tag-gray">${job.portal_name||job.portal||""}</span>
        ${score}
        ${job.flags?.length?`<span class="tag tag-amber">⚑ ${job.flags.length}</span>`:""}
      </div>`;
    list.appendChild(d);
  });
}

function populateApplySelect() {
  const sel = $("apply-job-select");
  const prev = sel.value;
  sel.innerHTML = `<option value="">— select from queue —</option>`;
  state.jobs.filter(j=>j.status!=="applied").forEach(j => {
    sel.innerHTML += `<option value="${j.id}">${j.title} @ ${j.company}</option>`;
  });
  sel.value = prev;
}

// ── Portal detection ──────────────────────────────────────────────────────────
async function detectPortal() {
  try {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    if (!tab?.id) return {};
    const res = await new Promise(r => chrome.tabs.sendMessage(tab.id, {type:"GET_PORTAL"}, r));
    if (res) { $("portal-pill").textContent = res.portalName||"Unknown"; return res; }
  } catch {}
  return {};
}

// ── Scrape current page ───────────────────────────────────────────────────────
async function scrapePreview() {
  try {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    const res = await new Promise(r => chrome.tabs.sendMessage(tab.id, {type:"SCRAPE_JOB"}, r));
    const j = res?.job;
    if (j) {
      $("sp-portal").textContent   = j.portalName||j.portal||"—";
      $("sp-title").textContent    = j.title||"—";
      $("sp-company").textContent  = j.company||"—";
      $("sp-location").textContent = j.location||"—";
      $("sp-jd").textContent       = j.jd ? `${j.jd.length.toLocaleString()} chars` : "—";
      return j;
    }
  } catch {}
  return null;
}

// ── Scrape & send ─────────────────────────────────────────────────────────────
async function scrapeAndSend() {
  setStatus("scrape-status","Scraping…","");
  const job = await scrapePreview();
  if (!job?.title) { setStatus("scrape-status","⚑ No job detected. Are you on a listing page?","error"); return; }

  const res = await bgMsg({ type:"ADD_JOB", job });
  if (res.success) {
    state.jobs = [{ id:res.job?.id, ...job, status:"new", ats_score:null, flags:[], tailored_resume:"", cover_letter:"" }, ...state.jobs.filter(j=>j.url!==job.url)];
    renderQueue();
    populateApplySelect();
    setStatus("scrape-status", `✓ "${job.title}" added — open Wrendi to tailor & score`, "success");
    // Open web app after short delay
    if (state.workerUrl) {
      const base = state.workerUrl.replace("worker","pages").replace(/workers\.dev.*/,"pages.dev").replace("wrendi-worker","wrendi");
      // Actually just open wrendi.pages.dev
    }
  } else if (res.reason === "duplicate") {
    setStatus("scrape-status","Already in your queue — open Wrendi to manage it","warn");
  } else {
    setStatus("scrape-status","Error: "+(res.reason||"check Worker URL in settings"),"error");
  }
}

// ── Apply checklist ───────────────────────────────────────────────────────────
let _manualDone = false;
function renderChecklist(job) {
  const checks = [
    { label:"ATS score ≥ 75",        done:(job.ats_score||0)>=75,   required:true  },
    { label:"Tailored resume saved",  done:!!job.tailored_resume,    required:true  },
    { label:"Work auth set",          done:!!state.profile.work_auth||!!state.profile.workAuth, required:true },
    { label:"Reviewed manually",      done:_manualDone,              required:true, toggle:true },
  ];

  $("apply-job-card").style.display = "block";
  $("apply-job-card").innerHTML = `
    <div style="font-size:13px;font-weight:600">${job.title}</div>
    <div style="font-size:11px;color:var(--text2);margin-top:2px">${job.company} · ${job.portal_name||job.portal}</div>
    ${job.ats_score?`<div style="margin-top:5px"><span class="tag ${job.ats_score>=80?"tag-green":job.ats_score>=60?"tag-amber":"tag-red"}">${job.ats_score}/100</span></div>`:""}
  `;

  const cl = $("apply-checklist"); cl.innerHTML = "";
  checks.forEach(c => {
    const el = document.createElement("div");
    el.className = `check-item ${c.done?"done":""}`;
    el.innerHTML = `<div class="check-box">${c.done?"✓":""}</div><div><div class="check-text">${c.label}</div>${c.required&&!c.done?`<div class="check-req">Required</div>`:""}</div>`;
    if (c.toggle) { el.style.cursor="pointer"; el.addEventListener("click",()=>{ _manualDone=!_manualDone; renderChecklist(job); }); }
    cl.appendChild(el);
  });

  const blocking = checks.filter(c=>c.required&&!c.done);
  $("btn-autofill").disabled = blocking.length > 0;

  if (job.flags?.length) {
    $("apply-flags").style.display = "block";
    $("apply-flags").innerHTML = "<b style='display:block;margin-bottom:4px'>⚑ Flagged:</b>" + job.flags.map(f=>`<div>• ${f}</div>`).join("");
  } else { $("apply-flags").style.display="none"; }
}

// ── Auto-fill ─────────────────────────────────────────────────────────────────
async function autoFill(jobId) {
  const job = state.jobs.find(j=>j.id===jobId||j.id===Number(jobId));
  if (!job) return;
  setStatus("apply-status","Filling form…","");
  try {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    const profileWithResume = { ...state.profile, tailoredResume: job.tailored_resume };
    const res = await new Promise(r => chrome.tabs.sendMessage(tab.id, {type:"AUTOFILL", profile:profileWithResume}, r));
    if (res?.flagged?.length) {
      $("apply-flags").style.display="block";
      $("apply-flags").innerHTML = "<b style='display:block;margin-bottom:4px'>⚑ Needs manual answers:</b>" + res.flagged.map(f=>`<div>• ${f}</div>`).join("");
      await bgMsg({ type:"FLAG_JOB", url:job.url, flags:res.flagged });
      setStatus("apply-status",`${res.filled} filled · ${res.flagged.length} need answers`,"warn");
    } else {
      setStatus("apply-status",`✓ ${res?.filled||0} fields filled — review and submit`,"success");
    }
  } catch { setStatus("apply-status","Error — make sure you're on the application form","error"); }
}

// ── Settings ──────────────────────────────────────────────────────────────────
function openSettings() {
  $("settings-overlay").style.display = "flex";
  $("worker-url-input").value = state.workerUrl || "";
  $("ext-id-box").textContent = chrome.runtime.id;
  const p = state.profile;
  $("p-name").value = p.name||""; $("p-email").value = p.email||"";
  $("p-phone").value = p.phone||""; $("p-location").value = p.location||"";
  $("p-linkedin").value = p.linkedin||""; $("p-portfolio").value = p.portfolio||"";
  $("p-workauth").value = p.work_auth||p.workAuth||"";
  $("p-salary").value = p.salary_range||p.salaryRange||"";
}

async function saveSettings() {
  const workerUrl = $("worker-url-input").value.trim();
  const profile = {
    name:$("p-name").value, email:$("p-email").value, phone:$("p-phone").value,
    location:$("p-location").value, linkedin:$("p-linkedin").value, portfolio:$("p-portfolio").value,
    work_auth:$("p-workauth").value, salary_range:$("p-salary").value,
  };
  state.workerUrl = workerUrl;
  state.profile   = { ...state.profile, ...profile };
  await new Promise(r => chrome.storage.local.set({ workerUrl, profile:state.profile }, r));
  // Also push profile to Worker
  await bgMsg({ type:"SAVE_PROFILE", profile:state.profile });
  setStatus("settings-msg","✓ Saved","success");
  setTimeout(()=>setStatus("settings-msg","",""),2000);
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.querySelector(`[data-tab="${name}"]`)?.classList.add("active");
  $(`panel-${name}`)?.classList.add("active");
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadState();

  const authed = isAuthed();
  showView(authed);

  if (!authed) {
    $("btn-open-site").addEventListener("click", () => chrome.tabs.create({ url:"https://wrendi.pages.dev" }));
    $("btn-sync-token").addEventListener("click", async () => {
      const status = $("sync-status");
      status.textContent = "Looking for session…";
      status.className = "status-row";
      // Find a wrendi.pages.dev tab and read its token
      const tabs = await chrome.tabs.query({ url: "https://wrendi.pages.dev/*" });
      if (!tabs.length) {
        status.textContent = "No Wrendi tab found — open wrendi.pages.dev first";
        status.className = "status-row error";
        return;
      }
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => localStorage.getItem("wrendi_token"),
        });
        const token = results?.[0]?.result;
        if (token) {
          await chrome.storage.local.set({ wrendi_token: token });
          status.textContent = "✓ Session synced — reloading…";
          status.className = "status-row success";
          setTimeout(() => window.location.reload(), 800);
        } else {
          status.textContent = "No session found — sign in at wrendi.pages.dev";
          status.className = "status-row error";
        }
      } catch(e) {
        status.textContent = "Error: " + e.message;
        status.className = "status-row error";
      }
    });
    return;
  }

  renderQueue();
  populateApplySelect();

  // Detect portal and update banner
  const portal = await detectPortal();
  const banner = $("page-banner");
  if (portal.isApplication) {
    banner.textContent = "📝 Application form detected — go to Apply tab.";
    banner.className = "info-box info-amber";
    switchTab("apply");
  } else if (portal.isListing) {
    banner.textContent = "✓ Job listing detected — ready to scrape.";
    banner.className = "info-box info-green";
    scrapePreview();
  } else {
    banner.textContent = "Navigate to a job listing to scrape, or an application form to auto-fill.";
    banner.className = "info-box info-blue";
  }

  // Tab switching
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", ()=>switchTab(t.dataset.tab)));

  // Scrape
  $("btn-scrape").addEventListener("click", scrapeAndSend);

  // Queue refresh
  $("btn-refresh").addEventListener("click", async () => {
    await loadState(); renderQueue(); populateApplySelect();
    setStatus("queue-label","✓ Refreshed","success");
    setTimeout(()=>{$("queue-label").textContent=`${state.jobs.length} jobs · ${state.jobs.filter(j=>j.flags?.length).length} flagged`;$("queue-label").className="panel-label";},1500);
  });

  // Apply job select
  $("apply-job-select").addEventListener("change", e => {
    _manualDone = false;
    const job = state.jobs.find(j=>j.id===e.target.value||j.id===Number(e.target.value));
    if (job) renderChecklist(job);
    else { $("apply-job-card").style.display="none"; $("apply-checklist").innerHTML=""; $("btn-autofill").disabled=true; }
  });

  $("btn-autofill").addEventListener("click", () => autoFill($("apply-job-select").value));

  // Settings
  $("btn-settings").addEventListener("click", openSettings);
  $("btn-close-settings").addEventListener("click", ()=>$("settings-overlay").style.display="none");
  $("btn-save-settings").addEventListener("click", saveSettings);
  $("btn-copy-extid").addEventListener("click", ()=>{ navigator.clipboard.writeText(chrome.runtime.id); $("btn-copy-extid").textContent="Copied!"; setTimeout(()=>$("btn-copy-extid").textContent="Copy ID",1500); });
  $("btn-open-webapp").addEventListener("click", ()=>chrome.tabs.create({url:"https://wrendi.pages.dev"}));
}

document.addEventListener("DOMContentLoaded", init);
