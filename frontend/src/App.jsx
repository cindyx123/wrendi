import { useState, useEffect, useCallback, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "https://wrendi-worker.YOUR_SUBDOMAIN.workers.dev";

// ─── Browser-side Claude API (free via Claude.ai Pro subscription) ────────────
// When you're ready to share with others, set VITE_USE_WORKER_AI=true and
// add ANTHROPIC_API_KEY to the Worker instead.
async function callClaude(prompt, system = "") {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;
  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.map(b => b.text || "").join("") || "";
}

// ─── API client ───────────────────────────────────────────────────────────────
function useAPI() {
  const token = () => localStorage.getItem("wrendi_token") || "";
  const call = useCallback(async (method, path, body, isFormData=false) => {
    const headers = { Authorization: `Bearer ${token()}` };
    if (!isFormData) headers["Content-Type"] = "application/json";
    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);
    const res  = await fetch(`${API}${path}`, opts);
    if (res.status === 401) { localStorage.removeItem("wrendi_token"); window.location.reload(); }
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }, []);
  const trackEvent = useCallback((event, props={}) => {
    call("POST", "/analytics/event", { event, properties: props }).catch(()=>{});
  }, [call]);
  return {
    get:    (p)    => call("GET", p),
    post:   (p, b) => call("POST", p, b),
    put:    (p, b) => call("PUT", p, b),
    delete: (p)    => call("DELETE", p),
    track:  trackEvent,
  };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const G = createGlobalStyles();
function createGlobalStyles() {
  if (typeof document === "undefined") return;
  const id = "wrendi-styles";
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#0a0d14;--surf:#111520;--surf2:#161b27;--surf3:#1c2233;
      --b:#232b3e;--b2:#2d3a55;
      --a:#3b82f6;--a2:#60a5fa;--ad:rgba(59,130,246,.12);--ag:rgba(59,130,246,.25);
      --g:#22c55e;--gd:rgba(34,197,94,.12);
      --am:#f59e0b;--amd:rgba(245,158,11,.12);
      --r:#ef4444;--rd:rgba(239,68,68,.12);
      --pu:#a855f7;--pud:rgba(168,85,247,.12);
      --t:#e2e8f0;--t2:#94a3b8;--t3:#64748b;
      --mono:'IBM Plex Mono',monospace;--sans:'DM Sans',sans-serif;
    }
    html,body,#root{height:100%}
    body{background:var(--bg);color:var(--t);font-family:var(--sans);font-size:14px}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--b2);border-radius:2px}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
    @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
    .fade-in{animation:fadeIn .2s ease}
  `;
  document.head.appendChild(el);
}

// ─── Shared components ────────────────────────────────────────────────────────
const s = {
  // Layout
  app:     { display:"flex", height:"100vh", overflow:"hidden" },
  sidebar: { width:220, minWidth:220, background:"var(--surf)", borderRight:"1px solid var(--b)", display:"flex", flexDirection:"column", padding:"18px 0" },
  main:    { flex:1, overflow:"auto", background:"var(--bg)" },
  header:  { padding:"18px 26px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:"var(--bg)", zIndex:10, borderBottom:"1px solid var(--b)" },
  content: { padding:"20px 26px" },
  stack:   { display:"flex", flexDirection:"column", gap:12 },
  row:     { display:"flex", gap:10, alignItems:"center" },
  grid2:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 },
  grid4:   { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 },
  card:    { background:"var(--surf)", border:"1px solid var(--b)", borderRadius:10, padding:18 },
  // Text
  label:   { fontSize:11, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.07em", color:"var(--t3)", display:"block", marginBottom:5 },
  title:   { fontSize:17, fontWeight:600 },
  sub:     { fontSize:12, color:"var(--t3)", fontFamily:"var(--mono)", marginTop:2 },
  cardTitle: { fontSize:11, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--t3)", marginBottom:12 },
  // Inputs
  input:   { background:"var(--surf2)", border:"1px solid var(--b)", borderRadius:6, color:"var(--t)", fontSize:13, padding:"8px 12px", width:"100%", fontFamily:"var(--sans)", outline:"none" },
  textarea:{ background:"var(--surf2)", border:"1px solid var(--b)", borderRadius:6, color:"var(--t)", fontSize:13, padding:"8px 12px", width:"100%", fontFamily:"var(--sans)", outline:"none", resize:"vertical", lineHeight:1.6 },
  select:  { background:"var(--surf2)", border:"1px solid var(--b)", borderRadius:6, color:"var(--t)", fontSize:13, padding:"8px 12px", width:"100%", fontFamily:"var(--sans)", outline:"none", cursor:"pointer" },
};

function Card({ children, style={} }) {
  return <div style={{...s.card,...style}}>{children}</div>;
}
function CardTitle({ children }) {
  return <div style={s.cardTitle}>{children}</div>;
}
function Stack({ children, gap=12, style={} }) {
  return <div style={{display:"flex",flexDirection:"column",gap,...style}}>{children}</div>;
}
function Row({ children, gap=10, style={} }) {
  return <div style={{display:"flex",gap,alignItems:"center",...style}}>{children}</div>;
}

function Btn({ children, onClick, variant="ghost", size="md", disabled=false, style={} }) {
  const base = { display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,borderRadius:6,fontWeight:500,cursor:disabled?"not-allowed":"pointer",border:"none",transition:"all .15s",fontFamily:"var(--sans)",opacity:disabled?.4:1,whiteSpace:"nowrap" };
  const sizes = { sm:{padding:"5px 11px",fontSize:12}, md:{padding:"8px 15px",fontSize:13}, lg:{padding:"11px 22px",fontSize:14} };
  const variants = {
    primary: { background:"var(--a)", color:"white" },
    ghost:   { background:"transparent", color:"var(--t2)", border:"1px solid var(--b)" },
    success: { background:"var(--gd)", color:"var(--g)", border:"1px solid var(--g)" },
    danger:  { background:"var(--rd)", color:"var(--r)", border:"1px solid var(--r)" },
    amber:   { background:"var(--amd)", color:"var(--am)", border:"1px solid var(--am)" },
  };
  return <button style={{...base,...sizes[size],...variants[variant],...style}} onClick={disabled?undefined:onClick} disabled={disabled}>{children}</button>;
}

function Input({ label, ...props }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label && <span style={s.label}>{label}</span>}
      <input style={s.input} {...props}/>
    </div>
  );
}
function Textarea({ label, minHeight=100, ...props }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label && <span style={s.label}>{label}</span>}
      <textarea style={{...s.textarea,minHeight}} {...props}/>
    </div>
  );
}
function Select({ label, children, ...props }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label && <span style={s.label}>{label}</span>}
      <select style={s.select} {...props}>{children}</select>
    </div>
  );
}

function Tag({ children, color="blue" }) {
  const colors = {
    blue:  { background:"var(--ad)", color:"var(--a2)" },
    green: { background:"var(--gd)", color:"var(--g)" },
    amber: { background:"var(--amd)", color:"var(--am)" },
    red:   { background:"var(--rd)", color:"var(--r)" },
    gray:  { background:"var(--surf3)", color:"var(--t3)" },
    purple:{ background:"var(--pud)", color:"var(--pu)" },
  };
  return <span style={{ display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:20,fontSize:11,fontFamily:"var(--mono)",fontWeight:500,...colors[color]}}>{children}</span>;
}

function Alert({ children, color="blue", icon="ℹ" }) {
  const colors = {
    blue:  { background:"var(--ad)", border:"1px solid var(--a)", color:"var(--a2)" },
    green: { background:"var(--gd)", border:"1px solid var(--g)", color:"var(--g)" },
    amber: { background:"var(--amd)", border:"1px solid var(--am)", color:"var(--am)" },
    red:   { background:"var(--rd)", border:"1px solid var(--r)", color:"var(--r)" },
  };
  return (
    <div style={{ display:"flex",gap:10,padding:"11px 14px",borderRadius:8,fontSize:13,alignItems:"flex-start",...colors[color]}}>
      <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function Spinner() { return <span style={{display:"inline-block",width:14,height:14,border:"2px solid var(--b2)",borderTopColor:"var(--a)",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>; }
function Dots() { return <span style={{display:"inline-flex",gap:3,alignItems:"center"}}>{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:"currentColor",animation:`pulse 1.2s ${i*.2}s infinite`}}/>)}</span>; }

function ScoreRing({ score, size=72 }) {
  const r = size/2-6;
  const c = 2*Math.PI*r;
  const f = score?(c*score/100):0;
  const color = score>=80?"var(--g)":score>=60?"var(--am)":"var(--r)";
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surf3)" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${f} ${c}`} strokeLinecap="round"/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--mono)",fontWeight:700,fontSize:size*.24,color}}>{score??"–"}</div>
    </div>
  );
}

function CssBar({ value, max, color="var(--a)", height=6 }) {
  return (
    <div style={{background:"var(--surf3)",borderRadius:4,height,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${max?(value/max*100):0}%`,background:color,borderRadius:4,transition:"width .5s"}}/>
    </div>
  );
}

// ─── Status meta ──────────────────────────────────────────────────────────────
const ST = {
  new:      { label:"New",       color:"blue"  },
  tailoring:{ label:"Tailoring", color:"purple"},
  scored:   { label:"Scored",    color:"amber" },
  ready:    { label:"Ready ✓",   color:"green" },
  flagged:  { label:"Review",    color:"amber" },
  applied:  { label:"Applied",   color:"green" },
  skipped:  { label:"Skipped",   color:"gray"  },
};

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    if (!email.includes("@")) { setError("Enter a valid email address"); return; }
    setLoading(true); setError("");
    const res = await fetch(`${API}/auth/magic`, {
      method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(()=>({}));
    if (res.ok) setSent(true);
    else setError(data.error || "Something went wrong");
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)"}}>
      <div style={{background:"var(--surf)",border:"1px solid var(--b)",borderRadius:14,padding:40,width:380}} className="fade-in">
        <div style={{fontFamily:"var(--mono)",fontSize:22,fontWeight:700,color:"var(--a2)",letterSpacing:"0.1em",marginBottom:6}}>⬡ WRENDI</div>
        <div style={{fontSize:13,color:"var(--t3)",marginBottom:28}}>Smarter job tailoring, less chaos.</div>
        {!sent ? (
          <Stack gap={12}>
            <Input label="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" onKeyDown={e=>e.key==="Enter"&&submit()}/>
            {error && <div style={{color:"var(--r)",fontSize:12}}>{error}</div>}
            <Btn variant="primary" onClick={submit} disabled={loading} style={{width:"100%",padding:"11px 0"}}>
              {loading ? <><Dots/> Sending…</> : "Send magic link →"}
            </Btn>
            <div style={{fontSize:12,color:"var(--t3)",textAlign:"center",lineHeight:1.6}}>No password. We'll email you a sign-in link.<br/>Data stored securely in the cloud.</div>
          </Stack>
        ) : (
          <Alert color="green" icon="✓">Magic link sent to <strong>{email}</strong>. Check your inbox — expires in 15 min.</Alert>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ jobs, onNav }) {
  const flagged = jobs.filter(j=>j.flags?.length>0);
  const applied = jobs.filter(j=>j.status==="applied").length;
  const scored  = jobs.filter(j=>j.ats_score);
  const avg     = scored.length ? Math.round(scored.reduce((a,b)=>a+b.ats_score,0)/scored.length) : null;
  return (
    <Stack>
      <div style={s.grid4}>
        {[["Jobs Tracked",jobs.length,"var(--t)"],["Applied",applied,"var(--g)"],["Need Review",flagged.length,"var(--am)"],["Avg ATS",avg??"—",avg>=80?"var(--g)":avg>=60?"var(--am)":"var(--t)"]].map(([l,v,c])=>(
          <Card key={l}><div style={{fontSize:28,fontFamily:"var(--mono)",fontWeight:700,color:c}}>{v}</div><div style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em",marginTop:4}}>{l}</div></Card>
        ))}
      </div>
      {flagged.length>0 && (
        <Card>
          <CardTitle>⚑ Needs Your Attention</CardTitle>
          <Stack gap={8}>
            {flagged.map(j=>(
              <Alert key={j.id} color="amber" icon="⚠">
                <div><strong>{j.title}</strong> @ {j.company}</div>
                {j.flags.map((f,i)=><div key={i} style={{fontSize:12,marginTop:2}}>→ {f}</div>)}
              </Alert>
            ))}
          </Stack>
        </Card>
      )}
      <Card>
        <CardTitle>Pipeline</CardTitle>
        {Object.entries(ST).map(([k,v])=>{
          const n=jobs.filter(j=>j.status===k).length;
          if(!n) return null;
          return <div key={k} style={{marginBottom:10}}>
            <Row style={{marginBottom:4,justifyContent:"space-between"}}><span style={{fontSize:12}}>{v.label}</span><span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--t2)"}}>{n}</span></Row>
            <CssBar value={n} max={jobs.length}/>
          </div>;
        })}
      </Card>
    </Stack>
  );
}

// ─── Live Search ──────────────────────────────────────────────────────────────
function Search({ api, onJobAdded }) {
  const [query,    setQuery]    = useState("");
  const [location, setLocation] = useState("");
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [added,    setAdded]    = useState({});
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q, loc) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true); setError("");
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(q)}&location=${encodeURIComponent(loc)}`);
      setResults(data.results||[]);
      if (data.error) setError(data.error);
    } catch(e) { setError(e.message); setResults([]); }
    setLoading(false);
  }, [api]);

  const handleQuery = (v) => {
    setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v, location), 500);
  };

  const addToQueue = async (job) => {
    try {
      const res = await api.post("/jobs", job);
      setAdded(p=>({...p,[job.id]:"added"}));
      onJobAdded?.();
    } catch(e) {
      if (e.message.includes("duplicate")) setAdded(p=>({...p,[job.id]:"exists"}));
    }
  };

  return (
    <Stack>
      <Card>
        <div style={s.grid2}>
          <Input label="Job Title" value={query} onChange={e=>handleQuery(e.target.value)} placeholder='e.g. "UX Designer" or "Email Marketing Manager"'/>
          <Input label="Location (optional)" value={location} onChange={e=>setLocation(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch(query,location)} placeholder='e.g. "Remote" or "Atlanta, GA"'/>
        </div>
        <Row style={{marginTop:12}}>
          <Btn variant="primary" onClick={()=>doSearch(query,location)} disabled={loading||!query.trim()}>
            {loading ? <><Spinner/> Searching…</> : "🔍 Search Jobs"}
          </Btn>
          {results.length>0 && <span style={{fontSize:12,color:"var(--t3)",fontFamily:"var(--mono)"}}>{results.length} results</span>}
        </Row>
        {error && <Alert color="amber" icon="⚑" style={{marginTop:10}}>{error.includes("not configured")?"Search requires a RAPIDAPI_KEY secret in your Worker. Sign up free at rapidapi.com/letscrape-6bsfe32z/api/jsearch":error}</Alert>}
      </Card>

      {loading && !results.length && (
        <Card><Row style={{justifyContent:"center",padding:20,color:"var(--t3)"}}><Spinner/> <span style={{marginLeft:8}}>Searching across LinkedIn, Indeed, Glassdoor…</span></Row></Card>
      )}

      {results.map(job=>(
        <div key={job.id} style={{...s.card,transition:"border-color .15s",cursor:"default"}} className="fade-in">
          <Row style={{alignItems:"flex-start"}}>
            {job.logo && <img src={job.logo} alt="" style={{width:36,height:36,borderRadius:6,objectFit:"contain",background:"white",padding:2,flexShrink:0}}/>}
            <div style={{flex:1}}>
              <Row style={{justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{job.title}</div>
                  <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{job.company} · {job.location}</div>
                </div>
                <Row gap={6} style={{flexShrink:0}}>
                  {job.remote && <Tag color="green">Remote</Tag>}
                  {job.salary && <Tag color="purple">{job.salary}</Tag>}
                  <Tag color="gray">{job.portal_name||job.portal}</Tag>
                </Row>
              </Row>
              {job.jd && <div style={{fontSize:12,color:"var(--t3)",marginTop:8,lineHeight:1.5,maxHeight:48,overflow:"hidden"}}>{job.jd.slice(0,200)}…</div>}
              <Row style={{marginTop:10,gap:8}}>
                <Btn size="sm" variant={added[job.id]==="added"?"success":added[job.id]==="exists"?"ghost":"primary"} onClick={()=>addToQueue(job)} disabled={!!added[job.id]}>
                  {added[job.id]==="added"?"✓ Added":added[job.id]==="exists"?"Already in queue":"+ Add to Queue"}
                </Btn>
                {job.url && <a href={job.url} target="_blank" rel="noopener" style={{fontSize:12,color:"var(--a2)"}}>View posting →</a>}
                {job.posted && <span style={{fontSize:11,color:"var(--t3)",fontFamily:"var(--mono)",marginLeft:"auto"}}>{new Date(job.posted).toLocaleDateString()}</span>}
              </Row>
            </div>
          </Row>
        </div>
      ))}

      {!loading && !results.length && query && (
        <Card><div style={{textAlign:"center",padding:24,color:"var(--t3)"}}>No results for "{query}". Try different keywords or check your RAPIDAPI_KEY.</div></Card>
      )}
      {!query && (
        <Card><div style={{textAlign:"center",padding:24,color:"var(--t3)",lineHeight:1.8}}>Search for jobs across LinkedIn, Indeed, Glassdoor, and more.<br/><span style={{fontSize:12}}>Results come from JSearch via RapidAPI — 500 free searches/month.</span></div></Card>
      )}
    </Stack>
  );
}

// ─── Job Queue ────────────────────────────────────────────────────────────────
function Queue({ jobs, api, onRefresh, onSelect }) {
  const [showAdd, setShowAdd] = useState(false);
  const [filter,  setFilter]  = useState("all");
  const [search,  setSearch]  = useState("");
  const [form,    setForm]    = useState({ title:"",company:"",location:"",portal:"linkedin",url:"",jd:"" });
  const [loading, setLoading] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [editJD,  setEditJD]  = useState("");
  const [editMsg, setEditMsg] = useState("");
  const [viewJob, setViewJob] = useState(null);
  const [viewMode, setViewMode] = useState("resume"); // resume | cover

  const filtered = jobs
    .filter(j=>filter==="all"||j.status===filter)
    .filter(j=>!search||`${j.title} ${j.company}`.toLowerCase().includes(search.toLowerCase()));

  const addJob = async () => {
    if (!form.title||!form.company) return;
    setLoading(true);
    try { await api.post("/jobs", form); onRefresh(); setShowAdd(false); setForm({ title:"",company:"",location:"",portal:"linkedin",url:"",jd:"" }); }
    catch(e) { alert(e.message); }
    setLoading(false);
  };

  const remove = async (id) => { await api.delete(`/jobs/${id}`); onRefresh(); };
  const openEdit = (job) => { setEditJob(job); setEditJD(job.jd||""); setEditMsg(""); };
  const openView = (job, mode) => { setViewJob(job); setViewMode(mode); };

  const saveEdit = async () => {
    if (!editJob) return;
    try {
      await api.put(`/jobs/${editJob.id}`, { jd: editJD });
      setEditMsg("✓ Saved");
      onRefresh();
      setTimeout(()=>{ setEditMsg(""); setEditJob(null); }, 1500);
    } catch(e) { setEditMsg("Error: "+e.message); }
  };

  return (
    <Stack>
      {/* View saved resume / cover letter modal */}
      {viewJob && (
        <div style={{position:"fixed",inset:0,background:"rgba(10,13,20,.92)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"var(--surf)",border:"1px solid var(--b)",borderRadius:12,width:"100%",maxWidth:680,maxHeight:"85vh",display:"flex",flexDirection:"column"}} className="fade-in">
            <div style={{padding:"16px 20px",borderBottom:"1px solid var(--b)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{viewJob.title} @ {viewJob.company}</div>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  {viewJob.tailored_resume && (
                    <span onClick={()=>setViewMode("resume")} style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontFamily:"var(--mono)",cursor:"pointer",background:viewMode==="resume"?"var(--ad)":"var(--surf2)",color:viewMode==="resume"?"var(--a2)":"var(--t3)",border:`1px solid ${viewMode==="resume"?"var(--a)":"var(--b)"}`}}>
                      Tailored Resume
                    </span>
                  )}
                  {viewJob.cover_letter && (
                    <span onClick={()=>setViewMode("cover")} style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontFamily:"var(--mono)",cursor:"pointer",background:viewMode==="cover"?"var(--pud)":"var(--surf2)",color:viewMode==="cover"?"var(--pu)":"var(--t3)",border:`1px solid ${viewMode==="cover"?"var(--pu)":"var(--b)"}`}}>
                      Cover Letter
                    </span>
                  )}
                </div>
              </div>
              <Row gap={8}>
                <Btn size="sm" variant="ghost" onClick={()=>navigator.clipboard.writeText(viewMode==="resume"?viewJob.tailored_resume:viewJob.cover_letter)}>
                  Copy
                </Btn>
                <Btn size="sm" onClick={()=>setViewJob(null)}>✕ Close</Btn>
              </Row>
            </div>
            <div style={{padding:20,overflowY:"auto",flex:1}}>
              <div style={{background:"var(--surf2)",border:"1px solid var(--b)",borderRadius:8,padding:16,fontSize:13,lineHeight:1.8,color:"var(--t2)",whiteSpace:"pre-wrap",fontFamily:"var(--sans)"}}>
                {viewMode==="resume" ? viewJob.tailored_resume : viewJob.cover_letter}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit JD panel */}
      {editJob && (
        <Card style={{borderColor:"var(--a)"}}>
          <Row style={{justifyContent:"space-between",marginBottom:12}}>
            <div>
              <div style={{fontWeight:600}}>{editJob.title} @ {editJob.company}</div>
              <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>Paste the full job description so AI features work correctly</div>
            </div>
            <Btn size="sm" onClick={()=>setEditJob(null)}>✕</Btn>
          </Row>
          <Textarea label="Job Description" minHeight={200} value={editJD} onChange={e=>setEditJD(e.target.value)} placeholder="Paste the full job description here…"/>
          <Row style={{marginTop:10}}>
            <Btn variant="primary" onClick={saveEdit}>Save JD</Btn>
            <Btn onClick={()=>setEditJob(null)}>Cancel</Btn>
            {editMsg && <span style={{fontSize:12,color:editMsg.startsWith("✓")?"var(--g)":"var(--r)",fontFamily:"var(--mono)"}}>{editMsg}</span>}
          </Row>
        </Card>
      )}

      <Row style={{flexWrap:"wrap",gap:8}}>
        <input style={{...s.input,flex:1,minWidth:160}} placeholder="Search title or company…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select style={{...s.select,width:150}} value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(ST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <Btn variant="primary" onClick={()=>setShowAdd(v=>!v)}>+ Add Job</Btn>
      </Row>

      {showAdd && (
        <Card>
          <CardTitle>Add Job Manually</CardTitle>
          <div style={s.grid2}>
            <Input label="Title" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="UX Designer II"/>
            <Input label="Company" value={form.company} onChange={e=>setForm(p=>({...p,company:e.target.value}))} placeholder="Fidelity Investments"/>
            <Input label="Location" value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))} placeholder="Remote"/>
            <Select label="Portal" value={form.portal} onChange={e=>setForm(p=>({...p,portal:e.target.value}))}>
              {["linkedin","indeed","workday","greenhouse","lever","icims","taleo","adp","accenture","jobvite"].map(p=><option key={p}>{p}</option>)}
            </Select>
          </div>
          <div style={{marginTop:10}}><Input label="URL" value={form.url} onChange={e=>setForm(p=>({...p,url:e.target.value}))} placeholder="https://…"/></div>
          <div style={{marginTop:10}}><Textarea label="Job Description" minHeight={140} value={form.jd} onChange={e=>setForm(p=>({...p,jd:e.target.value}))} placeholder="Paste full JD…"/></div>
          <Row style={{marginTop:12}}>
            <Btn variant="primary" onClick={addJob} disabled={loading}>{loading?<Dots/>:"Add to Queue"}</Btn>
            <Btn onClick={()=>setShowAdd(false)}>Cancel</Btn>
          </Row>
        </Card>
      )}

      <div style={{fontSize:12,color:"var(--t3)",fontFamily:"var(--mono)"}}>{filtered.length} jobs</div>

      <Stack>
        {filtered.map(j=>(
          <Card key={j.id} style={j.flags?.length?{borderColor:"var(--am)",background:"var(--amd)"}:{}}>
            <Row style={{alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600}}>{j.title}</div>
                <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{j.company} · {j.location} · {j.date_added?.slice(0,10)}</div>
                {j.flags?.length>0 && <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>{j.flags.map((f,i)=><Tag key={i} color="amber">⚑ {f}</Tag>)}</div>}
              </div>
              {j.ats_score && <ScoreRing score={j.ats_score} size={50}/>}
            </Row>
            <Row style={{marginTop:10,flexWrap:"wrap",gap:6}}>
              <Tag color={ST[j.status]?.color||"gray"}>{ST[j.status]?.label||j.status}</Tag>
              <Tag color="gray">{j.portal_name||j.portal}</Tag>
              {j.jd ? <Tag color="green">✓ JD</Tag> : <Tag color="red">⚑ No JD</Tag>}
              {j.tailored_resume && <Tag color="green">✓ Tailored</Tag>}
              {j.cover_letter    && <Tag color="purple">✓ Cover</Tag>}
            </Row>
            <Row style={{marginTop:10,gap:6,flexWrap:"wrap"}}>
              <Btn size="sm" variant="primary" onClick={()=>onSelect(j)}>Apply →</Btn>
              <Btn size="sm" variant="ghost" onClick={()=>openEdit(j)}>
                {j.jd ? "Edit JD" : "⚑ Add JD"}
              </Btn>
              {j.tailored_resume && (
                <Btn size="sm" variant="ghost" onClick={()=>openView(j,"resume")}>View Resume</Btn>
              )}
              {j.cover_letter && (
                <Btn size="sm" variant="ghost" onClick={()=>openView(j,"cover")}>View Cover</Btn>
              )}
              {j.url && <a href={j.url} target="_blank" rel="noopener" style={{fontSize:12,color:"var(--a2)"}}>Posting</a>}
              <Btn size="sm" variant="danger" style={{marginLeft:"auto"}} onClick={()=>remove(j.id)}>Remove</Btn>
            </Row>
          </Card>
        ))}
        {!filtered.length && <Alert color="blue">No jobs match. Add one above or use Search to find jobs live.</Alert>}
      </Stack>
    </Stack>
  );
}


// ─── Resume Studio ────────────────────────────────────────────────────────────
function Studio({ jobs, api, onRefresh }) {
  const [jobId,  setJobId]  = useState("");
  const [tone,   setTone]   = useState("Professional, data-driven, user-focused. Match the company's tone.");
  const [mode,   setMode]   = useState("tailor");
  const [result, setResult] = useState("");
  const [loading,setLoading]= useState(false);
  const [status, setStatus] = useState("");

  const run = async () => {
    if (!jobId) { setStatus("Select a job first"); return; }
    setLoading(true); setResult(""); setStatus("Working…");
    try {
      const data = await api.post(mode==="tailor"?"/ai/tailor":"/ai/cover", { jobId, toneGuide:tone });
      setResult(data.text||"");
      setStatus("✓ Saved to job automatically");
      onRefresh();
    } catch(e) { setStatus("Error: "+e.message); }
    setLoading(false);
  };

  const withJD = jobs.filter(j=>j.jd);

  return (
    <Stack>
      <div style={{display:"flex",borderBottom:"1px solid var(--b)",marginBottom:4}}>
        {[["tailor","Tailor Resume"],["cover","Cover Letter"]].map(([k,l])=>(
          <div key={k} onClick={()=>setMode(k)} style={{padding:"9px 16px",fontSize:13,cursor:"pointer",color:mode===k?"var(--a2)":"var(--t3)",borderBottom:mode===k?"2px solid var(--a)":"2px solid transparent",marginBottom:-1,fontWeight:mode===k?500:400}}>{l}</div>
        ))}
      </div>
      <Card>
        <CardTitle>Select Job from Queue</CardTitle>
        <select style={s.select} value={jobId} onChange={e=>setJobId(e.target.value)}>
          <option value="">— choose a job —</option>
          {withJD.map(j=><option key={j.id} value={j.id}>{j.title} @ {j.company}</option>)}
        </select>
        {!withJD.length && <Alert color="amber" style={{marginTop:10}} icon="⚑">Add jobs with a job description first — via Search or manually in Queue.</Alert>}
      </Card>
      <Card>
        <CardTitle>Tone Guidance</CardTitle>
        <Textarea minHeight={65} value={tone} onChange={e=>setTone(e.target.value)}/>
      </Card>
      <Row>
        <Btn variant="primary" onClick={run} disabled={loading||!jobId}>
          {loading?<><Dots/> Working…</>:mode==="tailor"?"✦ Tailor Resume":"✉ Write Cover Letter"}
        </Btn>
        {result && <Btn size="sm" onClick={()=>navigator.clipboard.writeText(result)}>Copy</Btn>}
        {status && <span style={{fontSize:12,color:status.startsWith("✓")?"var(--g)":"var(--am)",fontFamily:"var(--mono)"}}>{status}</span>}
      </Row>
      {result && (
        <Card>
          <CardTitle>Result — auto-saved to job</CardTitle>
          <div style={{background:"var(--surf2)",border:"1px solid var(--b)",borderRadius:8,padding:14,fontSize:13,lineHeight:1.7,color:"var(--t2)",whiteSpace:"pre-wrap",maxHeight:360,overflowY:"auto"}}>{result}</div>
        </Card>
      )}
    </Stack>
  );
}

// ─── ATS Scorer ───────────────────────────────────────────────────────────────
function ATS({ jobs, api, onRefresh }) {
  const [jobId,  setJobId]  = useState("");
  const [extra,  setExtra]  = useState("");
  const [result, setResult] = useState(null);
  const [loading,setLoading]= useState(false);
  const [status, setStatus] = useState("");

  const run = async () => {
    if (!jobId) { setStatus("Select a job first"); return; }
    setLoading(true); setResult(null); setStatus("Analyzing…");
    try {
      const data = await api.post("/ai/score", { jobId, resumeText:extra||undefined });
      setResult(data); setStatus(`${data.score}/100 · ${data.grade} · saved`);
      onRefresh();
    } catch(e) { setStatus("Error: "+e.message); }
    setLoading(false);
  };

  return (
    <Stack>
      <Card>
        <CardTitle>Select Job</CardTitle>
        <select style={s.select} value={jobId} onChange={e=>setJobId(e.target.value)}>
          <option value="">— choose a job —</option>
          {jobs.filter(j=>j.jd).map(j=><option key={j.id} value={j.id}>{j.title} @ {j.company}</option>)}
        </select>
      </Card>
      <Card>
        <CardTitle>Resume to Score (optional — uses saved tailored resume if blank)</CardTitle>
        <Textarea minHeight={120} value={extra} onChange={e=>setExtra(e.target.value)} placeholder="Paste a specific version, or leave blank…"/>
      </Card>
      <Row>
        <Btn variant="primary" onClick={run} disabled={loading||!jobId}>{loading?<><Dots/> Analyzing…</>:"⚡ Run ATS Score"}</Btn>
        {status && <span style={{fontSize:12,color:"var(--t2)",fontFamily:"var(--mono)"}}>{status}</span>}
      </Row>
      {result && (
        <Stack>
          <Card>
            <Row style={{alignItems:"flex-start",gap:18}}>
              <ScoreRing score={result.score} size={90}/>
              <div style={{flex:1}}>
                <div style={{fontSize:22,fontFamily:"var(--mono)",fontWeight:700}}>Grade: {result.grade}</div>
                <div style={{color:"var(--t2)",marginTop:6,fontSize:13,lineHeight:1.6}}>{result.summary}</div>
              </div>
            </Row>
          </Card>
          <div style={s.grid2}>
            <Card>
              <CardTitle style={{color:"var(--g)"}}>✓ Matched Keywords</CardTitle>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>{result.matched_keywords?.map((k,i)=><Tag key={i} color="green">{k}</Tag>)}</div>
              <CardTitle style={{color:"var(--r)"}}>✗ Missing Keywords</CardTitle>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{result.missing_keywords?.map((k,i)=><Tag key={i} color="red">{k}</Tag>)}</div>
            </Card>
            <Card>
              <CardTitle>Suggestions</CardTitle>
              {result.suggestions?.map((s,i)=><div key={i} style={{fontSize:13,color:"var(--t2)",marginBottom:8,paddingLeft:10,borderLeft:"2px solid var(--a)"}}>→ {s}</div>)}
            </Card>
          </div>
        </Stack>
      )}
    </Stack>
  );
}

// ─── Apply Panel ──────────────────────────────────────────────────────────────
function Apply({ job, jobs, api, onRefresh, onSelect }) {
  const [ansQ,   setAnsQ]   = useState("");
  const [ansA,   setAnsA]   = useState("");
  const [ansLoad,setAnsLoad]= useState(false);
  const [stage,  setStage]  = useState("");
  const [sNote,  setSNote]  = useState("");
  const [stages, setStages] = useState([]);
  const [sMsg,   setSMsg]   = useState("");
  const [manual, setManual] = useState(false);

  useEffect(()=>{ if(job?.id) api.get(`/stages/${job.id}`).then(setStages).catch(()=>{}); }, [job?.id]);

  const draftAnswer = async () => {
    if (!ansQ||!job) return;
    setAnsLoad(true); setAnsA("");
    try { const d=await api.post("/ai/answer",{question:ansQ,jobId:job.id}); setAnsA(d.text||""); }
    catch(e) { setAnsA("Error: "+e.message); }
    setAnsLoad(false);
  };

  const logStage = async () => {
    if (!stage||!job) return;
    await api.post("/stages",{job_id:job.id,stage,notes:sNote});
    setSMsg("✓ Logged"); onRefresh();
    api.get(`/stages/${job.id}`).then(setStages).catch(()=>{});
    setTimeout(()=>setSMsg(""),2000);
  };

  if (!job) return (
    <Stack>
      <Alert color="blue">Select a job from the Queue to open the Apply panel.</Alert>
      <Stack>
        {jobs.filter(j=>j.status!=="applied").slice(0,6).map(j=>(
          <Card key={j.id} style={{cursor:"pointer"}} onClick={()=>onSelect(j)}>
            <Row style={{justifyContent:"space-between"}}>
              <div><div style={{fontWeight:600}}>{j.title}</div><div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{j.company} · {j.location}</div></div>
              <Row gap={6}><Tag color={ST[j.status]?.color||"gray"}>{ST[j.status]?.label}</Tag>{j.ats_score&&<Tag color={j.ats_score>=80?"green":j.ats_score>=60?"amber":"red"}>ATS {j.ats_score}</Tag>}</Row>
            </Row>
          </Card>
        ))}
      </Stack>
    </Stack>
  );

  const checks = [
    { label:"ATS score ≥ 75",        done:(job.ats_score||0)>=75, required:true  },
    { label:"Tailored resume saved",  done:!!job.tailored_resume,   required:true  },
    { label:"Cover letter drafted",   done:!!job.cover_letter,      required:false },
    { label:"Reviewed application",   done:manual, required:true, toggle:true },
  ];
  const blocking = checks.filter(c=>c.required&&!c.done);

  return (
    <Stack>
      <Card>
        <Row style={{alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:16}}>{job.title}</div>
            <div style={{fontSize:13,color:"var(--t2)",marginTop:3}}>{job.company} · {job.location}</div>
            {job.url&&<a href={job.url} target="_blank" rel="noopener" style={{fontSize:12,color:"var(--a2)",display:"block",marginTop:6}}>Open job posting →</a>}
          </div>
          {job.ats_score&&<ScoreRing score={job.ats_score} size={66}/>}
        </Row>
      </Card>

      <Card>
        <CardTitle>Pre-Apply Checklist</CardTitle>
        {checks.map((c,i)=>(
          <div key={i} onClick={c.toggle?()=>setManual(v=>!v):undefined}
            style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 11px",borderRadius:6,background:"var(--surf2)",border:"1px solid var(--b)",marginBottom:6,cursor:c.toggle?"pointer":"default",opacity:c.done?.5:1}}>
            <div style={{width:16,height:16,borderRadius:3,border:"1px solid var(--b2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,background:c.done?"var(--g)":"transparent",borderColor:c.done?"var(--g)":"var(--b2)",color:c.done?"#0a0d14":"transparent",marginTop:1}}>{c.done?"✓":""}</div>
            <div><div style={{fontSize:13}}>{c.label}</div>{c.required&&!c.done&&<div style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--am)",marginTop:2}}>Required — complete in Studio or Profile</div>}</div>
          </div>
        ))}
        {blocking.length>0&&<Alert color="amber" icon="⚑" style={{marginTop:6}}>{blocking.length} item{blocking.length>1?"s":""} still needed before applying.</Alert>}
      </Card>

      <Card>
        <CardTitle>🤖 Custom Question Drafter</CardTitle>
        <div style={{fontSize:12,color:"var(--t2)",marginBottom:10}}>Paste any custom question from the application form — AI drafts an answer from your background.</div>
        <Textarea minHeight={65} value={ansQ} onChange={e=>setAnsQ(e.target.value)} placeholder={`"Why do you want to work at ${job.company}?"`}/>
        <Btn size="sm" style={{marginTop:8}} onClick={draftAnswer} disabled={ansLoad||!ansQ}>{ansLoad?<><Dots/> Drafting…</>:"✦ Draft Answer"}</Btn>
        {ansA&&<div style={{marginTop:10}}>
          <div style={{background:"var(--surf2)",border:"1px solid var(--b)",borderRadius:6,padding:12,fontSize:13,lineHeight:1.7,color:"var(--t2)"}}>{ansA}</div>
          <Btn size="sm" style={{marginTop:6}} onClick={()=>navigator.clipboard.writeText(ansA)}>Copy</Btn>
        </div>}
      </Card>

      <Card>
        <CardTitle>Application Stage Tracker</CardTitle>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          {["applied","phone_screen","interview","final_round","offer","rejected","withdrawn"].map(st=>(
            <span key={st} onClick={()=>setStage(st)} style={{padding:"4px 10px",borderRadius:20,fontSize:11,fontFamily:"var(--mono)",cursor:"pointer",background:stage===st?"var(--ad)":"var(--surf3)",color:stage===st?"var(--a2)":"var(--t3)",border:`1px solid ${stage===st?"var(--a)":"var(--b)"}`,transition:"all .15s"}}>{st.replace("_"," ")}</span>
          ))}
        </div>
        <Textarea minHeight={50} value={sNote} onChange={e=>setSNote(e.target.value)} placeholder="Notes (interviewer, date, etc.)"/>
        <Row style={{marginTop:8}}>
          <Btn size="sm" variant="success" onClick={logStage} disabled={!stage}>Log Stage</Btn>
          {sMsg&&<span style={{fontSize:12,color:"var(--g)",fontFamily:"var(--mono)"}}>{sMsg}</span>}
        </Row>
        {stages.length>0&&<div style={{marginTop:14}}>
          {stages.map((st,i)=>(
            <div key={i} style={{display:"flex",gap:12,fontSize:12,color:"var(--t2)",padding:"6px 0",borderBottom:"1px solid var(--b)"}}>
              <span style={{fontFamily:"var(--mono)",color:"var(--a2)",minWidth:110}}>{st.stage.replace("_"," ")}</span>
              <span style={{flex:1}}>{st.notes}</span>
              <span style={{color:"var(--t3)"}}>{st.date?.slice(0,10)}</span>
            </div>
          ))}
        </div>}
      </Card>
    </Stack>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function Profile({ api }) {
  const [p,  setP]   = useState(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ api.get("/profile").then(d=>setP(d||{})).catch(()=>setP({})); },[]);
  const u = (k,v) => setP(prev=>({...prev,[k]:v}));

  const save = async () => {
    setSaving(true);
    try { await api.put("/profile", p); setMsg("✓ Saved to cloud"); }
    catch(e) { setMsg("Error: "+e.message); }
    setSaving(false); setTimeout(()=>setMsg(""),2500);
  };

  if (!p) return <Row style={{padding:30,justifyContent:"center",color:"var(--t3)"}}><Spinner/> <span style={{marginLeft:8}}>Loading…</span></Row>;

  return (
    <Stack>
      <Card>
        <CardTitle>Personal Information</CardTitle>
        <div style={s.grid2}>
          {[["name","Full Name"],["email","Email"],["phone","Phone"],["location","Location"],["linkedin","LinkedIn URL"],["portfolio","Portfolio URL"]].map(([k,l])=>(
            <Input key={k} label={l} value={p[k]||""} onChange={e=>u(k,e.target.value)}/>
          ))}
        </div>
      </Card>
      <Card>
        <CardTitle>Job Preferences</CardTitle>
        <div style={s.grid2}>
          <Input label="Target Role(s)" value={p.target_role||""} onChange={e=>u("target_role",e.target.value)} placeholder="UX Designer"/>
          <Input label="Salary Range" value={p.salary_range||""} onChange={e=>u("salary_range",e.target.value)} placeholder="$90k–$120k"/>
          <Select label="Work Authorization" value={p.work_auth||""} onChange={e=>u("work_auth",e.target.value)}>
            <option value="">Select…</option>
            <option>US Citizen</option><option>Green Card</option><option>H1-B (requires sponsorship)</option><option>EAD / OPT</option>
          </Select>
          <Select label="Work Mode" value={p.work_mode||"Remote"} onChange={e=>u("work_mode",e.target.value)}>
            <option>Remote</option><option>Hybrid</option><option>On-site</option><option>Any</option>
          </Select>
        </div>
      </Card>
      <Card>
        <CardTitle>Master Resume</CardTitle>
        <Alert color="blue" style={{marginBottom:12}}>Plain text. Used as the base for all AI tailoring. Stored encrypted in Cloudflare D1.</Alert>
        <Textarea minHeight={260} value={p.resume_text||""} onChange={e=>u("resume_text",e.target.value)} placeholder="Paste your full resume here…"/>
      </Card>
      <Card>
        <CardTitle>Key Skills (comma-separated)</CardTitle>
        <Textarea minHeight={70} value={p.skills||""} onChange={e=>u("skills",e.target.value)} placeholder="UX Design, Figma, SFMC, HTML, CSS…"/>
      </Card>
      <Row>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving?<Dots/>:"Save to Cloud"}</Btn>
        {msg&&<span style={{fontSize:12,color:msg.startsWith("✓")?"var(--g)":"var(--r)",fontFamily:"var(--mono)"}}>{msg}</span>}
      </Row>
    </Stack>
  );
}

// ─── Analytics Dashboard (admin only) ────────────────────────────────────────
function Analytics({ api }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [tab,   setTab]   = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(()=>{
    setLoading(true);
    Promise.all([api.get("/admin/stats"), api.get("/admin/users")])
      .then(([s, u])=>{ setStats(s); setUsers(u); })
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false));
  },[]);

  if (loading) return <Row style={{padding:40,justifyContent:"center",color:"var(--t3)"}}><Spinner/> <span style={{marginLeft:8}}>Loading analytics…</span></Row>;
  if (error) return <Alert color="red" icon="✗">{error.includes("Forbidden")?"Admin access only — set ADMIN_EMAIL secret to your email and sign in.":error}</Alert>;
  if (!stats) return null;

  const { users:u, jobs:j, features:f, topSearches, dailyActive, featureBreakdown, recentErrors } = stats;
  const maxDaily = Math.max(...(dailyActive||[]).map(d=>d.users), 1);
  const maxFeat  = Math.max(...(featureBreakdown||[]).map(d=>d.n), 1);

  const FEAT_LABELS = { tailor_run:"Resume Tailoring", ats_run:"ATS Scoring", cover_run:"Cover Letter", custom_answer:"Custom Q&A", search:"Job Search", job_added:"Jobs Added" };
  const FEAT_COLORS = { tailor_run:"var(--a)", ats_run:"var(--am)", cover_run:"var(--pu)", custom_answer:"var(--g)", search:"var(--a2)", job_added:"var(--t2)" };

  return (
    <Stack>
      <div style={{display:"flex",borderBottom:"1px solid var(--b)",marginBottom:4}}>
        {[["overview","Overview"],["users","Users"],["errors","Errors"]].map(([k,l])=>(
          <div key={k} onClick={()=>setTab(k)} style={{padding:"9px 16px",fontSize:13,cursor:"pointer",color:tab===k?"var(--a2)":"var(--t3)",borderBottom:tab===k?"2px solid var(--a)":"2px solid transparent",marginBottom:-1,fontWeight:tab===k?500:400}}>{l}</div>
        ))}
      </div>

      {tab==="overview" && (
        <Stack>
          {/* User stats */}
          <div style={s.grid4}>
            {[["Total Users",u.total,"var(--t)"],["Active (7d)",u.active7,"var(--a2)"],["Active (30d)",u.active30,"var(--g)"],["New (30d)",u.new30,"var(--am)"]].map(([l,v,c])=>(
              <Card key={l}><div style={{fontSize:26,fontFamily:"var(--mono)",fontWeight:700,color:c}}>{v}</div><div style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em",marginTop:4}}>{l}</div></Card>
            ))}
          </div>
          {/* Job + feature stats */}
          <div style={s.grid4}>
            {[["Jobs Tracked",j.total,"var(--t)"],["Applied",j.applied,"var(--g)"],["AI Tailors",f.tailors,"var(--a2)"],["ATS Runs",f.ats,"var(--am)"]].map(([l,v,c])=>(
              <Card key={l}><div style={{fontSize:26,fontFamily:"var(--mono)",fontWeight:700,color:c}}>{v}</div><div style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em",marginTop:4}}>{l}</div></Card>
            ))}
          </div>

          {/* Daily active users chart */}
          <Card>
            <CardTitle>Daily Active Users — Last 30 Days</CardTitle>
            {dailyActive?.length>0 ? (
              <div style={{display:"flex",alignItems:"flex-end",gap:3,height:80,padding:"0 0 8px"}}>
                {dailyActive.map((d,i)=>(
                  <div key={i} title={`${d.day}: ${d.users} users`} style={{flex:1,background:"var(--a)",borderRadius:"2px 2px 0 0",minWidth:4,height:`${(d.users/maxDaily)*100}%`,opacity:.75,transition:"height .3s",cursor:"default"}}/>
                ))}
              </div>
            ) : <div style={{color:"var(--t3)",fontSize:12}}>No data yet</div>}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--t3)",fontFamily:"var(--mono)",marginTop:4}}>
              <span>{dailyActive?.[0]?.day||""}</span><span>Today</span>
            </div>
          </Card>

          {/* Feature usage breakdown */}
          <div style={s.grid2}>
            <Card>
              <CardTitle>Feature Usage</CardTitle>
              {featureBreakdown?.map((f,i)=>(
                <div key={i} style={{marginBottom:12}}>
                  <Row style={{justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12}}>{FEAT_LABELS[f.event]||f.event}</span>
                    <span style={{fontSize:12,fontFamily:"var(--mono)",color:"var(--t2)"}}>{f.n}</span>
                  </Row>
                  <CssBar value={f.n} max={maxFeat} color={FEAT_COLORS[f.event]||"var(--a)"}/>
                </div>
              ))}
            </Card>
            <Card>
              <CardTitle>Top Search Queries</CardTitle>
              {topSearches?.results?.length>0 ? (
                <Stack gap={6}>
                  {topSearches.results.map((s,i)=>(
                    <Row key={i} style={{justifyContent:"space-between"}}>
                      <span style={{fontSize:12,color:"var(--t2)"}}>{s.query}</span>
                      <Tag color="gray">{s.n}</Tag>
                    </Row>
                  ))}
                </Stack>
              ) : <div style={{fontSize:12,color:"var(--t3)"}}>No searches yet</div>}
            </Card>
          </div>
        </Stack>
      )}

      {tab==="users" && (
        <Card>
          <CardTitle>All Users ({users.length})</CardTitle>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:"1px solid var(--b)"}}>
                {["Email","Joined","Last Login","Jobs"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontFamily:"var(--mono)",color:"var(--t3)",fontWeight:500,fontSize:11}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {users.map((u,i)=>(
                  <tr key={u.id} style={{borderBottom:"1px solid var(--b)",background:i%2===0?"transparent":"rgba(255,255,255,.01)"}}>
                    <td style={{padding:"8px 10px",color:"var(--t2)"}}>{u.email}</td>
                    <td style={{padding:"8px 10px",color:"var(--t3)",fontFamily:"var(--mono)"}}>{u.created_at?.slice(0,10)}</td>
                    <td style={{padding:"8px 10px",color:"var(--t3)",fontFamily:"var(--mono)"}}>{u.last_login?.slice(0,10)||"—"}</td>
                    <td style={{padding:"8px 10px"}}><Tag color="gray">{u.jobs}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab==="errors" && (
        <Card>
          <CardTitle>Recent Errors ({recentErrors?.length||0})</CardTitle>
          {!recentErrors?.length && <div style={{color:"var(--t3)",fontSize:12}}>No errors logged — good sign! ✓</div>}
          <Stack gap={6}>
            {recentErrors?.map((e,i)=>(
              <div key={i} style={{background:"var(--rd)",border:"1px solid var(--r)",borderRadius:6,padding:"8px 12px",fontSize:12}}>
                <Row style={{justifyContent:"space-between"}}>
                  <span style={{color:"var(--r)",fontFamily:"var(--mono)"}}>{e.properties?.endpoint||"unknown"}</span>
                  <span style={{color:"var(--t3)",fontFamily:"var(--mono)"}}>{e.created_at?.slice(0,16)}</span>
                </Row>
                <div style={{color:"var(--t2)",marginTop:4}}>{e.properties?.message||"No message"}</div>
              </div>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

// ─── Alerts Page ──────────────────────────────────────────────────────────────
function Alerts({ api }) {
  const [alerts,  setAlerts]  = useState([]);
  const [form,    setForm]    = useState({ query:"", location:"", label:"", frequency:"daily" });
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState("");
  const [testing, setTesting] = useState({});

  useEffect(()=>{ api.get("/alerts").then(setAlerts).catch(()=>{}); }, []);

  const add = async () => {
    if (!form.query.trim()) return;
    setLoading(true);
    try {
      const res = await api.post("/alerts", form);
      const newAlert = { id:res.id, ...form, active:1, last_run:null };
      setAlerts(prev=>[newAlert,...prev]);
      setForm({ query:"", location:"", label:"", frequency:"daily" });
      setMsg("✓ Alert created");
    } catch(e) { setMsg("Error: "+e.message); }
    setLoading(false);
    setTimeout(()=>setMsg(""), 3000);
  };

  const toggle = async (id, active) => {
    await api.put(`/alerts/${id}`, { active: active?0:1 });
    setAlerts(prev=>prev.map(a=>a.id===id?{...a,active:active?0:1}:a));
  };

  const remove = async (id) => {
    await api.delete(`/alerts/${id}`);
    setAlerts(prev=>prev.filter(a=>a.id!==id));
  };

  const test = async (id) => {
    setTesting(p=>({...p,[id]:true}));
    try {
      await api.post(`/alerts/${id}/test`, {});
      setMsg("✓ Test alert sent — check your inbox");
    } catch(e) { setMsg("Error: "+e.message); }
    setTesting(p=>({...p,[id]:false}));
    setTimeout(()=>setMsg(""), 4000);
  };

  return (
    <Stack>
      <Alert color="blue" icon="🔔">
        Wrendi checks your saved searches every morning at 9 AM EST and emails you new matches. Only jobs you haven't seen before are included.
      </Alert>

      <Card>
        <CardTitle>New Alert</CardTitle>
        <div style={s.grid2}>
          <Input label="Job Title / Keywords *" value={form.query} onChange={e=>setForm(p=>({...p,query:e.target.value}))} placeholder='"UX Designer" or "Email Marketing Manager"'/>
          <Input label="Location (optional)" value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))} placeholder="Remote, Atlanta GA, …"/>
          <Input label="Label (optional)" value={form.label} onChange={e=>setForm(p=>({...p,label:e.target.value}))} placeholder="Give this search a name"/>
          <Select label="Frequency" value={form.frequency} onChange={e=>setForm(p=>({...p,frequency:e.target.value}))}>
            <option value="daily">Daily (9 AM EST)</option>
            <option value="weekly">Weekly (Monday)</option>
          </Select>
        </div>
        <Row style={{marginTop:12,flexWrap:"wrap",gap:8}}>
          <Btn variant="primary" onClick={add} disabled={loading||!form.query.trim()}>
            {loading?<Dots/>:"🔔 Create Alert"}
          </Btn>
          {msg && <span style={{fontSize:12,color:msg.startsWith("✓")?"var(--g)":"var(--r)",fontFamily:"var(--mono)"}}>{msg}</span>}
        </Row>
      </Card>

      {!alerts.length && (
        <Card><div style={{textAlign:"center",padding:24,color:"var(--t3)"}}>No alerts yet. Create one above to get daily job matches in your inbox.</div></Card>
      )}

      <Stack>
        {alerts.map(a=>(
          <Card key={a.id} style={!a.active?{opacity:.55}:{}}>
            <Row style={{justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div style={{flex:1}}>
                <Row gap={8} style={{flexWrap:"wrap"}}>
                  <div style={{fontWeight:600,fontSize:14}}>{a.label||a.query}</div>
                  <Tag color={a.active?"green":"gray"}>{a.active?"Active":"Paused"}</Tag>
                  <Tag color="gray">{a.frequency}</Tag>
                </Row>
                <div style={{fontSize:12,color:"var(--t2)",marginTop:4}}>
                  Search: <span style={{fontFamily:"var(--mono)",color:"var(--a2)"}}>{a.query}</span>
                  {a.location && <> · <span style={{fontFamily:"var(--mono)"}}>{a.location}</span></>}
                </div>
                {a.last_run && <div style={{fontSize:11,color:"var(--t3)",fontFamily:"var(--mono)",marginTop:3}}>Last run: {a.last_run?.slice(0,10)}</div>}
              </div>
              <Row gap={6} style={{flexShrink:0}}>
                <Btn size="sm" variant="ghost" onClick={()=>test(a.id)} disabled={testing[a.id]}>
                  {testing[a.id]?<Dots/>:"Test"}
                </Btn>
                <Btn size="sm" variant={a.active?"amber":"success"} onClick={()=>toggle(a.id,a.active)}>
                  {a.active?"Pause":"Resume"}
                </Btn>
                <Btn size="sm" variant="danger" onClick={()=>remove(a.id)}>Remove</Btn>
              </Row>
            </Row>
          </Card>
        ))}
      </Stack>

      <Card>
        <CardTitle>How It Works</CardTitle>
        <Stack gap={8}>
          {[
            ["🔍","Searches run automatically","Wrendi searches JSearch (LinkedIn, Indeed, Glassdoor) using your saved queries every morning."],
            ["🆕","Only new results","Jobs you've already been sent are never included again — no repeat emails."],
            ["📧","One digest per day","All your alerts are bundled into a single email so your inbox stays clean."],
            ["⚡","Add to queue in one click","Every job in the email links directly to Wrendi where you can add it to your queue."],
          ].map(([icon,title,desc])=>(
            <Row key={title} style={{alignItems:"flex-start",gap:12}}>
              <span style={{fontSize:20,flexShrink:0}}>{icon}</span>
              <div><div style={{fontWeight:600,fontSize:13}}>{title}</div><div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>{desc}</div></div>
            </Row>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

// ─── Interview Prep Page ──────────────────────────────────────────────────────
const CATEGORY_META = {
  behavioral:   { label:"Behavioral",    color:"blue",   icon:"🧠" },
  role_specific:{ label:"Role-Specific", color:"purple", icon:"💼" },
  technical:    { label:"Technical",     color:"amber",  icon:"⚡" },
  culture_fit:  { label:"Culture Fit",   color:"green",  icon:"🤝" },
  situational:  { label:"Situational",   color:"red",    icon:"⚖" },
};

function InterviewPrep({ jobs, api }) {
  const [jobId,     setJobId]     = useState("");
  const [prep,      setPrep]      = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [status,    setStatus]    = useState("");
  const [filter,    setFilter]    = useState("all");
  const [expanded,  setExpanded]  = useState({});

  const job = jobs.find(j=>j.id===jobId||j.id===Number(jobId));

  const loadExisting = async (id) => {
    try {
      const data = await api.get(`/interview-prep/${id}`);
      if (data) {
        setPrep(data);
        setQuestions(data.questions||[]);
      } else {
        setPrep(null);
        setQuestions([]);
      }
    } catch {}
  };

  const generate = async () => {
    if (!jobId) return;
    setLoading(true); setStatus("Generating prep…"); setPrep(null); setQuestions([]);
    try {
      const data = await api.post("/ai/interview-prep", { jobId });
      setPrep(data);
      setQuestions(data.questions||[]);
      setStatus(`✓ ${data.questions?.length||0} questions generated`);
    } catch(e) { setStatus("Error: "+e.message); }
    setLoading(false);
  };

  const saveNotes = async () => {
    if (!jobId) return;
    setSaving(true);
    try {
      await api.put(`/interview-prep/${jobId}`, { questions });
      setStatus("✓ Notes saved");
    } catch(e) { setStatus("Error: "+e.message); }
    setSaving(false);
    setTimeout(()=>setStatus(""),2000);
  };

  const toggleDone = (idx) => {
    setQuestions(prev=>prev.map((q,i)=>i===idx?{...q,done:!q.done}:q));
  };

  const updateNote = (idx, note) => {
    setQuestions(prev=>prev.map((q,i)=>i===idx?{...q,note}:q));
  };

  const filtered = filter==="all" ? questions : filter==="done" ? questions.filter(q=>q.done) : questions.filter(q=>q.category===filter);

  return (
    <Stack>
      <Card>
        <Row style={{flexWrap:"wrap",gap:12}}>
          <div style={{flex:1,minWidth:200}}>
            <Select label="Select Job" value={jobId} onChange={e=>{ setJobId(e.target.value); if(e.target.value) loadExisting(e.target.value); else{setPrep(null);setQuestions([]); }}}>
              <option value="">— choose a job —</option>
              {jobs.filter(j=>j.jd).map(j=><option key={j.id} value={j.id}>{j.title} @ {j.company}</option>)}
            </Select>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
            <Btn variant="primary" onClick={generate} disabled={loading||!jobId}>
              {loading?<><Dots/> Generating…</>:prep?"🔄 Regenerate":"🧠 Generate Prep"}
            </Btn>
            {questions.length>0 && <Btn variant="ghost" onClick={saveNotes} disabled={saving}>{saving?<Dots/>:"Save Notes"}</Btn>}
          </div>
        </Row>
        {status && <div style={{fontSize:12,fontFamily:"var(--mono)",color:status.startsWith("✓")?"var(--g)":"var(--am)",marginTop:8}}>{status}</div>}
      </Card>

      {!jobId && (
        <Card>
          <div style={{textAlign:"center",padding:28,color:"var(--t3)"}}>
            <div style={{fontSize:40,marginBottom:12}}>🧠</div>
            <div style={{fontWeight:600,fontSize:15,marginBottom:8}}>Interview Prep</div>
            <div style={{fontSize:13,lineHeight:1.7}}>Select a job above to generate tailored interview questions based on the JD and your background. Covers behavioral, technical, role-specific, and culture fit questions — with talking points from your actual experience.</div>
          </div>
        </Card>
      )}

      {job && !prep && !loading && jobId && (
        <Alert color="blue" icon="ℹ">
          No prep generated yet for <strong>{job.title} @ {job.company}</strong>. Click "Generate Prep" above.
        </Alert>
      )}

      {prep && (
        <Stack>
          {/* Overview */}
          <div style={s.grid2}>
            <Card>
              <CardTitle>Company Context</CardTitle>
              <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7}}>{prep.company_context}</div>
            </Card>
            <Card>
              <CardTitle>What They Really Want</CardTitle>
              <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7}}>{prep.role_focus}</div>
            </Card>
          </div>

          {/* Progress */}
          <Card>
            <Row style={{justifyContent:"space-between",marginBottom:8}}>
              <CardTitle style={{margin:0}}>Questions — {questions.filter(q=>q.done).length}/{questions.length} practiced</CardTitle>
              <Row gap={6}>
                {["all","done","behavioral","technical","role_specific","culture_fit","situational"].map(f=>(
                  <span key={f} onClick={()=>setFilter(f)}
                    style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontFamily:"var(--mono)",cursor:"pointer",background:filter===f?"var(--ad)":"var(--surf3)",color:filter===f?"var(--a2)":"var(--t3)",border:`1px solid ${filter===f?"var(--a)":"var(--b)"}`,transition:"all .15s"}}>
                    {f==="all"?"All":f==="done"?"✓ Done":f.replace("_"," ")}
                  </span>
                ))}
              </Row>
            </Row>
            <CssBar value={questions.filter(q=>q.done).length} max={questions.length} color="var(--g)" height={4}/>
          </Card>

          {/* Question cards */}
          <Stack gap={8}>
            {filtered.map((q,i)=>{
              const meta = CATEGORY_META[q.category] || { label:q.category, color:"gray", icon:"❓" };
              const isExpanded = expanded[q.id||i];
              return (
                <Card key={q.id||i} style={q.done?{opacity:.6,borderColor:"var(--g)"}:{}}>
                  <Row style={{alignItems:"flex-start",gap:12}}>
                    <div onClick={()=>toggleDone(questions.indexOf(q))}
                      style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${q.done?"var(--g)":"var(--b2)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,background:q.done?"var(--g)":"transparent",color:q.done?"#0a0d14":"var(--t3)",flexShrink:0,cursor:"pointer",marginTop:1}}>
                      {q.done?"✓":""}
                    </div>
                    <div style={{flex:1}}>
                      <Row style={{justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
                        <Tag color={meta.color}>{meta.icon} {meta.label}</Tag>
                        <span onClick={()=>setExpanded(p=>({...p,[q.id||i]:!isExpanded}))}
                          style={{fontSize:12,color:"var(--a2)",cursor:"pointer"}}>{isExpanded?"▲ Collapse":"▼ Expand"}</span>
                      </Row>
                      <div style={{fontWeight:600,fontSize:14,lineHeight:1.5,marginBottom:isExpanded?12:0}}>{q.question}</div>

                      {isExpanded && (
                        <Stack gap={10} style={{marginTop:10}}>
                          {q.why && (
                            <div style={{background:"var(--surf2)",borderRadius:6,padding:"10px 12px",borderLeft:"3px solid var(--am)"}}>
                              <div style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--am)",marginBottom:4}}>WHY THEY'RE ASKING</div>
                              <div style={{fontSize:13,color:"var(--t2)"}}>{q.why}</div>
                            </div>
                          )}
                          {q.approach && (
                            <div style={{background:"var(--surf2)",borderRadius:6,padding:"10px 12px",borderLeft:"3px solid var(--a)"}}>
                              <div style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--a2)",marginBottom:4}}>HOW TO ANSWER</div>
                              <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.6}}>{q.approach}</div>
                            </div>
                          )}
                          {q.key_points?.length>0 && (
                            <div style={{background:"var(--surf2)",borderRadius:6,padding:"10px 12px",borderLeft:"3px solid var(--g)"}}>
                              <div style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--g)",marginBottom:6}}>KEY POINTS TO MENTION</div>
                              {q.key_points.map((pt,pi)=>(
                                <div key={pi} style={{fontSize:13,color:"var(--t2)",marginBottom:5,paddingLeft:12,position:"relative"}}>
                                  <span style={{position:"absolute",left:0,color:"var(--g)"}}>→</span>{pt}
                                </div>
                              ))}
                            </div>
                          )}
                          <div>
                            <div style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--t3)",marginBottom:5}}>YOUR NOTES</div>
                            <textarea
                              style={{...s.textarea,minHeight:70,fontSize:12}}
                              value={q.note||""}
                              onChange={e=>updateNote(questions.indexOf(q), e.target.value)}
                              placeholder="Add your own talking points, personal anecdotes, or reminders…"
                            />
                          </div>
                        </Stack>
                      )}
                    </div>
                  </Row>
                </Card>
              );
            })}
          </Stack>

          {questions.length>0 && (
            <Btn variant="success" onClick={saveNotes} disabled={saving} style={{alignSelf:"flex-start"}}>
              {saving?<Dots/>:"✓ Save All Notes"}
            </Btn>
          )}
        </Stack>
      )}
    </Stack>
  );
}

// ─── Setup Progress (dashboard card) ─────────────────────────────────────────
function SetupProgress({ profile, jobs, onNav }) {
  const steps = [
    { label:"Add your name & email",      done:!!(profile?.name && profile?.email),       nav:"profile"  },
    { label:"Paste your master resume",   done:!!(profile?.resume_text?.length > 50),     nav:"profile"  },
    { label:"Set work auth & salary",     done:!!(profile?.work_auth && profile?.salary_range), nav:"profile" },
    { label:"Add your first job",         done:jobs.length > 0,                           nav:"search"   },
    { label:"Tailor a resume",            done:jobs.some(j=>j.tailored_resume),           nav:"studio"   },
    { label:"Run your first ATS score",   done:jobs.some(j=>j.ats_score),                nav:"ats"      },
  ];
  const done = steps.filter(s=>s.done).length;
  if (done === steps.length) return null;
  return (
    <Card style={{borderColor:"var(--a)",background:"var(--ad)"}}>
      <Row style={{justifyContent:"space-between",marginBottom:12}}>
        <CardTitle style={{margin:0}}>Getting Started — {done}/{steps.length} complete</CardTitle>
        <span style={{fontSize:12,fontFamily:"var(--mono)",color:"var(--a2)"}}>{Math.round(done/steps.length*100)}%</span>
      </Row>
      <CssBar value={done} max={steps.length} color="var(--a)" height={4}/>
      <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:6}}>
        {steps.map((st,i)=>(
          <div key={i} onClick={()=>!st.done&&onNav(st.nav)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:6,background:st.done?"transparent":"var(--surf2)",border:`1px solid ${st.done?"transparent":"var(--b)"}`,cursor:st.done?"default":"pointer",opacity:st.done?.6:1,transition:"all .15s"}}>
            <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${st.done?"var(--g)":"var(--b2)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,background:st.done?"var(--g)":"transparent",color:st.done?"#0a0d14":"var(--t3)",flexShrink:0}}>
              {st.done?"✓":i+1}
            </div>
            <span style={{fontSize:13,color:st.done?"var(--t3)":"var(--t)"}}>{st.label}</span>
            {!st.done && <span style={{marginLeft:"auto",fontSize:11,color:"var(--a2)"}}>→</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Onboarding Wizard ────────────────────────────────────────────────────────
function Onboarding({ api, onComplete }) {
  const [step,    setStep]    = useState(0);
  const [profile, setProfile] = useState({ name:"", email:"", phone:"", location:"", linkedin:"", portfolio:"", work_auth:"", salary_range:"", work_mode:"Remote", resume_text:"", skills:"" });
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const up = (k,v) => setProfile(p=>({...p,[k]:v}));

  const STEPS = [
    { icon:"👋", title:"Welcome to Wrendi", sub:"Let's get you set up in 4 quick steps." },
    { icon:"👤", title:"Your Profile",       sub:"Basic info used to auto-fill applications." },
    { icon:"📄", title:"Your Resume",        sub:"Paste your master resume. AI tailors this for each job." },
    { icon:"🔍", title:"Find Your First Job", sub:"Search live or skip for now." },
    { icon:"🎉", title:"You're all set!",     sub:"Wrendi is ready to help you apply smarter." },
  ];

  const saveAndNext = async () => {
    setSaving(true); setMsg("");
    try {
      await api.put("/profile", profile);
      setStep(s=>s+1);
    } catch(e) { setMsg(e.message); }
    setSaving(false);
  };

  const pct = Math.round((step / (STEPS.length-1)) * 100);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(10,13,20,.95)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"var(--surf)",border:"1px solid var(--b)",borderRadius:16,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto"}} className="fade-in">
        {/* Progress */}
        <div style={{padding:"20px 24px 0"}}>
          <Row style={{justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--t3)"}}>SETUP PROGRESS</span>
            <span style={{fontSize:11,fontFamily:"var(--mono)",color:"var(--a2)"}}>{step+1} of {STEPS.length}</span>
          </Row>
          <CssBar value={step} max={STEPS.length-1} color="var(--a)" height={3}/>
        </div>

        <div style={{padding:"24px 24px 28px"}}>
          <div style={{fontSize:40,marginBottom:12}}>{STEPS[step].icon}</div>
          <div style={{fontSize:20,fontWeight:700,marginBottom:6}}>{STEPS[step].title}</div>
          <div style={{fontSize:13,color:"var(--t3)",marginBottom:24}}>{STEPS[step].sub}</div>

          {/* Step 0: Welcome */}
          {step===0 && (
            <Stack>
              {[["🔍","Live job search","Search across LinkedIn, Indeed, Glassdoor in one place"],
                ["✦","AI resume tailoring","Your master resume rewritten for every job's tone and keywords"],
                ["⚡","ATS scoring","Know your match score before you apply"],
                ["▶","Auto-fill forms","The Chrome extension fills application forms using your tailored resume"],
                ["📊","Analytics","Track your pipeline from search to offer"],
              ].map(([icon,title,desc])=>(
                <div key={title} style={{display:"flex",gap:14,padding:"10px 14px",background:"var(--surf2)",borderRadius:8,border:"1px solid var(--b)"}}>
                  <span style={{fontSize:20,flexShrink:0}}>{icon}</span>
                  <div><div style={{fontWeight:600,fontSize:13}}>{title}</div><div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>{desc}</div></div>
                </div>
              ))}
              <Btn variant="primary" style={{width:"100%",padding:"12px 0",marginTop:8}} onClick={()=>setStep(1)}>
                Get started →
              </Btn>
            </Stack>
          )}

          {/* Step 1: Profile */}
          {step===1 && (
            <Stack>
              <div style={s.grid2}>
                <Input label="Full Name *" value={profile.name} onChange={e=>up("name",e.target.value)} placeholder="Cindy Xiong"/>
                <Input label="Email *" value={profile.email} onChange={e=>up("email",e.target.value)} type="email" placeholder="you@email.com"/>
                <Input label="Phone" value={profile.phone} onChange={e=>up("phone",e.target.value)} placeholder="(555) 555-5555"/>
                <Input label="Location" value={profile.location} onChange={e=>up("location",e.target.value)} placeholder="Atlanta, GA"/>
                <Input label="LinkedIn URL" value={profile.linkedin} onChange={e=>up("linkedin",e.target.value)} placeholder="linkedin.com/in/…"/>
                <Input label="Portfolio URL" value={profile.portfolio} onChange={e=>up("portfolio",e.target.value)} placeholder="yoursite.com"/>
              </div>
              <div style={s.grid2}>
                <Select label="Work Authorization *" value={profile.work_auth} onChange={e=>up("work_auth",e.target.value)}>
                  <option value="">Select…</option>
                  <option>US Citizen</option><option>Green Card</option>
                  <option>H1-B (requires sponsorship)</option><option>EAD / OPT</option>
                </Select>
                <Input label="Salary Range *" value={profile.salary_range} onChange={e=>up("salary_range",e.target.value)} placeholder="$90,000–$120,000"/>
              </div>
              {msg && <div style={{color:"var(--r)",fontSize:12}}>{msg}</div>}
              <Row style={{justifyContent:"space-between"}}>
                <Btn onClick={()=>setStep(0)}>← Back</Btn>
                <Btn variant="primary" onClick={saveAndNext} disabled={saving||!profile.name||!profile.email}>{saving?<Dots/>:"Save & Continue →"}</Btn>
              </Row>
            </Stack>
          )}

          {/* Step 2: Resume */}
          {step===2 && (
            <Stack>
              <Alert color="blue">Plain text works best. Copy from your Word doc or Google Doc — formatting gets stripped by ATS systems anyway.</Alert>
              <Textarea label="Master Resume *" minHeight={220} value={profile.resume_text} onChange={e=>up("resume_text",e.target.value)} placeholder="CINDY XIONG&#10;UX Designer · Jefferson, GA&#10;&#10;EXPERIENCE&#10;CVS Health / ActiveHealth Management&#10;UX Designer / MarTech Manager, 2019–2024&#10;• Led redesign of…"/>
              <Textarea label="Key Skills (comma-separated)" minHeight={60} value={profile.skills} onChange={e=>up("skills",e.target.value)} placeholder="UX Design, Figma, SFMC, HTML, CSS, User Research…"/>
              {msg && <div style={{color:"var(--r)",fontSize:12}}>{msg}</div>}
              <Row style={{justifyContent:"space-between"}}>
                <Btn onClick={()=>setStep(1)}>← Back</Btn>
                <Row gap={8}>
                  <Btn onClick={()=>setStep(3)} style={{fontSize:12,color:"var(--t3)"}}>Skip for now</Btn>
                  <Btn variant="primary" onClick={saveAndNext} disabled={saving||!profile.resume_text}>{saving?<Dots/>:"Save & Continue →"}</Btn>
                </Row>
              </Row>
            </Stack>
          )}

          {/* Step 3: First job search */}
          {step===3 && (
            <Stack>
              <Alert color="blue">Search below and click "+ Add to Queue" on any result — or skip and add jobs manually later.</Alert>
              <FirstJobSearch api={api}/>
              <Row style={{justifyContent:"space-between",marginTop:8}}>
                <Btn onClick={()=>setStep(2)}>← Back</Btn>
                <Btn variant="primary" onClick={()=>setStep(4)}>Continue →</Btn>
              </Row>
            </Stack>
          )}

          {/* Step 4: Done */}
          {step===4 && (
            <Stack>
              {[
                ["Next: Tailor your resume","Go to Resume Studio, select a job, click Tailor Resume","studio"],
                ["Next: Score it","Run ATS Scorer to see your match percentage before applying","ats"],
                ["Next: Install the extension","Scrape jobs directly from LinkedIn, Workday, and more","https://wrendi.pages.dev"],
              ].map(([title,desc,nav])=>(
                <div key={title} style={{padding:"12px 14px",background:"var(--surf2)",borderRadius:8,border:"1px solid var(--b)"}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{title}</div>
                  <div style={{fontSize:12,color:"var(--t3)"}}>{desc}</div>
                </div>
              ))}
              <Btn variant="primary" style={{width:"100%",padding:"12px 0",marginTop:4}} onClick={onComplete}>
                Go to Dashboard →
              </Btn>
            </Stack>
          )}
        </div>
      </div>
    </div>
  );
}

// Lightweight job search inside the onboarding wizard
function FirstJobSearch({ api }) {
  const [q,       setQ]       = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [added,   setAdded]   = useState({});
  const debounce = useRef(null);

  const search = async (v) => {
    if (!v.trim()) { setResults([]); return; }
    setLoading(true);
    try { const d=await api.get(`/search?q=${encodeURIComponent(v)}`); setResults(d.results||[]); }
    catch { setResults([]); }
    setLoading(false);
  };

  const add = async (job) => {
    try { await api.post("/jobs", job); setAdded(p=>({...p,[job.id]:"added"})); }
    catch { setAdded(p=>({...p,[job.id]:"exists"})); }
  };

  return (
    <Stack gap={8}>
      <Input value={q} onChange={e=>{ setQ(e.target.value); clearTimeout(debounce.current); debounce.current=setTimeout(()=>search(e.target.value),500); }} placeholder='Search e.g. "UX Designer remote"'/>
      {loading && <Row style={{justifyContent:"center",padding:10,color:"var(--t3)"}}><Spinner/></Row>}
      {results.slice(0,4).map(job=>(
        <div key={job.id} style={{padding:"10px 12px",background:"var(--surf2)",borderRadius:8,border:"1px solid var(--b)"}}>
          <Row style={{justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
            <div><div style={{fontWeight:600,fontSize:13}}>{job.title}</div><div style={{fontSize:12,color:"var(--t2)"}}>{job.company} · {job.location}</div></div>
            <Btn size="sm" variant={added[job.id]?"success":"primary"} onClick={()=>add(job)} disabled={!!added[job.id]}>
              {added[job.id]==="added"?"✓ Added":"+ Add"}
            </Btn>
          </Row>
        </div>
      ))}
    </Stack>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
const PAGES = [
  { id:"dashboard", icon:"⬡", label:"Dashboard"     },
  { id:"search",    icon:"🔍", label:"Search Jobs"   },
  { id:"alerts",    icon:"🔔", label:"Job Alerts"    },
  { id:"queue",     icon:"≡",  label:"My Queue"      },
  { id:"studio",    icon:"✦",  label:"Resume Studio" },
  { id:"ats",       icon:"⚡",  label:"ATS Scorer"    },
  { id:"apply",     icon:"▶",  label:"Apply"         },
  { id:"prep",      icon:"🧠", label:"Interview Prep"},
  { id:"profile",   icon:"◎",  label:"Profile"       },
];
const TITLES = {
  dashboard:"Command Center", search:"Live Job Search", alerts:"Job Alerts",
  queue:"My Queue", studio:"Resume Studio", ats:"ATS Scorer",
  apply:"Apply", prep:"Interview Prep", profile:"Profile", analytics:"Analytics"
};
const SUBS = {
  dashboard:"wrendi // job-search-ops",
  search:"real-time search across linkedin, indeed, glassdoor + more",
  alerts:"saved searches — daily email digest of new matches",
  queue:"manage + track applications",
  studio:"ai tailoring + tone matching — saved to cloud automatically",
  ats:"keyword analysis + gap detection",
  apply:"checklist + custom question drafter + stage tracking",
  prep:"tailored questions + talking points from your actual background",
  profile:"resume + preferences — encrypted in cloudflare d1",
  analytics:"usage analytics + user activity — admin only",
};

export default function App() {
  const [authed,      setAuthed]      = useState(false);
  const [page,        setPage]        = useState("dashboard");
  const [jobs,        setJobs]        = useState([]);
  const [selJob,      setSelJob]      = useState(null);
  const [user,        setUser]        = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const api = useAPI();

  useEffect(()=>{
    createGlobalStyles();
    const match = window.location.hash.match(/token=([^&]+)/);
    if (match) { localStorage.setItem("wrendi_token", match[1]); window.history.replaceState({},""," "); }
    const stored = localStorage.getItem("wrendi_token");
    if (stored) {
      api.get("/auth/me")
        .then(u=>{
          setUser(u);
          setAuthed(true);
          loadJobs();
          // Load profile to check onboarding state
          api.get("/profile").then(p=>{
            setProfile(p||{});
            // Show onboarding if first login (no resume + no setup flag)
            const isNew = !p?.resume_text && !localStorage.getItem("wrendi_setup_done");
            if (isNew) setShowOnboard(true);
          });
        })
        .catch(()=>localStorage.removeItem("wrendi_token"));
    }
  },[]);

  const loadJobs = ()=>{ api.get("/jobs").then(setJobs).catch(console.error); };
  const onSelect = (job)=>{ setSelJob(job); setPage("apply"); };
  const logout   = ()=>{ localStorage.removeItem("wrendi_token"); localStorage.removeItem("wrendi_setup_done"); window.location.reload(); };

  // Auto-refresh jobs when switching to these pages
  useEffect(()=>{
    if (authed && ["dashboard","queue","apply","studio","ats","prep"].includes(page)) {
      loadJobs();
    }
  }, [page, authed]);

  const completeOnboarding = () => {
    localStorage.setItem("wrendi_setup_done","1");
    setShowOnboard(false);
    loadJobs();
    api.get("/profile").then(setProfile).catch(()=>{});
  };

  if (!authed) return <AuthScreen/>;

  const flagged  = jobs.filter(j=>j.flags?.length>0).length;
  const isAdmin  = user?.is_admin;
  const navPages = isAdmin ? [...PAGES, { id:"analytics", icon:"📊", label:"Analytics" }] : PAGES;

  return (
    <div style={s.app}>
      {/* Onboarding wizard overlay */}
      {showOnboard && <Onboarding api={api} onComplete={completeOnboarding}/>}

      <div style={s.sidebar}>
        <div style={{padding:"0 18px 18px",borderBottom:"1px solid var(--b)"}}>
          <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:700,color:"var(--a2)",letterSpacing:"0.1em"}}>⬡ WRENDI</div>
          <div style={{fontSize:10,color:"var(--t3)",marginTop:2,fontFamily:"var(--mono)"}}>job search ops</div>
        </div>
        <div style={{padding:"12px 10px",flex:1,display:"flex",flexDirection:"column",gap:2}}>
          {navPages.map(n=>(
            <div key={n.id} onClick={()=>setPage(n.id)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:500,color:page===n.id?"var(--a2)":"var(--t2)",background:page===n.id?"var(--ad)":"transparent",border:`1px solid ${page===n.id?"var(--ag)":"transparent"}`,transition:"all .15s",userSelect:"none"}}>
              <span style={{fontSize:14,width:18,textAlign:"center"}}>{n.icon}</span>
              <span>{n.label}</span>
              {n.id==="queue"&&flagged>0&&<span style={{marginLeft:"auto",background:"var(--am)",color:"white",fontSize:10,fontFamily:"var(--mono)",padding:"1px 6px",borderRadius:20,fontWeight:600}}>{flagged}</span>}
              {n.id==="analytics"&&<span style={{marginLeft:"auto",background:"var(--pu)",color:"white",fontSize:9,fontFamily:"var(--mono)",padding:"1px 5px",borderRadius:20}}>ADMIN</span>}
            </div>
          ))}
        </div>
        <div style={{padding:"12px 18px",borderTop:"1px solid var(--b)",fontSize:11,fontFamily:"var(--mono)",color:"var(--t3)",display:"flex",flexDirection:"column",gap:4}}>
          <div style={{color:"var(--t2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.email}</div>
          <div>{jobs.filter(j=>j.status==="applied").length} applied · {jobs.length} tracked</div>
          <div style={{color:"var(--g)",fontSize:10}}>☁ Cloud sync active</div>
          <Btn size="sm" style={{marginTop:4,fontSize:11,padding:"4px 10px"}} onClick={logout}>Sign out</Btn>
        </div>
      </div>

      <div style={s.main}>
        <div style={s.header}>
          <div>
            <div style={s.title}>{TITLES[page]||page}</div>
            <div style={s.sub}>{SUBS[page]||""}</div>
          </div>
          {!localStorage.getItem("wrendi_setup_done") && (
            <Btn size="sm" variant="amber" onClick={()=>setShowOnboard(true)}>Setup guide</Btn>
          )}
        </div>
        <div style={s.content} className="fade-in">
          {page==="dashboard" && (
            <Stack>
              <SetupProgress profile={profile} jobs={jobs} onNav={setPage}/>
              <Dashboard jobs={jobs} onNav={setPage}/>
            </Stack>
          )}
          {page==="search"    && <Search api={api} onJobAdded={loadJobs}/>}
          {page==="alerts"    && <Alerts api={api}/>}
          {page==="queue"     && <Queue jobs={jobs} api={api} onRefresh={loadJobs} onSelect={onSelect}/>}
          {page==="studio"    && <Studio jobs={jobs} api={api} onRefresh={loadJobs}/>}
          {page==="ats"       && <ATS jobs={jobs} api={api} onRefresh={loadJobs}/>}
          {page==="apply"     && <Apply job={selJob} jobs={jobs} api={api} onRefresh={loadJobs} onSelect={onSelect}/>}
          {page==="prep"      && <InterviewPrep jobs={jobs} api={api}/>}
          {page==="profile"   && <Profile api={api}/>}
          {page==="analytics" && <Analytics api={api}/>}
        </div>
      </div>
    </div>
  );
}
