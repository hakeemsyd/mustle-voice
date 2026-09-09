import React, { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { ActiveWorkoutBanner } from "../components/ActiveWorkoutBanner";
import { AttachSheet } from "../components/AttachSheet";
import { ChatTranscript, type ChatTranscriptHandle } from "../components/ChatTranscript";
import { GLOBAL_CHAT_PROMPT_OPTIONS, QuickPromptChips } from "../components/QuickPromptChips";
import { SessionVoiceInputDock } from "../components/session-chat/SessionVoiceInputDock";
import { useHomeChat } from "../hooks/useHomeChat";
import { useKeyboardOpen } from "../hooks/useKeyboardOpen";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { useActiveSessionContext } from "../session/ActiveSessionContext";
import { useSharedVoiceSession } from "../session/VoiceSessionProvider";
import { colors, fonts } from "../constants/theme";
import { BackIcon } from "../icons/BackIcon";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "GlobalChat">;

export const GlobalChatScreen = ({ route, navigation }: Props) => {
  const insets = useScreenInsets();
  const session = useActiveSessionContext();
  const userId = session.userId;
  const { transcript, coachTyping, sendMessage, appendLocal, loadMessageContext, attachImage, attachFile } =
    useHomeChat(userId);
  const {
    orbState, isActive, toggle, connect, release, status: voiceStatus, reconnecting,
    isMuted, toggleMute, setMessageHandler, setSessionConfig,
  } = useSharedVoiceSession();

  const [draft, setDraft] = useState("");
  const [inputMode, setInputMode] = useState<"mic" | "keyboard">(route.params?.initialMode ?? "keyboard");
  const [attachOpen, setAttachOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();

  const transcriptRef = useRef<ChatTranscriptHandle>(null);
  const jumpedRef = useRef(false);

  useFocusEffect(
    React.useCallback(() => {
      setMessageHandler(({ role, text }) => appendLocal(role === "user" ? "user" : "assistant", text));
      setSessionConfig({
        userId,
        dynamicVariables: {
          user_name: session.userName ?? "there",
          user_id: userId ?? "",
          user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
    }, [userId, session.userName, appendLocal, setMessageHandler, setSessionConfig]),
  );

  // Mic open whenever this screen is focused in mic mode, released when it isn't — replaces a
  // one-shot "start once on mount" effect that left the connection to be managed by hand from
  // then on.
  useFocusEffect(
    React.useCallback(() => {
      if (inputMode === "mic") connect();
      return release;
    }, [inputMode, connect, release]),
  );

  useEffect(() => {
    const target = route.params?.jumpToMessageId;
    if (!target || jumpedRef.current) return;
    jumpedRef.current = true;
    (async () => {
      const found = await loadMessageContext(target);
      if (!found) return;
      setTimeout(() => transcriptRef.current?.scrollToMessageId(target), 150);
    })();
  }, [route.params?.jumpToMessageId, loadMessageContext]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    Keyboard.dismiss();
    void sendMessage(text);
  };

  const handleQuickPrompt = (phrase: string) => {
    Keyboard.dismiss();
    void sendMessage(phrase);
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    void attachImage(asset.uri);
  };

  const handleChooseLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    void attachImage(asset.uri);
  };

  const handleChooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*" });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    void attachFile(asset.uri, asset.name);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerSide}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <BackIcon size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
        <Text style={styles.headerTitle}>MUSTLE COACH</Text>
        <View style={styles.headerSide} />
      </View>

      <ActiveWorkoutBanner />

      {/* Lifts the thread and dock above the keyboard instead of letting it cover the newest
          messages. The chips hide while typing — they'd otherwise sit between the message being
          replied to and the composer. */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ChatTranscript
        ref={transcriptRef}
        messages={transcript}
        coachTyping={coachTyping}
        onStartDay={(planSessionId) => navigation.navigate("PreWorkoutPreview", { planSessionId })}
        onModifyPlan={() => setDraft("I'd like to change ")}
        onOpenPreview={(planSessionId) => navigation.navigate("PreWorkoutPreview", { planSessionId })}
      />

      {!isActive && !keyboardOpen && (
        <QuickPromptChips onPick={handleQuickPrompt} options={GLOBAL_CHAT_PROMPT_OPTIONS} />
      )}

      <View style={[styles.dock, { paddingBottom: insets.bottom + 52 }]}>
        <SessionVoiceInputDock
          value={draft}
          onChangeText={setDraft}
          onSend={handleSend}
          mode={inputMode}
          onModeChange={setInputMode}
          isVoiceActive={isActive}
          onToggleVoice={toggle}
          orbState={orbState}
          voiceStatus={voiceStatus}
          reconnecting={reconnecting}
          onAttachTap={() => setAttachOpen(true)}
          muted={isMuted}
          onToggleMute={toggleMute}
        />
      </View>
      </KeyboardAvoidingView>

      <AttachSheet
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onTakePhoto={handleTakePhoto}
        onChooseLibrary={handleChooseLibrary}
        onChooseFile={handleChooseFile}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // This is the same dark chat surface as Session Preview and Active Session, not a light
  // variant of it — one product surface, reached from three places.
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerSide: {
    width: 74,
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.muted,
  },
  // No top border here, unlike Session Preview's dock — the quick-prompt chips sit directly
  // above it and a rule between the two reads as a seam.
  dock: {
    paddingTop: 10,
    paddingHorizontal: 20,
  },
});
