import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { colors, fonts } from "../../constants/theme";

interface ScreenSetNewPasswordProps {
  /** Set once the recovery session is confirmed invalid/expired — shows a dead-end message
   *  instead of a form nothing can submit to. */
  linkError: string | null;
  onDone: () => void;
  onCancel: () => void;
}

const MIN_PASSWORD_LENGTH = 8;

// Reached only via a real password-reset email link (see App.tsx's Linking handler +
// src/lib/passwordRecovery.ts) — by the time this renders, supabase.auth.setSession() has
// already swapped in the recovery session for whichever account requested the reset, so
// updateUser() here lands on that same account. No design-repo counterpart exists for this
// screen (password reset wasn't in the mockup) — styled to match the now-corrected sibling auth
// screens' conventions (field labels, button radius/height, error colors) rather than a source.
export const ScreenSetNewPassword = ({ linkError, onDone, onCancel }: ScreenSetNewPasswordProps) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (confirmPassword !== password) {
      setFieldError("Passwords don't match");
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setFieldError(error.message);
      return;
    }
    onDone();
  };

  if (linkError) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>RESET PASSWORD</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Link expired</Text>
          <Text style={styles.subtitle}>{linkError}</Text>
        </View>
        <View style={styles.cta}>
          <Pressable style={styles.ctaBtn} onPress={onCancel}>
            <Text style={styles.ctaBtnText}>BACK TO LOG IN</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>RESET PASSWORD</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Set a new password.</Text>
        <Text style={styles.subtitle}>Choose something you haven't used before.</Text>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>
          {fieldError && <Text style={styles.fieldError}>{fieldError}</Text>}
        </View>
      </View>

      <View style={styles.cta}>
        <Pressable style={styles.ctaBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.ctaBtnText}>SAVE PASSWORD</Text>}
        </Pressable>
        <Pressable onPress={onCancel} hitSlop={8} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
  },
  topBar: {
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: "center",
  },
  topBarTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.3,
    color: colors.text,
    textAlign: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
  },
  form: {
    marginTop: 24,
    gap: 18,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: fonts.display,
    fontSize: 13,
    letterSpacing: 0.8,
    color: colors.muted,
  },
  input: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  fieldError: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#E05555",
  },
  cta: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
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
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  cancelText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
});
