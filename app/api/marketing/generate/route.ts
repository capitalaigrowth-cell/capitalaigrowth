import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { mode?: string; title?: string; brief?: string; source_url?: string; filename?: string; mime_type?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const mode = body.mode === "upload" ? "upload" : "brief";
  const hook = mode === "upload" ? process.env.MAKE_G6_MARKETING_UPLOAD_WEBHOOK : process.env.MAKE_G6_MARKETING_BRIEF_WEBHOOK;
  if (!hook) return NextResponse.json({ error: "Marketing G6 bridge is not configured" }, { status: 503 });
  if (mode === "brief" && !body.brief?.trim()) return NextResponse.json({ error: "Campaign brief is required" }, { status: 400 });
  if (mode === "upload" && !body.source_url?.trim()) return NextResponse.json({ error: "Secure recording URL is required" }, { status: 400 });

  const jobId = Date.now();
  const payload = mode === "upload"
    ? { job_id: jobId, title: body.title || "G6 Marketing Recording", lane: "G6", filename: body.filename || "recording", mime_type: body.mime_type || "video/mp4", source_url: body.source_url }
    : { job_id: jobId, title: body.title || "G6 Marketing Campaign", lane: "G6", filename: "dashboard-brief.txt", brief: body.brief };

  const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
  const text = await r.text();
  if (!r.ok) return NextResponse.json({ error: "Marketing G6 rejected the request" }, { status: 502 });
  return NextResponse.json({ ok: true, job_id: jobId, mode, message: mode === "upload" ? "Recording sent to Marketing G6 for transcription and campaign generation." : "Brief sent to Marketing G6 for AI campaign generation.", response: text.slice(0, 2000) });
}
