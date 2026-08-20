import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootNavigator } from './RootNavigator';
import { ActiveSessionScreen } from '../screens/ActiveSessionScreen';
import { PreWorkoutPreviewScreen } from '../screens/PreWorkoutPreviewScreen';
import { SessionReportScreen } from '../screens/SessionReportScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={RootNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="PreWorkoutPreview"
        component={PreWorkoutPreviewScreen}
        options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ActiveSession"
        component={ActiveSessionScreen}
        options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="SessionReport"
        component={SessionReportScreen}
        options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
