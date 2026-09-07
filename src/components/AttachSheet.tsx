import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { CameraIcon, ImageIcon, PaperclipIcon, XIcon } from "../icons";

interface AttachSheetProps {
  open: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChooseLibrary: () => void;
  onChooseFile: () => void;
}

export function AttachSheet({ open, onClose, onTakePhoto, onChooseLibrary, onChooseFile }: AttachSheetProps) {
  const insets = useScreenInsets();

  const rows = [
    { label: "Take Photo", Icon: CameraIcon, onPress: onTakePhoto },
    { label: "Photo Library", Icon: ImageIcon, onPress: onChooseLibrary },
    { label: "Add Files", Icon: PaperclipIcon, onPress: onChooseFile },
  ];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]} onPress={(e) => e.stopPropagation()}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <XIcon size={15} color={colors.muted} />
          </Pressable>

          <Text style={styles.title}>ATTACH</Text>

          <View style={styles.rows}>
            {rows.map(({ label, Icon, onPress }) => (
              <Pressable
                key={label}
                style={styles.row}
                onPress={() => {
                  onClose();
                  onPress();
                }}
              >
                <View style={styles.rowIcon}>
                  <Icon size={18} color={colors.accentOn} />
                </View>
                <Text style={styles.rowLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(8,8,8,0.94)",
  },
  sheet: {
    paddingTop: 20,
    paddingHorizontal: 20,
    gap: 14,
  },
  closeBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.3)",
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  rowLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
});
