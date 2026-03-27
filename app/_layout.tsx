import WebSidebar, { WEB_SIDEBAR_WIDTH } from "@/components/WebSidebar";
import Colors from "@/constants/Colors";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/lib/i18n";
import {
  registerForPushNotifications,
  setupNotificationListeners,
  unregisterPushToken,
} from "@/lib/pushNotifications";
import { supabase } from "@/lib/supabase";
import { useIsMobileWeb } from "@/lib/useIsMobileWeb";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const RECOVERY_FLAG = "lupyy_password_recovery_pending";

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const pushCleanupRef = useRef<(() => void) | null>(null);

  const publicRoutes = useMemo(() => {
    return ["/", "/login", "/signup", "/reset", "/terms", "/privacy"];
  }, []);

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

  function isRecoveryContext(): boolean {
    if (pathname === "/reset") return true;

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

  // ═══════════════════════════════════════════════════
  // Push Notifications — registra ao logar, limpa ao deslogar
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === "SIGNED_IN" && session) {
          await registerForPushNotifications();

          pushCleanupRef.current = setupNotificationListeners(
            (notification: Notifications.Notification) => {
              console.log("Notificação recebida:", notification.request.content);
            },
            (response: Notifications.NotificationResponse) => {
              const data = response.notification.request.content.data;
              if (data?.type === "follow" && data?.actorId) {
                router.push(`/user/${data.actorId}` as any);
              } else {
                router.push("/notifications" as any);
              }
            }
          );
        }

        if (event === "SIGNED_OUT") {
          await unregisterPushToken();
          pushCleanupRef.current?.();
          pushCleanupRef.current = null;
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      pushCleanupRef.current?.();
    };
  }, [router]);

  // ═══════════════════════════════════════════════════
  // Auth guard — redireciona conforme sessão
  // ═══════════════════════════════════════════════════
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
        if (Platform.OS === "web" && typeof window !== "undefined") {
          try { window.localStorage.removeItem(RECOVERY_FLAG); } catch {}
        }
        if (!isPublicRoute) navigateIfNeeded("/");
      } else {
        if (isRecoveryContext()) {
          // recovery — manter em /reset
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
        if (_event === "PASSWORD_RECOVERY") return;
        if (isRecoveryContext()) return;

        if (session) {
          if (isRedirectToFeedRoute) navigateIfNeeded("/(tabs)/feed");
        } else {
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

  const isDesktopPublicRoute =
    Platform.OS === "web" && !isMobileWeb && isPublicRoute;

  const desktopPublicRouteStyle = isDesktopPublicRoute
    ? ({
        minHeight: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
      } as any)
    : undefined;

  const desktopPublicRouteContentStyle = isDesktopPublicRoute
    ? ({
        backgroundColor: Colors.background,
        flex: 1,
        width: "100%",
        maxWidth: "100%",
        alignSelf: "stretch",
      } as any)
    : ({
        backgroundColor: Colors.background,
      } as const);

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
              contentStyle: desktopPublicRouteContentStyle,
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
