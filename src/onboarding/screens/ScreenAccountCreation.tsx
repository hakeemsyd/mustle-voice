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
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";
import { isIdentityAlreadyLinkedError } from "../../lib/authErrors";
import {
  linkAppleToCurrentUser,
  signInWithApple,
  AppleSignInCancelledError,
} from "../../lib/appleAuth";
import {
  linkGoogleToCurrentUser,
  signInWithGoogle,
  GoogleSignInCancelledError,
} from "../../lib/googleAuth";
import { colors, fonts } from "../../constants/theme";
import { BackIcon } from "../../icons/BackIcon";
import { GoogleIcon } from "../../icons/GoogleIcon";
import { MailCheckIcon } from "../../icons/MailCheckIcon";
import {
  savePendingEmailConfirmation,
  clearPendingEmailConfirmation,
} from "../../lib/pendingEmailConfirmation";

interface ScreenAccountCreationProps {
  onSuccess: () => void;
  onBack: () => void;
  /** Set when the app was closed while a previous email signup was still waiting on
   *  confirmation (see pendingEmailConfirmation.ts) — resumes straight into the "check your
   *  email" screen instead of restarting account creation, which would resubmit the same
   *  email/password and fail ("New password should be different from the old password"). */
  resumeEmail?: string;
}

type Step = "methods" | "email" | "confirmSent";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Ported from mustle-mvp's ScreenAccountCreation.tsx/.module.css — same drift/fix pattern as
// ScreenLogin.tsx (see its header comment): uniform plain-bordered Google/Email buttons instead
// of one being lime-highlighted, 10px button radius instead of full pills, centered header +
// "CREATE ACCOUNT" top-bar title, field labels + boxed form-error on the email step, and the
// "Account creation is required to start training" note restored under the methods list. Apple
// is a custom button matching Google/Email here, not Apple's own AppleAuthenticationButton —
// see ScreenLogin.tsx's comment on why and how it stays within Apple's actual guidelines anyway.
//
// Reached only from Summary's "CREATE ACCOUNT", once the user has been through the full
// onboarding data-capture flow. Upgrades the existing anonymous session in place
// (supabase.auth.updateUser) rather than creating a separate account — same user_id, so the
// profile/plan/history captured through onboarding is already attached, no separate linking
// step needed. Confirmed live: this project has "confirm email" enabled and no access to change
// it, so the account is usable immediately on this device but the email itself is pending
// confirmation until the user clicks the link — surfaced here, not silently skipped.
export const ScreenAccountCreation = ({
  onSuccess,
  onBack,
  resumeEmail,
}: ScreenAccountCreationProps) => {
  const [step, setStep] = useState<Step>(resumeEmail ? "confirmSent" : "methods");
  const [email, setEmail] = useState(resumeEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [appleSubmitting, setAppleSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // A prior install/rebuild can leave an orphaned anonymous account already linked to this same
  // Google/Apple identity (see the anonymous-identity-instability history this project has hit
  // before) — linking it again here always fails identically, since it really is already used.
  // The only real recovery is signing into that existing account instead, which is what this
  // offers rather than a dead-end "try again" that can never succeed.
  const offerExistingAccountSignIn = (
    provider: "Google" | "Apple",
    signIn: () => Promise<void>,
  ) => {
    Alert.alert(
      "Account already exists",
      `You've already used this ${provider} account with MUSTLE before. Sign in to that account instead? ` +
        "Anything you just entered in this setup won't be attached to it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign In",
          onPress: async () => {
            try {
              await signIn();
              clearPendingEmailConfirmation();
              onSuccess();
            } catch (err) {
              console.error(`[account creation] ${provider} recovery sign-in failed:`, err);
              Alert.alert("Sign in failed", `Something went wrong signing into your ${provider} account.`);
            }
          },
        },
      ],
    );
  };

  const handleGoogleTap = async () => {
    setGoogleSubmitting(true);
    try {
      await linkGoogleToCurrentUser();
      clearPendingEmailConfirmation();
      onSuccess();
    } catch (err) {
      if (err instanceof GoogleSignInCancelledError) {
        // no-op
      } else if (isIdentityAlreadyLinkedError(err)) {
        offerExistingAccountSignIn("Google", signInWithGoogle);
      } else {
        console.error("[account creation] Google sign-up failed:", err);
        Alert.alert(
          "Sign up failed",
          "Something went wrong connecting your Google account. Try again.",
        );
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleApple = async () => {
    setAppleSubmitting(true);
    try {
      await linkAppleToCurrentUser();
      clearPendingEmailConfirmation();
      onSuccess();
    } catch (err) {
      if (err instanceof AppleSignInCancelledError) {
        // no-op
      } else if (isIdentityAlreadyLinkedError(err)) {
        offerExistingAccountSignIn("Apple", signInWithApple);
      } else {
        console.error("[account creation] Apple sign-up failed:", err);
        Alert.alert(
          "Sign up failed",
          "Something went wrong connecting your Apple ID. Try again.",
        );
      }
    } finally {
      setAppleSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const errs: typeof fieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) errs.email = "Email is required";
    else if (!EMAIL_RE.test(trimmedEmail))
      errs.email = "Enter a valid email address";
    if (!password) errs.password = "Password is required";
    else if (password.length < MIN_PASSWORD_LENGTH)
      errs.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    if (!confirmPassword) errs.confirmPassword = "Confirm your password";
    else if (confirmPassword !== password)
      errs.confirmPassword = "Passwords don't match";
    setFieldErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser(
      { email: trimmedEmail, password },
      { emailRedirectTo: Linking.createURL("email-confirmed") },
    );
    setSubmitting(false);

    if (error) {
      setFormError(
        /already registered|already exists/i.test(error.message)
          ? "An account with this email already exists."
          : error.message,
      );
      return;
    }

    await savePendingEmailConfirmation(trimmedEmail);
    setStep("confirmSent");
  };

  const handleConfirmSentContinue = () => {
    clearPendingEmailConfirmation();
    onSuccess();
  };

  if (step === "confirmSent") {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>CREATE ACCOUNT</Text>
        </View>
        <View style={styles.sentBody}>
          <View style={styles.iconWrap}>
            <MailCheckIcon size={28} color={colors.accent} />
          </View>
          <Text style={styles.sentTitle}>Check your email</Text>
          <Text style={styles.sentSubtitle}>
            We sent a confirmation link to{" "}
            <Text style={styles.emailAccent}>{email.trim()}</Text>. You can keep
            training right away — just confirm when you get a chance to fully
            secure your account.
          </Text>
        </View>
        <View style={styles.cta}>
          <Pressable style={styles.ctaBtn} onPress={handleConfirmSentContinue}>
            <Text style={styles.ctaBtnText}>CONTINUE</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.topBarSide}
          onPress={step === "email" ? () => setStep("methods") : onBack}
          hitSlop={8}
        >
          <BackIcon />
        </Pressable>
        <Text style={styles.topBarTitle}>CREATE ACCOUNT</Text>
        <View style={styles.topBarSide} />
      </View>

      {step === "methods" ? (
        <View style={styles.methodsBody}>
          <View style={styles.header}>
            <Text style={styles.title}>Save your plan.</Text>
            <Text style={styles.subtitle}>
              One more step — create an account so your coach and progress are
              never lost.
            </Text>
          </View>

          <View style={styles.methods}>
            <Pressable
              style={styles.methodBtn}
              onPress={handleApple}
              disabled={appleSubmitting}
            >
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
            <Pressable
              style={styles.methodBtn}
              onPress={() => setStep("email")}
            >
              <Text style={styles.methodIconMail}>@</Text>
              <Text style={styles.methodBtnText}>Continue with Email</Text>
            </Pressable>
          </View>

          <Text style={styles.noSkipNote}>
            Account creation is required to start training.
          </Text>
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
              {fieldErrors.email && (
                <Text style={styles.fieldError}>{fieldErrors.email}</Text>
              )}
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {fieldErrors.password && (
                <Text style={styles.fieldError}>{fieldErrors.password}</Text>
              )}
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
              {fieldErrors.confirmPassword && (
                <Text style={styles.fieldError}>
                  {fieldErrors.confirmPassword}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.formActions}>
            {formError && <Text style={styles.formError}>{formError}</Text>}
            <Pressable
              style={styles.ctaBtn}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.ctaBtnText}>CREATE ACCOUNT</Text>
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
    maxWidth: 280,
  },
  emailAccent: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
  },
  methodsBody: {
    flex: 1,
    justifyContent: "center",
    gap: 32,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
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
  noSkipNote: {
    textAlign: "center",
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#555555",
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
  cta: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
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
