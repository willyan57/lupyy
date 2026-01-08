import WebSidebar from "@/components/WebSidebar";
import Colors from "@/constants/Colors";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { useIsMobileWeb } from "@/lib/useIsMobileWeb";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  const publicRoutes = useMemo(() => {
    return ["/", "/login", "/signup", "/reset", "/terms", "/privacy"];
  }, []);

  const redirectToFeedRoutes = useMemo(() => {
    return ["/", "/login", "/signup", "/reset"];
  }, []);

  const isPublicRoute = useMemo(() => {
    return publicRoutes.includes(pathname);
  }, [publicRoutes, pathname]);

  const isRedirectToFeedRoute = useMemo(() => {
    return redirectToFeedRoutes.includes(pathname);
  }, [redirectToFeedRoutes, pathname]);

  const isMobileWeb = useIsMobileWeb(900);

  useEffect(() => {
    let mounted = true;

    const navigateIfNeeded = (target: any) => {
      if (pathname === target) return;
      router.replace(target);
    };

    const checkInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!session) {
        if (!isPublicRoute) navigateIfNeeded("/");
      } else {
        if (isRedirectToFeedRoute) navigateIfNeeded("/(tabs)/feed");
      }

      setReady(true);
    };

    checkInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;

        if (session) {
          if (isRedirectToFeedRoute) navigateIfNeeded("/(tabs)/feed");
        } else {
          if (!isPublicRoute) navigateIfNeeded("/");
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isPublicRoute, isRedirectToFeedRoute, pathname, router]);

  if (!ready) return null;

  const showSidebar = Platform.OS === "web" && !isPublicRoute && !isMobileWeb;

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="reset" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ThemeProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

        {showSidebar ? (
          <View style={{ flex: 1, flexDirection: "row", backgroundColor: Colors.background }}>
            <WebSidebar />
            <View style={{ flex: 1, backgroundColor: Colors.background }}>{stack}</View>
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: Colors.background }}>{stack}</View>
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
