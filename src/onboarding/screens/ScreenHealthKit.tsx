import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { ProgressDots } from "../ProgressDots";
import { BackIcon } from "../../icons/BackIcon";
import { colors, fonts } from "../../constants/theme";

interface ScreenHealthKitProps {
  onNext: (connected: boolean) => void;
  onBack: () => void;
}

const DATA_POINTS = [
  { icon: "🏋️", label: "Workouts", desc: "Auto-log every session to Apple Health" },
  { icon: "❤️", label: "Heart Rate", desc: "Track effort and recovery in real time" },
  { icon: "⚖️", label: "Body Data", desc: "Sync weight, body fat & measurements" },
  { icon: "😴", label: "Sleep", desc: "Optimise training load around your rest" },
  { icon: "👣", label: "Activity", desc: "Steps and movement on your rest days" },
];

export const ScreenHealthKit = ({ onNext, onBack }: ScreenHealthKitProps) => {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = () => {
    setConnecting(true);
    setTimeout(() => onNext(true), 900);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={12}>
          <BackIcon />
        </Pressable>

        <ProgressDots total={13} current={11} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <View style={styles.iconRing}>
            <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
              <Path
                d="M20 35 C20 35 6 26 6 15.5 C6 10.8 9.7 7 14.3 7 C17 7 19.5 8.4 20 10 C20.5 8.4 23 7 25.7 7 C30.3 7 34 10.8 34 15.5 C34 26 20 35 20 35Z"
                fill="rgba(255,255,255,0.15)"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={1.5}
              />
            </Svg>
          </View>
        </View>

        <View style={styles.headline}>
          <Text style={styles.eyebrow}>STEP 11 OF 13</Text>
          <Text style={styles.title}>SYNC WITH{"\n"}APPLE HEALTH</Text>
          <Text style={styles.subtitle}>
            One connection. Your data, where it already lives.
          </Text>
        </View>

        <View style={styles.dataList}>
          {DATA_POINTS.map((item) => (
            <View key={item.label} style={styles.dataRow}>
              <Text style={styles.dataIcon}>{item.icon}</Text>
              <View style={styles.dataText}>
                <Text style={styles.dataLabel}>{item.label}</Text>
                <Text style={styles.dataDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.cta}>
        <Pressable
          style={[styles.btnConnect, connecting && styles.btnConnecting]}
          onPress={handleConnect}
          disabled={connecting}
        >
          <Text style={styles.btnConnectText}>
            {connecting ? "CONNECTING…" : "CONNECT APPLE HEALTH"}
          </Text>
        </Pressable>

        <Pressable onPress={() => onNext(false)} disabled={connecting}>
          <Text style={styles.btnSkip}>Skip for now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },

  iconWrap: {
    marginBottom: 24,
  },

  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  headline: {
    marginBottom: 28,
  },

  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 11,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.3)",
    marginBottom: 8,
  },

  title: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 44,
    color: colors.text,
    marginBottom: 12,
  },

  subtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(255,255,255,0.45)",
  },

  dataList: {
    gap: 2,
  },

  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  dataIcon: {
    fontSize: 18,
    width: 28,
    textAlign: "center",
  },

  dataText: {
    gap: 2,
  },

  dataLabel: {
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.text,
  },

  dataDesc: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.35)",
  },

  cta: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 12,
  },

  btnConnect: {
    width: "100%",
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  btnConnecting: {
    backgroundColor: "rgba(200,241,53,0.5)",
  },

  btnConnectText: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.7,
    color: colors.accentOn,
  },

  btnSkip: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    padding: 8,
  },
});
