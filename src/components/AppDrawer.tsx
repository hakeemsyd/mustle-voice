import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useProfileName } from "../hooks/useProfileName";
import { useMessageHistory, type HistoryTag } from "../hooks/useMessageHistory";
import { useScreenInsets } from "../hooks/useScreenInsets";
import {
  useTodayCalendar,
  useMonthCalendar,
  useDayDetail,
} from "../hooks/useCalendarData";
import { useFuelData } from "../hooks/useFuelData";
import { localDateKey, addDays } from "../lib/calendarDate";
import { colors, fonts, lightCard } from "../constants/theme";
import { MMark } from "../icons/MMark";
import { MonthGrid } from "./MonthGrid";
import {
  ArrowLeftIcon,
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CreditCardIcon,
  DumbbellIcon,
  HeartPulseIcon,
  HelpCircleIcon,
  ListIcon,
  MailCheckIcon,
  MessageCircleDashedIcon,
  MessageCircleIcon,
  PersonStandingIcon,
  SearchIcon,
  SettingsIcon,
  UtensilsIcon,
  XIcon,
} from "../icons";
import { supabase } from "../lib/supabase";
import { setCachedDisplayName } from "../lib/profileStore";
import { titleCase } from "../lib/textFormat";

type DrawerView = "index" | "history" | "calendar" | "profile";

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  onOpenCalendar: () => void;
  userId: string | null;
  /** Jumps back into the chat transcript at a specific message — passed through from Home,
   *  which owns the transcript this drawer's History entries point into. */
  onOpenHistoryEntry?: (messageId: string) => void;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const ENTER_CURVE = Easing.bezier(0.22, 1, 0.36, 1);
const EXIT_CURVE = Easing.bezier(0.4, 0, 1, 1);

const SECTION_TITLES: Record<Exclude<DrawerView, "index">, string> = {
  history: "Chat History",
  calendar: "Calendar",
  profile: "Profile",
};

const TAG_ICON: Record<HistoryTag, typeof UtensilsIcon> = {
  meal: UtensilsIcon,
  workout: DumbbellIcon,
  recovery: HeartPulseIcon,
  profile: PersonStandingIcon,
  general: MessageCircleIcon,
};

const TAG_LABEL: Record<HistoryTag, string> = {
  meal: "Meal",
  workout: "Workout",
  recovery: "Recovery",
  profile: "Profile",
  general: "General",
};

const TAGS: HistoryTag[] = ["meal", "workout", "recovery", "profile", "general"];

const dateGroupLabel = (dateKey: string): string => {
  const today = localDateKey(new Date());
  const yesterday = localDateKey(addDays(new Date(), -1));
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
};

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const relativeTime = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

// ---------- Index screen ----------

const IndexRow = ({
  title,
  summary,
  onPress,
  first,
}: {
  title: string;
  summary: string;
  onPress: () => void;
  first?: boolean;
}) => (
  <Pressable style={[styles.idxRow, first && styles.idxRowFirst]} onPress={onPress}>
    <View style={styles.idxTitleGroup}>
      <Text style={styles.idxTitle}>{title}</Text>
      <View style={styles.idxSub}>
        <View style={styles.idxDot} />
        <Text style={styles.idxSubText}>{summary}</Text>
      </View>
    </View>
    <ChevronRightIcon size={24} color={colors.muted} />
  </Pressable>
);

// ---------- Shared header ----------

const DrawerHeader = ({
  view,
  historyMeta,
  onBack,
  onClose,
}: {
  view: DrawerView;
  historyMeta?: string;
  onBack: () => void;
  onClose: () => void;
}) => (
  <View style={styles.header}>
    {view === "index" ? (
      <>
        <Text style={styles.headerEyebrow}>Menu</Text>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
          <XIcon size={16} color={colors.muted} />
        </Pressable>
      </>
    ) : (
      <>
        <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
          <ArrowLeftIcon size={18} color={colors.text} />
          <Text style={styles.headerTitle}>{SECTION_TITLES[view]}</Text>
        </Pressable>
        {historyMeta && <Text style={styles.headerMeta}>{historyMeta}</Text>}
      </>
    )}
  </View>
);

// ---------- History detail ----------

const HistoryEntryRow = ({
  tag,
  title,
  at,
  onPress,
}: {
  tag: HistoryTag;
  title: string;
  at: string;
  onPress: () => void;
}) => {
  const Icon = TAG_ICON[tag];
  return (
    <Pressable style={styles.entry} onPress={onPress}>
      <View style={styles.entryBadge}>
        <Icon size={14} color={colors.accent} />
      </View>
      <View style={styles.entryBody}>
        <Text style={styles.entryTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.entryTimeRow}>
          <ClockIcon size={10} color={colors.muted} />
          <Text style={styles.entryTime}>{dateGroupLabel(localDateKey(new Date(at)))}</Text>
        </View>
      </View>
      <ChevronRightIcon size={14} color={colors.muted} />
    </Pressable>
  );
};

const HistoryDetail = ({
  onOpenEntry,
}: {
  onOpenEntry: (id: string) => void;
}) => {
  const { loading, groups } = useMessageHistory();
  const [search, setSearch] = useState("");
  const [listView, setListView] = useState<"topic" | "recent">("recent");
  const [activeTag, setActiveTag] = useState<HistoryTag | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState(localDateKey(new Date()));

  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  const mostRecent = flat[flat.length - 1] ?? null;

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((e) => e.title.toLowerCase().includes(q));
  }, [flat, search]);

  const tagCounts = useMemo(() => {
    const counts: Record<HistoryTag, number> = { meal: 0, workout: 0, recovery: 0, profile: 0, general: 0 };
    searched.forEach((e) => counts[e.tag]++);
    return counts;
  }, [searched]);

  const topicGroups = useMemo(() => {
    return TAGS.map((tag) => ({ tag, entries: searched.filter((e) => e.tag === tag) })).filter(
      (g) => g.entries.length > 0,
    );
  }, [searched]);

  const dayEntries = useMemo(
    () => searched.filter((e) => localDateKey(new Date(e.at)) === selectedDateKey).slice().reverse(),
    [searched, selectedDateKey],
  );

  const hasAnyHistory = flat.length > 0;
  const filteredFlat = activeTag ? searched.filter((e) => e.tag === activeTag) : searched;

  return (
    <View style={styles.flex}>
      <View style={styles.stickySearchBar}>
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
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.historyContent}>
        {hasAnyHistory && mostRecent && !search && (
          <Pressable style={styles.hero} onPress={() => onOpenEntry(mostRecent.id)}>
            <View style={styles.heroTop}>
              <View style={styles.heroBadge}>
                <MessageCircleIcon size={14} color={lightCard.iconOn} />
              </View>
              <Text style={styles.heroEyebrow}>LAST CONVERSATION</Text>
              <Text style={styles.heroTime}>{relativeTime(mostRecent.at)}</Text>
              <ChevronRightIcon size={16} color="rgba(10,10,10,0.35)" />
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {mostRecent.title}
            </Text>
            <View style={styles.heroTags}>
              <View style={styles.heroDot} />
              <Text style={styles.heroTagsText}>{TAG_LABEL[mostRecent.tag]}</Text>
            </View>
          </Pressable>
        )}

        <View style={styles.viewTabsRow}>
          <Pressable
            style={[styles.viewTab, listView === "topic" && styles.viewTabActive]}
            onPress={() => setListView("topic")}
          >
            <Text style={[styles.viewTabText, listView === "topic" && styles.viewTabTextActive]}>By Topic</Text>
          </Pressable>
          <Pressable
            style={[styles.viewTab, listView === "recent" && styles.viewTabActive]}
            onPress={() => setListView("recent")}
          >
            <Text style={[styles.viewTabText, listView === "recent" && styles.viewTabTextActive]}>By Date</Text>
          </Pressable>
        </View>

        {listView === "topic" ? (
          <>
            <View style={styles.tagFilterRow}>
              <Pressable
                style={[styles.tagFilterItem, activeTag === null && styles.tagFilterItemActive]}
                onPress={() => setActiveTag(null)}
              >
                <Text style={[styles.tagFilterText, activeTag === null && styles.tagFilterTextActive]}>
                  All {searched.length > 0 ? `(${searched.length})` : ""}
                </Text>
              </Pressable>
              {TAGS.map((tag) => {
                const Icon = TAG_ICON[tag];
                const active = activeTag === tag;
                if (tagCounts[tag] === 0) return null;
                return (
                  <Pressable
                    key={tag}
                    style={[styles.tagFilterItem, active && styles.tagFilterItemActive]}
                    onPress={() => setActiveTag((t) => (t === tag ? null : tag))}
                  >
                    <Icon size={12} color={active ? colors.accent : colors.muted} />
                    <Text style={[styles.tagFilterText, active && styles.tagFilterTextActive]}>
                      {TAG_LABEL[tag]} ({tagCounts[tag]})
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            ) : activeTag ? (
              filteredFlat.length === 0 ? (
                <EmptyState title="No matches" subtitle="Try a different search term or tag." />
              ) : (
                <View style={styles.topicListFlat}>
                  {filteredFlat
                    .slice()
                    .reverse()
                    .map((e) => (
                      <HistoryEntryRow key={e.id} tag={e.tag} title={e.title} at={e.at} onPress={() => onOpenEntry(e.id)} />
                    ))}
                </View>
              )
            ) : topicGroups.length === 0 ? (
              <EmptyState title="No conversations yet" subtitle="Talk to your coach and it'll show up here." />
            ) : (
              topicGroups.map(({ tag, entries }) => (
                <View key={tag}>
                  <View style={styles.topicHead}>
                    <Text style={styles.topicHeadTitle}>{TAG_LABEL[tag]}</Text>
                    <Text style={styles.topicHeadCount}>
                      {entries.length} conversation{entries.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <View style={styles.topicList}>
                    {entries
                      .slice()
                      .reverse()
                      .map((e) => (
                        <HistoryEntryRow key={e.id} tag={e.tag} title={e.title} at={e.at} onPress={() => onOpenEntry(e.id)} />
                      ))}
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <>
            <View style={styles.datePager}>
              <Pressable
                style={styles.datePagerBtn}
                onPress={() => setSelectedDateKey((d) => localDateKey(addDays(new Date(`${d}T00:00:00`), -1)))}
                hitSlop={6}
              >
                <View style={{ transform: [{ rotate: "180deg" }] }}>
                  <ChevronRightIcon size={14} color={colors.text} />
                </View>
              </Pressable>
              <View style={styles.datePagerLabel}>
                <Text style={styles.datePagerDay}>{dateGroupLabel(selectedDateKey)}</Text>
                {dayEntries.length === 0 && <Text style={styles.datePagerCount}>No conversations</Text>}
              </View>
              <Pressable
                style={[styles.datePagerBtn, selectedDateKey >= localDateKey(new Date()) && styles.datePagerBtnDisabled]}
                onPress={() => setSelectedDateKey((d) => localDateKey(addDays(new Date(`${d}T00:00:00`), 1)))}
                disabled={selectedDateKey >= localDateKey(new Date())}
                hitSlop={6}
              >
                <ChevronRightIcon
                  size={14}
                  color={selectedDateKey >= localDateKey(new Date()) ? colors.muted : colors.text}
                />
              </Pressable>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            ) : dayEntries.length === 0 ? (
              <EmptyState title="No conversations" subtitle={`Nothing logged on ${dateGroupLabel(selectedDateKey)}.`} />
            ) : (
              <View style={styles.topicListFlat}>
                {dayEntries.map((e) => (
                  <HistoryEntryRow key={e.id} tag={e.tag} title={e.title} at={e.at} onPress={() => onOpenEntry(e.id)} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const EmptyState = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <View style={styles.emptyState}>
    <MessageCircleDashedIcon size={28} color={colors.muted} />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptySub}>{subtitle}</Text>
  </View>
);

// ---------- Calendar detail ----------

const CalendarTimelineDay = ({ dateKey }: { dateKey: string }) => {
  const detail = useDayDetail(dateKey);
  if (detail.loading) return <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />;

  const loggedWorkout = detail.workouts[0] ?? null;
  const doneFocus = loggedWorkout?.focus ?? null;
  const hasPlan = !!doneFocus || !!detail.plannedFocus;
  const plannedValue = doneFocus ? titleCase(doneFocus) : detail.plannedFocus ? titleCase(detail.plannedFocus) : null;

  if (!hasPlan && detail.meals.length === 0 && detail.injuryNotes.length === 0) {
    return <EmptyState title="No facts yet for this day" subtitle="Meals, injuries, and workouts logged this day will show up here." />;
  }

  return (
    <View style={styles.calDayBody}>
      {hasPlan && (
        <View style={styles.calPlannedRow}>
          <View style={styles.calPlannedIcon}>
            <DumbbellIcon size={14} color={colors.accent} />
          </View>
          <Text style={styles.calPlannedText}>{plannedValue}</Text>
          {loggedWorkout && <CheckCircleIcon size={14} color={colors.accent} />}
        </View>
      )}
      {detail.meals.map((m, i) => (
        <View key={i} style={styles.calFactLine}>
          <UtensilsIcon size={12} color={colors.muted} />
          <Text style={styles.calFactText} numberOfLines={1}>
            {m.description} — {m.calories} kcal
          </Text>
        </View>
      ))}
      {detail.injuryNotes.map((n) => (
        <View key={n.id} style={styles.calFactLine}>
          <HeartPulseIcon size={12} color={colors.muted} />
          <Text style={styles.calFactText} numberOfLines={2}>
            {n.summary}
          </Text>
        </View>
      ))}
    </View>
  );
};

const CalendarDetail = ({ onOpenFullCalendar }: { onOpenFullCalendar: () => void }) => {
  const [heroView, setHeroView] = useState<"session" | "nutrition">("session");
  const [dateView, setDateView] = useState<"day" | "month">("day");
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [timelineDateKey, setTimelineDateKey] = useState(localDateKey(new Date()));

  const today = useTodayCalendar();
  const fuel = useFuelData();
  const month = useMonthCalendar(monthCursor);

  const caloriesMacro = fuel.macros?.find((m) => m.key === "calories");
  const proteinMacro = fuel.macros?.find((m) => m.key === "protein");
  const carbsMacro = fuel.macros?.find((m) => m.key === "carbs");
  const fatMacro = fuel.macros?.find((m) => m.key === "fat");

  const totalSets = today.session?.exercises.reduce((sum, ex) => sum + (ex.sets ?? 0), 0) ?? 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.calendarContent}>
      <Pressable
        style={styles.calHeroCard}
        onPress={onOpenFullCalendar}
      >
        <View style={styles.calHeroWatermark}>
          <MMark size={140} color="#0A0A0A" />
        </View>
        {heroView === "session" ? (
          <>
            <View style={styles.calHeroTop}>
              <Text style={styles.calHeroEyebrow}>TODAY'S SESSION</Text>
              <View style={styles.calHeroIconBadge}>
                <DumbbellIcon size={18} color={lightCard.iconOn} />
              </View>
            </View>
            <Text style={styles.calHeroTitle}>
              {today.completedWorkout?.focus
                ? titleCase(today.completedWorkout.focus)
                : today.isRestDay
                  ? "Rest Day"
                  : today.session
                    ? titleCase(today.session.focus)
                    : "No Session"}
            </Text>
            <Text style={styles.calHeroDate}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            {today.session && !today.completedWorkout && (
              <View style={styles.calHeroStatsRow}>
                <View style={styles.calHeroStat}>
                  <Text style={styles.calHeroStatValue}>{today.session.exercises.length}</Text>
                  <Text style={styles.calHeroStatLabel}>Exercises</Text>
                </View>
                <View style={styles.calHeroStatDivider} />
                <View style={styles.calHeroStat}>
                  <Text style={styles.calHeroStatValue}>{totalSets}</Text>
                  <Text style={styles.calHeroStatLabel}>Total sets</Text>
                </View>
                <View style={styles.calHeroStatDivider} />
                <View style={styles.calHeroStat}>
                  <Text style={styles.calHeroStatValue}>Strength</Text>
                  <Text style={styles.calHeroStatLabel}>Type</Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.calHeroTop}>
              <Text style={styles.calHeroEyebrow}>TODAY'S NUTRITION</Text>
              <View style={styles.calHeroIconBadge}>
                <UtensilsIcon size={18} color={lightCard.iconOn} />
              </View>
            </View>
            <Text style={styles.calHeroTitle}>{caloriesMacro?.current ?? 0} kcal</Text>
            <Text style={styles.calHeroDate}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            <View style={styles.calHeroStatsRow}>
              {[proteinMacro, carbsMacro, fatMacro].map((m, i) => (
                <View key={m?.key ?? i} style={styles.calHeroStat}>
                  <Text style={styles.calHeroStatValue}>
                    {m?.current ?? 0}/{m?.goal ?? 0}g
                  </Text>
                  <Text style={styles.calHeroStatLabel}>{m?.label ?? ""}</Text>
                  <View style={styles.calHeroStatBarTrack}>
                    <View
                      style={[
                        styles.calHeroStatBarFill,
                        { width: `${m && m.goal > 0 ? Math.min(100, Math.round((m.current / m.goal) * 100)) : 0}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </Pressable>

      <View style={styles.calSubToggleRow}>
        <View style={styles.flex} />
        <View style={styles.calSubToggle}>
          <Pressable
            style={[styles.calSubToggleBtn, heroView === "session" && styles.calSubToggleBtnActive]}
            onPress={() => setHeroView("session")}
          >
            <Text style={[styles.calSubToggleText, heroView === "session" && styles.calSubToggleTextActive]}>
              Timeline
            </Text>
          </Pressable>
          <Pressable
            style={[styles.calSubToggleBtn, heroView === "nutrition" && styles.calSubToggleBtnActive]}
            onPress={() => setHeroView("nutrition")}
          >
            <Text style={[styles.calSubToggleText, heroView === "nutrition" && styles.calSubToggleTextActive]}>
              Meals Logged
            </Text>
          </Pressable>
        </View>
        <View style={[styles.flex, styles.dayMonthWrap]}>
          <Pressable
            style={[styles.dayMonthBtn, dateView === "day" && styles.dayMonthBtnActive]}
            onPress={() => setDateView("day")}
          >
            <ListIcon size={14} color={dateView === "day" ? colors.text : colors.muted} />
          </Pressable>
          <Pressable
            style={[styles.dayMonthBtn, dateView === "month" && styles.dayMonthBtnActive]}
            onPress={() => setDateView("month")}
          >
            <CalendarIcon size={14} color={dateView === "month" ? colors.text : colors.muted} />
          </Pressable>
        </View>
      </View>

      {dateView === "month" ? (
        <View style={styles.calMonthWrap}>
          <MonthGrid
            monthDate={monthCursor}
            onMonthChange={setMonthCursor}
            onSelectDay={(key) => {
              if (heroView === "session") setTimelineDateKey(key);
              else fuel.setLoggedDate(key);
              setDateView("day");
            }}
            dayCellStyle={(cell) => (month.plannedDates.has(cell.key) ? styles.scheduledDay : undefined)}
            renderMarker={(cell) => {
              const logged = month.completedDates.has(cell.key) || month.partialDates.has(cell.key);
              if (logged) return <View style={styles.markerFilled} />;
              if (month.plannedDates.has(cell.key)) return <View style={styles.markerHollow} />;
              return null;
            }}
          />
        </View>
      ) : heroView === "session" ? (
        <>
          <DatePagerRow
            dateKey={timelineDateKey}
            onPrev={() => setTimelineDateKey((d) => localDateKey(addDays(new Date(`${d}T00:00:00`), -1)))}
            onNext={() => setTimelineDateKey((d) => localDateKey(addDays(new Date(`${d}T00:00:00`), 1)))}
            nextDisabled={timelineDateKey >= localDateKey(new Date())}
          />
          <CalendarTimelineDay dateKey={timelineDateKey} />
        </>
      ) : (
        <>
          <DatePagerRow
            dateKey={fuel.loggedDate}
            onPrev={fuel.goToPreviousDay}
            onNext={fuel.goToNextDay}
            nextDisabled={!fuel.canGoToNextDay}
          />
          {fuel.loggedLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
          ) : fuel.loggedEntries.length === 0 ? (
            <Text style={styles.calMealsEmpty}>No meals logged that day.</Text>
          ) : (
            <View style={styles.calMealsList}>
              {fuel.loggedEntries.map((entry) => (
                <View key={entry.id} style={styles.calMealRow}>
                  <View style={styles.calMealIcon}>
                    <UtensilsIcon size={14} color={colors.accent} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.calMealDesc} numberOfLines={1}>
                      {entry.description}
                    </Text>
                    <Text style={styles.calMealMeta}>
                      {formatTime(entry.at)} · {entry.calories} kcal
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
};

const DatePagerRow = ({
  dateKey,
  onPrev,
  onNext,
  nextDisabled,
}: {
  dateKey: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) => (
  <View style={styles.datePager}>
    <Pressable style={styles.datePagerBtn} onPress={onPrev} hitSlop={6}>
      <View style={{ transform: [{ rotate: "180deg" }] }}>
        <ChevronRightIcon size={14} color={colors.text} />
      </View>
    </Pressable>
    <View style={styles.datePagerLabel}>
      <Text style={styles.datePagerDay}>{dateGroupLabel(dateKey)}</Text>
    </View>
    <Pressable style={[styles.datePagerBtn, nextDisabled && styles.datePagerBtnDisabled]} onPress={onNext} disabled={nextDisabled} hitSlop={6}>
      <ChevronRightIcon size={14} color={nextDisabled ? colors.muted : colors.text} />
    </Pressable>
  </View>
);

// ---------- Profile detail ----------

interface ProfileData {
  displayName: string;
  email: string | null;
  weeklyFrequency: number | null;
  unitPrefs: "metric" | "imperial";
}

const SettingsRow = ({
  icon,
  label,
  value,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onPress: () => void;
}) => (
  <Pressable style={styles.settingsRow} onPress={onPress}>
    <View style={styles.settingsRowIcon}>{icon}</View>
    <Text style={styles.settingsRowLabel}>{label}</Text>
    {value != null && <Text style={styles.settingsRowValue}>{value}</Text>}
    <ChevronRightIcon size={14} color={colors.muted} />
  </Pressable>
);

const ProfileSectionLabel = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <View style={styles.profileSectionLabelRow}>
    {icon}
    <Text style={styles.profileSectionLabel}>{label}</Text>
  </View>
);

const comingSoon = (feature: string) => Alert.alert(feature, "Not available yet — coming in a future update.");

const ProfileDetail = ({ userId, userName }: { userId: string | null; userName: string }) => {
  const [data, setData] = useState<ProfileData | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [
        {
          data: { session },
        },
        biometricsRes,
        profileRes,
      ] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("biometrics").select("weekly_frequency").eq("user_id", userId).maybeSingle(),
        supabase.from("profile").select("display_name, unit_prefs").eq("user_id", userId).maybeSingle(),
      ]);
      if (cancelled) return;
      const displayName = profileRes.data?.display_name ?? "";
      setData({
        displayName,
        email: session?.user.email ?? null,
        weeklyFrequency: biometricsRes.data?.weekly_frequency ?? null,
        unitPrefs: (profileRes.data?.unit_prefs as "metric" | "imperial" | undefined) ?? "metric",
      });
      setNameDraft(displayName);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const saveName = async () => {
    if (!userId || !data || nameDraft.trim() === data.displayName || !nameDraft.trim()) return;
    setSavingName(true);
    const trimmed = nameDraft.trim();
    const { error } = await supabase.from("profile").update({ display_name: trimmed }).eq("user_id", userId);
    setSavingName(false);
    if (error) {
      console.error("[drawer] failed to save name:", error.message);
      return;
    }
    setData({ ...data, displayName: trimmed });
    setCachedDisplayName(userId, trimmed);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1500);
  };

  const confirmLogOut = () => {
    Alert.alert("Log out?", "You can log back in any time with your email and password.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          const { error } = await supabase.auth.signOut();
          if (error) {
            console.error("[drawer] failed to log out:", error.message);
            Alert.alert("Log out failed", "Check your connection and try again.");
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const initial = (userName || "?").trim().charAt(0).toUpperCase();

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.profileBody}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View>
          <Text style={styles.profileName}>{userName || "You"}</Text>
          <Text style={styles.profileSub}>Coached by MUSTLE</Text>
        </View>
      </View>

      {!!data?.weeklyFrequency && (
        <View style={styles.profileStat}>
          <DumbbellIcon size={13} color={colors.accent} />
          <Text style={styles.profileStatText}>Trains {data.weeklyFrequency}x / week</Text>
        </View>
      )}

      <ProfileSectionLabel icon={<SettingsIcon size={12} color={colors.muted} />} label="Account" />
      <View style={styles.settingsRow}>
        <View style={styles.settingsRowIcon}>
          <PersonStandingIcon size={16} color={colors.muted} />
        </View>
        <Text style={styles.settingsRowLabel}>Name</Text>
        <View style={styles.nameEdit}>
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            onBlur={saveName}
            onSubmitEditing={saveName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            style={styles.nameInput}
            returnKeyType="done"
          />
          {savingName ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : nameSaved ? (
            <CheckIcon size={14} color={colors.accent} />
          ) : nameDraft.trim() !== data?.displayName && nameDraft.trim().length > 0 ? (
            <Pressable style={styles.nameSaveBtn} onPress={saveName} hitSlop={8}>
              <Text style={styles.nameSaveBtnText}>Save</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {data?.email && (
        <SettingsRow
          icon={<MailCheckIcon size={16} color={colors.muted} />}
          label="Email"
          value={data.email}
          onPress={() => comingSoon("Changing email")}
        />
      )}

      <ProfileSectionLabel icon={<CreditCardIcon size={12} color={colors.muted} />} label="Subscription" />
      <View style={styles.planCard}>
        <Text style={styles.planTier}>Free plan</Text>
        <Text style={styles.planCaption}>No active subscription — everything in v1 is included.</Text>
      </View>

      <ProfileSectionLabel icon={<BellIcon size={12} color={colors.muted} />} label="Preferences" />
      <SettingsRow
        icon={<BellIcon size={16} color={colors.muted} />}
        label="Notification preferences"
        value="On"
        onPress={() => comingSoon("Notification preferences")}
      />
      <SettingsRow
        icon={<SettingsIcon size={16} color={colors.muted} />}
        label="Units"
        value={data?.unitPrefs === "metric" ? "Metric" : "Imperial"}
        onPress={() => comingSoon("Changing units")}
      />

      <ProfileSectionLabel icon={<HelpCircleIcon size={12} color={colors.muted} />} label="Support" />
      <SettingsRow
        icon={<HelpCircleIcon size={16} color={colors.muted} />}
        label="Help & Support"
        onPress={() => comingSoon("Help & Support")}
      />
      <SettingsRow
        icon={<SettingsIcon size={16} color={colors.muted} />}
        label="Terms & Privacy"
        onPress={() => comingSoon("Terms & Privacy")}
      />

      <Pressable style={styles.logoutBtn} onPress={confirmLogOut} disabled={loggingOut} hitSlop={8}>
        {loggingOut ? (
          <ActivityIndicator size="small" color="#F2503D" />
        ) : (
          <Text style={styles.logoutBtnText}>Log out</Text>
        )}
      </Pressable>

      <Text style={styles.profileFooter}>Mustle · v1.0.0</Text>
    </ScrollView>
  );
};

// ---------- Root drawer ----------

export const AppDrawer = ({ visible, onClose, onOpenCalendar, userId, onOpenHistoryEntry }: AppDrawerProps) => {
  const insets = useScreenInsets();
  const userName = useProfileName(userId);
  const { groups: historyGroups } = useMessageHistory();
  const today = useTodayCalendar();

  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<DrawerView>("index");
  const [detailView, setDetailView] = useState<Exclude<DrawerView, "index">>("history");

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const drawerTranslateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const stageAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setView("index");
      setDetailView("history");
      stageAnim.setValue(0);
      Animated.timing(backdropOpacity, { toValue: 1, duration: 220, easing: Easing.linear, useNativeDriver: true }).start();
      Animated.timing(drawerTranslateX, { toValue: 0, duration: 300, easing: ENTER_CURVE, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, easing: Easing.linear, useNativeDriver: true }).start();
      Animated.timing(drawerTranslateX, { toValue: -SCREEN_WIDTH, duration: 200, easing: EXIT_CURVE, useNativeDriver: true }).start(() => {
        setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const openDetail = (v: Exclude<DrawerView, "index">) => {
    setDetailView(v);
    setView(v);
    Animated.timing(stageAnim, { toValue: 1, duration: 300, easing: ENTER_CURVE, useNativeDriver: true }).start();
  };

  const backToIndex = () => {
    setView("index");
    Animated.timing(stageAnim, { toValue: 0, duration: 300, easing: ENTER_CURVE, useNativeDriver: true }).start();
  };

  const indexTranslateX = stageAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -SCREEN_WIDTH * 0.18] });
  const indexOpacity = stageAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const detailTranslateX = stageAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_WIDTH, 0] });
  const detailOpacity = stageAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const historyCount = historyGroups.reduce((n, g) => n + g.entries.length, 0);
  const lastEntry = historyGroups[0]?.entries[historyGroups[0].entries.length - 1];
  const historySummary = historyCount === 0 ? "No conversations yet" : `${historyCount} conversations · last one ${lastEntry ? relativeTime(lastEntry.at) : ""}`;
  const calendarSummary = `${today.completedWorkout?.focus ? titleCase(today.completedWorkout.focus) : today.session ? titleCase(today.session.focus) : "Training"} · today`;
  const profileSummary = userName ? `${userName} · Coached by MUSTLE` : "Coached by MUSTLE";

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent onRequestClose={view === "index" ? onClose : backToIndex}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <Animated.View
        style={[styles.drawer, { paddingTop: insets.top, transform: [{ translateX: drawerTranslateX }] }]}
      >
        <DrawerHeader
          view={view}
          historyMeta={view === "history" ? (historyCount > 0 ? `${historyCount} total` : undefined) : undefined}
          onBack={backToIndex}
          onClose={onClose}
        />

        <View style={styles.stage}>
          <Animated.View
            style={[styles.stageLayer, { transform: [{ translateX: indexTranslateX }], opacity: indexOpacity }]}
            pointerEvents={view === "index" ? "auto" : "none"}
          >
            <ScrollView contentContainerStyle={styles.indexBody}>
              <IndexRow title="Chat History" summary={historySummary} onPress={() => openDetail("history")} first />
              <IndexRow title="Calendar" summary={calendarSummary} onPress={() => openDetail("calendar")} />
              <IndexRow title="Profile" summary={profileSummary} onPress={() => openDetail("profile")} />
            </ScrollView>
          </Animated.View>

          <Animated.View
            style={[
              styles.stageLayer,
              styles.detailLayer,
              { transform: [{ translateX: detailTranslateX }], opacity: detailOpacity },
            ]}
            pointerEvents={view === "index" ? "none" : "auto"}
          >
            {detailView === "history" && (
              <HistoryDetail
                onOpenEntry={(id) => {
                  if (!onOpenHistoryEntry) return;
                  onClose();
                  onOpenHistoryEntry(id);
                }}
              />
            )}
            {detailView === "calendar" && (
              <CalendarDetail
                onOpenFullCalendar={() => {
                  onClose();
                  onOpenCalendar();
                }}
              />
            )}
            {detailView === "profile" && <ProfileDetail userId={userId} userName={userName ?? ""} />}
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerEyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 10.5,
    letterSpacing: 1.68,
    textTransform: "uppercase",
    color: colors.muted,
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
  backRow: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  headerTitle: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 1.2, color: colors.text },
  headerMeta: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted },

  stage: { flex: 1, overflow: "hidden" },
  stageLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  detailLayer: { backgroundColor: colors.bg },

  // Index
  indexBody: { paddingHorizontal: 20, paddingVertical: 24 },
  idxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 26,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  idxRowFirst: { borderTopWidth: 0, paddingTop: 12 },
  idxTitleGroup: { gap: 6 },
  idxTitle: { fontFamily: fonts.display, fontSize: 40, letterSpacing: 0.4, lineHeight: 40, color: colors.text },
  idxSub: { flexDirection: "row", alignItems: "center", gap: 7 },
  idxDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accent },
  idxSubText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },

  // History
  stickySearchBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  historyContent: { paddingBottom: 32 },

  hero: {
    marginHorizontal: 20,
    marginBottom: 4,
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(10,10,10,0.08)",
    borderRadius: 16,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  heroBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  heroEyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 9.5,
    letterSpacing: 1.33,
    textTransform: "uppercase",
    color: "rgba(10,10,10,0.45)",
  },
  heroTime: { marginLeft: "auto", fontFamily: fonts.bodySemiBold, fontSize: 10.5, color: "rgba(10,10,10,0.45)" },
  heroTitle: { marginTop: 10, fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.2, lineHeight: 22, color: "#0A0A0A" },
  heroTags: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9 },
  heroDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accent },
  heroTagsText: { fontFamily: fonts.bodySemiBold, fontSize: 10.5, color: "rgba(10,10,10,0.5)" },

  viewTabsRow: {
    flexDirection: "row",
    gap: 4,
    alignSelf: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
    padding: 3,
    marginTop: 14,
  },
  viewTab: { paddingVertical: 5, paddingHorizontal: 13, borderRadius: 100 },
  viewTabActive: { backgroundColor: colors.border },
  viewTabText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.muted },
  viewTabTextActive: { color: colors.text },

  tagFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tagFilterItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  tagFilterItemActive: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  tagFilterText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.muted },
  tagFilterTextActive: { color: colors.accent },

  topicHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  topicHeadTitle: { fontFamily: fonts.display, fontSize: 25, letterSpacing: 0.375, color: colors.text },
  topicHeadCount: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.muted },
  topicList: { paddingHorizontal: 20 },
  topicListFlat: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 14 },

  datePager: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 4 },
  datePagerBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePagerBtnDisabled: { opacity: 0.3 },
  datePagerLabel: { alignItems: "center", minWidth: 128 },
  datePagerDay: { fontFamily: fonts.display, fontSize: 18, letterSpacing: 0.54, color: colors.text },
  datePagerCount: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted },

  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: 10,
  },
  entryBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  entryBody: { flex: 1, minWidth: 0 },
  entryTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  entryTimeRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  entryTime: { fontFamily: fonts.body, fontSize: 10, color: colors.muted },

  emptyState: { alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 48 },
  emptyTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text, textAlign: "center" },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center" },

  // Calendar
  calendarContent: { paddingBottom: 32 },
  calHeroCard: {
    position: "relative",
    overflow: "hidden",
    marginHorizontal: 20,
    marginTop: 14,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
  },
  calHeroWatermark: { position: "absolute", right: -26, bottom: -30, opacity: 0.045 },
  calHeroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calHeroEyebrow: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.1, color: "rgba(10,10,10,0.45)" },
  calHeroIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  calHeroTitle: {
    marginTop: 10,
    fontFamily: fonts.display,
    fontSize: 36,
    letterSpacing: 0.72,
    lineHeight: 38,
    textTransform: "uppercase",
    color: "#0A0A0A",
  },
  calHeroDate: { marginTop: 4, fontFamily: fonts.body, fontSize: 13, color: "rgba(10,10,10,0.5)" },
  calHeroStatsRow: {
    flexDirection: "row",
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(10,10,10,0.1)",
  },
  calHeroStat: { flex: 1, gap: 2 },
  calHeroStatValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: "#0A0A0A" },
  calHeroStatLabel: { fontFamily: fonts.body, fontSize: 10.5, color: "rgba(10,10,10,0.45)" },
  calHeroStatDivider: { width: 1, height: 26, backgroundColor: "rgba(10,10,10,0.1)", marginHorizontal: 14 },
  calHeroStatBarTrack: { height: 3, borderRadius: 2, backgroundColor: "rgba(10,10,10,0.1)", marginTop: 6, overflow: "hidden" },
  calHeroStatBarFill: { height: "100%", borderRadius: 2, backgroundColor: colors.accent },

  calSubToggleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginTop: 16 },
  calSubToggle: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
    padding: 3,
  },
  calSubToggleBtn: { paddingVertical: 5, paddingHorizontal: 13, borderRadius: 100 },
  calSubToggleBtnActive: { backgroundColor: colors.border },
  calSubToggleText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.muted },
  calSubToggleTextActive: { color: colors.text },
  dayMonthWrap: { flexDirection: "row", justifyContent: "flex-end", gap: 2 },
  dayMonthBtn: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dayMonthBtnActive: { backgroundColor: colors.border },

  calMonthWrap: { marginHorizontal: 20, marginTop: 12, gap: 16, padding: 16, borderRadius: 20, backgroundColor: colors.surfaceDeep, borderWidth: 1, borderColor: colors.border },
  scheduledDay: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  markerFilled: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  markerHollow: { width: 4, height: 4, borderRadius: 2, borderWidth: 1, borderColor: colors.muted },

  calDayBody: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  calPlannedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calPlannedIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  calPlannedText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  calFactLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  calFactText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.text },

  calMealsList: { paddingHorizontal: 20, paddingTop: 8, gap: 8 },
  calMealsEmpty: { paddingHorizontal: 20, paddingTop: 12, fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  calMealRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  calMealIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceDeep },
  calMealDesc: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text },
  calMealMeta: { fontFamily: fonts.body, fontSize: 10.5, color: colors.muted, marginTop: 1 },

  // Profile
  profileBody: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
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
  avatarText: { fontFamily: fonts.display, fontSize: 18, color: colors.accent },
  profileName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  profileSub: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 },
  profileStat: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 100,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  profileStatText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.accent },
  profileSectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, marginTop: 4 },
  profileSectionLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", color: colors.muted },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  settingsRowIcon: { width: 16, alignItems: "center" },
  settingsRowLabel: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  settingsRowValue: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  nameEdit: { flexDirection: "row", alignItems: "center", gap: 8 },
  nameInput: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.text,
    textAlign: "right",
    minWidth: 80,
    paddingVertical: 2,
  },
  nameSaveBtn: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  nameSaveBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.accent },
  planCard: { padding: 14, borderRadius: 12, backgroundColor: colors.surfaceDeep, borderWidth: 1, borderColor: colors.border, gap: 4, marginBottom: 18 },
  planTier: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  planCaption: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  logoutBtn: {
    marginTop: 18,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: "#F2503D" },
  profileFooter: { marginTop: 14, fontFamily: fonts.bodyLight, fontSize: 12, color: colors.muted, textAlign: "center" },
});
