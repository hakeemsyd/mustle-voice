import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useProfileName } from "../hooks/useProfileName";
import { useMessageHistory, type HistoryTag } from "../hooks/useMessageHistory";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { colors, fonts } from "../constants/theme";
import {
  ChevronRightIcon,
  DumbbellIcon,
  HeartPulseIcon,
  MessageCircleDashedIcon,
  MessageCircleIcon,
  SearchIcon,
  UtensilsIcon,
  XIcon,
} from "../icons";

type Section = "history" | "calendar" | "profile";

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenCalendar: () => void;
  userId: string | null;
}

const TAG_ICON: Record<HistoryTag, typeof UtensilsIcon> = {
  meal: UtensilsIcon,
  workout: DumbbellIcon,
  recovery: HeartPulseIcon,
  general: MessageCircleIcon,
};

const TAG_LABEL: Record<HistoryTag, string> = {
  meal: "Meal",
  workout: "Workout",
  recovery: "Recovery",
  general: "General",
};

const TAGS: HistoryTag[] = ["meal", "workout", "recovery", "general"];

export function AppDrawer({ visible, onClose, onOpenSettings, onOpenCalendar, userId }: AppDrawerProps) {
  const [section, setSection] = useState<Section>("history");
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<HistoryTag | null>(null);
  const userName = useProfileName(userId);
  const { loading: historyLoading, groups } = useMessageHistory();
  const insets = useScreenInsets();

  const filteredGroups = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) => {
          if (activeTag && e.tag !== activeTag) return false;
          if (search.trim() && !e.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
          return true;
        }),
      }))
      .filter((g) => g.entries.length > 0);
  }, [groups, search, activeTag]);

  const initial = (userName || "?").trim().charAt(0).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <View style={styles.tabs}>
            {(["history", "calendar", "profile"] as Section[]).map((s) => (
              <Pressable key={s} style={styles.tab} onPress={() => setSection(s)}>
                <Text style={[styles.tabText, section === s && styles.tabTextActive]}>
                  {s === "history" ? "History" : s === "calendar" ? "Calendar" : "Profile"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <XIcon size={16} color={colors.text} />
          </Pressable>
        </View>

        {section === "history" ? (
          <View style={styles.flex}>
            <View style={styles.searchWrap}>
              <SearchIcon size={14} color={colors.muted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search conversations…"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.tagRow}>
              <Pressable style={[styles.tagChip, activeTag === null && styles.tagChipActive]} onPress={() => setActiveTag(null)}>
                <Text style={[styles.tagChipText, activeTag === null && styles.tagChipTextActive]}>All</Text>
              </Pressable>
              {TAGS.map((tag) => {
                const Icon = TAG_ICON[tag];
                const active = activeTag === tag;
                return (
                  <Pressable
                    key={tag}
                    style={[styles.tagChip, active && styles.tagChipActive]}
                    onPress={() => setActiveTag((t) => (t === tag ? null : tag))}
                  >
                    <Icon size={12} color={active ? colors.accent : colors.muted} />
                    <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{TAG_LABEL[tag]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView style={styles.flex} contentContainerStyle={styles.historyContent}>
              {!historyLoading && filteredGroups.length === 0 && (
                <View style={styles.emptyState}>
                  <MessageCircleDashedIcon size={28} color={colors.muted} />
                  <Text style={styles.emptyTitle}>No conversations yet</Text>
                  <Text style={styles.emptySub}>Talk to your coach and it'll show up here.</Text>
                </View>
              )}
              {filteredGroups.map((group) => (
                <View key={group.label} style={styles.group}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  {group.entries.map((entry) => {
                    const Icon = TAG_ICON[entry.tag];
                    return (
                      <View key={entry.id} style={styles.entry}>
                        <Text style={styles.entryTitle}>{entry.title}</Text>
                        <View style={styles.entryTagRow}>
                          <Icon size={11} color={colors.muted} />
                          <Text style={styles.entryTag}>{TAG_LABEL[entry.tag]}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : section === "calendar" ? (
          <View style={styles.calendarContent}>
            <Pressable
              style={styles.settingsRow}
              onPress={() => {
                onClose();
                onOpenCalendar();
              }}
            >
              <Text style={styles.settingsRowLabel}>Open full calendar</Text>
              <ChevronRightIcon size={14} color={colors.muted} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.profileBody}>
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View>
                <Text style={styles.profileName}>{userName || "You"}</Text>
                <Text style={styles.profileSub}>Coached by MUSTLE</Text>
              </View>
            </View>
            <Pressable
              style={styles.settingsRow}
              onPress={() => {
                onClose();
                onOpenSettings();
              }}
            >
              <Text style={styles.settingsRowLabel}>Edit profile & settings</Text>
              <ChevronRightIcon size={14} color={colors.muted} />
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 48,
  },
  tabs: { flexDirection: "row", gap: 18 },
  tab: { paddingVertical: 6 },
  tabText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  tabTextActive: { color: colors.text, fontFamily: fonts.bodySemiBold },
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

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },

  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 16, marginTop: 10 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 100,
    backgroundColor: colors.surfaceDeep,
  },
  tagChipActive: { backgroundColor: colors.accentDim },
  tagChipText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted },
  tagChipTextActive: { color: colors.accent },

  historyContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  group: { marginBottom: 18 },
  groupLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: 8,
  },
  entry: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: 4,
  },
  entryTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  entryTagRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  entryTag: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },

  emptyState: { alignItems: "center", gap: 8, paddingTop: 60 },
  emptyTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center" },

  calendarContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  profileBody: { paddingHorizontal: 16, paddingTop: 16 },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
    marginBottom: 8,
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
  avatarText: { fontFamily: fonts.display, fontSize: 18, color: colors.accent },
  profileName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  profileSub: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  settingsRowLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
});
