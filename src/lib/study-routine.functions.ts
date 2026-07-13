// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
// Study Routine — independent module. Uses existing Academic Manager data
// (levels / subjects / chapters) by reference only, and its own two tables:
// public.study_routines and public.study_routine_tasks.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------- Shared enums
const routineTypeEnum = z.enum(["daily", "weekly", "monthly", "custom"]);
const taskTypeEnum = z.enum(["study", "mcq", "quiz", "mock", "revision", "custom"]);
const priorityEnum = z.enum(["low", "medium", "high"]);
const statusEnum = z.enum(["pending", "in_progress", "completed"]);

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable().optional();
const nullableText = z.string().trim().max(4000).nullable().optional();

// ---------------------------------------------------------------- List routines
const listRoutinesInput = z
  .object({
    includeArchived: z.boolean().optional(),
  })
  .partial();

export const listStudyRoutines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listRoutinesInput> | undefined) =>
    listRoutinesInput.parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("study_routines")
      .select(
        "id,name,type,level_code,subject_id,chapter_id,is_active,is_archived,created_at,updated_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (!data.includeArchived) q = q.eq("is_archived", false);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---------------------------------------------------------------- Upsert routine
const upsertRoutineInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(160),
  type: routineTypeEnum,
  level_code: z.string().trim().max(40).nullable().optional(),
  subject_id: nullableUuid,
  chapter_id: nullableUuid,
  is_active: z.boolean().optional(),
});

export const upsertStudyRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof upsertRoutineInput>) => upsertRoutineInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const patch = {
      name: data.name,
      type: data.type,
      level_code: data.level_code ?? null,
      subject_id: data.subject_id ?? null,
      chapter_id: data.chapter_id ?? null,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { error } = await sb
        .from("study_routines")
        .update(patch)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw error;
      return { ok: true, id: data.id } as const;
    }
    const { data: row, error } = await sb
      .from("study_routines")
      .insert({ ...patch, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id as string } as const;
  });

// ---------------------------------------------------------------- Routine ops
const routineIdInput = z.object({ id: uuid });

export const deleteStudyRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof routineIdInput>) => routineIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("study_routines")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

const setFlagsInput = z.object({
  id: uuid,
  is_active: z.boolean().optional(),
  is_archived: z.boolean().optional(),
});

export const setStudyRoutineFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof setFlagsInput>) => setFlagsInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const patch: Record<string, unknown> = {};
    if (typeof data.is_active === "boolean") patch.is_active = data.is_active;
    if (typeof data.is_archived === "boolean") patch.is_archived = data.is_archived;
    if (!Object.keys(patch).length) return { ok: true } as const;
    const { error } = await sb
      .from("study_routines")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

export const duplicateStudyRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof routineIdInput>) => routineIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: src, error: srcErr } = await sb
      .from("study_routines")
      .select("name,type,level_code,subject_id,chapter_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (srcErr) throw srcErr;
    const { data: row, error } = await sb
      .from("study_routines")
      .insert({
        user_id: context.userId,
        name: `${src.name} (copy)`,
        type: src.type,
        level_code: src.level_code,
        subject_id: src.subject_id,
        chapter_id: src.chapter_id,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Copy tasks belonging to this routine (reset status to pending).
    const { data: srcTasks } = await sb
      .from("study_routine_tasks")
      .select(
        "level_code,subject_id,chapter_id,title,description,task_type,task_date,start_time,end_time,priority,notes",
      )
      .eq("routine_id", data.id)
      .eq("user_id", context.userId);
    if (srcTasks?.length) {
      const clones = srcTasks.map((t: any) => ({
        ...t,
        user_id: context.userId,
        routine_id: row.id,
        status: "pending",
        completion: 0,
      }));
      const { error: insErr } = await sb.from("study_routine_tasks").insert(clones);
      if (insErr) throw insErr;
    }
    return { ok: true, id: row.id as string } as const;
  });

// ---------------------------------------------------------------- Tasks — list
const listTasksInput = z
  .object({
    routineId: uuid.optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .partial();

export const listStudyRoutineTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listTasksInput> | undefined) =>
    listTasksInput.parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("study_routine_tasks")
      .select(
        "id,routine_id,level_code,subject_id,chapter_id,title,description,task_type,task_date,start_time,end_time,priority,status,completion,notes,created_at,updated_at",
      )
      .eq("user_id", context.userId)
      .order("task_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (data.routineId) q = q.eq("routine_id", data.routineId);
    if (data.from) q = q.gte("task_date", data.from);
    if (data.to) q = q.lte("task_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---------------------------------------------------------------- Tasks — upsert
const taskInput = z.object({
  id: uuid.optional(),
  routine_id: nullableUuid,
  level_code: z.string().trim().max(40).nullable().optional(),
  subject_id: nullableUuid,
  chapter_id: nullableUuid,
  title: z.string().trim().min(1).max(200),
  description: nullableText,
  task_type: taskTypeEnum.default("study"),
  task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  priority: priorityEnum.default("medium"),
  status: statusEnum.default("pending"),
  completion: z.number().int().min(0).max(100).default(0),
  notes: nullableText,
});

export const upsertStudyRoutineTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof taskInput>) => taskInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { id, ...rest } = data;
    const patch = {
      ...rest,
      description: rest.description ?? null,
      notes: rest.notes ?? null,
      level_code: rest.level_code ?? null,
      subject_id: rest.subject_id ?? null,
      chapter_id: rest.chapter_id ?? null,
      routine_id: rest.routine_id ?? null,
    };
    if (id) {
      const { error } = await sb
        .from("study_routine_tasks")
        .update(patch)
        .eq("id", id)
        .eq("user_id", context.userId);
      if (error) throw error;
      return { ok: true, id } as const;
    }
    const { data: row, error } = await sb
      .from("study_routine_tasks")
      .insert({ ...patch, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id as string } as const;
  });

// ---------------------------------------------------------------- Task ops
const taskIdInput = z.object({ id: uuid });

export const deleteStudyRoutineTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof taskIdInput>) => taskIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("study_routine_tasks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

const setStatusInput = z.object({
  id: uuid,
  status: statusEnum,
  completion: z.number().int().min(0).max(100).optional(),
});

export const setStudyRoutineTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof setStatusInput>) => setStatusInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const patch: Record<string, unknown> = { status: data.status };
    if (typeof data.completion === "number") patch.completion = data.completion;
    else if (data.status === "completed") patch.completion = 100;
    else if (data.status === "pending") patch.completion = 0;
    const { error } = await sb
      .from("study_routine_tasks")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

export const duplicateStudyRoutineTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof taskIdInput>) => taskIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: src, error: srcErr } = await sb
      .from("study_routine_tasks")
      .select(
        "routine_id,level_code,subject_id,chapter_id,title,description,task_type,task_date,start_time,end_time,priority,notes",
      )
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (srcErr) throw srcErr;
    const clone = {
      ...src,
      user_id: context.userId,
      title: `${src.title} (copy)`,
      status: "pending" as const,
      completion: 0,
    };
    const { data: row, error } = await sb
      .from("study_routine_tasks")
      .insert(clone)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id as string } as const;
  });

// ---------------------------------------------------------------- Types
export type StudyRoutineRow = {
  id: string;
  name: string;
  type: "daily" | "weekly" | "monthly" | "custom";
  level_code: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type StudyRoutineTaskRow = {
  id: string;
  routine_id: string | null;
  level_code: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  title: string;
  description: string | null;
  task_type: "study" | "mcq" | "quiz" | "mock" | "revision" | "custom";
  task_date: string;
  start_time: string;
  end_time: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed";
  completion: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};