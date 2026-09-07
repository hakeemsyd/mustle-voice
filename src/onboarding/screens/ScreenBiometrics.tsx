import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ProgressDots } from "../ProgressDots";
import { WheelPicker } from "../../components/WheelPicker";
import { fonts, colors } from "../../constants/theme";
import { BackIcon } from "../../icons/BackIcon";
import { useScreenInsets } from "../../hooks/useScreenInsets";

type Units = "metric" | "imperial";

interface ScreenBiometricsProps {
  onNext: (height: string, weight: string, units: Units) => void;
  onBack: () => void;
}

const CM_MIN = 120;
const CM_MAX = 220;
const KG_MIN = 30;
const KG_MAX = 180;
const FEET_MIN = 3;
const FEET_MAX = 7;
const INCHES_MIN = 0;
const INCHES_MAX = 11;
const LBS_MIN = 70;
const LBS_MAX = 400;
// A dedicated top row instead of extending the range indefinitely — a rare >400lbs
// answer gets clarified as an exact number later, through conversation with the coach.
// Imperial only: kg's 180 max already sits right at that boundary.
const LBS_PLUS = LBS_MAX + 1;

const DEFAULT_CM = 180;
const DEFAULT_KG = 80;

function toFeetInches(cm: number) {
  const totalInches = Math.round(cm / 2.54);
  return {
    feet: Math.min(FEET_MAX, Math.max(FEET_MIN, Math.floor(totalInches / 12))),
    inches: totalInches % 12,
  };
}
const toCm = (feet: number, inches: number) =>
  Math.round((feet * 12 + inches) * 2.54);
const toLbs = (kg: number) => Math.round(kg / 0.453592);
const toKg = (lbs: number) => Math.round(lbs * 0.453592);

// Wheel-based, not free text/voice — removes the unit-parsing ambiguity entirely
// (confirmed live: a plain typed number defaulted to inches, producing "457.2 cm"
// for someone who meant 180). Height/weight are stored canonically in cm/kg
// regardless of the displayed unit, so toggling converts the current value
// instead of resetting it.
export const ScreenBiometrics = ({ onNext, onBack }: ScreenBiometricsProps) => {
  const [units, setUnits] = useState<Units>("imperial");
  const [cm, setCm] = useState(DEFAULT_CM);
  const [kg, setKg] = useState(DEFAULT_KG);
  const [weightAtCap, setWeightAtCap] = useState(false);

  const { feet, inches } = toFeetInches(cm);
  const lbs = toLbs(kg);

  const buildAnswer = (): [height: string, weight: string] =>
    units === "imperial"
      ? [`${feet}'${inches}`, weightAtCap ? "400+" : `${lbs}`]
      : [`${cm}`, `${kg}`];

  const handleContinue = () => {
    const [height, weight] = buildAnswer();
    onNext(height, weight, units);
  };

  const insets = useScreenInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBarSpacer}
          activeOpacity={0.7}
          onPress={onBack}
        >
          <BackIcon />
        </TouchableOpacity>

        <ProgressDots total={11} current={7} />

        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>YOUR BODY</Text>
        <Text style={styles.title}>Height & weight?</Text>
        <Text style={styles.subtitle}>
          Rough numbers are fine — you can update this anytime.
        </Text>

        <View style={styles.unitToggle}>
          <Pressable
            style={[
              styles.unitBtn,
              units === "imperial" && styles.unitBtnActive,
            ]}
            onPress={() => setUnits("imperial")}
          >
            <Text
              style={[
                styles.unitBtnText,
                units === "imperial" && styles.unitBtnTextActive,
              ]}
            >
              Imperial
            </Text>
          </Pressable>
          <Pressable
            style={[styles.unitBtn, units === "metric" && styles.unitBtnActive]}
            onPress={() => setUnits("metric")}
          >
            <Text
              style={[
                styles.unitBtnText,
                units === "metric" && styles.unitBtnTextActive,
              ]}
            >
              Metric
            </Text>
          </Pressable>
        </View>

        <View style={styles.wheelsRow}>
          <View style={styles.wheelGroup}>
            <Text style={styles.wheelGroupLabel}>HEIGHT</Text>
            {units === "imperial" ? (
              <View style={styles.heightWheels}>
                <View style={styles.wheelBox}>
                  <WheelPicker
                    min={FEET_MIN}
                    max={FEET_MAX}
                    value={feet}
                    onChange={(f) => setCm(toCm(f, inches))}
                    formatLabel={(n) => `${n}'`}
                    accessibilityLabel="Height — feet"
                  />
                </View>
                <View style={styles.wheelBox}>
                  <WheelPicker
                    min={INCHES_MIN}
                    max={INCHES_MAX}
                    value={inches}
                    onChange={(i) => setCm(toCm(feet, i))}
                    formatLabel={(n) => `${n}"`}
                    accessibilityLabel="Height — inches"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.wheelBox}>
                <WheelPicker
                  min={CM_MIN}
                  max={CM_MAX}
                  value={cm}
                  onChange={setCm}
                  accessibilityLabel="Height in centimeters"
                />
              </View>
            )}
            <Text style={styles.wheelSuffix}>
              {units === "imperial" ? "FT / IN" : "CM"}
            </Text>
          </View>

          <View style={styles.wheelGroup}>
            <Text style={styles.wheelGroupLabel}>WEIGHT</Text>
            <View style={styles.wheelBox}>
              {units === "imperial" ? (
                <WheelPicker
                  min={LBS_MIN}
                  max={LBS_PLUS}
                  value={weightAtCap ? LBS_PLUS : lbs}
                  onChange={(l) => {
                    if (l === LBS_PLUS) {
                      setWeightAtCap(true);
                    } else {
                      setWeightAtCap(false);
                      setKg(toKg(l));
                    }
                  }}
                  formatLabel={(n) => (n === LBS_PLUS ? "400+" : String(n))}
                  accessibilityLabel="Weight in pounds"
                />
              ) : (
                <WheelPicker
                  min={KG_MIN}
                  max={KG_MAX}
                  value={kg}
                  onChange={(k) => {
                    setWeightAtCap(false);
                    setKg(k);
                  }}
                  accessibilityLabel="Weight in kilograms"
                />
              )}
            </View>
            <Text style={styles.wheelSuffix} pointerEvents="none">
              {units === "imperial" ? "LBS" : "KG"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.cta, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}>
        <TouchableOpacity
          style={styles.ctaBtn}
          activeOpacity={0.85}
          onPress={handleContinue}
        >
          <Text style={styles.ctaBtnText}>CONTINUE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  topBarSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 13,
    letterSpacing: 1.2,
    color: "rgba(200,241,53,0.65)",
  },
  title: {
    marginTop: 20,
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 38,
    color: colors.text,
  },
  subtitle: {
    marginTop: 14,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  unitToggle: {
    flexDirection: "row",
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 24,
    alignSelf: "center",
  },
  unitBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  unitBtnActive: {
    backgroundColor: "#1A1A1A",
  },
  unitBtnText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: "#888888",
  },
  unitBtnTextActive: {
    color: colors.text,
  },
  // flex:1 + centered, not a fixed marginTop under the toggle — matches the source's
  // actual layout shape, centering the wheel group in whatever space is left above the CTA.
  wheelsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  wheelGroup: {
    alignItems: "center",
  },
  wheelGroupLabel: {
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.35)",
    marginBottom: 8,
    position: "absolute",
    top: 38,
    zIndex: 10000,
  },
  heightWheels: {
    flexDirection: "row",
    gap: 6,
  },
  wheelBox: {
    width: 88,
  },
  wheelSuffix: {
    marginTop: 10,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.muted,
  },
  cta: {
    paddingHorizontal: 24,
  },
  ctaBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.7,
    color: colors.bg,
  },
});
