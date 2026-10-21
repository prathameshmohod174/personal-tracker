"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { Activity, AlertTriangle, BrainCircuit, CalendarCheck, CheckCircle2, RefreshCw, ShieldCheck, Sparkles, Target } from "lucide-react";

type Period = "daily" | "weekly";
type Assessment = {
  headline: string;
  score: number;
  verdict: string;
  evidence: string[];
  patterns: string[];
  risks: string[];
  actions: string[];
  next_week_priorities: string[];
  data_quality_notes: string[];
  generated_at?: string;
  period?: Period;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const mondayKey = (date: Date) => {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return dateKey(monday);
};

export default function AICoach() {
  const [daily, setDaily] = useState<Assessment | null>(null);
  const [weekly, setWeekly] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState<Period | null>(null);
  const [error, setError] = useState("");
  const [lastPeriod, setLastPeriod] = useState<Period>("daily");

  const runAssessment = useCallback(async (period: Period, force = false) => {
    const user = firebaseAuth.currentUser;
    if (!user) { setError("Sign in to generate a private assessment."); return; }
    setBusy(period);
    setLastPeriod(period);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/ai-coach/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ period, force, localDate: dateKey(new Date()), weekStart: mondayKey(new Date()) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The assessment could not be generated.");
      if (period === "daily") setDaily(payload.assessment as Assessment);
      else setWeekly(payload.assessment as Assessment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void runAssessment("daily"); }, [runAssessment]);

  function section(title: string, items: string[] | undefined, icon: ReactNode) {
    if (!items?.length) return null;
    return <section className="coach-section"><h4>{icon}{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>;
  }

  const renderAssessment = (item: Assessment | null, period: Period) => {
    if (!item) return <div className="coach-empty"><Sparkles size={20}/><p>No {period} assessment generated yet.</p><button className="primary" disabled={busy !== null} onClick={() => void runAssessment(period)}>{busy === period ? "Assessing…" : period === "daily" ? "Generate daily verdict" : "Generate weekly report"}</button></div>;
    return <div className="coach-report">
      <div className="coach-score-row"><div><span className="muted-small">EXECUTION SCORE · OUT OF 100</span><strong className="coach-score">{item.score}<small>/100</small></strong></div><span className="coach-date">{item.generated_at ? new Date(item.generated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Saved assessment"}</span></div>
      <h3>{item.headline}</h3><p className="coach-verdict">{item.verdict}</p>
      {section("Evidence from your logs", item.evidence, <CheckCircle2 size={16}/>)}
      {section("Patterns observed", item.patterns, <Activity size={16}/>)}
      {section("Risks and missed commitments", item.risks, <AlertTriangle size={16}/>)}
      {section(period === "daily" ? "Next actions" : "Actions for next week", item.actions, <Target size={16}/>)}
      {period === "weekly" && section("Priorities for next week", item.next_week_priorities, <CalendarCheck size={16}/>)}
      {item.data_quality_notes?.length > 0 && section("Limits of this assessment", item.data_quality_notes, <ShieldCheck size={16}/>)}
      <p className="muted-small">This is a coaching estimate based on records you entered, not an objective measure of your worth. Missing logs are treated as missing evidence, not proof that you did nothing.</p>
      <button className="text-button" disabled={busy !== null} onClick={() => void runAssessment(period, true)}><RefreshCw size={14}/> Reassess using latest data</button>
    </div>;
  };

  const assessment = lastPeriod === "daily" ? daily : weekly;
  return <div className="content">
    <div className="section-intro"><h2>AI Progress Coach</h2><p>Direct feedback from your actual DAYFRAME logs — not motivational guesswork.</p></div>
    <div className="coach-banner"><div className="coach-banner-icon"><BrainCircuit size={22}/></div><div><strong>Honest, evidence-based accountability</strong><p>The coach reviews priorities, tasks, deadlines, projects, focus sessions, distractions, fitness logs and your weekly reflections. It will flag weak execution, but won't invent explanations when the data is missing.</p></div></div>
    {error && <div className="coach-error" role="alert">{error}</div>}
    <div className="coach-tabs">
      <button className={lastPeriod === "daily" ? "coach-tab active" : "coach-tab"} onClick={() => setLastPeriod("daily")}>Daily verdict</button>
      <button className={lastPeriod === "weekly" ? "coach-tab active" : "coach-tab"} onClick={() => setLastPeriod("weekly")}>Weekly report</button>
    </div>
    <section className="panel coach-panel"><div className="panel-head"><div><h3>{lastPeriod === "daily" ? "Today's execution" : "Weekly performance review"}</h3><p>{lastPeriod === "daily" ? "One assessment per local day, refreshed when you request it." : "A wider look at consistency, bottlenecks and next week's plan."}</p></div><Sparkles size={18}/></div>{renderAssessment(assessment, lastPeriod)}</section>
    <div className="coach-footnote"><ShieldCheck size={16}/><p>Private to your account. The AI key stays on the server. Only the authenticated user's records are read, and the report is saved to that user's Firestore space.</p></div>
  </div>;
}
