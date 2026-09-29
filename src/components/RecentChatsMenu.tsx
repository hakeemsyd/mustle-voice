import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { HistoryIcon, XIcon } from "../icons";
import { fonts } from "../constants/theme";
import { conversationDateLabel, type ConversationSummary } from "../lib/conversations";

interface RecentChatsMenuProps {
  open: boolean;
  conversations: ConversationSummary[];
  onClose: () => void;
  onPick: (conversationId: string) => void;
}

export const RecentChatsMenu = ({ open, conversations, onClose, onPick }: RecentChatsMenuProps) => (
  <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.menu} onPress={() => undefined}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>LATEST 10 CONVERSATIONS</Text>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <XIcon size={14} color="#0A0A0A" />
          </Pressable>
        </View>
        <ScrollView style={styles.list} bounces={false}>
          {conversations.map((conversation, index) => (
            <Pressable
              key={conversation.id}
              style={({ pressed }) => [
                styles.row,
                index === conversations.length - 1 && styles.rowLast,
                pressed && styles.rowPressed,
              ]}
              onPress={() => onPick(conversation.id)}
            >
              <View style={styles.rowIcon}>
                <HistoryIcon size={13} color="#FFFFFF" />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {conversation.title}
                </Text>
                <Text style={styles.rowMeta}>{conversationDateLabel(conversation.at)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(8,8,8,0.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  menu: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 18 },
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(10,10,10,0.08)",
  },
  headerLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.72,
    color: "rgba(10,10,10,0.5)",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(10,10,10,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(10,10,10,0.08)",
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    backgroundColor: "rgba(10,10,10,0.06)",
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: "#0A0A0A",
  },
  rowMeta: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: "rgba(10,10,10,0.5)",
  },
});
