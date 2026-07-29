import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Both values are public by design (the publishable key ships in every client);
// data access is protected by row-level security, not by hiding these.
const SUPABASE_URL = 'https://tozgvzylotvuygahvuxq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ERmR2mIx0bvEZAUqPu0-Aw_LAZo1mOe';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
