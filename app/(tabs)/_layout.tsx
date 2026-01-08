import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobileWeb } from "@/lib/useIsMobileWeb";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Platform, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TabsLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  // Detecta se é mobile no navegador (igual Instagram)
  const isMobileWeb = useIsMobileWeb(900);

  // Desktop Web = sidebar + sem Tab Bar
  const isLargeWeb = Platform.OS === "web" && !isMobileWeb;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        // TAB BAR (APK + WEB MOBILE)
        tabBarStyle: isLargeWeb
          ? { display: "none" } // Oculta tabs no desktop
          : {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              borderTopWidth: 0.5,

              // ★ ALTURA CORRETA IGUAL AO APK + INSTAGRAM WEB MOBILE
              height: 56 + insets.bottom,

              // ★ SAFE AREA: levanta a tab bar quando o navegador recolhe
              paddingTop: 4,
              paddingBottom: 4 + insets.bottom,
            },

        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="tribes"
        options={{
          title: "Tribos",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="conversations"
        options={{
          title: "Conversas",
          href: "/conversations",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubble" : "chatbubble-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: "Pesquisar",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "search" : "search-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            if (pathname !== "/profile") {
              router.replace("/profile");
            }
          },
        }}
      />
    </Tabs>
  );
}

export default TabsLayout;

const styles = StyleSheet.create({});
