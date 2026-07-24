import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../constants/theme';

export function ScreenPlaceholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>IN BUILD</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
  },
  badgeText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, color: colors.accent },
  title: { fontFamily: fonts.display, fontSize: 40, letterSpacing: 1, color: colors.text, textAlign: 'center' },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 300,
  },
});
