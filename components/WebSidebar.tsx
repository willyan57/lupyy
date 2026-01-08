import Colors from "@/constants/Colors";
import { Link, LinkProps, usePathname } from "expo-router";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ItemProps = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
};

function SidebarItem({ href, label, icon, active }: ItemProps) {
  const itemStyle = StyleSheet.flatten([
    styles.item,
    active ? styles.itemActive : null,
  ]);

  const labelStyle = StyleSheet.flatten([
    styles.label,
    active ? styles.labelActive : null,
  ]);

  return (
    <Link href={href as LinkProps["href"]} asChild>
      <TouchableOpacity style={itemStyle} activeOpacity={0.8}>
        <View style={styles.icon}>{icon}</View>
        <Text style={labelStyle}>{label}</Text>
      </TouchableOpacity>
    </Link>
  );
}

export const WEB_SIDEBAR_WIDTH = 240;

export default function WebSidebar() {
  if (Platform.OS !== "web") return null;

  // No navegador do celular (web mobile), escondemos o sidebar desktop
  if (typeof window !== "undefined") {
    const mq = window.matchMedia("(max-width: 899px), (pointer: coarse)");
    if (mq.matches) return null;
  }

  const pathname = usePathname();

  const items: ItemProps[] = [
    {
      href: "/feed",
      label: "Página inicial",
      icon: <Text style={styles.iconText}>🏠</Text>,
      active: pathname?.startsWith("/feed") ?? false,
    },
    {
      href: "/search",
      label: "Pesquisa",
      icon: <Text style={styles.iconText}>🔍</Text>,
      active: pathname?.startsWith("/search") ?? false,
    },
    {
      href: "/tribes",
      label: "Tribos",
      icon: <Text style={styles.iconText}>👥</Text>,
      active: pathname?.startsWith("/tribes") ?? false,
    },
    {
      href: "/new",
      label: "Criar",
      icon: <Text style={styles.iconText}>➕</Text>,
      active: pathname?.startsWith("/new") ?? false,
    },
    {
      href: "/conversations",
      label: "Conversas",
      icon: <Text style={styles.iconText}>💬</Text>,
      active: pathname?.startsWith("/conversations") ?? false,
    },
    {
      href: "/profile",
      label: "Perfil",
      icon: <Text style={styles.iconText}>👤</Text>,
      active: pathname?.startsWith("/profile") ?? false,
    },
  ];

  return (
    <View style={styles.wrapper}>
      <View style={styles.sidebar}>
        <Text style={styles.logo}>Lupyy</Text>

        <View style={styles.items}>
          {items.map((item) => (
            <SidebarItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.active}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "fixed" as any,
    left: 0,
    top: 0,
    bottom: 0,
    width: WEB_SIDEBAR_WIDTH,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 12,
    zIndex: 100,
  },
  sidebar: {
    flex: 1,
  },
  logo: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 24,
  },
  items: {
    // sem gap para evitar bug no web; usamos margin nos itens
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 4,
  },
  itemActive: {
    backgroundColor: Colors.background,
  },
  icon: {
    width: 26,
  },
  iconText: {
    fontSize: 18,
  },
  label: {
    color: Colors.text,
    fontSize: 14,
    marginLeft: 8,
    fontWeight: "500",
  },
  labelActive: {
    fontWeight: "700",
  },
});
