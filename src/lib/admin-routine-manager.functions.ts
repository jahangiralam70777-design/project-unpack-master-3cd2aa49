// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
// Admin Routine Manager — READ-ONLY monitoring of student Study Routines.
// Independent module: relies only on `study_routines`, `study_routine_tasks`,
// and `study_routine_settings`. It does not mutate any student data.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// --------------------------------------------------------------- helpers
async function assertAdmin(sb: any, userId: string) {
  // Try the standard has_role RPC first; if unavailable, fall back to user_roles table.
  try {
    const [a, s] = await Promise.all([
      sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
      sb.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    ]);
    if (a?.data === true || s?.data === true) return;
    throw new Error("Forbidden");
  } catch {
    try {
      const { data } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["admin", "super_admin"])
        .limit(1);
      if (data && data.length > 0) return;
    } catch { /* noop */ }
    throw new Error("Forbidden");
  }
}

async function loadUserDirectory(userIds: string[]): Promise<Record<string, { email: string | null; name: string | null }>> {
  const out: Record<string, { email: string | null; name: string | null }> = {};
  if (!userIds.length) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Fetch profiles first (best-effort) — may not exist in this environment.
  try {
    const { data } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id,email,display_name,full_name")
      .in("id", userIds);
    for (const p of data ?? []) {
      out[p.id] = {
        email: p.email ?? null,
        name: p.display_name ?? p.full_name ?? null,
      };
    }
  } catch { /* profiles table not available */ }
  // Fill missing with auth admin lookup.
  const missing = userIds.filter((id) => !out[id]?.email);
  for (const id of missing) {
    try {
      const { data } = await (supabaseAdmin as any).auth.admin.getUserById(id);
      const u = data?.user;
      out[id] = {
        email: u?.email ?? out[id]?.email ?? null,
        name:
          out[id]?.name ??
          (u?.user_metadata?.full_name as string | undefined) ??
          (u?.user_metadata?.name as string | undefined) ??
          null,
      };
    } catch { /* ignore */ }
  }
  return out;
}

// --------------------------------------------------------------- stats
export const adminRoutineStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    await assertAdmin(sb, context.userId);

    const [routinesRes, tasksRes] = await Promise.all([
      sb.from("study_routines").select("id,user_id,is_archived,created_at,updated_at"),
      sb
        .from("study_routine_tasks")
        .select(
          "id,user_id,status,completion,task_date,start_time,end_time,created_at,updated_at",
        ),
    ]);
    const routines: any[] = routinesRes.data ?? [];
    const tasks: any[] = tasksRes.data ?? [];

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const studentIds = new Set<string>();
    const activeToday = new Set<string>();
    const activeWeek = new Set<string>();
    const activeMonth = new Set<string>();
    for (const r of routines) studentIds.add(r.user_id);
    for (const t of tasks) {
      studentIds.add(t.user_id);
      const updated = new Date(t.updated_at ?? t.created_at);
      if (updated >= startOfDay) activeToday.add(t.user_id);
      if (updated >= startOfWeek) activeWeek.add(t.user_id);
      if (updated >= startOfMonth) activeMonth.add(t.user_id);
    }

    const completed = tasks.filter((t) => t.status === "completed").length;
    const pending = tasks.length - completed;
    const avgCompletion = tasks.length
      ? Math.round(tasks.reduce((s, t) => s + (t.completion ?? 0), 0) / tasks.length)
      : 0;

    // Avg daily study minutes = sum(duration for completed tasks) / distinct-days / student count.
    const minuteFor = (t: any) => {
      const [h1, m1] = String(t.start_time ?? "00:00").split(":").map(Number);
      const [h2, m2] = String(t.end_time ?? "00:00").split(":").map(Number);
      const mins = h2 * 60 + m2 - (h1 * 60 + m1);
      return mins > 0 ? mins : 0;
    };
    const completedTasks = tasks.filter((t) => t.status === "completed");
    const totalMinutes = completedTasks.reduce((s, t) => s + minuteFor(t), 0);
    const distinctDays = new Set(completedTasks.map((t) => t.task_date)).size || 1;
    const avgDailyMinutes = Math.round(totalMinutes / distinctDays);

    return {
      totalStudents: studentIds.size,
      activeToday: activeToday.size,
      activeWeek: activeWeek.size,
      activeMonth: activeMonth.size,
      totalRoutines: routines.length,
      totalTasks: tasks.length,
      completedTasks: completed,
      pendingTasks: pending,
      avgCompletion,
      avgDailyMinutes,
    };
  });

// --------------------------------------------------------------- students table
const listInput = z
  .object({
    search: z.string().trim().max(120).optional(),
    levelCode: z.string().trim().max(40).optional(),
    subjectId: z.string().uuid().optional(),
    chapterId: z.string().uuid().optional(),
    routineType: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
    status: z.enum(["all", "active", "inactive"]).default("all"),
    sortBy: z.enum(["last_active", "completion", "tasks", "created"]).default("last_active"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(5).max(100).default(20),
  })
  .partial()
  .transform((v) => ({
    search: v.search ?? "",
    levelCode: v.levelCode ?? "",
    subjectId: v.subjectId ?? "",
    chapterId: v.chapterId ?? "",
    routineType: v.routineType ?? "",
    status: v.status ?? "all",
    sortBy: v.sortBy ?? "last_active",
    sortDir: v.sortDir ?? "desc",
    page: v.page ?? 1,
    pageSize: v.pageSize ?? 20,
  }));

export const adminRoutineStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) => listInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdmin(sb, context.userId);

    // Pull routines and tasks; aggregate per user in memory (dataset is per-user small).
    let rq = sb
      .from("study_routines")
      .select(
        "id,user_id,name,type,level_code,subject_id,chapter_id,is_active,is_archived,created_at",
      )
      .eq("is_archived", false);
    if (data.levelCode) rq = rq.eq("level_code", data.levelCode);
    if (data.subjectId) rq = rq.eq("subject_id", data.subjectId);
    if (data.chapterId) rq = rq.eq("chapter_id", data.chapterId);
    if (data.routineType) rq = rq.eq("type", data.routineType);
    const { data: routines = [] } = await rq;

    const userIds = Array.from(new Set(routines.map((r: any) => r.user_id)));
    if (!userIds.length) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
    }

    const { data: tasks = [] } = await sb
      .from("study_routine_tasks")
      .select(
        "user_id,status,completion,start_time,end_time,updated_at,created_at,level_code,subject_id,chapter_id",
      )
      .in("user_id", userIds);

    const directory = await loadUserDirectory(userIds);

    // Aggregate per user, using their PRIMARY (most recent, non-archived) routine.
    const byUser: Record<string, any> = {};
    const primaryRoutine: Record<string, any> = {};
    for (const r of routines) {
      const prev = primaryRoutine[r.user_id];
      if (!prev || new Date(r.created_at) > new Date(prev.created_at)) {
        primaryRoutine[r.user_id] = r;
      }
      byUser[r.user_id] = byUser[r.user_id] ?? {
        userId: r.user_id,
        routineCount: 0,
        totalTasks: 0,
        completed: 0,
        pending: 0,
        studyMinutes: 0,
        lastActive: null as string | null,
        createdAt: r.created_at,
      };
      byUser[r.user_id].routineCount += 1;
      if (new Date(r.created_at) < new Date(byUser[r.user_id].createdAt)) {
        byUser[r.user_id].createdAt = r.created_at;
      }
    }
    for (const t of tasks as any[]) {
      const agg = byUser[t.user_id];
      if (!agg) continue;
      agg.totalTasks += 1;
      if (t.status === "completed") {
        agg.completed += 1;
        const [h1, m1] = String(t.start_time ?? "00:00").split(":").map(Number);
        const [h2, m2] = String(t.end_time ?? "00:00").split(":").map(Number);
        const mins = h2 * 60 + m2 - (h1 * 60 + m1);
        if (mins > 0) agg.studyMinutes += mins;
      } else {
        agg.pending += 1;
      }
      const ts = t.updated_at ?? t.created_at;
      if (!agg.lastActive || new Date(ts) > new Date(agg.lastActive)) agg.lastActive = ts;
    }

    let rows = Object.values(byUser).map((agg: any) => {
      const dir = directory[agg.userId] ?? { email: null, name: null };
      const primary = primaryRoutine[agg.userId] ?? {};
      const completion = agg.totalTasks
        ? Math.round((agg.completed / agg.totalTasks) * 100)
        : 0;
      return {
        ...agg,
        email: dir.email,
        name: dir.name ?? dir.email ?? agg.userId.slice(0, 8),
        levelCode: primary.level_code ?? null,
        subjectId: primary.subject_id ?? null,
        chapterId: primary.chapter_id ?? null,
        routineType: primary.type ?? null,
        completion,
      };
    });

    // Search
    if (data.search) {
      const q = data.search.toLowerCase();
      rows = rows.filter(
        (r: any) =>
          (r.name ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q),
      );
    }
    if (data.status === "active") rows = rows.filter((r: any) => r.completed > 0);
    if (data.status === "inactive") rows = rows.filter((r: any) => r.completed === 0);

    // Sort
    const dir = data.sortDir === "asc" ? 1 : -1;
    rows.sort((a: any, b: any) => {
      const va =
        data.sortBy === "completion"
          ? a.completion
          : data.sortBy === "tasks"
            ? a.totalTasks
            : data.sortBy === "created"
              ? new Date(a.createdAt).getTime()
              : new Date(a.lastActive ?? 0).getTime();
      const vb =
        data.sortBy === "completion"
          ? b.completion
          : data.sortBy === "tasks"
            ? b.totalTasks
            : data.sortBy === "created"
              ? new Date(b.createdAt).getTime()
              : new Date(b.lastActive ?? 0).getTime();
      return (va - vb) * dir;
    });

    const total = rows.length;
    const start = (data.page - 1) * data.pageSize;
    return {
      rows: rows.slice(start, start + data.pageSize),
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// --------------------------------------------------------------- detail
const detailInput = z.object({ userId: z.string().uuid() });

export const adminRoutineStudentDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) => detailInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdmin(sb, context.userId);
    const [routinesRes, tasksRes] = await Promise.all([
      sb
        .from("study_routines")
        .select(
          "id,name,type,level_code,subject_id,chapter_id,is_active,is_archived,created_at,updated_at",
        )
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false }),
      sb
        .from("study_routine_tasks")
        .select(
          "id,routine_id,level_code,subject_id,chapter_id,title,description,task_type,task_date,start_time,end_time,priority,status,completion,notes,created_at,updated_at",
        )
        .eq("user_id", data.userId)
        .order("task_date", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);
    const dir = await loadUserDirectory([data.userId]);
    return {
      user: {
        id: data.userId,
        email: dir[data.userId]?.email ?? null,
        name: dir[data.userId]?.name ?? null,
      },
      routines: routinesRes.data ?? [],
      tasks: tasksRes.data ?? [],
    };
  });

// --------------------------------------------------------------- analytics
export const adminRoutineAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    await assertAdmin(sb, context.userId);
    const { data: tasks = [] } = await sb
      .from("study_routine_tasks")
      .select("user_id,status,completion,task_date,start_time,end_time,updated_at");

    const dayKey = (d: string) => d;
    const daily: Record<string, { completed: number; total: number }> = {};
    const weekly: Record<string, { completed: number; total: number }> = {};
    const monthly: Record<string, { completed: number; total: number }> = {};
    const perUser: Record<string, { completed: number; total: number }> = {};

    for (const t of tasks as any[]) {
      const d = dayKey(t.task_date);
      const wk = (() => {
        const dt = new Date(t.task_date);
        const first = new Date(dt); first.setDate(dt.getDate() - dt.getDay());
        return first.toISOString().slice(0, 10);
      })();
      const mo = t.task_date.slice(0, 7);
      for (const [b, k] of [
        [daily, d],
        [weekly, wk],
        [monthly, mo],
      ] as const) {
        b[k] = b[k] ?? { completed: 0, total: 0 };
        b[k].total += 1;
        if (t.status === "completed") b[k].completed += 1;
      }
      perUser[t.user_id] = perUser[t.user_id] ?? { completed: 0, total: 0 };
      perUser[t.user_id].total += 1;
      if (t.status === "completed") perUser[t.user_id].completed += 1;
    }

    const asSeries = (b: Record<string, { completed: number; total: number }>) =>
      Object.entries(b)
        .sort(([a], [c]) => (a < c ? -1 : 1))
        .map(([k, v]) => ({ key: k, ...v }));

    const directory = await loadUserDirectory(Object.keys(perUser));
    const ranked = Object.entries(perUser)
      .map(([uid, v]) => ({
        userId: uid,
        name: directory[uid]?.name ?? directory[uid]?.email ?? uid.slice(0, 8),
        completed: v.completed,
        total: v.total,
        completion: v.total ? Math.round((v.completed / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.completed - a.completed);

    return {
      daily: asSeries(daily).slice(-14),
      weekly: asSeries(weekly).slice(-12),
      monthly: asSeries(monthly).slice(-12),
      mostActive: ranked.slice(0, 5),
      leastActive: ranked.slice(-5).reverse(),
      totalCompleted: tasks.filter((t: any) => t.status === "completed").length,
      totalPending: tasks.filter((t: any) => t.status !== "completed").length,
    };
  });

// --------------------------------------------------------------- module toggle
export const getStudyRoutineModuleEnabled = createServerFn({ method: "GET" }).handler(
  async () => {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const url = process.env.SUPABASE_URL!;
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data } = await (sb as any)
      .from("study_routine_settings")
      .select("enabled")
      .eq("id", true)
      .maybeSingle();
    return { enabled: data?.enabled ?? true };
  },
);

export const setStudyRoutineModuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) => z.object({ enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("study_routine_settings")
      .upsert({ id: true, enabled: data.enabled, updated_at: new Date().toISOString(), updated_by: context.userId });
    if (error) throw error;
    return { ok: true, enabled: data.enabled };
  });
