import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type HistoryTag = "meal" | "workout" | "recovery" | "general";

export interface HistoryEntry {
  id: string;
  title: string;
  tag: HistoryTag;
  at: string;
}

export interface HistoryGroup {
  label: string;
  entries: HistoryEntry[];
}

const TOOL_TAGS: Record<string, HistoryTag> = {
  log_food: "meal",
  log_workout: "workout",
  skip_exercise: "workout",
  swap_exercise: "workout",
  end_workout: "workout",
  record_injury: "recovery",
};

function tagFromBlocks(blocks: any[] | null): HistoryTag {
  if (!blocks) return "general";
  for (const turn of blocks) {
    for (const block of turn.content ?? []) {
      if (block.type === "tool_use" && TOOL_TAGS[block.name]) return TOOL_TAGS[block.name];
    }
  }
  return "general";
}

function dateLabel(at: string): string {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function useMessageHistory() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<HistoryGroup[]>([]);
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("message")
        .select("id, role, content, blocks, at")
        .eq("user_id", userId)
        .eq("hidden", false)
        .order("at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (error) {
        console.error("[history] failed to load messages:", error.message);
        setLoading(false);
        return;
      }

      const rows = data ?? [];
      const entries: HistoryEntry[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any;
        if (row.role !== "user") continue;
        const next = rows[i + 1] as any;
        const tag = next?.role === "assistant" ? tagFromBlocks(next.blocks) : "general";
        entries.push({ id: row.id, title: truncate(row.content, 80), tag, at: row.at });
      }
      entries.reverse();

      const byDate = new Map<string, HistoryEntry[]>();
      for (const entry of entries) {
        const label = dateLabel(entry.at);
        const arr = byDate.get(label) ?? [];
        arr.push(entry);
        byDate.set(label, arr);
      }

      setGroups(Array.from(byDate.entries()).map(([label, groupEntries]) => ({ label, entries: groupEntries })));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  return { loading, groups, refetch };
}
