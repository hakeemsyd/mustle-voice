import AsyncStorage from '@react-native-async-storage/async-storage';

export const HOME_CACHE_KEY = 'home_data_cache_v1';

export const clearLocalUserData = async () => {
  await AsyncStorage.removeItem(HOME_CACHE_KEY).catch(() => null);
};
