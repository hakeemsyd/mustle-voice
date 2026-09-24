import { StackActions, createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const TAB_SCREENS = new Set(['Home', 'Stats', 'Body', 'Fuel', 'Recovery']);

export function navigateFromAppAction(screen: string, params?: Record<string, unknown>) {
  if (!navigationRef.isReady()) return;
  const navigate = navigationRef.navigate as (name: string, params?: object) => void;

  if (TAB_SCREENS.has(screen)) {
    const root = navigationRef.getRootState();
    if (root && root.routes[root.index]?.name !== 'Tabs') navigationRef.dispatch(StackActions.popTo('Tabs'));
    navigate('Tabs', { screen, params });
    return;
  }

  navigate(screen, params);
}
