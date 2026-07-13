/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  Flame,
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLevels } from "@/hooks/use-levels";
import { listSubjects, listChapters } from "@/lib/learning.functions";
import {
  useStudyRoutines,
  useStudyRoutineTasks,
  useStudyRoutineMutations,
} from "@/hooks/use-study-routine";
import type {
  StudyRoutineRow,
  StudyRoutineTaskRow,
} from "@/lib/study-routine.functions";

type FilterKey =
  | "today"
  | "tomorrow"
  | "week"
  | "month"
  | "completed"
  | "pending";

type RoutineType = StudyRoutineRow["type"];
type TaskType = StudyRoutineTaskRow["task_type"];
type Priority = StudyRoutineTaskRow["priority"];
type TaskStatus = StudyRoutineTaskRow["status"];

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  study: "Study",
  mcq: "MCQ Practice",
  quiz: "Quiz",
  mock: "Mock Test",
  revision: "Revision",
  custom: "Custom",
};

const STATUS_STYLES: Record<
  TaskStatus,
  { label: string; dot: string; badge: string; ring: string }
> = {
  completed: {
    label: "Completed",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
    ring: "ring-emerald-500/30",
  },
  in_progress: {
    label: "In Progress",
    dot: "bg-amber-500",
    badge:
      "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
    ring: "ring-amber-500/30",
  },
  pending: {
    label: "Pending",
    dot: "bg-rose-500",
    badge:
      "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
    ring: "ring-rose-500/30",
  },
};

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-sky-500/10 text-sky-600 border-sky-500/30 dark:text-sky-400",
  medium:
    "bg-violet-500/10 text-violet-600 border-violet-500/30 dark:text-violet-400",
  high: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
};

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function normalizeTime(t: string) {
  // Accepts HH:MM or HH:MM:SS; returns HH:MM.
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function minutesBetween(a: string, b: string) {
  const [ah, am] = normalizeTime(a).split(":").map(Number);
  const [bh, bm] = normalizeTime(b).split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

// -----------------------------------------------------------------------------
// Root
// -----------------------------------------------------------------------------

export function StudyRoutineFlow() {
  const [filter, setFilter] = useState<FilterKey>("today");
  const [editing, setEditing] = useState<StudyRoutineTaskRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const tasksQuery = useStudyRoutineTasks();
  const routinesQuery = useStudyRoutines();
  const mut = useStudyRoutineMutations();

  const tasks = tasksQuery.data ?? [];
  const filtered = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);
  const todays = useMemo(
    () => tasks.filter((t) => t.task_date === todayISO()),
    [tasks],
  );

  const stats = useMemo(() => {
    const total = todays.length;
    const completed = todays.filter((t) => t.status === "completed").length;
    const inProgress = todays.filter((t) => t.status === "in_progress").length;
    const pending = todays.filter((t) => t.status === "pending").length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, pending, pct };
  }, [todays]);

  const loading = tasksQuery.isLoading;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <Header />

      <CreateRoutineCard
        onCreate={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        onSaveRoutine={(data) => mut.upsertRoutine.mutate(data)}
        routines={routinesQuery.data ?? []}
        onCopyPrevious={(id) => mut.duplicateRoutine.mutate(id)}
      />

      <FilterBar value={filter} onChange={setFilter} count={filtered.length} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TodaysRoutineCard
            stats={stats}
            tasks={filtered}
            loading={loading}
            onEdit={(t) => {
              setEditing(t);
              setDialogOpen(true);
            }}
            onDelete={(id) => mut.deleteTask.mutate(id)}
            onStatus={(id, status) => mut.setTaskStatus.mutate({ id, status })}
            onDuplicate={(t) => mut.duplicateTask.mutate(t.id)}
          />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <RoutineOverviewCard tasks={tasks} />
          <MonthlySummaryCard tasks={tasks} />
        </div>
      </div>

      <RoutineCalendarCard tasks={tasks} />

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSave={(payload) => {
          mut.upsertTask.mutate(payload, {
            onSuccess: () => setDialogOpen(false),
          });
        }}
        saving={mut.upsertTask.isPending}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent ring-1 ring-primary/20">
          <CalendarDays className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Study Routine
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Plan smart. Study consistently. Achieve more.
          </p>
        </div>
      </div>
      <Badge
        variant="secondary"
        className="shrink-0 gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Premium Planner
      </Badge>
    </motion.header>
  );
}

// -----------------------------------------------------------------------------
// Cascading Level → Subject → Chapter reader
// -----------------------------------------------------------------------------

function useAcademicCascade(level: string | null, subjectId: string | null) {
  const levelsQuery = useLevels();
  const subjectsFn = useServerFn(listSubjects);
  const chaptersFn = useServerFn(listChapters);

  const subjectsQuery = useQuery({
    queryKey: ["sr-subjects", level ?? "__all"],
    queryFn: async () =>
      (await subjectsFn({
        data: level ? { level } : undefined,
      })) as Array<{ id: string; name: string; level: string }>,
    staleTime: 30_000,
  });

  const chaptersQuery = useQuery({
    queryKey: ["sr-chapters", subjectId ?? "__none"],
    queryFn: async () => {
      if (!subjectId) return [] as Array<{ id: string; name: string }>;
      return (await chaptersFn({
        data: { subjectId },
      })) as Array<{ id: string; name: string }>;
    },
    enabled: !!subjectId,
    staleTime: 30_000,
  });

  return { levelsQuery, subjectsQuery, chaptersQuery };
}

// -----------------------------------------------------------------------------
// Create routine card
// -----------------------------------------------------------------------------

function CreateRoutineCard({
  onCreate,
  onSaveRoutine,
  routines,
  onCopyPrevious,
}: {
  onCreate: () => void;
  onSaveRoutine: (data: {
    name: string;
    type: RoutineType;
    level_code: string | null;
    subject_id: string | null;
    chapter_id: string | null;
  }) => void;
  routines: StudyRoutineRow[];
  onCopyPrevious: (id: string) => void;
}) {
  const [level, setLevel] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [type, setType] = useState<RoutineType>("daily");

  const { levelsQuery, subjectsQuery } = useAcademicCascade(level, subjectId);

  // Auto-reset subject when level changes and the chosen subject no longer fits.
  useEffect(() => {
    if (!subjectId) return;
    const subjects = subjectsQuery.data ?? [];
    if (subjects.length && !subjects.some((s) => s.id === subjectId)) {
      setSubjectId(null);
    }
  }, [subjectsQuery.data, subjectId]);

  const canCreate = !!level;
  const levels = levelsQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
    >
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-40 bg-gradient-to-b from-primary/10 to-transparent blur-2xl" />
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Plus className="h-4 w-4 text-primary" /> Create Routine
            </CardTitle>
            {routines.length > 0 && (
              <Select
                onValueChange={(v) => {
                  if (v) onCopyPrevious(v);
                }}
              >
                <SelectTrigger className="h-9 w-full text-xs sm:w-[220px]">
                  <SelectValue placeholder="Copy previous routine" />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">
                  {routines.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Level">
              <Select
                value={level ?? undefined}
                onValueChange={(v) => {
                  setLevel(v);
                  setSubjectId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      levelsQuery.isLoading ? "Loading…" : "Select level"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                  {!levels.length && !levelsQuery.isLoading && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No levels available
                    </div>
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject">
              <Select
                value={subjectId ?? undefined}
                onValueChange={setSubjectId}
                disabled={!level}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !level
                        ? "Select a level first"
                        : subjectsQuery.isLoading
                          ? "Loading…"
                          : "Select subject"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                  {level && !subjects.length && !subjectsQuery.isLoading && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No subjects for this level
                    </div>
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Routine Type">
              <Select
                value={type}
                onValueChange={(v) => setType(v as RoutineType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                className="gap-2 shadow-sm"
                disabled={!canCreate}
                onClick={() => {
                  onSaveRoutine({
                    name: `${type[0].toUpperCase()}${type.slice(1)} routine`,
                    type,
                    level_code: level,
                    subject_id: subjectId,
                    chapter_id: null,
                  });
                }}
              >
                Save Routine
              </Button>
              <Button className="w-full gap-2 shadow-sm" onClick={onCreate}>
                <Plus className="h-4 w-4" /> Add Task
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Filter bar
// -----------------------------------------------------------------------------

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
];

function FilterBar({
  value,
  onChange,
  count,
}: {
  value: FilterKey;
  onChange: (k: FilterKey) => void;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map((f) => {
        const active = value === f.key;
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
              "hover:border-primary/40 hover:bg-primary/5",
              active
                ? "border-primary/50 bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        );
      })}
      <span className="ml-auto text-xs text-muted-foreground">
        {count} task{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function filterTasks(
  tasks: StudyRoutineTaskRow[],
  filter: FilterKey,
): StudyRoutineTaskRow[] {
  const today = todayISO();
  const tomorrow = todayISO(1);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const monthEnd = new Date(now);
  monthEnd.setMonth(now.getMonth() + 1);

  return tasks.filter((t) => {
    const d = new Date(t.task_date);
    switch (filter) {
      case "today":
        return t.task_date === today;
      case "tomorrow":
        return t.task_date === tomorrow;
      case "week":
        return d >= now && d <= weekEnd;
      case "month":
        return d >= now && d <= monthEnd;
      case "completed":
        return t.status === "completed";
      case "pending":
        return t.status === "pending";
    }
  });
}

// -----------------------------------------------------------------------------
// Today's routine
// -----------------------------------------------------------------------------

function TodaysRoutineCard({
  stats,
  tasks,
  loading,
  onEdit,
  onDelete,
  onStatus,
  onDuplicate,
}: {
  stats: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    pct: number;
  };
  tasks: StudyRoutineTaskRow[];
  loading: boolean;
  onEdit: (t: StudyRoutineTaskRow) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, s: TaskStatus) => void;
  onDuplicate: (t: StudyRoutineTaskRow) => void;
}) {
  return (
    <Card className="h-full border-border/60 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ListChecks className="h-4 w-4 text-primary" /> Today's Routine
          </CardTitle>
          <Badge variant="outline" className="rounded-full text-xs">
            {new Date().toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 items-center gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:grid-cols-[auto_1fr]">
          <CompletionRing pct={stats.pct} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Total" value={stats.total} icon={Target} />
            <MiniStat
              label="Completed"
              value={stats.completed}
              icon={CheckCircle2}
              tone="emerald"
            />
            <MiniStat
              label="In Progress"
              value={stats.inProgress}
              icon={Loader2}
              tone="amber"
            />
            <MiniStat
              label="Pending"
              value={stats.pending}
              icon={Timer}
              tone="rose"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {loading ? (
            <>
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </>
          ) : (
            <AnimatePresence initial={false}>
              {tasks.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-dashed border-border/70 p-8 text-center"
                >
                  <p className="text-sm text-muted-foreground">
                    No tasks in this view. Create a routine to get started.
                  </p>
                </motion.div>
              ) : (
                tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onStatus={onStatus}
                    onDuplicate={onDuplicate}
                  />
                ))
              )}
            </AnimatePresence>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CompletionRing({ pct }: { pct: number }) {
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          className="text-muted"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          className="text-primary"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: off }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-lg font-semibold text-foreground">{pct}%</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Complete
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "amber"
        ? "text-amber-500"
        : tone === "rose"
          ? "text-rose-500"
          : "text-primary";
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className={cn("h-3 w-3", toneClass)} />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function TaskRow({
  task,
  onEdit,
  onDelete,
  onStatus,
  onDuplicate,
}: {
  task: StudyRoutineTaskRow;
  onEdit: (t: StudyRoutineTaskRow) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, s: TaskStatus) => void;
  onDuplicate: (t: StudyRoutineTaskRow) => void;
}) {
  const s = STATUS_STYLES[task.status];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm ring-1 ring-transparent transition-all",
        "hover:border-primary/30 hover:shadow-md sm:flex-row sm:items-center",
        s.ring,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
            s.dot,
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {task.title}
            </h3>
            <Badge
              variant="outline"
              className={cn("text-[10px]", PRIORITY_STYLES[task.priority])}
            >
              {task.priority}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {TASK_TYPE_LABEL[task.task_type]}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> {task.level_code ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />{" "}
              {normalizeTime(task.start_time)} – {normalizeTime(task.end_time)}
            </span>
            <Badge variant="outline" className={cn("text-[10px]", s.badge)}>
              {s.label}
            </Badge>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {task.status !== "completed" ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 text-xs"
            onClick={() => onStatus(task.id, "completed")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={() => onStatus(task.id, "pending")}
          >
            <Timer className="h-3.5 w-3.5" /> Reopen
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onDuplicate(task)}
          aria-label="Duplicate"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onEdit(task)}
          aria-label="Edit"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-rose-500 hover:text-rose-600"
          onClick={() => onDelete(task.id)}
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// Overview + summary
// -----------------------------------------------------------------------------

function RoutineOverviewCard({ tasks }: { tasks: StudyRoutineTaskRow[] }) {
  const data = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // Mon=0
    return days.map((label, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - day + i);
      const iso = d.toISOString().slice(0, 10);
      const dayTasks = tasks.filter((t) => t.task_date === iso);
      const total = dayTasks.length || 0;
      const done = dayTasks.filter((t) => t.status === "completed").length;
      const completion = total ? Math.round((done / total) * 100) : 0;
      return { day: label, completion, target: 80 };
    });
  }, [tasks]);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> Routine Overview
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Weekly completion vs target
        </p>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
            />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              stroke="currentColor"
              className="text-muted-foreground"
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              stroke="currentColor"
              className="text-muted-foreground"
              fontSize={11}
            />
            <RTooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="completion"
              name="Completion %"
              radius={[6, 6, 0, 0]}
              fill="currentColor"
              className="fill-primary"
            />
            <Bar
              dataKey="target"
              name="Target %"
              radius={[6, 6, 0, 0]}
              fill="currentColor"
              className="fill-muted-foreground/40"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function MonthlySummaryCard({ tasks }: { tasks: StudyRoutineTaskRow[] }) {
  const summary = useMemo(() => {
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const monthTasks = tasks.filter((t) => t.task_date.startsWith(monthPrefix));
    const days = new Set(monthTasks.map((t) => t.task_date));
    const completedDays = new Set(
      monthTasks.filter((t) => t.status === "completed").map((t) => t.task_date),
    );
    const subjects = new Set(
      monthTasks.map((t) => t.subject_id ?? t.level_code ?? "—"),
    );
    const totalMinutes = monthTasks.reduce(
      (acc, t) =>
        acc + Math.max(0, minutesBetween(t.start_time, t.end_time)),
      0,
    );
    return {
      studyDays: days.size,
      completedDays: completedDays.size,
      completionRate: days.size
        ? Math.round((completedDays.size / days.size) * 100)
        : 0,
      studyTime: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
      subjects: subjects.size,
      tasksCompleted: monthTasks.filter((t) => t.status === "completed").length,
    };
  }, [tasks]);

  const items = [
    { label: "Study Days", value: summary.studyDays, icon: CalendarDays },
    { label: "Completed", value: summary.completedDays, icon: CheckCircle2 },
    { label: "Completion", value: `${summary.completionRate}%`, icon: Flame },
    { label: "Study Time", value: summary.studyTime, icon: Clock },
    { label: "Subjects", value: summary.subjects, icon: BookOpen },
    { label: "Tasks Done", value: summary.tasksCompleted, icon: Trophy },
  ];

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Trophy className="h-4 w-4 text-primary" /> Monthly Summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          A snapshot of this month
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.label}
              className="rounded-2xl border border-border/60 bg-muted/20 p-3"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <it.icon className="h-3 w-3 text-primary" />
                {it.label}
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {it.value}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Calendar
// -----------------------------------------------------------------------------

function RoutineCalendarCard({ tasks }: { tasks: StudyRoutineTaskRow[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const { grid, monthLabel } = useMemo(() => buildMonthGrid(cursor), [cursor]);

  function dayStatus(
    iso: string | null,
  ): "completed" | "partial" | "missed" | "empty" {
    if (!iso) return "empty";
    const day = tasks.filter((t) => t.task_date === iso);
    if (day.length === 0) return "empty";
    const done = day.filter((t) => t.status === "completed").length;
    if (done === day.length) return "completed";
    if (done === 0) return "missed";
    return "partial";
  }

  const legend = [
    { key: "completed", label: "Completed", cls: "bg-emerald-500" },
    { key: "partial", label: "Partial", cls: "bg-amber-500" },
    { key: "missed", label: "Not Completed", cls: "bg-rose-500" },
    { key: "empty", label: "No Routine", cls: "bg-muted" },
  ];

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> Routine Calendar
            </CardTitle>
            <p className="text-xs text-muted-foreground">Monthly overview</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setCursor(shiftMonth(cursor, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[9rem] text-center text-sm font-medium">
              {monthLabel}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setCursor(shiftMonth(cursor, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {grid.map((cell, i) => {
            const status = dayStatus(cell.iso);
            const tone =
              status === "completed"
                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                : status === "partial"
                  ? "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400"
                  : status === "missed"
                    ? "bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400"
                    : "bg-muted/30 text-muted-foreground border-border/60";
            return (
              <div
                key={i}
                className={cn(
                  "aspect-square rounded-xl border p-1.5 text-xs transition-colors",
                  cell.iso ? tone : "border-transparent bg-transparent",
                )}
              >
                {cell.day && (
                  <div className="flex h-full flex-col justify-between">
                    <span className="font-medium">{cell.day}</span>
                    {status !== "empty" && cell.iso && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 self-end rounded-full",
                          status === "completed" && "bg-emerald-500",
                          status === "partial" && "bg-amber-500",
                          status === "missed" && "bg-rose-500",
                        )}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {legend.map((l) => (
            <span key={l.key} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", l.cls)} />{" "}
              {l.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function shiftMonth(d: Date, delta: number) {
  const n = new Date(d);
  n.setMonth(n.getMonth() + delta);
  return n;
}

function buildMonthGrid(cursor: Date) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: { day: number | null; iso: string | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = new Date(y, m, d).toISOString().slice(0, 10);
    cells.push({ day: d, iso });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return { grid: cells, monthLabel };
}

// -----------------------------------------------------------------------------
// Task dialog
// -----------------------------------------------------------------------------

type TaskFormPayload = {
  id?: string;
  routine_id: string | null;
  level_code: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  task_date: string;
  start_time: string;
  end_time: string;
  priority: Priority;
  status: TaskStatus;
  completion: number;
  notes: string | null;
};

function makeDefaultTask(): TaskFormPayload {
  return {
    routine_id: null,
    level_code: null,
    subject_id: null,
    chapter_id: null,
    title: "",
    description: null,
    task_type: "study",
    task_date: todayISO(),
    start_time: "09:00",
    end_time: "10:00",
    priority: "medium",
    status: "pending",
    completion: 0,
    notes: null,
  };
}

function TaskDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: StudyRoutineTaskRow | null;
  onSave: (payload: TaskFormPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<TaskFormPayload>(() => makeDefaultTask());

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        id: initial.id,
        routine_id: initial.routine_id,
        level_code: initial.level_code,
        subject_id: initial.subject_id,
        chapter_id: initial.chapter_id,
        title: initial.title,
        description: initial.description,
        task_type: initial.task_type,
        task_date: initial.task_date,
        start_time: normalizeTime(initial.start_time),
        end_time: normalizeTime(initial.end_time),
        priority: initial.priority,
        status: initial.status,
        completion: initial.completion,
        notes: initial.notes,
      });
    } else {
      setForm(makeDefaultTask());
    }
  }, [open, initial]);

  const { levelsQuery, subjectsQuery, chaptersQuery } = useAcademicCascade(
    form.level_code,
    form.subject_id,
  );
  const levels = levelsQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];
  const chapters = chaptersQuery.data ?? [];

  function set<K extends keyof TaskFormPayload>(
    key: K,
    value: TaskFormPayload[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>
            Fill in the details for this study task.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Revise chapter 3"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Level</Label>
            <Select
              value={form.level_code ?? undefined}
              onValueChange={(v) => {
                set("level_code", v);
                set("subject_id", null);
                set("chapter_id", null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Select
              value={form.subject_id ?? undefined}
              onValueChange={(v) => {
                set("subject_id", v);
                set("chapter_id", null);
              }}
              disabled={!form.level_code}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !form.level_code ? "Select level first" : "Select subject"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Chapter</Label>
            <Select
              value={form.chapter_id ?? undefined}
              onValueChange={(v) => set("chapter_id", v)}
              disabled={!form.subject_id}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !form.subject_id
                      ? "Select subject first"
                      : "Select chapter"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {chapters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              value={form.task_type}
              onValueChange={(v) => set("task_type", v as TaskType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input
              type="date"
              value={form.task_date}
              onChange={(e) => set("task_date", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => set("priority", v as Priority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as TaskStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Start</Label>
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => set("start_time", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">End</Label>
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => set("end_time", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Completion %
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.completion}
              onChange={(e) =>
                set(
                  "completion",
                  Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                )
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={form.description ?? ""}
              onChange={(e) =>
                set("description", e.target.value ? e.target.value : null)
              }
              rows={2}
              placeholder="Short description"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) =>
                set("notes", e.target.value ? e.target.value : null)
              }
              rows={2}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              if (!form.title.trim()) return;
              onSave(form);
            }}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : initial ? (
              "Save Changes"
            ) : (
              "Create Task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}