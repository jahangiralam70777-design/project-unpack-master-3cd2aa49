import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudyRoutineVisibility } from "@/hooks/use-study-routine-visibility";

const StudyRoutineFlow = lazy(() =>
  import("@/components/dashboard/StudyRoutineFlow").then((m) => ({
    default: m.StudyRoutineFlow,
  })),
);

export const Route = createFileRoute("/_student/study-routine")({
  component: StudyRoutinePage,
  head: () => ({
    meta: [
      { title: "Study Routine · CA Aspire BD" },
      {
        name: "description",
        content:
          "Plan smart, study consistently and achieve more with daily, weekly, monthly and custom study routines.",
      },
      { property: "og:title", content: "Study Routine · CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Create routines, track tasks and visualize your study calendar in one premium planner.",
      },
    ],
  }),
});

function StudyRoutinePage() {
  const { enabled, loading } = useStudyRoutineVisibility();
  if (loading) return <Skeleton className="h-[60vh] w-full rounded-3xl" />;
  if (!enabled) return <Navigate to="/dashboard" replace />;
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <StudyRoutineFlow />
    </Suspense>
  );
}