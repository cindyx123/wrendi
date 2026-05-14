// ─── Wrendi Extension Background ──────────────────────────────────────────────
// Posts scraped jobs directly to the Wrendi Worker instead of chrome.storage

const WORKER = "https://wrendi-worker.YOUR_SUBDOMAIN.workers.dev";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["workerUrl"], d => {
    if (!d.workerUrl) chrome.storage.local.set({ workerUrl: WORKER });
  });
});

function getToken() {
  return new Promise(r => chrome.storage.local.get(["wrendi_token"], d => r(d.wrendi_token || "")));
}

async function workerFetch(method, path, body) {
  const [token, data] = await Promise.all([getToken(), chrome.storage.local.get(["workerUrl"])]);
  const url = (data.workerUrl || WORKER) + path;
  const opts = { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json().catch(() => ({}));
}

function handleMessage(msg, sender, sendResponse) {
  // ADD_JOB — post to Worker
  if (msg.type === "ADD_JOB") {
    workerFetch("POST", "/jobs", msg.job).then(res => {
      const success = res.ok !== false;
      sendResponse({ success, job: { ...msg.job, id: res.id } });
      if (success) {
        chrome.action.setBadgeText({ text: "NEW" });
        chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
      }
    }).catch(e => sendResponse({ success: false, reason: e.message }));
    return true;
  }

  // GET_JOBS — fetch from Worker
  if (msg.type === "GET_JOBS") {
    workerFetch("GET", "/jobs").then(jobs => sendResponse({ jobs: Array.isArray(jobs) ? jobs : [] })).catch(() => sendResponse({ jobs: [] }));
    return true;
  }

  // UPDATE_JOB — patch in Worker
  if (msg.type === "UPDATE_JOB") {
    workerFetch("PUT", `/jobs/${msg.jobId}`, msg.updates).then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
    return true;
  }

  // GET_PROFILE — fetch from Worker
  if (msg.type === "GET_PROFILE") {
    workerFetch("GET", "/profile").then(p => sendResponse({ profile: p || {} })).catch(() => sendResponse({ profile: {} }));
    return true;
  }

  // SAVE_PROFILE — push to Worker
  if (msg.type === "SAVE_PROFILE") {
    workerFetch("PUT", "/profile", msg.profile).then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
    return true;
  }

  // FLAG_JOB
  if (msg.type === "FLAG_JOB") {
    workerFetch("GET", "/jobs").then(jobs => {
      const job = (Array.isArray(jobs) ? jobs : []).find(j => j.url === msg.url);
      if (job) workerFetch("PUT", `/jobs/${job.id}`, { flags: [...new Set([...(job.flags||[]), ...msg.flags])], status: "flagged" })
        .then(() => sendResponse({ success: true }));
      else sendResponse({ success: false });
    });
    return true;
  }

  // PING
  if (msg.type === "PING") { sendResponse({ pong: true, version: "1.2.0" }); return true; }

  // GET_ALL (for popup)
  if (msg.type === "GET_ALL") {
    Promise.all([workerFetch("GET", "/jobs"), workerFetch("GET", "/profile"), chrome.storage.local.get(["workerUrl"])])
      .then(([jobs, profile, s]) => sendResponse({ jobs: Array.isArray(jobs) ? jobs : [], profile: profile || {}, workerUrl: s.workerUrl || WORKER }))
      .catch(() => sendResponse({ jobs: [], profile: {}, workerUrl: WORKER }));
    return true;
  }
}

chrome.runtime.onMessage.addListener(handleMessage);
chrome.runtime.onMessageExternal.addListener(handleMessage);

// ── JWT bridge: when user visits wrendi.pages.dev, sync their token ───────────
// The web app writes the token to localStorage; we read it and save to chrome.storage
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("https://wrendi.pages.dev")) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const token = localStorage.getItem("wrendi_token");
        return token || null;
      }
    }).then(results => {
      const token = results?.[0]?.result;
      if (token) {
        chrome.storage.local.set({ wrendi_token: token });
      }
    }).catch(() => {});
  }
});
