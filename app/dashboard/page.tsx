import { createServiceClient } from "@/lib/supabase/server";
import type { Lead } from "@/types";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = createServiceClient();

  const { data: leads } = await db
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const { count: leadsThisWeek } = await db
    .from("leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekStart.toISOString());

  const { count: bookedThisWeek } = await db
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "booked")
    .gte("created_at", weekStart.toISOString());

  const { count: totalBooked } = await db
    .from("bookings")
    .select("*", { count: "exact", head: true });

  const { count: totalLeads } = await db
    .from("leads")
    .select("*", { count: "exact", head: true });

  const conversionRate =
    totalLeads && totalBooked
      ? Math.round((totalBooked / totalLeads) * 100)
      : 0;

  return (
    <DashboardClient
      leads={(leads ?? []) as Lead[]}
      stats={{
        leadsThisWeek: leadsThisWeek ?? 0,
        bookedThisWeek: bookedThisWeek ?? 0,
        conversionRate,
        totalLeads: totalLeads ?? 0,
        appUrl: process.env["APP_URL"] ?? "",
      }}
    />
  );
}
