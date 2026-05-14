// ─── Job Ops Content Script ────────────────────────────────────────────────────
// Runs on all supported job portals. Detects whether current page is a job
// listing, job application form, or neither — and injects the appropriate UI.

(function () {
  "use strict";

  // ── Portal Detection ──────────────────────────────────────────────────────────
  const HOST = location.hostname;

  const PORTAL_MAP = [
    { key: "linkedin",       match: /linkedin\.com/,         name: "LinkedIn" },
    { key: "indeed",         match: /indeed\.com/,           name: "Indeed" },
    { key: "workday",        match: /workday\.com|myworkdayjobs\.com/, name: "Workday" },
    { key: "greenhouse",     match: /greenhouse\.io/,        name: "Greenhouse" },
    { key: "lever",          match: /lever\.co/,             name: "Lever" },
    { key: "icims",          match: /icims\.com/,            name: "iCIMS" },
    { key: "taleo",          match: /taleo\.net/,            name: "Taleo" },
    { key: "adp",            match: /adp\.com/,              name: "ADP" },
    { key: "accenture",      match: /accenture\.com/,        name: "Accenture" },
    { key: "jobvite",        match: /jobvite\.com/,          name: "Jobvite" },
    { key: "smartrecruiters",match: /smartrecruiters\.com/,  name: "SmartRecruiters" },
  ];

  const portal = PORTAL_MAP.find(p => p.match.test(HOST)) || { key: "generic", name: "Job Portal" };

  // ── Scraper Configs ───────────────────────────────────────────────────────────
  // Each portal has selectors for: title, company, location, description
  const SCRAPERS = {
    linkedin: {
      title:    [".job-details-jobs-unified-top-card__job-title h1", ".t-24.job-details-jobs-unified-top-card__job-title"],
      company:  [".job-details-jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name"],
      location: [".job-details-jobs-unified-top-card__bullet", ".job-details-jobs-unified-top-card__workplace-type"],
      jd:       ["#job-details", ".jobs-description__content", ".jobs-box__html-content"],
      isListing: () => /\/jobs\/view\//.test(location.pathname),
      isApplication: () => /\/jobs\/apply\//.test(location.pathname),
    },
    indeed: {
      title:    [".jobsearch-JobInfoHeader-title span", "[data-testid='jobsearch-JobInfoHeader-title']"],
      company:  ["[data-testid='inlineHeader-companyName'] a", ".jobsearch-CompanyInfoContainer a"],
      location: ["[data-testid='job-location']", ".jobsearch-JobInfoHeader-subtitle span:last-child"],
      jd:       ["#jobDescriptionText", ".jobsearch-jobDescriptionText"],
      isListing: () => /\/viewjob|\/pagead\/clk/.test(location.href) || !!document.querySelector("#jobDescriptionText"),
      isApplication: () => /\/apply\//.test(location.pathname),
    },
    workday: {
      title:    ["[data-automation-id='jobPostingHeader']", ".css-1q2dra3"],
      company:  ["[data-automation-id='company-name']", ".css-dmjzth"],
      location: ["[data-automation-id='locations']", ".css-13waqqa"],
      jd:       ["[data-automation-id='job-posting-description']", ".css-cygeeu"],
      isListing: () => /job\//.test(location.pathname) || !!document.querySelector("[data-automation-id='jobPostingHeader']"),
      isApplication: () => /apply/.test(location.pathname) || !!document.querySelector("[data-automation-id='firstName']"),
    },
    greenhouse: {
      title:    ["h1.app-title", ".job-post h1"],
      company:  [".company-name", "header .company"],
      location: [".location", ".job-post .location"],
      jd:       ["#content .job-post", "#application .job-post", ".content"],
      isListing: () => /\/jobs\//.test(location.pathname) && !document.querySelector("form#application_form"),
      isApplication: () => !!document.querySelector("form#application_form"),
    },
    lever: {
      title:    [".posting-headline h2", "[class*='title']"],
      company:  [".main-header-logo img[alt]", "title"],
      location: [".posting-categories .location", ".sort-by-time"],
      jd:       [".posting-page", ".section-wrapper"],
      isListing: () => !document.querySelector("form#application-form") && !!document.querySelector(".posting-headline"),
      isApplication: () => !!document.querySelector("form#application-form"),
    },
    generic: {
      title:    ["h1", "[class*='job-title']", "[class*='jobtitle']"],
      company:  ["[class*='company']", "[class*='employer']"],
      location: ["[class*='location']", "[class*='city']"],
      jd:       ["[class*='description']", "[class*='job-desc']", "main article"],
      isListing: () => false,
      isApplication: () => false,
    }
  };

  // ── Auto-fill Configs ─────────────────────────────────────────────────────────
  const FORM_FILLERS = {
    workday: {
      firstName:  ["[data-automation-id='firstName']"],
      lastName:   ["[data-automation-id='lastName']"],
      email:      ["[data-automation-id='email']"],
      phone:      ["[data-automation-id='phone']"],
      address:    ["[data-automation-id='addressLine1']"],
      city:       ["[data-automation-id='city']"],
      linkedin:   ["[data-automation-id='linkedInUrl']", "[placeholder*='LinkedIn']"],
      website:    ["[data-automation-id='portfolioUrl']", "[placeholder*='Portfolio']", "[placeholder*='Website']"],
    },
    greenhouse: {
      firstName:  ["#first_name"],
      lastName:   ["#last_name"],
      email:      ["#email"],
      phone:      ["#phone"],
      linkedin:   ["#job_application_answers_attributes_0_text_value", "[id*='linkedin']"],
      website:    ["#website", "[id*='website']", "[id*='portfolio']"],
    },
    lever: {
      firstName:  ["input[name='name']"],
      email:      ["input[name='email']"],
      phone:      ["input[name='phone']"],
      linkedin:   ["input[name='urls[LinkedIn]']", "input[placeholder*='LinkedIn']"],
      website:    ["input[name='urls[Portfolio]']", "input[placeholder*='Portfolio']"],
      resume:     ["input[type='file']"],
    },
    generic: {
      firstName:  ["input[name*='first'][type='text']", "input[autocomplete='given-name']", "input[placeholder*='First']"],
      lastName:   ["input[name*='last'][type='text']", "input[autocomplete='family-name']", "input[placeholder*='Last']"],
      email:      ["input[type='email']", "input[name*='email']", "input[autocomplete='email']"],
      phone:      ["input[type='tel']", "input[name*='phone']", "input[autocomplete='tel']"],
      linkedin:   ["input[placeholder*='LinkedIn']", "input[name*='linkedin']"],
      website:    ["input[placeholder*='Portfolio']", "input[placeholder*='Website']", "input[name*='website']"],
    }
  };

  // ── Utilities ─────────────────────────────────────────────────────────────────
  function $first(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return "";
  }

  function $el(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function fillInput(el, value) {
    if (!el || !value) return false;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value"
    )?.set;
    if (nativeInputValueSetter) nativeInputValueSetter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // ── Scrape Current Job ────────────────────────────────────────────────────────
  function scrapeJob() {
    const cfg = SCRAPERS[portal.key] || SCRAPERS.generic;
    const title    = $first(cfg.title);
    const company  = $first(cfg.company);
    const location = $first(cfg.location);
    const jdEl     = $el(cfg.jd);
    const jd       = jdEl ? jdEl.innerText.trim() : "";

    return {
      title:    title    || document.title.replace(/ [-|] .*/, "").trim(),
      company:  company  || "",
      location: location || "",
      jd:       jd       || "",
      portal:   portal.key,
      portalName: portal.name,
      url:      location.href,
      dateAdded: new Date().toISOString().slice(0, 10),
    };
  }

  // ── Auto-fill Form ────────────────────────────────────────────────────────────
  function autofillForm(profile) {
    const filler = FORM_FILLERS[portal.key] || FORM_FILLERS.generic;
    const nameParts = (profile.name || "").split(" ");
    const firstName = nameParts[0] || "";
    const lastName  = nameParts.slice(1).join(" ") || "";

    const map = {
      firstName, lastName,
      email:    profile.email,
      phone:    profile.phone,
      linkedin: profile.linkedin,
      website:  profile.portfolio,
    };

    const results = [];
    let filled = 0, flagged = [];

    for (const [field, selectors] of Object.entries(filler)) {
      const value = map[field];
      if (!value) {
        if (["email", "firstName", "lastName"].includes(field)) {
          flagged.push(field + " is empty in profile");
        }
        continue;
      }
      const el = $el(selectors);
      if (el && fillInput(el, value)) {
        filled++;
        results.push({ field, value, status: "filled" });
      }
    }

    // Find unknown/custom questions
    const allInputs = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='file']), textarea, select"));
    const knownSelectors = Object.values(filler).flat();
    const unknownFields = allInputs.filter(el => {
      const matchesKnown = knownSelectors.some(sel => el.matches(sel));
      const isEmpty = !el.value;
      return !matchesKnown && isEmpty && el.offsetParent !== null;
    });

    if (unknownFields.length > 0) {
      unknownFields.forEach(el => {
        const label = document.querySelector(`label[for='${el.id}']`);
        const labelText = label?.textContent?.trim() || el.placeholder || el.name || "Unknown field";
        flagged.push(`Custom question requires answer: "${labelText}"`);
      });
    }

    // Highlight unfilled required fields
    unknownFields.forEach(el => {
      el.style.outline = "2px solid #f59e0b";
      el.style.background = "rgba(245,158,11,0.08)";
    });

    return { filled, flagged, results };
  }

  // ── Floating Button UI ────────────────────────────────────────────────────────
  function injectListingButton() {
    if (document.getElementById("jobops-btn")) return;

    const cfg = SCRAPERS[portal.key] || SCRAPERS.generic;
    const isListing = cfg.isListing ? cfg.isListing() : false;
    if (!isListing && portal.key !== "generic") return;

    const btn = document.createElement("div");
    btn.id = "jobops-btn";
    btn.innerHTML = `
      <div class="jo-fab">
        <span class="jo-fab-icon">⬡</span>
        <span class="jo-fab-label">Add to Job Ops</span>
      </div>
    `;
    document.body.appendChild(btn);

    btn.querySelector(".jo-fab").addEventListener("click", () => {
      const job = scrapeJob();
      if (!job.title) {
        showToast("⚠ Could not detect job title. Try highlighting the title text.", "warn");
        return;
      }
      chrome.runtime.sendMessage({ type: "ADD_JOB", job }, (res) => {
        if (res?.success) {
          showToast(`✓ "${job.title}" added to queue`, "success");
          btn.querySelector(".jo-fab-label").textContent = "✓ Added!";
          btn.querySelector(".jo-fab").classList.add("jo-added");
        }
      });
    });
  }

  function injectApplicationBar() {
    if (document.getElementById("jobops-bar")) return;

    const cfg = SCRAPERS[portal.key] || SCRAPERS.generic;
    const isApp = cfg.isApplication ? cfg.isApplication() : false;
    if (!isApp) return;

    const bar = document.createElement("div");
    bar.id = "jobops-bar";
    bar.innerHTML = `
      <div class="jo-bar">
        <span class="jo-bar-logo">⬡ Job Ops</span>
        <span class="jo-bar-portal">${portal.name}</span>
        <button class="jo-bar-btn jo-fill-btn">⚡ Auto-fill from Profile</button>
        <button class="jo-bar-btn jo-check-btn">⚑ Check for flags</button>
        <span class="jo-bar-status" id="jo-status">Ready</span>
        <button class="jo-bar-close" id="jo-close">✕</button>
      </div>
      <div class="jo-flag-list" id="jo-flags" style="display:none"></div>
    `;
    document.body.appendChild(bar);

    document.getElementById("jo-close").onclick = () => bar.remove();

    bar.querySelector(".jo-fill-btn").addEventListener("click", async () => {
      const status = document.getElementById("jo-status");
      status.textContent = "Loading profile...";
      chrome.storage.local.get(["profile"], (data) => {
        const profile = data.profile || {};
        if (!profile.name && !profile.email) {
          status.textContent = "⚠ No profile saved";
          showToast("Set up your profile in the Job Ops popup first.", "warn");
          return;
        }
        const result = autofillForm(profile);
        status.textContent = `✓ Filled ${result.filled} fields`;

        if (result.flagged.length > 0) {
          const flagList = document.getElementById("jo-flags");
          flagList.style.display = "block";
          flagList.innerHTML = result.flagged.map(f =>
            `<div class="jo-flag-item">⚑ ${f}</div>`
          ).join("");
          chrome.runtime.sendMessage({
            type: "FLAG_JOB",
            flags: result.flagged,
            url: window.location.href
          });
        }
      });
    });

    bar.querySelector(".jo-check-btn").addEventListener("click", () => {
      const inputs = document.querySelectorAll("input:not([type='hidden']):not([type='file']), textarea, select");
      let empty = [];
      inputs.forEach(el => {
        if (!el.value && el.offsetParent) {
          const label = document.querySelector(`label[for='${el.id}']`);
          const name = label?.textContent?.trim() || el.placeholder || el.name || "Unknown field";
          if (name && name.length < 100) empty.push(name);
        }
      });
      const flagList = document.getElementById("jo-flags");
      flagList.style.display = "block";
      flagList.innerHTML = empty.length
        ? empty.slice(0, 10).map(f => `<div class="jo-flag-item">⚑ Empty: ${f}</div>`).join("")
        : `<div class="jo-flag-item jo-ok">✓ All visible fields appear filled</div>`;
      document.getElementById("jo-status").textContent = `${empty.length} empty fields`;
    });
  }

  function showToast(msg, type = "info") {
    const existing = document.getElementById("jobops-toast");
    if (existing) existing.remove();
    const t = document.createElement("div");
    t.id = "jobops-toast";
    t.className = `jo-toast jo-toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("jo-toast-show"), 50);
    setTimeout(() => { t.classList.remove("jo-toast-show"); setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ── Listen for messages from popup ───────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SCRAPE_JOB") {
      sendResponse({ job: scrapeJob() });
    }
    if (msg.type === "AUTOFILL") {
      const result = autofillForm(msg.profile);
      sendResponse(result);
    }
    if (msg.type === "GET_PORTAL") {
      const cfg = SCRAPERS[portal.key] || SCRAPERS.generic;
      sendResponse({
        portal: portal.key,
        portalName: portal.name,
        isListing: cfg.isListing?.() || false,
        isApplication: cfg.isApplication?.() || false,
      });
    }
    return true;
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  function init() {
    injectListingButton();
    injectApplicationBar();
  }

  // Run now and re-check on navigation (for SPAs)
  init();
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 1500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
