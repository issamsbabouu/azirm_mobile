import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://uqdpmjstkdbnkkgmsztc.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZHBtanN0a2RibmtrZ21zenRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTQ0MDQsImV4cCI6MjA2MzY5MDQwNH0.Q_j7kUsL4OG2Q38Fya-zlleAVqqD_f--rDeKY-GnZB4';
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
