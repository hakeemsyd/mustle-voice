import { useFonts } from 'expo-font';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
} from '@expo-google-fonts/dm-sans';
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    BebasNeue_400Regular,
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
    // Preloaded so the custom Apple/Google button and mic/keyboard-toggle glyphs never show a
    // blank glyph on first render — @expo/vector-icons otherwise lazy-loads its font the first
    // time it's used.
    ...Ionicons.font,
    ...MaterialIcons.font,
  });
  return loaded;
}
