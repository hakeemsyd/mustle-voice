import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type HistoryTag = "meal" | "workout" | "recovery" | "profile" | "general";

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
  update_food: "meal",
  delete_food: "meal",
  show_nutrition_summary: "meal",
  update_nutrition_targets: "meal",
  log_workout: "workout",
  skip_exercise: "workout",
  swap_exercise: "workout",
  end_workout: "workout",
  add_set: "workout",
  undo_last_set: "workout",
  adjust_rest_timer: "workout",
  generate_training_plan: "workout",
  update_training_plan: "workout",
  show_daily_workout: "workout",
  record_injury: "recovery",
  // Confirmed missing against real production data (2026-09-07 audit) — a weight update landed
  // as its own log_checkin call and, for want of a mapping here, fell to General. Body-stat
  // tracking reads closer to the personal-facts "profile" bucket than "recovery" (which this
  // codebase reserves for injury-related tags via record_injury above).
  log_checkin: "profile",
};

// onboardingSync.ts's own synthetic messages (Training history/Primary goal/Weekly training
// frequency/Injury notes) are inserted as plain user rows with no following tool-calling
// assistant turn at all — tagFromBlocks structurally can't classify them (there's no next-row
// tool call to look at), so they're matched here instead, against the small, fixed set of
// prefixes that file itself writes — a closed, controlled match, not content-sniffing.
const ONBOARDING_PREFIXES = [
  "Training history:",
  "Primary goal:",
  "Weekly training frequency:",
  "Injury notes:",
];

function tagFromContent(content: string): HistoryTag | null {
  return ONBOARDING_PREFIXES.some((p) => content.startsWith(p)) ? "profile" : null;
}

function tagFromBlocks(blocks: any[] | null): HistoryTag | null {
  if (!blocks) return null;
  for (const turn of blocks) {
    for (const block of turn.content ?? []) {
      if (block.type === "tool_use" && TOOL_TAGS[block.name]) return TOOL_TAGS[block.name];
    }
  }
  return null;
}

// How many rows AFTER a user turn to keep looking for the tool call it eventually produced.
// Confirmed live (2026-09-07 audit, direct DB query): "I ate 300g of chicken steak and one
// boiled rice bowl" only resolved into log_food 5 rows later — the model asked two rounds of
// clarifying questions first ("grilled or fried?", "what size rice bowl?"), and each of those
// intermediate replies called read_state or nothing at all, not a mapped tool. Checking only
// rows[i+1] (the previous behavior) missed the ENTIRE meal-logging conversation, including the
// message that started it — confirmed against real data as the dominant reason meal/workout
// conversations were showing up under General. 6 covers every real case found in that audit
// with one row of headroom, without scanning so far forward that an unrelated later exchange's
// tool call gets misattributed to an earlier, unrelated question.
const TOOL_TAG_LOOKAHEAD_ROWS = 6;

function findEventualTag(rows: any[], userRowIndex: number): HistoryTag {
  const end = Math.min(userRowIndex + 1 + TOOL_TAG_LOOKAHEAD_ROWS, rows.length);
  for (let j = userRowIndex + 1; j < end; j++) {
    const row = rows[j];
    if (row.role !== "assistant") continue;
    const tag = tagFromBlocks(row.blocks);
    if (tag) return tag;
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

      // Descending + limit, then re-ascend for processing — was ascending+limit(200), which
      // fetched the OLDEST 200 messages ever (the exact same bug already found and fixed in
      // useHomeChat.ts's own history load — confirmed live here too via a direct DB query: a
      // long-running account's History drawer only ever showed messages from its very first
      // session, nothing recent, once total message count passed 200).
      const { data, error } = await supabase
        .from("message")
        .select("id, role, content, blocks, at")
        .eq("user_id", userId)
        .eq("hidden", false)
        .order("at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        console.error("[history] failed to load messages:", error.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []).slice().reverse();
      const entries: HistoryEntry[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any;
        if (row.role !== "user") continue;
        const tag = tagFromContent(row.content) ?? findEventualTag(rows, i);
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
