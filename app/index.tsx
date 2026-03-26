import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import LoginScreen from "./login";

const APP_SCHEME = "lupyy";
const APP_DEEP_LINK = `${APP_SCHEME}://`;

export default function Entry() {
  if (Platform.OS !== "web") {
    return <LoginScreen />;
  }

  return <WebLanding />;
}

function WebLanding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        setHasSession(!!session);
      } finally {
        if (mounted) setChecking(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!checking && hasSession) {
      router.replace("/(tabs)/feed");
    }
  }, [checking, hasSession, router]);

  if (checking) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        <View style={styles.desktopContent}>
          <LoginScreen />
        </View>
        <WebFooter />
      </View>
    );
  }

  return (
    <View style={styles.mobileRoot}>
      <View style={styles.mobileTopSpacer} />

      <View style={styles.mobileCenter}>
        <View style={styles.mobileLogoWrap}>
          <Image
            source={require("../assets/branding/lupyy-logo.png")}
            style={styles.mobileLogo}
            contentFit="contain"
          />
        </View>

        <Text style={styles.mobileTitle}>Lupyy</Text>

        <Text style={styles.mobileSubtitle}>
          Compartilhe momentos do dia a dia apenas com seus amigos próximos.
        </Text>

        <Pressable style={styles.mobilePrimaryBtn} onPress={openAppDeepLink}>
          <Text style={styles.mobilePrimaryBtnText}>Abrir Lupyy</Text>
        </Pressable>

        <View style={styles.mobileSecondaryRow}>
          <Pressable onPress={() => router.push("/login")}>
            <Text style={styles.mobileLinkStrong}>Entrar</Text>
          </Pressable>
          <Text style={styles.mobileLinkMuted}> ou </Text>
          <Pressable onPress={() => router.push("/signup")}>
            <Text style={styles.mobileLinkStrong}>cadastrar-se</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.mobileFooter}>
        <Text style={styles.mobileFooterText}>from</Text>
        <Text style={styles.mobileFooterBrand}>Lupyy</Text>
        <LegalBar />
      </View>
    </View>
  );
}

function openAppDeepLink() {
  try {
    // @ts-ignore
    window.location.href = APP_DEEP_LINK;
    setTimeout(() => {
      // @ts-ignore
      if (window.location.href === APP_DEEP_LINK) return;
    }, 50);
  } catch {}

  setTimeout(() => {
    // @ts-ignore
    if (typeof window !== "undefined") window.location.href = "/login";
  }, 900);
}

function WebFooter() {
  return (
    <View style={styles.webFooter}>
      <View style={styles.webFooterRow}>
        <Link href="/terms" style={styles.webFooterLink}>
          Termos
        </Link>
        <Link href="/privacy" style={styles.webFooterLink}>
          Privacidade
        </Link>
        <Text style={styles.webFooterMuted}>© {new Date().getFullYear()} Lupyy</Text>
      </View>
    </View>
  );
}

function LegalBar() {
  return (
    <View style={styles.legalBar}>
      <Text style={styles.legalText}>
        Ao continuar, você concorda com os{" "}
        <Link href="/terms" style={styles.legalLink}>
          Termos de Uso
        </Link>{" "}
        e a{" "}
        <Link href="/privacy" style={styles.legalLink}>
          Política de Privacidade
        </Link>
        .
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  desktopRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  desktopContent: {
    flex: 1,
    width: "100%",
  },
  webFooter: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 18,
    paddingTop: 10,
  },
  webFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  webFooterLink: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  webFooterMuted: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  mobileRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  mobileTopSpacer: {
    height: 56,
  },
  mobileCenter: {
    width: "100%",
    maxWidth: 520,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  mobileLogoWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  mobileLogo: {
    width: 84,
    height: 84,
  },
  mobileTitle: {
    fontSize: 44,
    fontWeight: "900",
    color: Colors.text,
    marginBottom: 10,
  },
  mobileSubtitle: {
    color: Colors.textMuted,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 20,
    maxWidth: 440,
  },
  mobilePrimaryBtn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.brandStart,
    marginBottom: 14,
  },
  mobilePrimaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  mobileSecondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileLinkStrong: {
    color: Colors.brandEnd,
    fontSize: 16,
    fontWeight: "800",
  },
  mobileLinkMuted: {
    color: Colors.textMuted,
    fontSize: 16,
    fontWeight: "600",
  },
  mobileFooter: {
    marginTop: "auto",
    paddingBottom: 22,
    alignItems: "center",
    gap: 4,
    width: "100%",
  },
  mobileFooterText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  mobileFooterBrand: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  legalBar: {
    marginTop: 10,
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 520,
  },
  legalText: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
  legalLink: {
    color: Colors.brandEnd,
    fontWeight: "800",
  },
});