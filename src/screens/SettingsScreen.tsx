import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { setCachedDisplayName } from "../lib/profileStore";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { colors, fonts } from "../constants/theme";
import { ArrowLeftIcon, CheckIcon } from "../icons";

interface Injury {
  area: string;
  severity: string | null;
}

interface SettingsData {
  userId: string;
  displayName: string;
  weightKg: number | null;
  heightCm: number | null;
  sex: string | null;
  activityLevel: string | null;
  weeklyFrequency: number | null;
  goalObjective: string | null;
  injuries: Injury[];
}

function titleCase(value: string | null): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SettingsScreen() {
  const navigation = useNavigation();
  const insets = useScreenInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SettingsData | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [weightDraft, setWeightDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingWeight, setSavingWeight] = useState(false);
  const [savedField, setSavedField] = useState<"name" | "weight" | null>(null);

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

      const [profileRes, biometricsRes, weightRes, goalRes, injuryRes] = await Promise.all([
        supabase.from("profile").select("display_name").eq("user_id", userId).maybeSingle(),
        supabase
          .from("biometrics")
          .select("height_cm, sex, activity_level, weekly_frequency")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("weight_log")
          .select("weight_kg")
          .eq("user_id", userId)
          .order("measured_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("goal").select("objective").eq("user_id", userId).maybeSingle(),
        supabase.from("injury").select("area, severity").eq("user_id", userId).eq("status", "active"),
      ]);

      if (cancelled) return;

      const next: SettingsData = {
        userId,
        displayName: profileRes.data?.display_name ?? "",
        weightKg: weightRes.data?.weight_kg ?? null,
        heightCm: biometricsRes.data?.height_cm ?? null,
        sex: biometricsRes.data?.sex ?? null,
        activityLevel: biometricsRes.data?.activity_level ?? null,
        weeklyFrequency: biometricsRes.data?.weekly_frequency ?? null,
        goalObjective: goalRes.data?.objective ?? null,
        injuries: (injuryRes.data ?? []) as Injury[],
      };

      setData(next);
      setNameDraft(next.displayName);
      setWeightDraft(next.weightKg != null ? String(next.weightKg) : "");
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveName = async () => {
    if (!data || nameDraft.trim() === data.displayName) return;
    setSavingName(true);
    const { error } = await supabase
      .from("profile")
      .update({ display_name: nameDraft.trim() })
      .eq("user_id", data.userId);
    setSavingName(false);
    if (error) {
      console.error("[settings] failed to save name:", error.message);
      return;
    }
    setData({ ...data, displayName: nameDraft.trim() });
    setCachedDisplayName(data.userId, nameDraft.trim());
    setSavedField("name");
    setTimeout(() => setSavedField(null), 1500);
  };

  const saveWeight = async () => {
    if (!data) return;
    const parsed = parseFloat(weightDraft);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed === data.weightKg) return;
    setSavingWeight(true);
    const { error } = await supabase.from("weight_log").insert({ user_id: data.userId, weight_kg: parsed });
    setSavingWeight(false);
    if (error) {
      console.error("[settings] failed to save weight:", error.message);
      return;
    }
    setData({ ...data, weightKg: parsed });
    setSavedField("weight");
    setTimeout(() => setSavedField(null), 1500);
  };

  const initial = (data?.displayName || "?").trim().charAt(0).toUpperCase();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeftIcon size={16} color={colors.text} />
        </Pressable>
      </View>

      {loading || !data ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
          >
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View>
                <Text style={styles.profileName}>{data.displayName || "You"}</Text>
                <Text style={styles.profileSub}>Coached by MUSTLE</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>PROFILE</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Name</Text>
              <View style={styles.rowEdit}>
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  onBlur={saveName}
                  onSubmitEditing={saveName}
                  placeholder="Your name"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  returnKeyType="done"
                />
                {savingName ? (
                  <ActivityIndicator size="small" color={colors.muted} />
                ) : savedField === "name" ? (
                  <CheckIcon size={14} color={colors.accent} />
                ) : nameDraft.trim() !== data.displayName && nameDraft.trim().length > 0 ? (
                  <Pressable style={styles.saveBtn} onPress={saveName} hitSlop={8}>
                    <Text style={styles.saveBtnText}>Save</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Text style={styles.sectionLabel}>BODY</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Weight</Text>
              <View style={styles.rowEdit}>
                <TextInput
                  value={weightDraft}
                  onChangeText={setWeightDraft}
                  onBlur={saveWeight}
                  onSubmitEditing={saveWeight}
                  placeholder="kg"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  returnKeyType="done"
                />
                {savingWeight ? (
                  <ActivityIndicator size="small" color={colors.muted} />
                ) : savedField === "weight" ? (
                  <CheckIcon size={14} color={colors.accent} />
                ) : (() => {
                    const parsed = parseFloat(weightDraft);
                    return Number.isFinite(parsed) && parsed > 0 && parsed !== data.weightKg;
                  })() ? (
                  <Pressable style={styles.saveBtn} onPress={saveWeight} hitSlop={8}>
                    <Text style={styles.saveBtnText}>Save</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Height</Text>
              <Text style={styles.rowValue}>{data.heightCm ? `${data.heightCm} cm` : "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Sex</Text>
              <Text style={styles.rowValue}>{titleCase(data.sex)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Activity level</Text>
              <Text style={styles.rowValue}>{titleCase(data.activityLevel)}</Text>
            </View>

            <Text style={styles.sectionLabel}>TRAINING</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Goal</Text>
              <Text style={styles.rowValue}>{titleCase(data.goalObjective)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Days per week</Text>
              <Text style={styles.rowValue}>{data.weeklyFrequency ?? "—"}</Text>
            </View>
            <Text style={styles.hint}>
              Tell your coach to change your goal or schedule — it updates your plan and nutrition targets
              together.
            </Text>

            <Text style={styles.sectionLabel}>INJURIES</Text>
            {data.injuries.length === 0 ? (
              <View style={styles.row}>
                <Text style={styles.rowValue}>None reported</Text>
              </View>
            ) : (
              data.injuries.map((injury, i) => (
                <View key={`${injury.area}-${i}`} style={styles.row}>
                  <Text style={styles.rowLabel}>{titleCase(injury.area)}</Text>
                  <Text style={styles.rowValue}>{titleCase(injury.severity)}</Text>
                </View>
              ))
            )}
            <Text style={styles.hint}>
              Tell your coach about a new injury or if one's healed — your plan gets safety-checked
              automatically.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  avatarText: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.accent,
  },
  profileName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  profileSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  sectionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.muted,
    marginTop: 18,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  rowValue: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  rowEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.text,
    textAlign: "right",
    minWidth: 80,
    paddingVertical: 2,
  },
  saveBtn: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  saveBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.accent,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 8,
  },
});
