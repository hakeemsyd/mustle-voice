import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingCoachButton } from '../components/FloatingCoachButton';
import { HomeScreen } from '../screens/HomeScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { BodyScreen } from '../screens/BodyScreen';
import { FuelScreen } from '../screens/FuelScreen';
import { RecoveryScreen } from '../screens/RecoveryScreen';
import { colors, fonts } from '../constants/theme';
import { AppleIcon, HouseIcon, MoonIcon, PersonStandingIcon, TrendingUpIcon } from '../icons';
import { navigateFromAppAction } from './navigationRef';

const Tab = createBottomTabNavigator();

// Matches mustle-mvp's AppNav (5 flat tabs, no FAB — see HomeScreenV2's showFab={false}).
// Icons are the exact lucide icons AppNav uses (House/TrendingUp/PersonStanding/Apple/Moon),
// vendored in src/icons rather than pulling in the whole icon library.
const ICONS = {
  Home: HouseIcon,
  Stats: TrendingUpIcon,
  Body: PersonStandingIcon,
  Fuel: AppleIcon,
  Recovery: MoonIcon,
} as const;

// Screens the coach FAB appears on — matches the design's IN_SCOPE_SCREENS (everything except
// Home, which already has its own orb as the coach entry point).
const FAB_SCREENS = new Set(['Stats', 'Body', 'Fuel', 'Recovery']);

export function RootNavigator() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + insets.bottom;
  const [activeTab, setActiveTab] = useState('Home');

  return (
    <View style={styles.root}>
      <Tab.Navigator
        screenListeners={{
          state: (e) => {
            const state = (e.data as { state?: { routes: { name: string }[]; index: number } }).state;
            if (state) setActiveTab(state.routes[state.index].name);
          },
        }}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.22)',
          tabBarStyle: {
            backgroundColor: colors.bg,
            borderTopColor: 'rgba(255,255,255,0.05)',
            height: 56 + insets.bottom,
            paddingTop: 6,
            paddingBottom: insets.bottom,
          },
          tabBarLabelStyle: {
            fontFamily: fonts.bodySemiBold,
            fontSize: 8,
            letterSpacing: 0.64,
            textTransform: 'uppercase',
          },
          tabBarIcon: ({ color, size }) => {
            const Icon = ICONS[route.name as keyof typeof ICONS];
            return <Icon size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Stats" component={StatsScreen} />
        <Tab.Screen name="Body" component={BodyScreen} />
        <Tab.Screen name="Fuel" component={FuelScreen} />
        <Tab.Screen name="Recovery" component={RecoveryScreen} />
      </Tab.Navigator>
      {FAB_SCREENS.has(activeTab) && (
        <FloatingCoachButton
          bottomOffset={tabBarHeight + 24}
          onPress={() => navigateFromAppAction('Home', { openChat: true })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
