import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { resolveInjuryZone } from "../lib/injuryZones";
import { localDateKey } from "../lib/calendarDate";
import type { FlaggedZone } from "../components/BodyZoneMap";

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export interface BodyProfile {
  goal: string | null;
  daysPerWeek: number | null;
  heightCm: number | null;
  weightKg: number | null;
  injuriesLabel: string;
}

export interface ProteinAdherence {
  daysHit: number;
  totalDays: number;
}

export interface BodyData {
  loading: boolean;
  composition: WeightPoint[];
  latestWeightKg: number | null;
  weekDeltaKg: number | null;
  hasTrend: boolean;
  flaggedZones: FlaggedZone[];
  profile: BodyProfile;
  proteinAdherence: ProteinAdherence | null;
  sourcesSynced: number;
  refetch: () => void;
}

function settled<T>(work: PromiseLike<T>): Promise<{ data: any; error: any }> {
  return Promise.resolve(work).then(
    (res: any) => res,
    (err) => ({ data: null, error: err }),
  );
}

export function useBodyData(): BodyData {
  const [state, setState] = useState<Omit<BodyData, "refetch">>({
    loading: true,
    composition: [],
    latestWeightKg: null,
    weekDeltaKg: null,
    hasTrend: false,
    flaggedZones: [],
    profile: { goal: null, daysPerWeek: null, heightCm: null, weightKg: null, injuriesLabel: "None" },
    proteinAdherence: null,
    sourcesSynced: 0,
  });
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
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [biometricsRes, goalRes, planRes, weightRes, injuryRes, nutritionRes, foodRes] = await Promise.all([
        settled(supabase.from("biometrics").select("height_cm").eq("user_id", userId).maybeSingle()),
        settled(supabase.from("goal").select("objective").eq("user_id", userId).maybeSingle()),
        settled(
          supabase.from("training_plan").select("days_per_week").eq("user_id", userId).eq("status", "active").maybeSingle(),
        ),
        settled(
          supabase
            .from("weight_log")
            .select("weight_kg, measured_at")
            .eq("user_id", userId)
            .gte("measured_at", ninetyDaysAgo.toISOString())
            .order("measured_at", { ascending: true }),
        ),
        settled(
          supabase.from("injury").select("area, note, created_at").eq("user_id", userId).eq("status", "active"),
        ),
        settled(supabase.from("nutrition_target").select("protein_g").eq("user_id", userId).maybeSingle()),
        settled(
          supabase
            .from("food_log")
            .select("protein_g, at")
            .eq("user_id", userId)
            .gte("at", sevenDaysAgo.toISOString()),
        ),
      ]);
      if (cancelled) return;

      const composition: WeightPoint[] = (weightRes.data ?? []).map((row: any) => ({
        date: row.measured_at,
        weightKg: row.weight_kg,
      }));

      const latest = composition[composition.length - 1] ?? null;
      const weekAgoCutoff = new Date(Date.now() - 7 * 86_400_000);
      const weekAgoPoint = composition.find((p) => new Date(p.date) >= weekAgoCutoff) ?? composition[0] ?? null;
      // A single logged weight (or every point landing on the same day) has nothing to
      // compare against — showing "0 lb down" in that case reads as a real trend when
      // there isn't one, so gate on the compared points actually being different entries.
      const hasTrend = !!latest && !!weekAgoPoint && weekAgoPoint !== latest;
      const weekDeltaKg = hasTrend ? Math.round((latest!.weightKg - weekAgoPoint!.weightKg) * 10) / 10 : null;

      const flaggedZones: FlaggedZone[] = (injuryRes.data ?? [])
        .map((row: any) => {
          const zone = resolveInjuryZone(row.area);
          if (!zone) return null;
          return {
            zoneId: zone.zoneId,
            view: zone.view,
            label: row.area.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            note: row.note ?? "",
            createdAt: row.created_at,
          } as FlaggedZone;
        })
        .filter(Boolean) as FlaggedZone[];

      const proteinTarget = nutritionRes.data?.protein_g ?? null;
      let proteinAdherence: ProteinAdherence | null = null;
      if (proteinTarget && proteinTarget > 0) {
        const byDay = new Map<string, number>();
        for (const row of foodRes.data ?? []) {
          const key = localDateKey(new Date(row.at));
          byDay.set(key, (byDay.get(key) ?? 0) + (row.protein_g ?? 0));
        }
        if (byDay.size > 0) {
          const daysHit = Array.from(byDay.values()).filter((sum) => sum >= proteinTarget).length;
          proteinAdherence = { daysHit, totalDays: byDay.size };
        }
      }

      setState({
        loading: false,
        composition,
        latestWeightKg: latest?.weightKg ?? null,
        weekDeltaKg,
        hasTrend,
        flaggedZones,
        profile: {
          goal: goalRes.data?.objective ?? null,
          daysPerWeek: planRes.data?.days_per_week ?? null,
          heightCm: biometricsRes.data?.height_cm ?? null,
          weightKg: latest?.weightKg ?? null,
          injuriesLabel: flaggedZones.length === 0 ? "None" : flaggedZones.map((z) => z.label).join(", "),
        },
        proteinAdherence,
        sourcesSynced: latest ? 1 : 0,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  return { ...state, refetch };
}
