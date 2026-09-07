import { Fragment, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { colors, fonts } from "../constants/theme";
import type { BodyView } from "../lib/injuryZones";

export interface Zone {
  id: string;
  d: string;
  cx: number;
  cy: number;
}

// Path data ported verbatim from Vlad's BodyDiagram.tsx (viewBox 0 0 208 400) — pure SVG
// geometry, no design-system dependency, safe to reuse as-is.
export const FRONT_ZONES: Zone[] = [
  { id: "neck", d: "M92 52 C92 46 97 44 104 44 C111 44 116 46 116 52 L114 66 C112 68 104 70 94 66 Z", cx: 104, cy: 57 },
  { id: "shoulder-left", d: "M58 74 C48 72 38 78 36 88 C34 98 38 108 48 110 L60 102 C62 94 62 84 58 74 Z", cx: 46, cy: 92 },
  { id: "shoulder-right", d: "M150 74 C160 72 170 78 172 88 C174 98 170 108 160 110 L148 102 C146 94 146 84 150 74 Z", cx: 162, cy: 92 },
  { id: "chest", d: "M72 82 C72 76 80 72 104 72 C128 72 136 76 136 82 L134 130 C126 138 116 142 104 142 C92 142 82 138 74 130 Z", cx: 104, cy: 107 },
  { id: "core", d: "M82 142 C80 136 78 130 80 124 L128 124 C130 130 128 136 126 142 C120 156 88 156 82 142 Z", cx: 104, cy: 140 },
  { id: "hips", d: "M76 170 C72 164 72 156 78 154 L130 154 C136 156 136 164 132 170 C124 180 84 180 76 170 Z", cx: 104, cy: 167 },
  { id: "bicep-left", d: "M48 110 C42 108 36 112 36 120 L40 130 C44 134 52 132 56 126 L54 112 C52 110 50 110 48 110 Z", cx: 46, cy: 120 },
  { id: "bicep-right", d: "M160 110 C166 108 172 112 172 120 L168 130 C164 134 156 132 152 126 L154 112 C156 110 158 110 160 110 Z", cx: 162, cy: 120 },
  { id: "elbow-left", d: "M36 130 C34 126 34 122 36 120 L54 120 C56 122 56 126 54 130 C50 136 40 136 36 130 Z", cx: 45, cy: 128 },
  { id: "elbow-right", d: "M172 130 C174 126 174 122 172 120 L154 120 C152 122 152 126 154 130 C158 136 168 136 172 130 Z", cx: 163, cy: 128 },
  { id: "quad-left", d: "M80 188 C78 182 78 176 82 174 L100 174 C104 176 104 182 102 188 L100 250 C96 254 82 254 80 250 Z", cx: 91, cy: 212 },
  { id: "quad-right", d: "M126 188 C128 182 128 176 124 174 L106 174 C102 176 102 182 104 188 L106 250 C108 254 124 254 126 250 Z", cx: 117, cy: 212 },
  { id: "knee-left", d: "M78 268 C74 262 74 254 78 250 L98 250 C102 254 102 262 98 268 Z", cx: 88, cy: 259 },
  { id: "knee-right", d: "M110 268 C114 262 114 254 118 250 L130 250 C134 254 134 262 130 268 Z", cx: 120, cy: 259 },
  { id: "ankle-left", d: "M76 362 C74 358 74 352 76 350 L94 350 C96 352 96 358 94 362 Z", cx: 85, cy: 356 },
  { id: "ankle-right", d: "M114 362 C112 358 112 352 114 350 L132 350 C134 352 134 358 132 362 Z", cx: 123, cy: 356 },
  { id: "wrist-left", d: "M20 194 C16 190 16 184 20 182 L34 182 C38 184 38 190 34 194 Z", cx: 27, cy: 188 },
  { id: "wrist-right", d: "M174 194 C170 190 170 184 174 182 L188 182 C192 184 192 190 188 194 Z", cx: 181, cy: 188 },
];

export const BACK_ZONES: Zone[] = [
  { id: "neck", d: "M92 52 C92 46 97 44 104 44 C111 44 116 46 116 52 L114 66 C112 68 104 70 94 66 Z", cx: 104, cy: 57 },
  { id: "shoulder-left", d: "M58 74 C48 72 38 78 36 88 C34 98 38 108 48 110 L60 102 C62 94 62 84 58 74 Z", cx: 46, cy: 92 },
  { id: "shoulder-right", d: "M150 74 C160 72 170 78 172 88 C174 98 170 108 160 110 L148 102 C146 94 146 84 150 74 Z", cx: 162, cy: 92 },
  { id: "upper-back", d: "M72 82 C72 76 80 72 104 72 C128 72 136 76 136 82 L134 130 C126 138 116 142 104 142 C92 142 82 138 74 130 Z", cx: 104, cy: 107 },
  { id: "lower-back", d: "M82 142 C80 136 78 130 80 124 L128 124 C130 130 128 136 126 142 C120 156 88 156 82 142 Z", cx: 104, cy: 140 },
  { id: "glutes", d: "M76 170 C72 164 72 156 78 154 L130 154 C136 156 136 164 132 170 C124 180 84 180 76 170 Z", cx: 104, cy: 167 },
  { id: "tricep-left", d: "M48 110 C42 108 36 112 36 120 L40 130 C44 134 52 132 56 126 L54 112 C52 110 50 110 48 110 Z", cx: 46, cy: 120 },
  { id: "tricep-right", d: "M160 110 C166 108 172 112 172 120 L168 130 C164 134 156 132 152 126 L154 112 C156 110 158 110 160 110 Z", cx: 162, cy: 120 },
  { id: "elbow-left", d: "M36 130 C34 126 34 122 36 120 L54 120 C56 122 56 126 54 130 C50 136 40 136 36 130 Z", cx: 45, cy: 128 },
  { id: "elbow-right", d: "M172 130 C174 126 174 122 172 120 L154 120 C152 122 152 126 154 130 C158 136 168 136 172 130 Z", cx: 163, cy: 128 },
  { id: "hamstring-left", d: "M78 188 C76 182 76 176 80 174 L98 174 C102 176 102 182 100 188 L98 244 C94 248 82 248 80 244 Z", cx: 89, cy: 211 },
  { id: "hamstring-right", d: "M108 188 C110 182 110 176 112 174 L130 174 C134 176 132 182 130 188 L128 244 C126 248 114 248 108 244 Z", cx: 119, cy: 211 },
  { id: "knee-left", d: "M78 268 C74 262 74 254 78 250 L98 250 C102 254 102 262 98 268 Z", cx: 88, cy: 259 },
  { id: "knee-right", d: "M110 268 C114 262 114 254 118 250 L130 250 C134 254 134 262 130 268 Z", cx: 120, cy: 259 },
  { id: "calf-left", d: "M78 274 C76 268 76 262 80 260 L96 260 C100 262 100 268 98 274 L96 328 C92 334 82 334 80 328 Z", cx: 88, cy: 297 },
  { id: "calf-right", d: "M110 274 C112 268 112 262 116 260 L128 260 C132 262 130 268 128 274 L126 328 C124 334 114 334 112 328 Z", cx: 120, cy: 297 },
];

export interface FlaggedZone {
  zoneId: string;
  view: BodyView;
  label: string;
  note: string;
  createdAt: string;
}

interface BodyZoneMapProps {
  flagged: FlaggedZone[];
  onSelect: (zone: FlaggedZone) => void;
}

export function BodyZoneMap({ flagged, onSelect }: BodyZoneMapProps) {
  const [view, setView] = useState<BodyView>(flagged[0]?.view ?? "front");
  const zones = view === "front" ? FRONT_ZONES : BACK_ZONES;
  const flaggedByZoneId = new Map(flagged.map((f) => [f.zoneId, f]));

  return (
    <View style={styles.wrap}>
      <View style={styles.viewToggle}>
        <Pressable style={[styles.viewBtn, view === "front" && styles.viewBtnActive]} onPress={() => setView("front")}>
          <Text style={[styles.viewBtnText, view === "front" && styles.viewBtnTextActive]}>FRONT</Text>
        </Pressable>
        <Pressable style={[styles.viewBtn, view === "back" && styles.viewBtnActive]} onPress={() => setView("back")}>
          <Text style={[styles.viewBtnText, view === "back" && styles.viewBtnTextActive]}>BACK</Text>
        </Pressable>
      </View>

      <Svg viewBox="0 0 208 400" style={styles.svg}>
        <Ellipse cx={104} cy={26} rx={22} ry={24} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} fill="none" />
        <Path d="M94 50 L94 68 M114 50 L114 68" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} strokeLinecap="round" fill="none" />
        <Path d="M64 74 L60 172 L78 188 L104 194 L130 188 L148 172 L144 74" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} strokeLinejoin="round" fill="none" />
        <Path d="M64 74 L44 120 L26 178 L18 198" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeLinecap="round" fill="none" />
        <Path d="M144 74 L164 120 L182 178 L190 198" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeLinecap="round" fill="none" />
        <Path d="M82 190 L80 274 L84 348 L88 392" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeLinecap="round" fill="none" />
        <Path d="M126 190 L128 274 L124 348 L120 392" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeLinecap="round" fill="none" />

        {zones.map((zone) => {
          const flag = flaggedByZoneId.get(zone.id);
          return (
            <Fragment key={zone.id}>
              <Path
                d={zone.d}
                fill={flag ? "rgba(200,241,53,0.3)" : "rgba(255,255,255,0.05)"}
                stroke={flag ? "#C8F135" : "rgba(255,255,255,0.14)"}
                strokeWidth={flag ? 1.5 : 1}
                onPress={flag ? () => onSelect(flag) : undefined}
              />
              {flag && <Circle cx={zone.cx} cy={zone.cy} r={2.5} fill="#C8F135" opacity={0.95} />}
            </Fragment>
          );
        })}
      </Svg>

      {flagged.length === 0 && <Text style={styles.empty}>No flagged areas.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12 },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  viewBtn: { paddingVertical: 5, paddingHorizontal: 22, borderRadius: 5 },
  viewBtnActive: { backgroundColor: colors.accentDim },
  viewBtnText: {
    fontFamily: fonts.display,
    fontSize: 11,
    letterSpacing: 0.66,
    color: "rgba(255,255,255,0.3)",
  },
  viewBtnTextActive: { color: colors.accent },
  svg: { width: "48%", aspectRatio: 208 / 400 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
});
