// ─── Wrendi Extension Background ──────────────────────────────────────────────

const WORKER_URL = "https://wrendi-worker.cindynxiong.workers.dev";

// ── On install: set defaults ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["workerUrl"], d => {
    if (!d.workerUrl) chrome.storage.local.set({ workerUrl: WORKER_URL });
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToken() {
  return new Promise(r => chrome.storage.local.get(["wrendi_token"], d => r(d.wrendi_token || "")));
}

async function workerFetch(method, path, body) {
  const [token, data] = await Promise.all([
    getToken(),
    chrome.storage.local.get(["workerUrl"])
  ]);
  const base = data.workerUrl || WORKER_URL;

  if (!token) throw new Error("Not signed in — visit wrendi.pages.dev first");

  const opts = {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${base}${path}`, opts);

  if (res.status === 401) {
    // Token expired — clear it so popup shows sign-in screen
    await chrome.storage.local.remove("wrendi_token");
    throw new Error("Session expired — visit wrendi.pages.dev to sign in again");
  }

  return res.json().catch(() => ({}));
}

// ── JWT Bridge ────────────────────────────────────────────────────────────────
// Syncs token from wrendi.pages.dev localStorage → chrome.storage
// Runs on every page load AND every DOM update on wrendi.pages.dev
async function syncTokenFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => localStorage.getItem("wrendi_token"),
    });
    const token = results?.[0]?.result;
    if (token) {
      await chrome.storage.local.set({ wrendi_token: token, workerUrl: WORKER_URL });
      console.log("Wrendi: token synced");
    }
  } catch (e) {
    // Tab not ready yet or no permission — ignore
  }
}

// Sync on tab load complete
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url?.includes("wrendi.pages.dev")) {
    // Sync on both "loading" and "complete" to catch token as early as possible
    if (changeInfo.status === "complete" || changeInfo.status === "loading") {
      setTimeout(() => syncTokenFromTab(tabId), 500);
      setTimeout(() => syncTokenFromTab(tabId), 2000); // retry after 2s for slow loads
    }
  }
});

// Sync when user switches to a wrendi tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url?.includes("wrendi.pages.dev")) {
      syncTokenFromTab(tabId);
    }
  } catch {}
});

// ── Check if token is valid, refresh if needed ────────────────────────────────
async function validateToken() {
  const token = await getToken();
  if (!token) return;
  // Decode JWT exp claim
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiresAt = payload.exp * 1000;
    const msLeft = expiresAt - Date.now();
    // If expired or less than 3 days left, clear it so popup shows sign-in
    if (msLeft < 3 * 24 * 60 * 60 * 1000) {
      await chrome.storage.local.remove("wrendi_token");
      console.log("Wrendi: token expired, cleared");
    }
  } catch {}
}

// Check token validity every 30 minutes
chrome.alarms.create("validateToken", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "validateToken") validateToken();
});

// ── Message handler ───────────────────────────────────────────────────────────
function handleMessage(msg, sender, sendResponse) {
  if (msg.type === "ADD_JOB") {
    workerFetch("POST", "/jobs", msg.job).then(res => {
      const success = res.ok !== false;
      sendResponse({ success, job: { ...msg.job, id: res.id } });
      if (success) {
        chrome.action.setBadgeText({ text: "NEW" });
        chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
      }
    }).catch(e => sendResponse({ success: false, reason: e.message }));
    return true;
  }

  if (msg.type === "GET_JOBS") {
    workerFetch("GET", "/jobs").then(jobs =>
      sendResponse({ jobs: Array.isArray(jobs) ? jobs : [] })
    ).catch(() => sendResponse({ jobs: [] }));
    return true;
  }

  if (msg.type === "UPDATE_JOB") {
    workerFetch("PUT", `/jobs/${msg.jobId}`, msg.updates)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (msg.type === "GET_PROFILE") {
    workerFetch("GET", "/profile")
      .then(p => sendResponse({ profile: p || {} }))
      .catch(() => sendResponse({ profile: {} }));
    return true;
  }

  if (msg.type === "SAVE_PROFILE") {
    workerFetch("PUT", "/profile", msg.profile)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (msg.type === "FLAG_JOB") {
    workerFetch("GET", "/jobs").then(jobs => {
      const job = (Array.isArray(jobs) ? jobs : []).find(j => j.url === msg.url);
      if (job) {
        workerFetch("PUT", `/jobs/${job.id}`, {
          flags: [...new Set([...(job.flags || []), ...msg.flags])],
          status: "flagged"
        }).then(() => sendResponse({ success: true }));
      } else {
        sendResponse({ success: false });
      }
    });
    return true;
  }

  if (msg.type === "PING") {
    sendResponse({ pong: true, version: "1.3.0" });
    return true;
  }

  if (msg.type === "GET_ALL") {
    Promise.all([
      workerFetch("GET", "/jobs"),
      workerFetch("GET", "/profile"),
      chrome.storage.local.get(["workerUrl", "wrendi_token"])
    ]).then(([jobs, profile, stored]) => {
      sendResponse({
        jobs:      Array.isArray(jobs) ? jobs : [],
        profile:   profile || {},
        workerUrl: stored.workerUrl || WORKER_URL,
        token:     stored.wrendi_token || "",
      });
    }).catch(() => sendResponse({ jobs: [], profile: {}, workerUrl: WORKER_URL, token: "" }));
    return true;
  }
}

chrome.runtime.onMessage.addListener(handleMessage);
chrome.runtime.onMessageExternal.addListener(handleMessage);
