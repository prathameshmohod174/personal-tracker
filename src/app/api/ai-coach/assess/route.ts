import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type Period = "daily" | "weekly";
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
function serialise(document: QueryDocumentSnapshot) {
  return { id: document.id, ...document.data() };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in again to use the AI coach." }, { status: 401 });

    const { auth, db } = getAdminServices();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const body = await request.json();
    if (body.period !== "daily" && body.period !== "weekly") {
      return NextResponse.json({ error: "Choose a daily or weekly assessment." }, { status: 400 });
    }
    const period: Period = body.period;
    if (!validDate(body.localDate) || !validDate(body.weekStart)) {
      return NextResponse.json({ error: "The assessment date is invalid. Refresh the page and try again." }, { status: 400 });
    }

    const date = body.localDate;
    const weekStart = body.weekStart;
    const assessmentId = period === "daily" ? `daily_${date}` : `weekly_${weekStart}`;
    const assessmentRef = db.doc(`users/${uid}/ai_assessments/${assessmentId}`);
    const existing = await assessmentRef.get();
    if (existing.exists && body.force !== true) {
      return NextResponse.json({ assessment: existing.data(), cached: true });
    }

    const userRoot = db.collection("users").doc(uid);
    const collectionNames = ["days", "tasks", "projects", "deadlines", "focus_sessions", "distractions", "gym_logs", "weekly_reviews"];
    const snapshots = await Promise.all(collectionNames.map((name) => userRoot.collection(name).get()));
    const records: Record<string, any[]> = Object.fromEntries(
      collectionNames.map((name, index) => [name, snapshots[index].docs.map(serialise)]),
    );

    const cutoff = new Date(date + "T12:00:00");
    cutoff.setDate(cutoff.getDate() - (period === "daily" ? 6 : 13));
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    const withinWindow = (value: unknown) => typeof value === "string" && value.slice(0, 10) >= cutoffKey && value.slice(0, 10) <= date;
    const windowed = {
      days: records.days.filter((r) => withinWindow(r.local_date)),
      focus_sessions: records.focus_sessions.filter((r) => withinWindow(r.work_date)),
      distractions: records.distractions.filter((r) => withinWindow(r.happened_at)),
      gym_logs: records.gym_logs.filter((r) => withinWindow(r.workout_date)),
      weekly_reviews: records.weekly_reviews.filter((r) => typeof r.week_start === "string" && r.week_start <= weekStart).slice(-8),
    };

    const tasks = records.tasks;
    const deadlines = records.deadlines;
    const projects = records.projects;
    const openTasks = tasks.filter((task) => !task.completed);
    const overdueTasks = openTasks.filter((task) => typeof task.due_date === "string" && task.due_date < date);
    const promptData = {
      assessment_period: period,
      local_date: date,
      week_start: weekStart,
      requested_scope: "all tracked DAYFRAME areas",
      recent_records: windowed,
      current_state: {
        total_tasks: tasks.length,
        completed_tasks: tasks.filter((task) => task.completed).length,
        open_tasks: openTasks.length,
        overdue_tasks: overdueTasks.slice(0, 40),
        active_projects: projects.filter((project) => project.status === "active").slice(0, 30),
        deadlines: deadlines.filter((deadline) => typeof deadline.due_at === "string").slice(0, 30),
      },
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI is not configured yet. Add OPENAI_API_KEY to your server environment, restart the dev server, and try again." }, { status: 503 });

    const systemPrompt = `You are DAYFRAME, a direct but fair personal execution coach. Assess only the supplied records. Do not infer unlogged work, intentions, emotions, causes, or character. Missing data means unknown, not zero effort. Be candid about repeated missed commitments and weak execution, but never insult, shame, diagnose, or equate productivity with human worth. Use specific evidence and distinguish facts from hypotheses. Daily verdict focuses on today's day record and recent logs; weekly report evaluates trends across the supplied 14-day window and saved reflections. Give a score from 0 to 100 only as a transparent execution estimate based on available evidence; if data is sparse, lower confidence and explain why. No unsupported claims. Return JSON only with: headline (short), score (integer 0-100), verdict (2-5 sentences), evidence (2-5 specific points), patterns (0-4 points; say when there is insufficient data), risks (0-4 points), actions (2-5 concrete next actions), next_week_priorities (weekly reports only, 3 items; daily reports use empty array), data_quality_notes (0-3 limitations). Avoid generic advice.`;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(promptData) },
        ],
      }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      console.error("AI coach provider error", aiResponse.status, detail.slice(0, 500));
      return NextResponse.json({ error: aiResponse.status === 401 ? "The OpenAI API key was rejected. Check OPENAI_API_KEY." : aiResponse.status === 429 ? "The AI provider rate limit or budget was reached. Check your API usage and billing." : "The AI provider could not complete the assessment. Try again shortly." }, { status: 502 });
    }

    const completion = await aiResponse.json();
    const content = completion.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("The AI provider returned an empty assessment.");
    const parsed = JSON.parse(content);
    const score = Number(parsed.score);
    if (!Number.isFinite(score) || score < 0 || score > 100 || typeof parsed.verdict !== "string") {
      throw new Error("The AI provider returned an invalid assessment.");
    }
    const assessment = {
      headline: String(parsed.headline || (period === "daily" ? "Daily execution verdict" : "Weekly performance review")),
      score: Math.round(score),
      verdict: parsed.verdict,
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 5).map(String) : [],
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns.slice(0, 4).map(String) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 4).map(String) : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5).map(String) : [],
      next_week_priorities: Array.isArray(parsed.next_week_priorities) ? parsed.next_week_priorities.slice(0, 3).map(String) : [],
      data_quality_notes: Array.isArray(parsed.data_quality_notes) ? parsed.data_quality_notes.slice(0, 3).map(String) : [],
      generated_at: new Date().toISOString(),
      period,
      local_date: date,
      week_start: weekStart,
      model,
    };

    await assessmentRef.set({
      ...assessment,
      created_at: existing.exists ? existing.data()?.created_at ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ assessment });
  } catch (error) {
    console.error("AI coach request failed", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("FIREBASE_SERVICE_ACCOUNT_KEY")) {
      return NextResponse.json({ error: "Server Firebase credentials are missing. Add FIREBASE_SERVICE_ACCOUNT_KEY to .env.local and restart the server." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not generate the assessment. Check the server terminal for details." }, { status: 500 });
  }
}
