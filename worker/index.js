// ─── Wrendi Worker ─────────────────────────────────────────────────────────────
// Cloudflare Worker — auth, jobs, AI proxy, live search, analytics
// Secrets needed: ANTHROPIC_API_KEY, JWT_SECRET, RESEND_API_KEY,
//                 RAPIDAPI_KEY, ADMIN_EMAIL

import { randomUUID } from "node:crypto";

const ORIGIN = "https://wrendi.pages.dev";

function cors(origin) {
  const allowed = [ORIGIN, "chrome-extension://"];
  const ok = !origin || allowed.some(o => origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin":  ok ? (origin || ORIGIN) : ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

const json  = (d, s=200, origin) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type":"application/json", ...cors(origin) }});
const err   = (m, s=400, origin) => json({ error: m }, s, origin);
const ok    = (d={}, origin)     => json({ ok: true, ...d }, 200, origin);

// ── JWT ───────────────────────────────────────────────────────────────────────
async function signJWT(payload, secret) {
  const enc  = s => btoa(JSON.stringify(s)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const h    = enc({ alg:"HS256", typ:"JWT" });
  const b    = enc(payload);
  const data = `${h}.${b}`;
  const key  = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig  = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const s    = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  return `${data}.${s}`;
}

async function verifyJWT(token, secret) {
  try {
    const [h, b, s] = token.split(".");
    const data = `${h}.${b}`;
    const key  = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
      { name:"HMAC", hash:"SHA-256" }, false, ["verify"]);
    const sigBuf = Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
    const valid  = await crypto.subtle.verify("HMAC", key, sigBuf, new TextEncoder().encode(data));
    if (!valid) return null;
    const payload = JSON.parse(atob(b.replace(/-/g,"+").replace(/_/g,"/")));
    if (payload.exp && Date.now()/1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

async function requireAuth(req, env) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ","").trim();
  if (!token) return null;
  const p = await verifyJWT(token, env.JWT_SECRET);
  return p?.userId || null;
}

// ── Rate limiting (5 magic links per email per 15 min) ────────────────────────
async function checkRateLimit(env, key) {
  const now     = new Date();
  const windowEnd = new Date(now.getTime() + 15*60*1000).toISOString();
  const row = await env.DB.prepare("SELECT count, window_end FROM rate_limits WHERE key = ?").bind(key).first();
  if (!row || new Date(row.window_end) < now) {
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key,count,window_end) VALUES (?,1,?)").bind(key, windowEnd).run();
    return true;
  }
  if (row.count >= 5) return false;
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return true;
}

// ── Resend email ──────────────────────────────────────────────────────────────
async function sendMagicLinkEmail(email, link, apiKey) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    "Wrendi <onboarding@resend.dev>",
      to:      [email],
      subject: "Your Wrendi sign-in link",
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0a0d14;color:#e2e8f0;border-radius:12px">
          <div style="font-family:monospace;font-size:20px;color:#60a5fa;letter-spacing:0.1em;margin-bottom:8px">⬡ WRENDI</div>
          <p style="color:#94a3b8;margin-bottom:24px">Smarter job tailoring, less chaos.</p>
          <p>Click below to sign in. This link expires in 15 minutes and can only be used once.</p>
          <a href="${link}" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:20px 0;font-size:15px">Sign In →</a>
          <p style="color:#64748b;font-size:13px">If you didn't request this, ignore it. Your account is safe.</p>
        </div>`
    })
  });
  return res.ok;
}

// ── Analytics helper ──────────────────────────────────────────────────────────
async function track(env, userId, event, properties = {}) {
  try {
    await env.DB.prepare("INSERT INTO analytics_events (id,user_id,event,properties) VALUES (?,?,?,?)")
      .bind(randomUUID(), userId || null, event, JSON.stringify(properties)).run();
  } catch {}
}

// ── Claude helper ─────────────────────────────────────────────────────────────
async function callClaude(apiKey, { prompt, system="", maxTokens=1500 }) {
  try {
    const body = { model:"claude-sonnet-4-20250514", max_tokens: maxTokens, messages:[{ role:"user", content: prompt }] };
    if (system) body.system = system;
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-api-key": apiKey, "anthropic-version":"2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) return { error: data.error.message };
    return { text: data.content?.map(b => b.text||"").join("") || "" };
  } catch (e) { return { error: e.message }; }
}

// ── Live job search via JSearch (RapidAPI) ────────────────────────────────────
async function searchJobs(query, location, page=1, rapidApiKey) {
  if (!rapidApiKey) return { results: [], error: "Search API not configured" };
  const q = location ? `${query} in ${location}` : query;
  try {
    const res = await fetch(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q)}&num_pages=1&page=${page}&date_posted=all`,
      { headers: { "X-RapidAPI-Key": rapidApiKey, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" } }
    );
    const data = await res.json();
    if (!res.ok) return { results: [], error: data.message || "Search failed" };
    const results = (data.data || []).map(j => ({
      id:          j.job_id,
      title:       j.job_title,
      company:     j.employer_name,
      location:    [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", "),
      portal:      (j.job_publisher || "").toLowerCase().replace(/\s+/g,"-"),
      portal_name: j.job_publisher || "",
      url:         j.job_apply_link || j.job_google_link,
      jd:          j.job_description || "",
      remote:      j.job_is_remote,
      salary:      j.job_min_salary ? `$${j.job_min_salary.toLocaleString()}–$${j.job_max_salary.toLocaleString()} ${j.job_salary_period||""}` : null,
      posted:      j.job_posted_at_datetime_utc,
      logo:        j.employer_logo,
    }));
    return { results, total: data.num_pages * 10 };
  } catch (e) { return { results: [], error: e.message }; }
}

// ─────────────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;
    const origin = request.headers.get("Origin") || "";

    if (method === "OPTIONS") return new Response(null, { headers: cors(origin) });

    // ── POST /auth/magic ────────────────────────────────────────────────────
    if (path === "/auth/magic" && method === "POST") {
      const { email } = await request.json().catch(()=>({}));
      if (!email?.includes("@")) return err("Valid email required", 400, origin);
      const allowed = await checkRateLimit(env, `magic:${email}`);
      if (!allowed) return err("Too many requests. Try again in 15 minutes.", 429, origin);

      let user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (!user) {
        const id = randomUUID();
        const isAdmin = email === env.ADMIN_EMAIL ? 1 : 0;
        await env.DB.prepare("INSERT INTO users (id,email,is_admin) VALUES (?,?,?)").bind(id, email, isAdmin).run();
        await env.DB.prepare("INSERT INTO profiles (user_id) VALUES (?)").bind(id).run();
        user = { id };
        await track(env, id, "signup");
      }

      const token   = randomUUID().replace(/-/g,"")+randomUUID().replace(/-/g,"");
      const expires = new Date(Date.now()+15*60*1000).toISOString();
      await env.DB.prepare("INSERT INTO auth_tokens (token,user_id,type,expires_at) VALUES (?,?,?,?)")
        .bind(token, user.id, "magic_link", expires).run();

      const link = `${url.origin}/auth/verify?token=${token}`;
      const sent = await sendMagicLinkEmail(email, link, env.RESEND_API_KEY);
      if (!sent) return err("Failed to send email. Check RESEND_API_KEY.", 500, origin);
      await track(env, user.id, "login_requested");
      return ok({ message:"Magic link sent" }, origin);
    }

    // ── GET /auth/verify ────────────────────────────────────────────────────
    if (path === "/auth/verify" && method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) return err("Token required", 400, origin);
      const row = await env.DB.prepare(
        "SELECT * FROM auth_tokens WHERE token=? AND type='magic_link' AND used=0"
      ).bind(token).first();
      if (!row || new Date(row.expires_at)<new Date()) return err("Invalid or expired link", 401, origin);
      await env.DB.prepare("UPDATE auth_tokens SET used=1 WHERE token=?").bind(token).run();
      await env.DB.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(row.user_id).run();
      const jwt = await signJWT({ userId: row.user_id, exp: Math.floor(Date.now()/1000)+30*24*3600 }, env.JWT_SECRET);
      await track(env, row.user_id, "login");
      return Response.redirect(`${ORIGIN}/#token=${jwt}`, 302);
    }

    // ── All below require auth ──────────────────────────────────────────────
    const userId = await requireAuth(request, env);

    // ── GET /auth/me ────────────────────────────────────────────────────────
    if (path === "/auth/me" && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const user = await env.DB.prepare("SELECT id,email,is_admin,created_at,last_login FROM users WHERE id=?").bind(userId).first();
      return json(user, 200, origin);
    }

    // ── GET /profile ────────────────────────────────────────────────────────
    if (path === "/profile" && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const p = await env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(userId).first();
      return json(p || {}, 200, origin);
    }

    // ── PUT /profile ────────────────────────────────────────────────────────
    if (path === "/profile" && method === "PUT") {
      if (!userId) return err("Unauthorized", 401, origin);
      const b = await request.json().catch(()=>({}));
      await env.DB.prepare(`
        INSERT INTO profiles (user_id,name,email,phone,location,linkedin,portfolio,target_role,salary_range,work_auth,work_mode,resume_text,skills,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          name=excluded.name, email=excluded.email, phone=excluded.phone,
          location=excluded.location, linkedin=excluded.linkedin, portfolio=excluded.portfolio,
          target_role=excluded.target_role, salary_range=excluded.salary_range,
          work_auth=excluded.work_auth, work_mode=excluded.work_mode,
          resume_text=excluded.resume_text, skills=excluded.skills, updated_at=datetime('now')
      `).bind(userId, b.name||"", b.email||"", b.phone||"", b.location||"", b.linkedin||"",
               b.portfolio||"", b.target_role||"", b.salary_range||"", b.work_auth||"",
               b.work_mode||"Remote", b.resume_text||"", b.skills||"").run();
      return ok({}, origin);
    }

    // ── GET /jobs ───────────────────────────────────────────────────────────
    if (path === "/jobs" && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const status = url.searchParams.get("status");
      const q      = url.searchParams.get("q");
      let query    = "SELECT * FROM jobs WHERE user_id=?";
      const params = [userId];
      if (status) { query += " AND status=?"; params.push(status); }
      if (q)      { query += " AND (title LIKE ? OR company LIKE ?)"; params.push(`%${q}%`,`%${q}%`); }
      query += " ORDER BY updated_at DESC";
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return json(results.map(j=>({...j, flags: JSON.parse(j.flags||"[]")})), 200, origin);
    }

    // ── POST /jobs ──────────────────────────────────────────────────────────
    if (path === "/jobs" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const b = await request.json().catch(()=>({}));
      if (b.url) {
        const exists = await env.DB.prepare("SELECT id FROM jobs WHERE user_id=? AND url=?").bind(userId, b.url).first();
        if (exists) return json({ ok:false, reason:"duplicate", id:exists.id }, 200, origin);
      }
      const id = randomUUID();
      await env.DB.prepare(`INSERT INTO jobs (id,user_id,title,company,location,portal,portal_name,url,jd,flags) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, userId, b.title||"", b.company||"", b.location||"", b.portal||"", b.portal_name||"", b.url||"", b.jd||"", JSON.stringify(b.flags||[])).run();
      await track(env, userId, "job_added", { portal: b.portal, has_jd: !!b.jd });
      return ok({ id }, origin);
    }

    // ── PUT /jobs/:id ───────────────────────────────────────────────────────
    const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
    if (jobMatch && method === "PUT") {
      if (!userId) return err("Unauthorized", 401, origin);
      const jobId = jobMatch[1];
      const owns  = await env.DB.prepare("SELECT id FROM jobs WHERE id=? AND user_id=?").bind(jobId, userId).first();
      if (!owns) return err("Not found", 404, origin);
      const b = await request.json().catch(()=>({}));
      const fields = ["title","company","location","portal","portal_name","url","jd","status","ats_score","tailored_resume","cover_letter","notes","date_applied"];
      const updates = [], vals = [];
      fields.forEach(f => { if (f in b) { updates.push(`${f}=?`); vals.push(b[f]); } });
      if ("flags" in b) { updates.push("flags=?"); vals.push(JSON.stringify(b.flags)); }
      updates.push("updated_at=datetime('now')");
      vals.push(jobId, userId);
      await env.DB.prepare(`UPDATE jobs SET ${updates.join(",")} WHERE id=? AND user_id=?`).bind(...vals).run();
      return ok({}, origin);
    }

    // ── DELETE /jobs/:id ────────────────────────────────────────────────────
    if (jobMatch && method === "DELETE") {
      if (!userId) return err("Unauthorized", 401, origin);
      await env.DB.prepare("DELETE FROM jobs WHERE id=? AND user_id=?").bind(jobMatch[1], userId).run();
      return ok({}, origin);
    }

    // ── POST /ai/tailor ─────────────────────────────────────────────────────
    if (path === "/ai/tailor" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { jobId, toneGuide="" } = await request.json().catch(()=>({}));
      const [job, prof] = await Promise.all([
        env.DB.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").bind(jobId, userId).first(),
        env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(userId).first(),
      ]);
      if (!job)             return err("Job not found", 404, origin);
      if (!prof?.resume_text) return err("Add your master resume in Profile first", 400, origin);
      if (!job.jd)          return err("This job has no job description saved", 400, origin);
      const res = await callClaude(env.ANTHROPIC_API_KEY, {
        system: "You are an expert resume writer and UX career coach. Tailor resumes to maximize ATS pass rates without fabricating experience. Mirror the tone of the JD precisely.",
        prompt: `Master resume:\n\n${prof.resume_text}\n\nJob description:\n\n${job.jd}\n\nTone: ${toneGuide||"Professional, data-driven, user-focused."}\n\nTailor the resume. Reorder bullets to surface most relevant experience, weave in JD keywords naturally, match company tone in summary. Return full tailored resume only.`,
      });
      if (res.error) { await track(env, userId, "error", { endpoint:"/ai/tailor", message:res.error }); return err(res.error, 502, origin); }
      await env.DB.prepare("UPDATE jobs SET tailored_resume=?, status='tailoring', updated_at=datetime('now') WHERE id=?").bind(res.text, jobId).run();
      await track(env, userId, "tailor_run", { job_id: jobId, success: true });
      return ok({ text: res.text }, origin);
    }

    // ── POST /ai/cover ──────────────────────────────────────────────────────
    if (path === "/ai/cover" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { jobId, toneGuide="" } = await request.json().catch(()=>({}));
      const [job, prof] = await Promise.all([
        env.DB.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").bind(jobId, userId).first(),
        env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(userId).first(),
      ]);
      if (!job?.jd || !prof?.resume_text) return err("Missing job or profile data", 400, origin);
      const res = await callClaude(env.ANTHROPIC_API_KEY, {
        system: "You are an expert cover letter writer. Never be generic. Mirror the company's exact tone. Lead with a hook. 3 short paragraphs max.",
        prompt: `Job: ${job.title} at ${job.company}\n\nJD:\n${job.jd}\n\nBackground:\n${prof.resume_text}\n\nTone: ${toneGuide}\n\nName: ${prof.name}, Email: ${prof.email}`,
      });
      if (res.error) return err(res.error, 502, origin);
      await env.DB.prepare("UPDATE jobs SET cover_letter=?, updated_at=datetime('now') WHERE id=?").bind(res.text, jobId).run();
      await track(env, userId, "cover_run", { job_id: jobId });
      return ok({ text: res.text }, origin);
    }

    // ── POST /ai/score ──────────────────────────────────────────────────────
    if (path === "/ai/score" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { jobId, resumeText } = await request.json().catch(()=>({}));
      const [job, prof] = await Promise.all([
        env.DB.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").bind(jobId, userId).first(),
        env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(userId).first(),
      ]);
      if (!job?.jd) return err("No JD on this job", 400, origin);
      const toScore = resumeText || job.tailored_resume || prof?.resume_text || "";
      if (!toScore) return err("No resume to score", 400, origin);
      const res = await callClaude(env.ANTHROPIC_API_KEY, {
        system: "You are an ATS scoring engine. Return ONLY valid JSON, no markdown, no explanation.",
        prompt: `Score this resume against the JD.\n\nJD:\n${job.jd}\n\nRESUME:\n${toScore}\n\nReturn ONLY JSON: {"score":85,"grade":"B+","summary":"...","matched_keywords":["k1"],"missing_keywords":["k2"],"strengths":["s1"],"suggestions":["s1"]}`,
        maxTokens: 800,
      });
      if (res.error) return err(res.error, 502, origin);
      try {
        const data   = JSON.parse(res.text.replace(/```json|```/g,"").trim());
        const status = data.score >= 80 ? "ready" : data.score >= 60 ? "scored" : "flagged";
        await env.DB.prepare("UPDATE jobs SET ats_score=?, status=?, updated_at=datetime('now') WHERE id=?").bind(data.score, status, jobId).run();
        await track(env, userId, "ats_run", { job_id: jobId, score: data.score });
        return ok(data, origin);
      } catch { return err("Failed to parse AI response", 502, origin); }
    }

    // ── POST /ai/answer ─────────────────────────────────────────────────────
    if (path === "/ai/answer" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { question, jobId } = await request.json().catch(()=>({}));
      const [job, prof] = await Promise.all([
        env.DB.prepare("SELECT title, company, jd FROM jobs WHERE id=? AND user_id=?").bind(jobId, userId).first(),
        env.DB.prepare("SELECT resume_text, name FROM profiles WHERE user_id=?").bind(userId).first(),
      ]);
      const res = await callClaude(env.ANTHROPIC_API_KEY, {
        system: "Answer job application questions concisely and authentically based only on the candidate's real background. First person. 2-4 sentences.",
        prompt: `Job: ${job?.title} at ${job?.company}\nBackground:\n${prof?.resume_text||""}\n\nQuestion: "${question}"`,
        maxTokens: 300,
      });
      if (res.error) return err(res.error, 502, origin);
      await track(env, userId, "custom_answer", { job_id: jobId });
      return ok({ text: res.text }, origin);
    }

    // ── GET /search ─────────────────────────────────────────────────────────
    if (path === "/search" && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const q        = url.searchParams.get("q") || "";
      const location = url.searchParams.get("location") || "";
      const page     = parseInt(url.searchParams.get("page")||"1");
      if (!q.trim()) return json({ results:[] }, 200, origin);
      const data = await searchJobs(q, location, page, env.RAPIDAPI_KEY);
      await track(env, userId, "search", { query: q, location, results: data.results?.length || 0 });
      return json(data, 200, origin);
    }

    // ── GET /stages/:jobId ──────────────────────────────────────────────────
    const stagesMatch = path.match(/^\/stages\/([^/]+)$/);
    if (stagesMatch && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { results } = await env.DB.prepare(
        "SELECT * FROM application_stages WHERE job_id=? AND user_id=? ORDER BY date DESC"
      ).bind(stagesMatch[1], userId).all();
      return json(results, 200, origin);
    }

    if (path === "/stages" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { job_id, stage, notes="" } = await request.json().catch(()=>({}));
      const id = randomUUID();
      await env.DB.prepare("INSERT INTO application_stages (id,job_id,user_id,stage,notes) VALUES (?,?,?,?,?)").bind(id, job_id, userId, stage, notes).run();
      if (stage === "applied") {
        await env.DB.prepare("UPDATE jobs SET status='applied', date_applied=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?").bind(job_id, userId).run();
      }
      await track(env, userId, "stage_logged", { stage });
      return ok({ id }, origin);
    }

    // ── POST /analytics/event (client-side events) ──────────────────────────
    if (path === "/analytics/event" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { event, properties={} } = await request.json().catch(()=>({}));
      if (event) await track(env, userId, event, properties);
      return ok({}, origin);
    }

    // ── GET /admin/stats (admin only) ───────────────────────────────────────
    if (path === "/admin/stats" && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const user = await env.DB.prepare("SELECT is_admin FROM users WHERE id=?").bind(userId).first();
      if (!user?.is_admin) return err("Forbidden", 403, origin);

      const [
        totalUsers, newUsers7, newUsers30, activeUsers7, activeUsers30,
        totalJobs, appliedJobs,
        tailorCount, atsCount, coverCount, answerCount, searchCount,
        errorCount, signupCount,
        topSearches, dailyActive, featureBreakdown, recentErrors,
      ] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as n FROM users").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE created_at >= datetime('now','-7 days')").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE created_at >= datetime('now','-30 days')").first(),
        env.DB.prepare("SELECT COUNT(DISTINCT user_id) as n FROM analytics_events WHERE created_at >= datetime('now','-7 days')").first(),
        env.DB.prepare("SELECT COUNT(DISTINCT user_id) as n FROM analytics_events WHERE created_at >= datetime('now','-30 days')").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM jobs").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM jobs WHERE status='applied'").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event='tailor_run'").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event='ats_run'").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event='cover_run'").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event='custom_answer'").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event='search'").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event='error'").first(),
        env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event='signup'").first(),
        env.DB.prepare("SELECT json_extract(properties,'$.query') as query, COUNT(*) as n FROM analytics_events WHERE event='search' AND query IS NOT NULL GROUP BY query ORDER BY n DESC LIMIT 10").all(),
        env.DB.prepare("SELECT date(created_at) as day, COUNT(DISTINCT user_id) as users FROM analytics_events WHERE created_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC").all(),
        env.DB.prepare("SELECT event, COUNT(*) as n FROM analytics_events WHERE event IN ('tailor_run','ats_run','cover_run','custom_answer','search','job_added') GROUP BY event ORDER BY n DESC").all(),
        env.DB.prepare("SELECT properties, created_at FROM analytics_events WHERE event='error' ORDER BY created_at DESC LIMIT 20").all(),
      ]);

      return json({
        users: {
          total: totalUsers.n, new7: newUsers7.n, new30: newUsers30.n,
          active7: activeUsers7.n, active30: activeUsers30.n, signups: signupCount.n,
        },
        jobs: { total: totalJobs.n, applied: appliedJobs.n },
        features: {
          tailors: tailorCount.n, ats: atsCount.n, covers: coverCount.n,
          answers: answerCount.n, searches: searchCount.n, errors: errorCount.n,
        },
        topSearches: topSearches.results,
        dailyActive: dailyActive.results,
        featureBreakdown: featureBreakdown.results,
        recentErrors: recentErrors.results.map(e => ({ ...e, properties: JSON.parse(e.properties||"{}") })),
      }, 200, origin);
    }

    // ── GET /admin/users (admin only) ───────────────────────────────────────
    if (path === "/admin/users" && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const user = await env.DB.prepare("SELECT is_admin FROM users WHERE id=?").bind(userId).first();
      if (!user?.is_admin) return err("Forbidden", 403, origin);
      const { results } = await env.DB.prepare(
        "SELECT u.id, u.email, u.created_at, u.last_login, COUNT(j.id) as jobs FROM users u LEFT JOIN jobs j ON j.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC"
      ).all();
      return json(results, 200, origin);
    }

    // ── GET /alerts ─────────────────────────────────────────────────────────
    if (path === "/alerts" && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { results } = await env.DB.prepare(
        "SELECT * FROM saved_searches WHERE user_id=? ORDER BY created_at DESC"
      ).bind(userId).all();
      return json(results, 200, origin);
    }

    // ── POST /alerts ─────────────────────────────────────────────────────────
    if (path === "/alerts" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { query, location="", label="", frequency="daily" } = await request.json().catch(()=>({}));
      if (!query?.trim()) return err("Query required", 400, origin);
      const id = randomUUID();
      await env.DB.prepare(
        "INSERT INTO saved_searches (id,user_id,query,location,label,frequency) VALUES (?,?,?,?,?,?)"
      ).bind(id, userId, query.trim(), location.trim(), label||query.trim(), frequency).run();
      await track(env, userId, "alert_created", { query });
      return ok({ id }, origin);
    }

    // ── PUT /alerts/:id ──────────────────────────────────────────────────────
    const alertMatch = path.match(/^\/alerts\/([^/]+)$/);
    if (alertMatch && method === "PUT") {
      if (!userId) return err("Unauthorized", 401, origin);
      const body = await request.json().catch(()=>({}));
      const fields = ["label","query","location","frequency","active"];
      const updates = [], vals = [];
      fields.forEach(f => { if (f in body) { updates.push(`${f}=?`); vals.push(body[f]); } });
      if (!updates.length) return ok({}, origin);
      vals.push(alertMatch[1], userId);
      await env.DB.prepare(`UPDATE saved_searches SET ${updates.join(",")} WHERE id=? AND user_id=?`).bind(...vals).run();
      return ok({}, origin);
    }

    // ── DELETE /alerts/:id ───────────────────────────────────────────────────
    if (alertMatch && method === "DELETE") {
      if (!userId) return err("Unauthorized", 401, origin);
      await env.DB.prepare("DELETE FROM saved_searches WHERE id=? AND user_id=?").bind(alertMatch[1], userId).run();
      return ok({}, origin);
    }

    // ── POST /alerts/:id/test ── send a test alert right now ─────────────────
    if (path.match(/^\/alerts\/[^/]+\/test$/) && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const searchId = path.split("/")[2];
      const [search, user] = await Promise.all([
        env.DB.prepare("SELECT * FROM saved_searches WHERE id=? AND user_id=?").bind(searchId, userId).first(),
        env.DB.prepare("SELECT email FROM users WHERE id=?").bind(userId).first(),
      ]);
      if (!search) return err("Not found", 404, origin);
      const sent = await sendAlertForSearch(env, user, search, true);
      return ok({ sent }, origin);
    }

    // ── POST /ai/interview-prep ──────────────────────────────────────────────
    if (path === "/ai/interview-prep" && method === "POST") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { jobId } = await request.json().catch(()=>({}));
      const [job, prof] = await Promise.all([
        env.DB.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").bind(jobId, userId).first(),
        env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(userId).first(),
      ]);
      if (!job)     return err("Job not found", 404, origin);
      if (!job.jd)  return err("No job description saved for this job", 400, origin);

      const res = await callClaude(env.ANTHROPIC_API_KEY, {
        system: "You are an expert interview coach. Generate highly specific, actionable interview prep based on the actual JD and the candidate's real background. Never be generic. Return ONLY valid JSON, no markdown.",
        prompt: `Job: ${job.title} at ${job.company}

Job Description:
${job.jd}

Candidate Background:
${prof?.resume_text || "(no resume provided)"}

Generate interview prep. Return ONLY this JSON structure:
{
  "company_context": "2-sentence overview of what this company does and values based on the JD",
  "role_focus": "What they really want in this hire — the 2-3 things that matter most",
  "questions": [
    {
      "id": "q1",
      "category": "behavioral",
      "question": "Specific question they are likely to ask",
      "why": "Why they're asking this (1 sentence)",
      "approach": "How to answer using this candidate's specific background (2-3 sentences)",
      "key_points": ["specific experience or achievement to mention", "metric or outcome to reference"]
    }
  ]
}

Categories: behavioral, technical, role_specific, culture_fit, situational
Include 10-12 questions. Make every question and every talking point specific to THIS job and THIS candidate. Reference actual experiences from their background.`,
        maxTokens: 2000,
      });

      if (res.error) { await track(env, userId, "error", { endpoint:"/ai/interview-prep", message:res.error }); return err(res.error, 502, origin); }

      try {
        const data = JSON.parse(res.text.replace(/```json|```/g,"").trim());
        // Persist to DB
        await env.DB.prepare(`
          INSERT INTO interview_prep (id,job_id,user_id,questions,generated_at,updated_at)
          VALUES (?,?,?,?,datetime('now'),datetime('now'))
          ON CONFLICT(job_id,user_id) DO UPDATE SET questions=excluded.questions, generated_at=datetime('now'), updated_at=datetime('now')
        `).bind(randomUUID(), jobId, userId, JSON.stringify(data)).run();
        await track(env, userId, "interview_prep_run", { job_id: jobId });
        return ok(data, origin);
      } catch(e) { return err("Failed to parse AI response: "+e.message, 502, origin); }
    }

    // ── GET /interview-prep/:jobId ───────────────────────────────────────────
    const prepMatch = path.match(/^\/interview-prep\/([^/]+)$/);
    if (prepMatch && method === "GET") {
      if (!userId) return err("Unauthorized", 401, origin);
      const row = await env.DB.prepare(
        "SELECT * FROM interview_prep WHERE job_id=? AND user_id=?"
      ).bind(prepMatch[1], userId).first();
      if (!row) return json(null, 200, origin);
      return json({ ...JSON.parse(row.questions), generated_at: row.generated_at }, 200, origin);
    }

    // ── PUT /interview-prep/:jobId ── save notes + done state ────────────────
    if (prepMatch && method === "PUT") {
      if (!userId) return err("Unauthorized", 401, origin);
      const { questions } = await request.json().catch(()=>({}));
      await env.DB.prepare(
        "UPDATE interview_prep SET questions=?, updated_at=datetime('now') WHERE job_id=? AND user_id=?"
      ).bind(JSON.stringify(questions), prepMatch[1], userId).run();
      return ok({}, origin);
    }

    return err("Not found", 404, origin);
  }
};

// ─── Cron: daily job alerts ────────────────────────────────────────────────────
// Triggered by wrangler.toml: crons = ["0 13 * * *"]
export { runDailyAlerts as scheduled };
async function runDailyAlerts(event, env, ctx) {
  // Get all active saved searches with user emails
  const { results: searches } = await env.DB.prepare(`
    SELECT ss.*, u.email as user_email
    FROM saved_searches ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.active = 1
  `).all();

  if (!searches.length) return;

  // Group by user so we send one email per user
  const byUser = {};
  searches.forEach(s => {
    if (!byUser[s.user_id]) byUser[s.user_id] = { email: s.user_email, searches: [] };
    byUser[s.user_id].searches.push(s);
  });

  for (const [userId, { email, searches: userSearches }] of Object.entries(byUser)) {
    const user = { id: userId, email };
    const allNewJobs = [];

    for (const search of userSearches) {
      const newJobs = await sendAlertForSearch(env, user, search, false);
      if (newJobs?.length) allNewJobs.push({ search, jobs: newJobs });
    }

    if (allNewJobs.length) {
      await sendAlertDigestEmail(env, user, allNewJobs);
    }

    // Update last_run for all searches
    for (const search of userSearches) {
      await env.DB.prepare("UPDATE saved_searches SET last_run=datetime('now') WHERE id=?").bind(search.id).run();
    }
  }
}

// Returns new jobs for a search (not previously sent), saves to alert_history
async function sendAlertForSearch(env, user, search, isTest) {
  const data = await searchJobs(search.query, search.location, 1, env.RAPIDAPI_KEY);
  if (!data.results?.length) return [];

  const newJobs = [];
  for (const job of data.results.slice(0, 10)) {
    if (isTest) { newJobs.push(job); continue; }
    try {
      await env.DB.prepare("INSERT INTO alert_history (id,user_id,search_id,job_id) VALUES (?,?,?,?)")
        .bind(randomUUID(), user.id, search.id, job.id).run();
      newJobs.push(job);
    } catch {} // UNIQUE constraint = already sent
  }
  return newJobs;
}

async function sendAlertDigestEmail(env, user, sections) {
  const date = new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  const totalJobs = sections.reduce((n, s) => n + s.jobs.length, 0);

  const jobRows = sections.map(({ search, jobs }) => `
    <div style="margin-bottom:28px">
      <div style="font-size:13px;font-family:monospace;color:#60a5fa;background:#161b27;border:1px solid #232b3e;border-radius:6px;padding:6px 12px;display:inline-block;margin-bottom:14px">
        🔍 ${search.label || search.query}${search.location ? ` · ${search.location}` : ""}
      </div>
      ${jobs.map(job => `
        <div style="border:1px solid #232b3e;border-radius:8px;padding:14px;margin-bottom:8px;background:#111520">
          <div style="font-weight:600;font-size:14px;color:#e2e8f0">${job.title}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:3px">${job.company} · ${job.location}</div>
          ${job.salary ? `<div style="font-size:12px;color:#a855f7;margin-top:4px">${job.salary}</div>` : ""}
          ${job.remote ? `<span style="font-size:11px;background:rgba(34,197,94,.12);color:#22c55e;padding:2px 8px;border-radius:20px;font-family:monospace">Remote</span>` : ""}
          ${job.jd ? `<div style="font-size:12px;color:#64748b;margin-top:8px;line-height:1.5">${job.jd.slice(0,140)}…</div>` : ""}
          <a href="${job.url}" style="display:inline-block;margin-top:10px;font-size:12px;color:#60a5fa">View & add to queue →</a>
        </div>
      `).join("")}
    </div>
  `).join("");

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#0a0d14;padding:32px;border-radius:12px">
      <div style="font-family:monospace;font-size:20px;font-weight:700;color:#60a5fa;letter-spacing:0.1em;margin-bottom:4px">⬡ WRENDI</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:24px">Job Alerts · ${date}</div>
      <div style="font-size:15px;font-weight:600;color:#e2e8f0;margin-bottom:20px">${totalJobs} new job${totalJobs>1?"s":""} matching your searches</div>
      ${jobRows}
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #232b3e">
        <a href="https://wrendi.pages.dev" style="display:inline-block;background:#3b82f6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open Wrendi →</a>
        <div style="font-size:11px;color:#64748b;margin-top:14px">Manage your alerts in Wrendi → Alerts. You're receiving this because you have active job alerts.</div>
      </div>
    </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    "Wrendi Alerts <onboarding@resend.dev>",
      to:      [user.email],
      subject: `🔔 ${totalJobs} new job${totalJobs>1?"s":""} matching your searches — ${date}`,
      html,
    }),
  });
}
