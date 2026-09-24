import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../constants/theme';

export function ScreenPlaceholder({
  title,
  subtitle,
  eyebrow,
  dimTitle,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  dimTitle?: boolean;
}) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.center}>
        {eyebrow ? (
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        ) : (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>IN BUILD</Text>
          </View>
        )}
        <Text style={[styles.title, dimTitle && styles.titleDim]}>{title}</Text>
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
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, color: colors.accent },
  title: { fontFamily: fonts.display, fontSize: 40, letterSpacing: 1, color: colors.text, textAlign: 'center' },
  titleDim: { color: 'rgba(255,255,255,0.25)' },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 300,
  },
});
