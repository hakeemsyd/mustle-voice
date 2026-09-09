import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootNavigator } from './RootNavigator';
import { ActiveSessionScreen } from '../screens/ActiveSessionScreen';
import { PreWorkoutPreviewScreen } from '../screens/PreWorkoutPreviewScreen';
import { SessionReportScreen } from '../screens/SessionReportScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { GlobalChatScreen } from '../screens/GlobalChatScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootStack = () => {
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
        name="Calendar"
        component={CalendarScreen}
        options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="GlobalChat" component={GlobalChatScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};
