/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart,
  Bar,
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  ListChecks,
  Loader2,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminRoutineStats,
  adminRoutineStudents,
  adminRoutineStudentDetail,
  adminRoutineAnalytics,
  getStudyRoutineModuleEnabled,
  setStudyRoutineModuleEnabled,
} from "@/lib/admin-routine-manager.functions";

/* --------------------------------------------------------------- primitives */

const StatCard = ({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: any;
  hint?: string;
}) => (
  <Card className="glass-card border-border/60">
    <CardContent className="flex items-center gap-4 p-5">
      <div className="bg-cta-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-glow">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 font-display text-2xl font-semibold tracking-tight">
          {value}
        </p>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </CardContent>
  </Card>
);

const StatusPill = ({ pct }: { pct: number }) => {
  const tone =
    pct >= 80
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : pct >= 40
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-rose-500/10 text-rose-600 dark:text-rose-400";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {pct}%
    </span>
  );
};

const formatMinutes = (m: number) => {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h ${mm}m` : `${mm}m`;
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/* ------------------------------------------------------------------- flow */

export function RoutineManagerFlow() {
  const qc = useQueryClient();

  // Realtime invalidation on routines/tasks/settings.
  useEffect(() => {
    const ch = (supabase as any)
      .channel("admin_routine_manager_watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_routines" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin-routine"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_routine_tasks" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin-routine"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_routine_settings" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin-routine", "settings"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const statsFn = useServerFn(adminRoutineStats);
  const stats = useQuery({
    queryKey: ["admin-routine", "stats"],
    queryFn: () => statsFn(),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Admin · Monitoring
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Routine Manager
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only oversight of student Study Routines, progress and activity.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          <Eye className="mr-1 h-3.5 w-3.5" /> View only
        </Badge>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Students Using" value={stats.data?.totalStudents ?? "—"} icon={Users} />
        <StatCard label="Active Today" value={stats.data?.activeToday ?? "—"} icon={Activity} />
        <StatCard label="Active This Week" value={stats.data?.activeWeek ?? "—"} icon={Activity} />
        <StatCard label="Active This Month" value={stats.data?.activeMonth ?? "—"} icon={Activity} />
        <StatCard label="Total Routines" value={stats.data?.totalRoutines ?? "—"} icon={CalendarClock} />
        <StatCard label="Total Tasks" value={stats.data?.totalTasks ?? "—"} icon={ListChecks} />
        <StatCard label="Completed Tasks" value={stats.data?.completedTasks ?? "—"} icon={CheckCircle2} />
        <StatCard label="Pending Tasks" value={stats.data?.pendingTasks ?? "—"} icon={Clock} />
        <StatCard
          label="Avg Completion"
          value={stats.data ? `${stats.data.avgCompletion}%` : "—"}
          icon={TrendingUp}
        />
        <StatCard
          label="Avg Daily Study"
          value={stats.data ? formatMinutes(stats.data.avgDailyMinutes) : "—"}
          icon={Clock}
        />
      </div>

      <Tabs defaultValue="students" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-4">
          <StudentsPanel />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsPanel />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------- students */

function StudentsPanel() {
  const [search, setSearch] = useState("");
  const [routineType, setRoutineType] = useState<string>("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"last_active" | "completion" | "tasks" | "created">(
    "last_active",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const listFn = useServerFn(adminRoutineStudents);
  const list = useQuery({
    queryKey: ["admin-routine", "students", { search, routineType, status, sortBy, sortDir, page, pageSize }],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          routineType: (routineType || undefined) as any,
          status,
          sortBy,
          sortDir,
          page,
          pageSize,
        },
      }),
    placeholderData: (prev) => prev,
  });

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));

  return (
    <Card className="glass-card border-border/60">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-base">Students</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or email…"
              className="w-56 pl-9"
            />
          </div>
          <Select
            value={routineType || "all"}
            onValueChange={(v) => {
              setRoutineType(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36"><SelectValue placeholder="Routine type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Sort by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last_active">Last active</SelectItem>
              <SelectItem value="completion">Completion</SelectItem>
              <SelectItem value="tasks">Total tasks</SelectItem>
              <SelectItem value="created">Created</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortDir} onValueChange={(v: any) => setSortDir(v)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Desc</SelectItem>
              <SelectItem value="asc">Asc</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="text-right">Done</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">Study Time</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : (list.data?.rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    No students found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                (list.data?.rows ?? []).map((r: any) => (
                  <TableRow key={r.userId}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.email ?? "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.routineType ? (
                        <Badge variant="secondary" className="capitalize">{r.routineType}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.totalTasks}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.pending}</TableCell>
                    <TableCell className="text-right"><StatusPill pct={r.completion} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinutes(r.studyMinutes)}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(r.lastActive)}</TableCell>
                    <TableCell className="text-sm">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="View details"
                        onClick={() => setSelectedUserId(r.userId)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-col-reverse items-center gap-3 md:flex-row md:justify-between">
          <p className="text-sm text-muted-foreground">
            {list.data?.total ?? 0} student{(list.data?.total ?? 0) === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <StudentDetailDialog
        userId={selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
      />
    </Card>
  );
}

/* --------------------------------------------------------------- detail */

function StudentDetailDialog({
  userId,
  onOpenChange,
}: {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detailFn = useServerFn(adminRoutineStudentDetail);
  const detail = useQuery({
    queryKey: ["admin-routine", "detail", userId],
    queryFn: () => detailFn({ data: { userId: userId! } }),
    enabled: !!userId,
  });

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const monthKey = todayKey.slice(0, 7);

  const groups = useMemo(() => {
    const tasks = (detail.data?.tasks ?? []) as any[];
    return {
      today: tasks.filter((t) => t.task_date === todayKey),
      week: tasks.filter((t) => new Date(t.task_date) >= startOfWeek),
      month: tasks.filter((t) => t.task_date.startsWith(monthKey)),
      byDay: tasks.reduce((acc: Record<string, any[]>, t) => {
        (acc[t.task_date] = acc[t.task_date] ?? []).push(t);
        return acc;
      }, {}),
      trend: (() => {
        const map: Record<string, { completed: number; total: number }> = {};
        for (const t of tasks) {
          map[t.task_date] = map[t.task_date] ?? { completed: 0, total: 0 };
          map[t.task_date].total += 1;
          if (t.status === "completed") map[t.task_date].completed += 1;
        }
        return Object.entries(map)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .slice(-30)
          .map(([k, v]) => ({ day: k.slice(5), completed: v.completed, total: v.total }));
      })(),
    };
  }, [detail.data, todayKey, monthKey, startOfWeek]);

  const activity = ((detail.data?.tasks ?? []) as any[])
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 12);

  return (
    <Dialog open={!!userId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {detail.data?.user.name ?? detail.data?.user.email ?? "Student details"}
          </DialogTitle>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Routines"
                value={(detail.data?.routines ?? []).length}
                icon={CalendarClock}
              />
              <StatCard
                label="Tasks"
                value={(detail.data?.tasks ?? []).length}
                icon={ListChecks}
              />
              <StatCard
                label="Completed"
                value={
                  ((detail.data?.tasks ?? []) as any[]).filter((t) => t.status === "completed")
                    .length
                }
                icon={CheckCircle2}
              />
              <StatCard label="Today" value={groups.today.length} icon={Clock} />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Completion trend</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={groups.trend}>
                      <CartesianGrid strokeOpacity={0.2} vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Line type="monotone" dataKey="completed" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="total" stroke="hsl(var(--muted-foreground))" strokeWidth={1} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <TaskList title="Today" items={groups.today} />
              <TaskList title="This Week" items={groups.week} />
            </div>
            <TaskList title="This Month" items={groups.month} collapsedByDefault />

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recent activity</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {activity.length === 0 ? (
                    <li className="text-sm text-muted-foreground">No activity yet.</li>
                  ) : (
                    activity.map((t) => (
                      <li key={t.id} className="flex items-center justify-between text-sm">
                        <span className="min-w-0 truncate">{t.title}</span>
                        <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                          {t.status} · {formatDate(t.updated_at)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TaskList({
  title,
  items,
  collapsedByDefault,
}: {
  title: string;
  items: any[];
  collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">
          {title} <span className="ml-1 text-muted-foreground">({items.length})</span>
        </CardTitle>
        {collapsedByDefault ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Show"}
          </Button>
        ) : null}
      </CardHeader>
      {open ? (
        <CardContent className="max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">{t.title}</span>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{t.status.replace("_", " ")}</Badge>
                    <StatusPill pct={t.completion ?? 0} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------- analytics */

function AnalyticsPanel() {
  const fn = useServerFn(adminRoutineAnalytics);
  const q = useQuery({ queryKey: ["admin-routine", "analytics"], queryFn: () => fn() });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const daily = (q.data?.daily ?? []).map((d: any) => ({ ...d, day: d.key.slice(5) }));
  const weekly = (q.data?.weekly ?? []).map((d: any) => ({ ...d, day: d.key.slice(5) }));
  const monthly = (q.data?.monthly ?? []).map((d: any) => ({ ...d, day: d.key }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Daily usage (14d)", data: daily },
          { label: "Weekly usage (12w)", data: weekly },
          { label: "Monthly usage (12m)", data: monthly },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{c.label}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={c.data}>
                    <CartesianGrid strokeOpacity={0.2} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="total" fill="hsl(var(--muted-foreground))" opacity={0.35} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RankCard title="Most active students" rows={q.data?.mostActive ?? []} />
        <RankCard title="Least active students" rows={q.data?.leastActive ?? []} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <StatCard label="Total completed" value={q.data?.totalCompleted ?? 0} icon={CheckCircle2} />
        <StatCard label="Total pending" value={q.data?.totalPending ?? 0} icon={Clock} />
      </div>
    </div>
  );
}

function RankCard({ title, rows }: { title: string; rows: any[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r: any) => (
              <li key={r.userId} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">{r.name}</span>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">
                    {r.completed}/{r.total}
                  </span>
                  <StatusPill pct={r.completion} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ settings */

function SettingsPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getStudyRoutineModuleEnabled);
  const setFn = useServerFn(setStudyRoutineModuleEnabled);
  const q = useQuery({
    queryKey: ["admin-routine", "settings"],
    queryFn: () => getFn(),
  });
  const enabled = q.data?.enabled ?? true;

  const mutation = useMutation({
    mutationFn: (next: boolean) => setFn({ data: { enabled: next } }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["admin-routine", "settings"] });
      const prev = qc.getQueryData(["admin-routine", "settings"]);
      qc.setQueryData(["admin-routine", "settings"], { enabled: next });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin-routine", "settings"], ctx.prev);
      toast.error("Failed to update setting");
    },
    onSuccess: (res) => {
      toast.success(res.enabled ? "Study Routine enabled" : "Study Routine disabled");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-routine", "settings"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Module visibility</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <Label className="text-sm font-semibold">Enable Study Routine</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            When disabled, the Study Routine sidebar entry hides instantly for every
            student and its routes become inaccessible. No refresh, no logout required.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => mutation.mutate(v)}
          disabled={mutation.isPending || q.isLoading}
          aria-label="Toggle Study Routine module"
        />
      </CardContent>
    </Card>
  );
}
