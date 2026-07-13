import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteStudyRoutine,
  deleteStudyRoutineTask,
  duplicateStudyRoutine,
  duplicateStudyRoutineTask,
  listStudyRoutines,
  listStudyRoutineTasks,
  setStudyRoutineFlags,
  setStudyRoutineTaskStatus,
  upsertStudyRoutine,
  upsertStudyRoutineTask,
  type StudyRoutineRow,
  type StudyRoutineTaskRow,
} from "@/lib/study-routine.functions";

// Keep query keys centralized so realtime invalidation matches exactly.
const ROUTINES_KEY = ["study-routines"] as const;
const TASKS_KEY = ["study-routine-tasks"] as const;

/** List routines. Live-updated via a shared postgres_changes channel. */
export function useStudyRoutines(opts?: { includeArchived?: boolean }) {
  const fn = useServerFn(listStudyRoutines);
  const includeArchived = !!opts?.includeArchived;
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel(`study-routine-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "study_routines" },
        () => {
          qc.invalidateQueries({ queryKey: ROUTINES_KEY });
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "study_routine_tasks" },
        () => {
          qc.invalidateQueries({ queryKey: TASKS_KEY });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: [...ROUTINES_KEY, includeArchived ? "all" : "active"],
    queryFn: async () => (await fn({ data: { includeArchived } })) as StudyRoutineRow[],
    staleTime: 5_000,
  });
}

export function useStudyRoutineTasks(params?: {
  routineId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const fn = useServerFn(listStudyRoutineTasks);
  const routineId = params?.routineId ?? null;
  const from = params?.from ?? null;
  const to = params?.to ?? null;
  return useQuery({
    queryKey: [...TASKS_KEY, routineId, from, to],
    queryFn: async () =>
      (await fn({
        data: {
          routineId: routineId ?? undefined,
          from: from ?? undefined,
          to: to ?? undefined,
        },
      })) as StudyRoutineTaskRow[],
    staleTime: 5_000,
  });
}

// ---------------------------------------------------------------- Mutations
export function useStudyRoutineMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ROUTINES_KEY });
    qc.invalidateQueries({ queryKey: TASKS_KEY });
  };

  const upsertRoutine = useServerFn(upsertStudyRoutine);
  const deleteRoutine = useServerFn(deleteStudyRoutine);
  const setFlags = useServerFn(setStudyRoutineFlags);
  const dupRoutine = useServerFn(duplicateStudyRoutine);
  const upsertTask = useServerFn(upsertStudyRoutineTask);
  const deleteTask = useServerFn(deleteStudyRoutineTask);
  const setStatus = useServerFn(setStudyRoutineTaskStatus);
  const dupTask = useServerFn(duplicateStudyRoutineTask);

  return {
    upsertRoutine: useMutation({
      mutationFn: (data: Parameters<typeof upsertRoutine>[0]["data"]) =>
        upsertRoutine({ data }),
      onSuccess: invalidate,
    }),
    deleteRoutine: useMutation({
      mutationFn: (id: string) => deleteRoutine({ data: { id } }),
      onSuccess: invalidate,
    }),
    setRoutineFlags: useMutation({
      mutationFn: (data: Parameters<typeof setFlags>[0]["data"]) => setFlags({ data }),
      onSuccess: invalidate,
    }),
    duplicateRoutine: useMutation({
      mutationFn: (id: string) => dupRoutine({ data: { id } }),
      onSuccess: invalidate,
    }),
    upsertTask: useMutation({
      mutationFn: (data: Parameters<typeof upsertTask>[0]["data"]) =>
        upsertTask({ data }),
      onSuccess: invalidate,
    }),
    deleteTask: useMutation({
      // Optimistic remove
      onMutate: async (id: string) => {
        await qc.cancelQueries({ queryKey: TASKS_KEY });
        const snapshots = qc.getQueriesData<StudyRoutineTaskRow[]>({
          queryKey: TASKS_KEY,
        });
        snapshots.forEach(([key, data]) => {
          if (Array.isArray(data)) {
            qc.setQueryData(key, data.filter((t) => t.id !== id));
          }
        });
        return { snapshots };
      },
      mutationFn: (id: string) => deleteTask({ data: { id } }),
      onError: (_e, _id, ctx) => {
        ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
      },
      onSettled: invalidate,
    }),
    setTaskStatus: useMutation({
      onMutate: async (vars: {
        id: string;
        status: StudyRoutineTaskRow["status"];
        completion?: number;
      }) => {
        await qc.cancelQueries({ queryKey: TASKS_KEY });
        const snapshots = qc.getQueriesData<StudyRoutineTaskRow[]>({
          queryKey: TASKS_KEY,
        });
        snapshots.forEach(([key, data]) => {
          if (Array.isArray(data)) {
            qc.setQueryData(
              key,
              data.map((t) =>
                t.id === vars.id
                  ? {
                      ...t,
                      status: vars.status,
                      completion:
                        typeof vars.completion === "number"
                          ? vars.completion
                          : vars.status === "completed"
                            ? 100
                            : vars.status === "pending"
                              ? 0
                              : t.completion,
                    }
                  : t,
              ),
            );
          }
        });
        return { snapshots };
      },
      mutationFn: (vars: {
        id: string;
        status: StudyRoutineTaskRow["status"];
        completion?: number;
      }) => setStatus({ data: vars }),
      onError: (_e, _v, ctx) => {
        ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
      },
      onSettled: invalidate,
    }),
    duplicateTask: useMutation({
      mutationFn: (id: string) => dupTask({ data: { id } }),
      onSuccess: invalidate,
    }),
  };
}