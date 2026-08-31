import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { signInWithApple, AppleSignInCancelledError } from "../../lib/appleAuth";
import { signInWithGoogle, GoogleSignInCancelledError } from "../../lib/googleAuth";
import { colors, fonts } from "../../constants/theme";
import { BackIcon } from "../../icons/BackIcon";
import { GoogleIcon } from "../../icons/GoogleIcon";

interface ScreenLoginProps {
  onBack: () => void;
  onForgotPassword: () => void;
}

type Step = "methods" | "email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ported from mustle-mvp's ScreenLogin.tsx/.module.css — a prior pass drifted from it in
// several visible ways: Google/Email rendered as differently-styled buttons (one plain, one
// lime-highlighted) instead of the source's identical plain bordered style for both, full pill
// radii (100) instead of the source's 10px used app-wide for this button shape, no header/
// subtitle on the methods step (should read "Welcome back." + a line under it, centered, both
// steps missing a "LOG IN" top-bar title), and the email step missing its field labels and the
// source's boxed form-error style. Apple's button is a custom one matching the other two here —
// not Apple's own AppleAuthenticationButton component, at the user's explicit direction, since
// its native rendering couldn't be made to match the bordered-pill style of its siblings. Kept
// within Apple's actual Sign-in-with-Apple guidelines regardless: the real Apple logo mark
// (Ionicons' logo-apple, not a lookalike) and one of Apple's approved button strings
// ("Continue with Apple") — the real signInWithApple() call underneath is unchanged.
//
// Signing in replaces the app's current anonymous session with the real one — App.tsx's
// onAuthStateChange listener picks that up automatically and re-checks onboarding status, which
// finds this account's existing profile and routes straight to Home, skipping profile capture
// entirely. No explicit navigation needed here beyond letting the sign-in call resolve.
export const ScreenLogin = ({ onBack, onForgotPassword }: ScreenLoginProps) => {
  const [step, setStep] = useState<Step>("methods");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [appleSubmitting, setAppleSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleGoogleTap = async () => {
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      // On success, App.tsx's auth listener takes it from here.
    } catch (err) {
      if (!(err instanceof GoogleSignInCancelledError)) {
        console.error("[login] Google sign-in failed:", err);
        Alert.alert("Log in failed", "Something went wrong connecting your Google account. Try again.");
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleApple = async () => {
    setAppleSubmitting(true);
    try {
      await signInWithApple();
      // On success, App.tsx's auth listener takes it from here.
    } catch (err) {
      if (!(err instanceof AppleSignInCancelledError)) {
        console.error("[login] Apple sign-in failed:", err);
        Alert.alert("Log in failed", "Something went wrong connecting your Apple ID. Try again.");
      }
    } finally {
      setAppleSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const errs: typeof fieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) errs.email = "Email is required";
    else if (!EMAIL_RE.test(trimmedEmail)) errs.email = "Enter a valid email address";
    if (!password) errs.password = "Password is required";
    setFieldErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    setSubmitting(false);

    if (error) {
      setFormError(
        /invalid login credentials/i.test(error.message)
          ? "Incorrect email or password."
          : error.message,
      );
    }
    // On success, App.tsx's auth listener takes it from here — nothing to navigate to manually.
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.topBarSide}
          onPress={step === "email" ? () => setStep("methods") : onBack}
          hitSlop={8}
        >
          <BackIcon />
        </Pressable>
        <Text style={styles.topBarTitle}>LOG IN</Text>
        <View style={styles.topBarSide} />
      </View>

      {step === "methods" ? (
        <View style={styles.methodsBody}>
          <View style={styles.header}>
            <Text style={styles.title}>Welcome back.</Text>
            <Text style={styles.subtitle}>Your profile is already trained. Log in to pick up where you left off.</Text>
          </View>

          <View style={styles.methods}>
            <Pressable style={styles.methodBtn} onPress={handleApple} disabled={appleSubmitting}>
              {appleSubmitting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={18} color={colors.text} />
                  <Text style={styles.methodBtnText}>Continue with Apple</Text>
                </>
              )}
            </Pressable>
            <Pressable style={styles.methodBtn} onPress={handleGoogleTap} disabled={googleSubmitting}>
              {googleSubmitting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <GoogleIcon size={18} />
                  <Text style={styles.methodBtnText}>Continue with Google</Text>
                </>
              )}
            </Pressable>
            <Pressable style={styles.methodBtn} onPress={() => setStep("email")}>
              <Text style={styles.methodIconMail}>@</Text>
              <Text style={styles.methodBtnText}>Continue with Email</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          <View style={styles.fields}>
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
              {fieldErrors.email && <Text style={styles.fieldError}>{fieldErrors.email}</Text>}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {fieldErrors.password && <Text style={styles.fieldError}>{fieldErrors.password}</Text>}
              <Pressable onPress={onForgotPassword} hitSlop={8} style={styles.forgotLink}>
                <Text style={styles.forgotLinkText}>Forgot Password?</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.formActions}>
            {formError && <Text style={styles.formError}>{formError}</Text>}
            <Pressable style={styles.ctaBtn} onPress={handleSubmit} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.ctaBtnText}>LOG IN</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
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
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.3,
    color: colors.text,
  },
  methodsBody: {
    flex: 1,
    justifyContent: "center",
    gap: 40,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 280,
  },
  methods: {
    gap: 12,
  },
  methodBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: colors.surface,
  },
  methodBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  methodIconMail: {
    width: 18,
    height: 18,
    textAlign: "center",
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
  },
  form: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  fields: {
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
  forgotLink: {
    alignSelf: "flex-end",
    marginTop: 8,
  },
  forgotLinkText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  formActions: {
    gap: 14,
    marginTop: 24,
  },
  formError: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: "#E05555",
    backgroundColor: "rgba(224,85,85,0.08)",
    borderWidth: 1,
    borderColor: "rgba(224,85,85,0.25)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
