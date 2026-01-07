import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type StoryItem = {
  id: string | number;
  media_type: "image" | "video";
  media_url: string;
  filter?: string | null;
  duration?: number | null; // em segundos (opcional). Se não vier, usa 30s
};

type StoryViewerProps = {
  visible: boolean;
  items: StoryItem[];
  startIndex?: number;
  onClose: () => void;
};

const { width, height } = Dimensions.get("window");

type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";

const FILTERS: { id: FilterId; overlay?: string; blur?: number; vignette?: boolean; glow?: boolean }[] = [
  { id: "none" },
  { id: "warm", overlay: "rgba(255,140,90,0.18)", glow: true },
  { id: "cool", overlay: "rgba(70,150,255,0.18)", glow: true },
  { id: "pink", overlay: "rgba(255,80,160,0.16)", glow: true },
  { id: "gold", overlay: "rgba(255,220,120,0.16)", glow: true, vignette: true },
  { id: "night", overlay: "rgba(0,0,0,0.28)", blur: 18, vignette: true },
];

const getFilter = (id?: string | null) =>
  FILTERS.find((f) => f.id === (id as FilterId)) ?? FILTERS[0];


function StoryVideo({ uri, playing }: { uri: string; playing: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = Platform.OS === "web"; // ajuda o autoplay no web
  });

  useEffect(() => {
    if (!player) return;

    if (playing) {
      player.play();
    } else {
      player.pause();
    }

    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [playing, player]);

  return (
    <VideoView
      style={styles.media}
      player={player}
      contentFit="contain"
      allowsFullscreen={false}
      allowsPictureInPicture={Platform.OS === "ios"}
    />
  );
}

/**
 * Viewer de Stories em sequência estilo IG.
 * Recebe a lista de items e o índice inicial.
 */
export default function StoryViewer({
  visible,
  items,
  startIndex = 0,
  onClose,
}: StoryViewerProps) {
  const { theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = items.length;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const goNext = useCallback(() => {
    if (total === 0) return;
    if (currentIndex + 1 < total) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  }, [currentIndex, total, onClose]);

  const goPrev = useCallback(() => {
    if (total === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    } else {
      // no primeiro, se voltar, fecha
      onClose();
    }
  }, [currentIndex, total, onClose]);

  // Reset de índice quando abrir / mudar startIndex
  useEffect(() => {
    if (!visible) return;

    clearTimer();

    const safeIndex =
      typeof startIndex === "number" &&
      startIndex >= 0 &&
      startIndex < total
        ? startIndex
        : 0;

    setCurrentIndex(safeIndex);
    setPaused(false);
  }, [visible, startIndex, total]);

  // Timer de avanço automático
  useEffect(() => {
    clearTimer();
    if (!visible || paused || total === 0) return;

    const current = items[currentIndex];
    if (!current) return;

    const durationSec =
      typeof current.duration === "number" && current.duration > 0
        ? current.duration
        : 30; // default 30s

    const timeoutMs = durationSec * 1000;

    timerRef.current = setTimeout(goNext, timeoutMs);

    return () => {
      clearTimer();
    };
  }, [visible, paused, currentIndex, items, total, goNext]);

  if (
    !visible ||
    total === 0 ||
    currentIndex < 0 ||
    currentIndex >= total
  ) {
    return null;
  }

  const current = items[currentIndex];

  const handlePress = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    if (x < width * 0.35) {
      // lado esquerdo → volta
      clearTimer();
      goPrev();
    } else {
      // lado direito → próximo
      clearTimer();
      goNext();
    }
  };

  const handleLongPress = () => {
    setPaused(true);
    clearTimer();
  };

  const handlePressOut = () => {
    setPaused(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, { backgroundColor: "#000" }]}>
        {/* Botão fechar */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            clearTimer();
            onClose();
          }}
          activeOpacity={0.9}
        >
          <Ionicons name="close" size={26} color="#ffffff" />
        </TouchableOpacity>

        {/* Área inteira clicável para navegação */}
        <Pressable
          style={styles.pressArea}
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressOut={handlePressOut}
          delayLongPress={250}
        >
          <View style={styles.mediaContainer}>
            {current.media_type === "image" ? (
              <Image
                source={{ uri: current.media_url }}
                style={styles.media}
                contentFit="contain"
                transition={150}
              />
            ) : (
              <StoryVideo uri={current.media_url} playing={!paused} />
            )}

{(() => {
  const f = getFilter((current as any)?.filter);
  if (!f || f.id === "none") return null;
  return (
    <>
      {f.blur ? (
        <BlurView intensity={f.blur} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      {f.overlay ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
      ) : null}
      {f.glow ? (
        <View pointerEvents="none" style={styles.glowWrap}>
          <LinearGradient
            colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0.0)"]}
            style={styles.glowTop}
          />
        </View>
      ) : null}
      {f.vignette ? (
        <>
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vignetteTop}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
            style={styles.vignetteBottom}
          />
        </>
      ) : null}
    </>
  );
})()}

          </View>
        </Pressable>

        {/* Pequena barra de info em cima: índice / total */}
        <View style={styles.topInfo}>
          <View style={styles.indexDotRow}>
            {items.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.indexDot,
                  idx === currentIndex && styles.indexDotActive,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Rodapé simples com posição */}
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomText}>
            Story {currentIndex + 1} de {total}
          </Text>
          {paused && (
            <Text style={styles.pausedHint}>Pausado (segurou na tela)</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pressArea: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaContainer: {
    width: "100%",
    maxWidth: 420,
    height: height * 0.8,
    alignItems: "center",
    justifyContent: "center",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  closeButton: {
    position: "absolute",
    top: Platform.select({ ios: 40, android: 32, default: 24 }),
    right: 16,
    zIndex: 20,
    padding: 6,
  },
  topInfo: {
    position: "absolute",
    top: Platform.select({ ios: 40, android: 30, default: 20 }),
    left: 16,
    right: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  indexDotRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  indexDot: {
    width: 26,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  indexDotActive: {
    backgroundColor: "#ffffff",
  },
  bottomInfo: {
    position: "absolute",
    bottom: 26,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bottomText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
  },
  pausedHint: {
    color: "#cccccc",
    fontSize: 11,
    marginTop: 4,
  },

  glowWrap: { ...StyleSheet.absoluteFillObject },

  glowTop: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },

  vignetteTop: { position: "absolute", top: 0, left: 0, right: 0, height: 220 },

  vignetteBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 260 },
});