"use client";

import { FormEvent, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDocs, runTransaction, setDoc, updateDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb, hasFirebaseConfig } from "@/lib/firebase";
import {
  Activity, ArrowUpRight, CalendarDays, Check, CheckCircle2, Circle, Clock3,
  Dumbbell, Focus, LayoutDashboard, ListTodo, LogOut,
  Plus, RefreshCw, ShieldCheck, Sparkles, Target, Timer, Trash2, TrendingUp, X
} from "lucide-react";

type Task = { id: string; title: string; area: string; due_date: string | null; priority: string; completed: boolean; created_at?: string };
type Project = { id: string; name: string; area: string; status: string; next_action: string | null; target_date: string | null };
type Deadline = { id: string; title: string; due_at: string; area: string; notes: string | null };
type FocusSession = { id: string; work_date: string; minutes: number; task: string; distraction_free: boolean; distraction_note: string | null };
type Distraction = { id: string; happened_at: string; trigger: string; note: string | null };
type GymLog = { id: string; workout_date: string; activity: string; completed: boolean; notes: string | null };
type Review = { id: string; week_start: string; wins: string; blockers: string; next_priorities: string };

const areas = ["University", "Career", "Random Hours", "Fitness", "Personal"];
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const datePlus = (days: number) => { const d = new Date(); d.setDate(d.getDate()+days); return d.toLocaleDateString("en-CA"); };
const dueLabel = (s?: string | null) => {
  if (!s) return "No due date";
  const diff = Math.round((new Date(s+"T12:00:00").getTime()-new Date(todayISO()+"T12:00:00").getTime())/86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(s+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"});
};

function authError(error: unknown) {
  if (error instanceof FirebaseError) {
    const known: Record<string,string> = {
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
      "auth/weak-password": "Choose a password with at least 6 characters.",
      "auth/popup-closed-by-user": "The Google sign-in window was closed before completion.",
      "auth/unauthorized-domain": "Add this Codespaces or deployed domain to Firebase Authentication → Settings → Authorized domains.",
      "auth/operation-not-allowed": "Enable this sign-in method in Firebase Authentication → Sign-in method."
    };
    return known[error.code] ?? error.message;
  }
  return error instanceof Error ? error.message : "Sign-in failed. Please try again.";
}

export default function Home() {
  const configured = hasFirebaseConfig();
  const [userId, setUserId] = useState("");
  const [authMode, setAuthMode] = useState<"signin"|"signup">("signin");
  const [password, setPassword] = useState("");
  const [dayStart, setDayStart] = useState("");
  const [priorities, setPriorities] = useState(["", "", ""]);
  const [priorityDone, setPriorityDone] = useState([false, false, false]);
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [active, setActive] = useState("Today");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [distractions, setDistractions] = useState<Distraction[]>([]);
  const [gymLogs, setGymLogs] = useState<GymLog[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskArea, setTaskArea] = useState("University");
  const [taskDue, setTaskDue] = useState("");
  const [taskPriority, setTaskPriority] = useState("High");
  const [focusTask, setFocusTask] = useState("Bremen exam preparation");
  const [focusMinutes, setFocusMinutes] = useState(60);
  const [focusDistractionFree, setFocusDistractionFree] = useState(true);
  const [focusNote, setFocusNote] = useState("");
  const [distractionTrigger, setDistractionTrigger] = useState("Phone / social media");
  const [distractionNote, setDistractionNote] = useState("");
  const [gymActivity, setGymActivity] = useState("Workout");
  const [projectName, setProjectName] = useState("");
  const [projectArea, setProjectArea] = useState("Random Hours");
  const [projectAction, setProjectAction] = useState("");
  const [deadlineTitle, setDeadlineTitle] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("2026-10-27T21:00");
  const [deadlineArea, setDeadlineArea] = useState("University");
  const [reviewWins, setReviewWins] = useState("");
  const [reviewBlockers, setReviewBlockers] = useState("");
  const [reviewPriorities, setReviewPriorities] = useState("");

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
      setUserEmail(currentUser?.email ?? "");
      setUserId(currentUser?.uid ?? "");
      if (currentUser) {
        try { await startOrLoadDay(currentUser.uid); await loadData(currentUser.uid); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Could not load your workspace."); setLoading(false); }
      } else {
        setTasks([]); setProjects([]); setDeadlines([]); setSessions([]); setDistractions([]); setGymLogs([]); setReviews([]); setLoading(false);
      }
    });
    return unsubscribe;
  }, [configured]);

  async function startOrLoadDay(uid: string) {
    const dayRef = doc(firebaseDb, "users", uid, "days", todayISO());
    const day = await runTransaction(firebaseDb, async (transaction) => {
      const existing = await transaction.get(dayRef);
      if (existing.exists()) return existing.data();
      const initial = { local_date: todayISO(), started_at: new Date().toISOString(), priorities: ["", "", ""], priority_done: [false, false, false], updated_at: new Date().toISOString() };
      transaction.set(dayRef, initial);
      return initial;
    });
    setDayStart(String(day.started_at ?? ""));
    const saved = Array.isArray(day.priorities) ? day.priorities.map(String) : ["", "", ""];
    setPriorities([saved[0] ?? "", saved[1] ?? "", saved[2] ?? ""]);
    const done = Array.isArray(day.priority_done) ? day.priority_done.map(Boolean) : [false, false, false];
    setPriorityDone([done[0] ?? false, done[1] ?? false, done[2] ?? false]);
  }

  async function loadData(uid = userId) {
    if (!uid) return;
    setLoading(true);
    try {
      const tables = ["tasks","projects","deadlines","focus_sessions","distractions","gym_logs","weekly_reviews"] as const;
      const results = await Promise.all(tables.map(async (table) => {
        const snapshot = await getDocs(collection(firebaseDb, "users", uid, table));
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      }));
      const [a,b,c,d,e,f,g] = results;
      setTasks(a as Task[]); setProjects(b as Project[]); setDeadlines(c as Deadline[]);
      setSessions(d as FocusSession[]); setDistractions(e as Distraction[]); setGymLogs(f as GymLog[]); setReviews(g as Review[]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load your data. Check Firebase Firestore rules."); }
    finally { setLoading(false); }
  }

  async function signIn(e: FormEvent) {
    e.preventDefault(); setMessage("");
    try {
      if (authMode === "signup") await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      else await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    } catch (error) { setMessage(authError(error)); }
  }

  async function signInGoogle() {
    setMessage("");
    try { await signInWithPopup(firebaseAuth, new GoogleAuthProvider()); }
    catch (error) { setMessage(authError(error)); }
  }

  async function signOut() { await firebaseSignOut(firebaseAuth); setUserEmail(""); }

  async function insertRow(table: string, row: Record<string, unknown>) {
    if (!userId) { setMessage("Sign in to save your data."); return; }
    try { await addDoc(collection(firebaseDb, "users", userId, table), { ...row, created_at: new Date().toISOString() }); setMessage("Saved."); await loadData(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this record."); }
  }

  async function updateRow(table: string, id: string, changes: Record<string, unknown>) {
    if (!userId) return;
    try { await updateDoc(doc(firebaseDb, "users", userId, table, id), changes); await loadData(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update this record."); }
  }

  async function deleteRow(table: string, id: string) {
    if (!userId || !confirm("Delete this record?")) return;
    try { await deleteDoc(doc(firebaseDb, "users", userId, table, id)); await loadData(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete this record."); }
  }

  async function savePriorities(e: FormEvent) {
    e.preventDefault(); if (!userId) return;
    try {
      await setDoc(doc(firebaseDb, "users", userId, "days", todayISO()), { local_date: todayISO(), started_at: dayStart || new Date().toISOString(), priorities, priority_done: priorityDone, updated_at: new Date().toISOString() }, { merge: true });
      setMessage("Today's priorities saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save today's priorities."); }
  }

  async function addTask(e: FormEvent) {
    e.preventDefault(); if (!taskTitle.trim()) return;
    await insertRow("tasks",{title:taskTitle.trim(),area:taskArea,due_date:taskDue||null,priority:taskPriority,completed:false});
    setTaskTitle("");
  }
  async function addProject(e: FormEvent) {
    e.preventDefault(); if (!projectName.trim()) return;
    await insertRow("projects",{name:projectName.trim(),area:projectArea,status:"active",next_action:projectAction.trim()||null});
    setProjectName("");setProjectAction("");
  }
  async function addDeadline(e: FormEvent) {
    e.preventDefault(); if (!deadlineTitle.trim() || !deadlineDate) return;
    await insertRow("deadlines",{title:deadlineTitle.trim(),due_at:new Date(deadlineDate).toISOString(),area:deadlineArea,notes:null});
    setDeadlineTitle("");
  }
  async function addSession(e: FormEvent) {
    e.preventDefault();
    await insertRow("focus_sessions",{work_date:todayISO(),minutes:focusMinutes,task:focusTask.trim()||"Focused work",distraction_free:focusDistractionFree,distraction_note:focusNote.trim()||null});
    setFocusNote("");
  }
  async function addDistraction(e: FormEvent) {
    e.preventDefault();
    await insertRow("distractions",{happened_at:new Date().toISOString(),trigger:distractionTrigger,note:distractionNote.trim()||null});
    setDistractionNote("");
  }
  async function addGym(e: FormEvent) {
    e.preventDefault();
    await insertRow("gym_logs",{workout_date:todayISO(),activity:gymActivity,completed:true,notes:null});
  }
  async function addReview(e: FormEvent) {
    e.preventDefault();
    const now = new Date(); const day = now.getDay(); now.setDate(now.getDate()-((day+6)%7));
    const weekStart = now.toLocaleDateString("en-CA");
    await insertRow("weekly_reviews",{week_start:weekStart,wins:reviewWins,blockers:reviewBlockers,next_priorities:reviewPriorities});
    setReviewWins("");setReviewBlockers("");setReviewPriorities("");
  }

  const todayTasks = tasks.filter(t=>!t.completed && (!t.due_date || t.due_date <= todayISO())).slice(0,6);
  const upcoming = deadlines.filter(d=>new Date(d.due_at).getTime() >= Date.now()).sort((a,b)=>a.due_at.localeCompare(b.due_at)).slice(0,5);
  const todayMinutes = sessions.filter(s=>s.work_date===todayISO()).reduce((sum,s)=>sum+s.minutes,0);
  const weekSessions = sessions.filter(s=>s.work_date>=datePlus(-6));
  const weekMinutes = weekSessions.reduce((sum,s)=>sum+s.minutes,0);
  const thisWeekGym = gymLogs.filter(g=>g.workout_date>=datePlus(-6)&&g.completed).length;
  const recentDistractions = distractions.filter(d=>d.happened_at?.slice(0,10)>=datePlus(-6)).length;
  const doneTasks = tasks.filter(t=>t.completed).length;
  const totalTasks = tasks.length;
  const [showAddTask,setShowAddTask] = useState(false);

  if (!configured) return <SetupScreen />;
  if (loading) return <div className="loading"><div className="spinner"/><p>Loading your DAYFRAME…</p></div>;
  if (!userEmail) return <main className="auth-wrap"><div className="auth-card"><div className="brand-mark"><Focus size={22}/></div><p className="eyebrow">YOUR PERSONAL OPERATING SYSTEM</p><h1>Make your days <em>count.</em></h1><p className="muted">Sign in, start your day, and set three priorities before the noise begins.</p><button className="google-button" type="button" onClick={signInGoogle}><GoogleIcon/> Continue with Google</button><div className="auth-divider"><span>or use email</span></div><form onSubmit={signIn} className="stack"><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label><button className="primary" type="submit">{authMode === "signup" ? "Create account" : "Sign in with email"} <ArrowUpRight size={16}/></button></form><button className="auth-switch" type="button" onClick={()=>{setAuthMode(authMode === "signin" ? "signup" : "signin");setMessage("")}}>{authMode === "signin" ? "New to DAYFRAME? Create an account" : "Already have an account? Sign in"}</button>{message&&<p className="notice">{message}</p>}<p className="tiny">Your private workspace syncs across devices. Your day-start time is recorded once per local calendar day.</p></div></main>;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Focus size={20}/></div><div><strong>DAYFRAME</strong><span>Personal OS</span></div></div>
      <div className="side-label">WORKSPACE</div>
      {[
        ["Today",LayoutDashboard],["Tasks",ListTodo],["Deadlines",CalendarDays],["Projects",Target],["Focus log",Timer],["Fitness",Dumbbell],["Weekly review",TrendingUp]
      ].map(([label,Icon]:any)=><button key={label} onClick={()=>setActive(label)} className={`nav-item ${active===label?"selected":""}`}><Icon size={17}/>{label}</button>)}
      <div className="sidebar-bottom"><div className="avatar">{userEmail.slice(0,1).toUpperCase()}</div><div className="account"><strong>{userEmail}</strong><span>Synced workspace</span></div><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div><p className="eyebrow">{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p><h1>{active==="Today"?"Your day, in focus.":active}</h1></div><div className="top-actions"><span className="sync-pill"><span/>Cloud synced</span><button className="icon-button" onClick={()=>loadData()} title="Refresh"><RefreshCw size={16}/></button></div></header>
      {message&&<div className="notice-banner"><span>{message}</span><button className="icon-button" onClick={()=>setMessage("")}><X size={15}/></button></div>}
      {active==="Today"&&<div className="content">
        <div className="welcome-row"><div><h2>One thing at a time.</h2><p>Protect your attention. Finish what matters.</p></div><span className="date-chip"><CalendarDays size={15}/>{new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</span></div>
        <section className="panel daily-checkin">
          <div className="panel-head"><div><h3>Today's check-in</h3><p>{dayStart ? `Day started at ${new Date(dayStart).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}` : "Your day starts when you sign in."}</p></div><span className="checkin-tag"><CheckCircle2 size={14}/> {priorityDone.filter(Boolean).length}/3 complete</span></div>
          <form className="stack" onSubmit={savePriorities}>
            <label>Most important task<input value={priorities[0]} onChange={e=>setPriorities(p=>[e.target.value,p[1],p[2]])} placeholder="The one thing that would make today count"/></label>
            <div className="two-fields"><label>Priority 2<input value={priorities[1]} onChange={e=>setPriorities(p=>[p[0],e.target.value,p[2]])} placeholder="Second priority"/></label><label>Priority 3<input value={priorities[2]} onChange={e=>setPriorities(p=>[p[0],p[1],e.target.value])} placeholder="Third priority"/></label></div>
            <div className="priority-progress-list">{priorities.map((priority, index) => <label key={index} className={`priority-progress ${priorityDone[index] ? "is-done" : ""}`}><input type="checkbox" checked={priorityDone[index]} disabled={!priority.trim()} onChange={e=>setPriorityDone(done=>done.map((value,i)=>i===index?e.target.checked:value))}/><span>{index+1}</span><strong>{priority.trim() || `Priority ${index+1} — add a task above`}</strong></label>)}</div>
            <div className="checkin-actions"><span className="muted-small">Saved per day · your original start time won't reset on later logins.</span><button className="primary" type="submit"><Check size={15}/> Save priorities</button></div>
          </form>
        </section>
        <div className="stats-grid">
          <Stat icon={<Clock3/>} label="Focus today" value={`${todayMinutes}/60`} sub="minutes completed"/>
          <Stat icon={<CheckCircle2/>} label="Daily priorities" value={`${priorityDone.filter(Boolean).length}/3`} sub="completed today"/>
          <Stat icon={<ListTodo/>} label="Tasks completed" value={`${doneTasks}/${totalTasks}`} sub="all-time checklist"/>
          <Stat icon={<Dumbbell/>} label="Gym this week" value={`${thisWeekGym}`} sub="logged sessions"/>
          <Stat icon={<Activity/>} label="Distractions" value={`${recentDistractions}`} sub="logged this week"/>
        </div>
        <div className="dashboard-grid">
          <section className="panel"><div className="panel-head"><div><h3>Today's priorities</h3><p>Choose a clear next action.</p></div><button className="text-button" onClick={()=>{setActive("Tasks");setShowAddTask(true)}}><Plus size={15}/> Add task</button></div>
            {todayTasks.length===0?<Empty text="No open tasks due today. Add a priority to get started."/>:<div className="task-list">{todayTasks.map(t=><div className="task-row" key={t.id}><button className="check-button" onClick={()=>updateRow("tasks",t.id,{completed:true})}><Circle size={19}/></button><div className="task-main"><strong>{t.title}</strong><span>{t.area} · {t.due_date?dueLabel(t.due_date):"No due date"}</span></div><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span></div>)}</div>}
          </section>
          <section className="panel deadline-panel"><div className="panel-head"><div><h3>Upcoming deadlines</h3><p>Protect the dates that matter.</p></div><button className="icon-button" onClick={()=>setActive("Deadlines")}><ArrowUpRight size={16}/></button></div>
            {upcoming.length===0?<Empty text="Add an exam, application, or submission date."/>:<div className="deadline-list">{upcoming.map(d=><div className="deadline-row" key={d.id}><div className="deadline-date"><strong>{new Date(d.due_at).toLocaleDateString("en-IN",{day:"2-digit"})}</strong><span>{new Date(d.due_at).toLocaleDateString("en-IN",{month:"short"})}</span></div><div className="task-main"><strong>{d.title}</strong><span>{d.area} · {new Date(d.due_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span></div></div>)}</div>}
          </section>
          <section className="panel focus-panel"><div className="panel-head"><div><h3>Log a focus session</h3><p>Track effort, not perfection.</p></div><Timer size={18}/></div>
            <form className="stack" onSubmit={addSession}><label>What did you work on?<input value={focusTask} onChange={e=>setFocusTask(e.target.value)} required/></label><div className="two-fields"><label>Minutes<select value={focusMinutes} onChange={e=>setFocusMinutes(Number(e.target.value))}>{[15,25,30,45,60,75,90,120].map(n=><option key={n}>{n}</option>)}</select></label><label>Session quality<select value={focusDistractionFree?"clean":"interrupted"} onChange={e=>setFocusDistractionFree(e.target.value==="clean")}><option value="clean">Phone-free</option><option value="interrupted">Interrupted</option></select></label></div><label>Distraction note (optional)<input value={focusNote} onChange={e=>setFocusNote(e.target.value)} placeholder="What pulled your attention?"/></label><button className="primary" type="submit"><Plus size={16}/> Save focus session</button></form>
          </section>
          <section className="panel"><div className="panel-head"><div><h3>Today's plan</h3><p>A realistic baseline, not a perfect day.</p></div><Sparkles size={18}/></div><div className="plan-list"><div><span className="plan-dot university"/><div><strong>University first</strong><p>Prepare for Bremen and check urgent application deadlines.</p></div></div><div><span className="plan-dot creative"/><div><strong>Creative progress</strong><p>One concrete next step for Random Hours when exam work allows.</p></div></div><div><span className="plan-dot fitness"/><div><strong>Movement and recovery</strong><p>Gym or a planned rest day. Protect your sleep.</p></div></div></div></section>
        </div>
      </div>}
      {active==="Tasks"&&<div className="content"><div className="section-intro"><h2>Tasks</h2><p>Capture it once. Then do the next action.</p></div>{showAddTask&&<form className="panel form-panel" onSubmit={addTask}><div className="form-heading"><h3>New task</h3><button type="button" className="icon-button" onClick={()=>setShowAddTask(false)}><X size={16}/></button></div><label>Task title<input autoFocus required value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Complete timed practice paper"/></label><div className="three-fields"><label>Area<select value={taskArea} onChange={e=>setTaskArea(e.target.value)}>{areas.map(a=><option key={a}>{a}</option>)}</select></label><label>Due date<input type="date" value={taskDue} onChange={e=>setTaskDue(e.target.value)}/></label><label>Priority<select value={taskPriority} onChange={e=>setTaskPriority(e.target.value)}><option>High</option><option>Medium</option><option>Low</option></select></label></div><button className="primary"><Plus size={16}/> Create task</button></form>}<div className="panel"><div className="panel-head"><div><h3>All tasks</h3><p>{tasks.filter(t=>!t.completed).length} open · {doneTasks} completed</p></div><button className="primary compact" onClick={()=>setShowAddTask(v=>!v)}><Plus size={15}/> Add task</button></div><div className="task-list">{tasks.map(t=><div className={`task-row ${t.completed?"completed":""}`} key={t.id}><button className="check-button" onClick={()=>updateRow("tasks",t.id,{completed:!t.completed})}>{t.completed?<CheckCircle2 size={19}/>:<Circle size={19}/>}</button><div className="task-main"><strong>{t.title}</strong><span>{t.area} · {dueLabel(t.due_date)}</span></div><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span><button className="icon-button danger" onClick={()=>deleteRow("tasks",t.id)}><Trash2 size={15}/></button></div>)}</div></div></div>}
      {active==="Deadlines"&&<div className="content"><div className="section-intro"><h2>Deadlines</h2><p>Exams, applications, and important dates.</p></div><form className="panel form-panel" onSubmit={addDeadline}><h3>Add deadline</h3><label>Name<input required value={deadlineTitle} onChange={e=>setDeadlineTitle(e.target.value)} placeholder="e.g. University of Bremen exam"/></label><div className="two-fields"><label>Date and time<input type="datetime-local" required value={deadlineDate} onChange={e=>setDeadlineDate(e.target.value)}/></label><label>Area<select value={deadlineArea} onChange={e=>setDeadlineArea(e.target.value)}>{areas.map(a=><option key={a}>{a}</option>)}</select></label></div><button className="primary"><Plus size={16}/> Add deadline</button></form><div className="panel"><h3>All deadlines</h3>{deadlines.length===0?<Empty text="No deadlines saved yet."/>:<div className="deadline-list">{deadlines.map(d=><div className="deadline-row" key={d.id}><div className="deadline-date"><strong>{new Date(d.due_at).toLocaleDateString("en-IN",{day:"2-digit"})}</strong><span>{new Date(d.due_at).toLocaleDateString("en-IN",{month:"short"})}</span></div><div className="task-main"><strong>{d.title}</strong><span>{d.area} · {new Date(d.due_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</span></div><button className="icon-button danger" onClick={()=>deleteRow("deadlines",d.id)}><Trash2 size={15}/></button></div>)}</div>}</div></div>}
      {active==="Projects"&&<div className="content"><div className="section-intro"><h2>Projects</h2><p>Keep active work small enough to move forward.</p></div><form className="panel form-panel" onSubmit={addProject}><h3>Add project</h3><label>Project name<input required value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="e.g. Random Hours showreel"/></label><div className="two-fields"><label>Area<select value={projectArea} onChange={e=>setProjectArea(e.target.value)}>{areas.map(a=><option key={a}>{a}</option>)}</select></label><label>Next action<input value={projectAction} onChange={e=>setProjectAction(e.target.value)} placeholder="e.g. Select final 5 shots"/></label></div><button className="primary"><Plus size={16}/> Add project</button></form><div className="project-grid">{projects.map(p=><div className="panel project-card" key={p.id}><div className="project-icon"><Target size={19}/></div><span className="project-area">{p.area}</span><h3>{p.name}</h3><p>{p.next_action||"Add a next action to move this forward."}</p><div className="project-footer"><span className="status-dot"/> {p.status}<button className="icon-button danger" onClick={()=>deleteRow("projects",p.id)}><Trash2 size={15}/></button></div></div>)}</div>{projects.length===0&&<div className="panel"><Empty text="Add your active projects, including Random Hours and university applications."/></div>}</div>}
      {active==="Focus log"&&<div className="content"><div className="section-intro"><h2>Focus log</h2><p>Build consistency by measuring what you actually do.</p></div><div className="stats-grid"><Stat icon={<Clock3/>} label="Last 7 days" value={`${weekMinutes} min`} sub="focused work logged"/><Stat icon={<Focus/>} label="Daily target" value="60 min" sub="your current baseline"/><Stat icon={<ShieldCheck/>} label="Phone-free" value={`${weekSessions.filter(s=>s.distraction_free).length}/${weekSessions.length}`} sub="sessions this week"/></div><div className="panel"><h3>Log a session</h3><form className="stack" onSubmit={addSession}><label>Task<input value={focusTask} onChange={e=>setFocusTask(e.target.value)} required/></label><div className="two-fields"><label>Minutes<select value={focusMinutes} onChange={e=>setFocusMinutes(Number(e.target.value))}>{[15,25,30,45,60,75,90,120].map(n=><option key={n}>{n}</option>)}</select></label><label>Phone-free?<select value={focusDistractionFree?"yes":"no"} onChange={e=>setFocusDistractionFree(e.target.value==="yes")}><option value="yes">Yes</option><option value="no">No</option></select></label></div><label>Note<input value={focusNote} onChange={e=>setFocusNote(e.target.value)} placeholder="Optional reflection"/></label><button className="primary"><Plus size={16}/> Log session</button></form></div><div className="panel"><h3>Log a distraction</h3><p className="muted">Notice the trigger without judging yourself. The goal is to find patterns.</p><form className="stack" onSubmit={addDistraction}><label>What pulled your attention?<select value={distractionTrigger} onChange={e=>setDistractionTrigger(e.target.value)}><option>Phone / social media</option><option>Messaging</option><option>Unrelated browser tabs</option><option>Overthinking</option><option>Fatigue</option><option>Unexpected interruption</option><option>Other</option></select></label><label>What happened? (optional)<input value={distractionNote} onChange={e=>setDistractionNote(e.target.value)} placeholder="e.g. opened Instagram during revision"/></label><button className="primary"><Plus size={16}/> Log distraction</button></form></div><div className="panel"><h3>Recent distractions</h3>{distractions.slice().reverse().slice(0,20).map(d=><div className="simple-row" key={d.id}><div><strong>{d.trigger}</strong><span>{new Date(d.happened_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}{d.note?" · "+d.note:""}</span></div><button className="icon-button danger" onClick={()=>deleteRow("distractions",d.id)}><Trash2 size={15}/></button></div>)}</div><div className="panel"><h3>Recent sessions</h3>{sessions.slice().reverse().slice(0,20).map(s=><div className="simple-row" key={s.id}><div><strong>{s.task}</strong><span>{s.work_date} · {s.distraction_free?"Phone-free":"Interrupted"}</span></div><strong>{s.minutes} min</strong><button className="icon-button danger" onClick={()=>deleteRow("focus_sessions",s.id)}><Trash2 size={15}/></button></div>)}</div></div>}
      {active==="Fitness"&&<div className="content"><div className="section-intro"><h2>Fitness</h2><p>Track consistency, not punishment.</p></div><div className="stats-grid"><Stat icon={<Dumbbell/>} label="Sessions this week" value={`${thisWeekGym}`} sub="logged workouts"/><Stat icon={<Activity/>} label="Weekly aim" value="4–6" sub="adjust for recovery"/></div><form className="panel form-panel" onSubmit={addGym}><h3>Log today's activity</h3><label>Activity<input value={gymActivity} onChange={e=>setGymActivity(e.target.value)} placeholder="e.g. Back and biceps"/></label><button className="primary"><Check size={16}/> Log activity</button></form><div className="panel"><h3>Recent activity</h3>{gymLogs.slice().reverse().slice(0,20).map(g=><div className="simple-row" key={g.id}><div><strong>{g.activity}</strong><span>{g.workout_date}</span></div><span className="success-text">Completed</span><button className="icon-button danger" onClick={()=>deleteRow("gym_logs",g.id)}><Trash2 size={15}/></button></div>)}</div></div>}
      {active==="Weekly review"&&<div className="content"><div className="section-intro"><h2>Weekly review</h2><p>Learn from the week. Don't judge yourself.</p></div><div className="stats-grid"><Stat icon={<Clock3/>} label="Focus time" value={`${weekMinutes} min`} sub="last seven days"/><Stat icon={<Dumbbell/>} label="Workouts" value={`${thisWeekGym}`} sub="last seven days"/><Stat icon={<Activity/>} label="Distractions" value={`${recentDistractions}`} sub="last seven days"/></div><form className="panel form-panel" onSubmit={addReview}><h3>Review this week</h3><label>What went well?<textarea required rows={3} value={reviewWins} onChange={e=>setReviewWins(e.target.value)} placeholder="Wins, work completed, moments of consistency…"/></label><label>What got in the way?<textarea rows={3} value={reviewBlockers} onChange={e=>setReviewBlockers(e.target.value)} placeholder="Distractions, unrealistic plans, energy, unexpected events…"/></label><label>Three priorities for next week<textarea required rows={3} value={reviewPriorities} onChange={e=>setReviewPriorities(e.target.value)} placeholder="1. …&#10;2. …&#10;3. …"/></label><button className="primary"><Check size={16}/> Save weekly review</button></form><div className="panel"><h3>Past reviews</h3>{reviews.slice().reverse().map(r=><div className="review-item" key={r.id}><strong>Week of {r.week_start}</strong><p><b>Wins:</b> {r.wins}</p><p><b>Blockers:</b> {r.blockers||"Not recorded"}</p><p><b>Next:</b> {r.next_priorities}</p></div>)}</div></div>}
      <footer className="footer"><span>DAYFRAME · A little progress, consistently.</span><span>Private workspace · {userEmail}</span></footer>
    </section>
  </main>;
}

function Stat({icon,label,value,sub}:{icon:React.ReactNode;label:string;value:string;sub:string}) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div><strong className="stat-value">{value}</strong><span className="stat-sub">{sub}</span></div>;
}
function Empty({text}:{text:string}) { return <div className="empty"><span><Sparkles size={17}/></span><p>{text}</p></div>; }

function SetupScreen() {
  return <main className="setup-wrap"><div className="setup-card"><div className="brand"><div className="brand-mark"><Focus size={20}/></div><div><strong>DAYFRAME</strong><span>Setup required</span></div></div><p className="eyebrow">YOUR PERSONAL OPERATING SYSTEM</p><h1>One calm place for <em>what matters.</em></h1><p className="muted">Add Firebase web-app configuration to enable secure authentication and cloud sync.</p><div className="setup-step"><span>01</span><div><strong>Create a Firebase project</strong><p>Open <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Firebase Console ↗</a> and create a separate project for DAYFRAME.</p></div></div><div className="setup-step"><span>02</span><div><strong>Register a web app</strong><p>In Project settings, add a web app and copy its configuration into <code>.env.local</code> using the names in <code>.env.example</code>.</p></div></div><div className="setup-step"><span>03</span><div><strong>Enable sign-in providers</strong><p>Authentication → Sign-in method: enable Email/Password and Google. Add your Codespaces and deployed domains to Authorized domains.</p></div></div><div className="setup-step"><span>04</span><div><strong>Create Firestore</strong><p>Build → Firestore Database → Create database, then publish the rules in <code>firestore.rules</code>.</p></div></div><div className="setup-note"><ShieldCheck size={17}/><p>Records are stored under the authenticated user's UID. Firestore rules deny cross-user reads and writes.</p></div><p className="tiny">Then run <code>npm install</code> and <code>npm run dev</code>.</p></div></main>;
}

function GoogleIcon() {
  return <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.65 5.93c4.47-4.13 7.12-10.2 7.12-17.58z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.87l-7.65-5.93c-2.13 1.43-4.87 2.28-8.26 2.28-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 43.62 14.62 48 24 48z"/></svg>;
}
