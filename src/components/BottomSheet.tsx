import React from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { XIcon } from '../icons';
import { useScreenInsets } from '../hooks/useScreenInsets';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** "half" ≈ 55% of screen height (default), "full" — for content-heavy sheets (e.g.
   *  Calendar's day detail) that need room for both a plan and a logged retrospective
   *  without a cramped, doubly-nested scroll area. Stops exactly at the status bar's own
   *  height, matching the reference's `calc(100% - 54px)` — not a flat 92%, which
   *  over/undershoots depending on device height. */
  heightVariant?: 'half' | 'full';
  children: React.ReactNode;
}

export const BottomSheet = ({ visible, onClose, heightVariant = 'half', children }: BottomSheetProps) => {
  const insets = useScreenInsets();
  const fullHeight = Dimensions.get('window').height - insets.top;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            heightVariant === 'full' ? { height: fullHeight } : styles.sheetHalf,
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <XIcon size={15} color={colors.muted} />
          </Pressable>
          <View style={[styles.content, heightVariant === 'full' && styles.contentFill]}>{children}</View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetHalf: { maxHeight: '55%' },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 2,
  },
  content: { paddingBottom: 32 },
  contentFill: { flex: 1 },
});
