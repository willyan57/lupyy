import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

declare const global: any;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Supabase environment variables are missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

const client =
  (global as any).__supabase__ ??
  createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
        removeItem: (key) => AsyncStorage.removeItem(key),
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  (global as any).__supabase__ = client;
}

export const supabase = client;
