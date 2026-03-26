// components/WebSidebar.tsx
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export const WEB_SIDEBAR_WIDTH = 260;

type SidebarItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  route: string;
};

export default function WebSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);

  const items: SidebarItem[] = [
    {
      key: "feed",
      label: t("sidebar_home") || "Página inicial",
      icon: "home-outline",
      iconActive: "home",
      route: "/(tabs)/feed",
    },
    {
      key: "search",
      label: t("sidebar_search") || "Pesquisa",
      icon: "search-outline",
      iconActive: "search",
      route: "/(tabs)/search",
    },
    {
      key: "tribes",
      label: t("sidebar_tribes") || "Tribos",
      icon: "people-outline",
      iconActive: "people",
      route: "/(tabs)/tribes",
    },
    {
      key: "create",
      label: t("sidebar_create") || "Criar",
      icon: "add-circle-outline",
      iconActive: "add-circle",
      route: "/capture",
    },
    {
      key: "notifications",
      label: t("sidebar_notifications") || "Notificações",
      icon: "heart-outline",
      iconActive: "heart",
      route: "/notifications",
    },
    {
      key: "conversations",
      label: t("sidebar_conversations") || "Conversas",
      icon: "chatbubble-ellipses-outline",
      iconActive: "chatbubble-ellipses",
      route: "/(tabs)/conversations",
    },
    {
      key: "profile",
      label: t("sidebar_profile") || "Perfil",
      icon: "person-outline",
      iconActive: "person",
      route: "/(tabs)/profile",
    },
  ];

  const fetchUnread = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_unread_notifications_count");
      if (!error && typeof data === "number") setUnreadCount(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const isActive = (item: SidebarItem) => {
    if (item.key === "feed") return pathname.includes("/feed");
    if (item.key === "search") return pathname.includes("/search");
    if (item.key === "tribes") return pathname.includes("/tribes");
    if (item.key === "conversations") return pathname.includes("/conversations");
    if (item.key === "profile") return pathname.includes("/profile");
    if (item.key === "notifications") return pathname.includes("/notifications");
    if (item.key === "create") return pathname.includes("/capture");
    return false;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          borderRightColor: theme.colors.border,
        },
      ]}
    >
      {/* Logo */}
      <TouchableOpacity
        style={styles.logoContainer}
        onPress={() => router.push("/(tabs)/feed")}
        activeOpacity={0.8}
      >
        <Text style={[styles.logo, { color: theme.colors.primary }]}>
          Lupyy
        </Text>
      </TouchableOpacity>

      {/* Nav items */}
      <View style={styles.navList}>
        {items.map((item) => {
          const active = isActive(item);
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.navItem,
                active && {
                  backgroundColor: theme.colors.surface + "20",
                },
              ]}
              onPress={() => {
                if (item.key === "notifications") {
                  setUnreadCount(0);
                }
                router.push(item.route as any);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrapper}>
                <Ionicons
                  name={active ? item.iconActive : item.icon}
                  size={24}
                  color={active ? theme.colors.primary : theme.colors.text}
                />
                {item.key === "notifications" && unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.navLabel,
                  {
                    color: active ? theme.colors.primary : theme.colors.text,
                    fontWeight: active ? "700" : "400",
                  },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: WEB_SIDEBAR_WIDTH,
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRightWidth: 1,
    paddingTop: 24,
    paddingHorizontal: 12,
    zIndex: 100,
  },
  logoContainer: {
    paddingHorizontal: 12,
    paddingBottom: 28,
  },
  logo: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  navList: {
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  iconWrapper: {
    position: "relative",
    width: 24,
    height: 24,
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  navLabel: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
});
