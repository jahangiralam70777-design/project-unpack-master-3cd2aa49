import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const RoutineManagerFlow = lazy(() =>
  import("@/components/admin/RoutineManagerFlow").then((m) => ({
    default: m.RoutineManagerFlow,
  })),
);

export const Route = createFileRoute("/admin/routine-manager")({
  component: RoutineManagerPage,
  head: () => ({
    meta: [
      { title: "Routine Manager · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Read-only monitoring of student Study Routines — usage, progress, activity and completion analytics.",
      },
      { property: "og:title", content: "Routine Manager · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "Monitor every student's Study Routine — daily, weekly and monthly progress with realtime insights.",
      },
    ],
  }),
});

function RoutineManagerPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <RoutineManagerFlow />
    </Suspense>
  );
}
