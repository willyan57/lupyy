import WebSidebar, { WEB_SIDEBAR_WIDTH } from "@/components/WebSidebar";
import Colors from "@/constants/Colors";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { useIsMobileWeb } from "@/lib/useIsMobileWeb";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const RECOVERY_FLAG = "lupyy_password_recovery_pending";

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  const publicRoutes = useMemo(() => {
    return ["/", "/login", "/signup", "/reset", "/terms", "/privacy"];
  }, []);

  // ✅ CORREÇÃO: /reset REMOVIDO desta lista para não redirecionar para feed durante recovery
  const redirectToFeedRoutes = useMemo(() => {
    return ["/", "/login", "/signup"];
  }, []);

  const isPublicRoute = useMemo(() => {
    return publicRoutes.includes(pathname);
  }, [publicRoutes, pathname]);

  const isRedirectToFeedRoute = useMemo(() => {
    return redirectToFeedRoutes.includes(pathname);
  }, [redirectToFeedRoutes, pathname]);

  const isMobileWeb = useIsMobileWeb(900);

  /**
   * Checks if the current context is a password recovery flow.
   * Uses both URL params and the persisted flag as signals,
   * but the flag alone is NOT enough — the auth guard uses this
   * only to SKIP redirect, not to grant access.
   */
  function isRecoveryContext(): boolean {
    // If we're on /reset, never redirect to feed
    if (pathname === "/reset") return true;

    // Check URL for recovery params (web only)
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const href = window.location.href;
      if (
        href.includes("type=recovery") ||
        href.includes("access_token=") ||
        href.includes("code=")
      ) {
        return true;
      }
    }

    return false;
  }

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
        // No session: clear any stale recovery flag
        if (Platform.OS === "web" && typeof window !== "undefined") {
          try { window.localStorage.removeItem(RECOVERY_FLAG); } catch {}
        }
        if (!isPublicRoute) navigateIfNeeded("/");
      } else {
        // ✅ CORREÇÃO: Se estiver em contexto de recovery, NÃO redirecionar para feed
        if (isRecoveryContext()) {
          // Sessão existe mas é recovery — manter em /reset
        } else if (isRedirectToFeedRoute) {
          navigateIfNeeded("/(tabs)/feed");
        }
      }

      setReady(true);
    };

    checkInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;

        // ✅ CORREÇÃO: PASSWORD_RECOVERY event = não redirecionar, deixar reset.tsx cuidar
        if (_event === "PASSWORD_RECOVERY") {
          return;
        }

        // ✅ CORREÇÃO: Se estiver em /reset com recovery ativo, não redirecionar
        if (isRecoveryContext()) {
          return;
        }

        if (session) {
          if (isRedirectToFeedRoute) navigateIfNeeded("/(tabs)/feed");
        } else {
          // Usuário deslogou — limpar flag de recovery
          if (Platform.OS === "web" && typeof window !== "undefined") {
            try { window.localStorage.removeItem(RECOVERY_FLAG); } catch {}
          }
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

  const showSidebar =
    Platform.OS === "web" && !isMobileWeb && !isPublicRoute;

  const desktopPublicRouteStyle =
    Platform.OS === "web" && !isMobileWeb && isPublicRoute
      ? ({
          minHeight: "100vh",
          paddingTop: 16,
          paddingBottom: 16,
          overflowY: "auto",
          overflowX: "hidden",
        } as any)
      : undefined;

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <LanguageProvider>
      <ThemeProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor={Colors.background}
        />

        {showSidebar && <WebSidebar />}

        <View
          style={[
            showSidebar
              ? {
                  flex: 1,
                  marginLeft: WEB_SIDEBAR_WIDTH,
                  backgroundColor: Colors.background,
                }
              : { flex: 1, backgroundColor: Colors.background },
            desktopPublicRouteStyle,
          ]}
        >
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
        </View>
      </ThemeProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
