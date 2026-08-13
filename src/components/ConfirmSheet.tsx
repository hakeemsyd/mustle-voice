import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import { useScreenInsets } from "../hooks/useScreenInsets";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const insets = useScreenInsets();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <Pressable
            style={[styles.confirmBtn, destructive && styles.confirmBtnDestructive]}
            onPress={onConfirm}
          >
            <Text style={[styles.confirmText, destructive && styles.confirmTextDestructive]}>
              {confirmLabel}
            </Text>
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 10,
  },
  handleWrap: {
    alignItems: "center",
    paddingBottom: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 0.4,
    color: colors.text,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.muted,
    marginBottom: 6,
  },
  confirmBtn: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  confirmBtnDestructive: {
    backgroundColor: "rgba(255,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,68,68,0.4)",
  },
  confirmText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accentOn,
  },
  confirmTextDestructive: {
    color: colors.danger,
  },
  cancelBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.muted,
  },
});
