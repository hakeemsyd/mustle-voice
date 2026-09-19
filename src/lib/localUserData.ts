import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearPlanPending } from './planStatus';

export const HOME_CACHE_KEY = 'home_data_cache_v1';

export const clearLocalUserData = async (userId: string | null) => {
  await AsyncStorage.removeItem(HOME_CACHE_KEY).catch(() => null);
  if (userId) await clearPlanPending(userId);
};
