import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { buildPasswordResetRedirectUrl } from "../../lib/passwordRecovery";
import { colors, fonts } from "../../constants/theme";
import { BackIcon } from "../../icons/BackIcon";
import { MailCheckIcon } from "../../icons/MailCheckIcon";

interface ScreenForgotPasswordProps {
  onBack: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ported from mustle-mvp's ScreenForgotPassword.tsx/.module.css — same drift/fix pattern as
// ScreenLogin.tsx (see its header comment): a "RESET PASSWORD" top-bar title, a field label
// above the email input, the sent-state's circular lime mail-check badge and centered layout
// (the form step itself stays left-aligned — the source deliberately only centers the sent
// state), and the CTA/back-link button styles. The actual send (resetPasswordForEmail +
// redirectTo) and the "never reveal whether the email exists" behavior were already real
// beyond the mockup's simulated version and are unchanged here.
export const ScreenForgotPassword = ({ onBack }: ScreenForgotPasswordProps) => {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setFieldError("Enter a valid email address");
      return;
    }
    setFieldError(null);
    setSending(true);
    // redirectTo lands back in the app itself (App.tsx's Linking listener + ScreenSetNewPassword)
    // rather than a dead end — requires this exact URL added to Supabase Auth's redirect
    // allow-list, which needs an admin/Damion to add (Hakeem doesn't have Auth settings access).
    await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: buildPasswordResetRedirectUrl() });
    setSending(false);
    // Always moves to "sent" regardless of the result — doesn't reveal whether the email exists.
    setSent(true);
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>RESET PASSWORD</Text>
        </View>
        <View style={styles.sentBody}>
          <View style={styles.iconWrap}>
            <MailCheckIcon size={28} color={colors.accent} />
          </View>
          <Text style={styles.sentTitle}>Check your email</Text>
          <Text style={styles.sentSubtitle}>
            If an account exists for <Text style={styles.emailAccent}>{email.trim()}</Text>, a reset link is on its way.
          </Text>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.backLink}>Back to Log In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.topBarSide} onPress={onBack} hitSlop={8}>
          <BackIcon />
        </Pressable>
        <Text style={styles.topBarTitle}>RESET PASSWORD</Text>
        <View style={styles.topBarSide} />
      </View>

      <View style={styles.form}>
        <View style={styles.header}>
          <Text style={styles.title}>Forgot your password?</Text>
          <Text style={styles.subtitle}>Enter the email on your account and we'll send you a reset link.</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {fieldError && <Text style={styles.fieldError}>{fieldError}</Text>}
        </View>

        <Pressable style={styles.ctaBtn} onPress={handleSubmit} disabled={sending}>
          {sending ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.ctaBtnText}>SEND RESET LINK</Text>}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    minHeight: 44,
  },
  topBarSide: {
    width: 32,
  },
  topBarTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.3,
    color: colors.text,
    textAlign: "center",
  },
  form: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    gap: 24,
  },
  header: {},
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
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
  sentBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 60,
    gap: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(200,241,53,0.1)",
    marginBottom: 8,
  },
  sentTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
    marginTop: 4,
  },
  sentSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 260,
  },
  emailAccent: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
  },
  backLink: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
});
