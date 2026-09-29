import React, { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { ActiveWorkoutBanner } from "../components/ActiveWorkoutBanner";
import { AttachSheet } from "../components/AttachSheet";
import { ChatTranscript, type ChatTranscriptHandle } from "../components/ChatTranscript";
import { RecentChatsMenu } from "../components/RecentChatsMenu";
import { GLOBAL_CHAT_PROMPT_OPTIONS, QuickPromptChips } from "../components/QuickPromptChips";
import { SessionVoiceInputDock } from "../components/session-chat/SessionVoiceInputDock";
import { useHomeChat } from "../hooks/useHomeChat";
import { useConversations } from "../hooks/useConversations";
import { useKeyboardOpen } from "../hooks/useKeyboardOpen";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { useActiveSessionContext } from "../session/ActiveSessionContext";
import { useSharedVoiceSession } from "../session/VoiceSessionProvider";
import { colors, fonts } from "../constants/theme";
import { BackIcon } from "../icons/BackIcon";
import { HistoryIcon } from "../icons";
import { enterConversation, leaveConversation } from "../lib/conversations";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "GlobalChat">;

export const GlobalChatScreen = ({ route, navigation }: Props) => {
  const insets = useScreenInsets();
  const session = useActiveSessionContext();
  const userId = session.userId;
  const requestedConversationId = route.params?.conversationId ?? null;
  const {
    transcript, coachTyping, loaded, conversationId, sendMessage, appendLocal, keepConversationOpen, attachImage, attachFile,
  } = useHomeChat(userId, requestedConversationId);
  const { conversations, refetch: refetchConversations } = useConversations(userId, 11);
  const recentConversations = conversations.filter((c) => c.id !== conversationId).slice(0, 10);
  const [recentOpen, setRecentOpen] = useState(false);
  const {
    orbState, isActive, toggle, connect, release, status: voiceStatus, reconnecting,
    isMuted, toggleMute, setMessageHandler, setSessionConfig,
  } = useSharedVoiceSession();

  const [draft, setDraft] = useState("");
  const [inputMode, setInputMode] = useState<"mic" | "keyboard">(route.params?.initialMode ?? "keyboard");
  const [attachOpen, setAttachOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();

  const transcriptRef = useRef<ChatTranscriptHandle>(null);

  useFocusEffect(
    React.useCallback(() => {
      if (!requestedConversationId) return;
      void enterConversation(requestedConversationId);
      return () => {
        void leaveConversation();
      };
    }, [requestedConversationId]),
  );

  useFocusEffect(
    React.useCallback(() => {
      setMessageHandler(({ role, text }) => {
        if (role === "user") void keepConversationOpen();
        appendLocal(role === "user" ? "user" : "assistant", text);
      });
      setSessionConfig({
        userId,
        dynamicVariables: {
          user_name: session.userName ?? "there",
          user_id: userId ?? "",
          user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
    }, [userId, session.userName, appendLocal, keepConversationOpen, setMessageHandler, setSessionConfig]),
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

  // "Update with your coach" (Body/Profile) and similar entry points hand off straight into a
  // real turn instead of just opening an empty composer — feels like tapping a quick-prompt chip
  // that was already typed for you. Gated on `loaded` so this can't race the history fetch and
  // fire before the transcript (and today's day-boundary reset) has settled; the ref stops a
  // re-focus or param identity change from sending it twice.
  const autoSentRef = useRef(false);
  useEffect(() => {
    const message = route.params?.autoSendMessage;
    if (!message || autoSentRef.current || !loaded) return;
    autoSentRef.current = true;
    void sendMessage(message);
  }, [route.params?.autoSendMessage, loaded, sendMessage]);

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
        <View style={[styles.headerSide, styles.headerSideEnd]}>
          {recentConversations.length > 0 && (
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                refetchConversations();
                setRecentOpen(true);
              }}
              hitSlop={6}
            >
              <HistoryIcon size={16} color={colors.text} />
            </Pressable>
          )}
        </View>
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
        <QuickPromptChips onPick={handleQuickPrompt} options={GLOBAL_CHAT_PROMPT_OPTIONS} disabled={coachTyping} />
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

      <RecentChatsMenu
        open={recentOpen}
        conversations={recentConversations}
        onClose={() => setRecentOpen(false)}
        onPick={(id) => {
          setRecentOpen(false);
          navigation.setParams({ conversationId: id });
        }}
      />

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
  headerSideEnd: {
    alignItems: "flex-end",
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
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
