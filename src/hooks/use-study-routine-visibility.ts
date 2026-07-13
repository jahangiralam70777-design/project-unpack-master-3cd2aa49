// Realtime hook for the Study Routine module enable/disable flag.
// Reads from the public.study_routine_settings singleton and listens for
// changes so the sidebar hides / the route becomes inaccessible instantly.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useStudyRoutineVisibility(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("study_routine_settings")
          .select("enabled")
          .eq("id", true)
          .maybeSingle();
        if (!cancelled) setEnabled(data?.enabled ?? true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const channel = (supabase as any)
      .channel("study_routine_settings_watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_routine_settings" },
        (payload: any) => {
          const next = payload?.new?.enabled;
          if (typeof next === "boolean") setEnabled(next);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { enabled, loading };
}
