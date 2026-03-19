// components/MatchCelebration.tsx
// Premium celebration overlay when two silent crushes match
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const CONFETTI_COLORS = [
  "#FF4D6D",
  "#6C63FF",
  "#00D2D3",
  "#FFD93D",
  "#FF6B9D",
  "#C084FC",
  "#34D399",
  "#F472B6",
];

const MATCH_PHRASES = [
  "É um match! 💘",
  "Vocês se curtiram! 🎉",
  "Crush correspondido! 💜",
  "A química rolou! ✨",
  "Corações conectados! 💕",
];

type Props = {
  visible: boolean;
  matchedUserName?: string;
  onClose: () => void;
  onSendMessage?: () => void;
};

type ConfettiPiece = {
  id: number;
  x: number;
  delay: number;
  color: string;
  size: number;
  rotation: number;
};

function generateConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_W,
    delay: Math.random() * 800,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));
}

function ConfettiPieceView({ piece }: { piece: ConfettiPiece }) {
  const translateY = useRef(new Animated.Value(-50)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_H + 50,
          duration: 2200 + Math.random() * 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 2800,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
      ]).start();
    }, piece.delay);

    return () => clearTimeout(timer);
  }, []);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: [`${piece.rotation}deg`, `${piece.rotation + 720}deg`],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: piece.x,
        top: -20,
        width: piece.size,
        height: piece.size * 1.4,
        backgroundColor: piece.color,
        borderRadius: 2,
        transform: [{ translateY }, { rotate: spin }],
        opacity,
      }}
    />
  );
}

function MatchCelebrationComponent({
  visible,
  matchedUserName,
  onClose,
  onSendMessage,
}: Props) {
  const [confetti] = useState(() => generateConfetti(40));
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const [phrase] = useState(
    () => MATCH_PHRASES[Math.floor(Math.random() * MATCH_PHRASES.length)]
  );

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [visible]);

  const handleSendMessage = useCallback(() => {
    onClose();
    onSendMessage?.();
  }, [onClose, onSendMessage]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Confetti layer */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {confetti.map((piece) => (
            <ConfettiPieceView key={piece.id} piece={piece} />
          ))}
        </View>

        {/* Main card */}
        <Animated.View
          style={[
            styles.card,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Glow ring */}
          <Animated.View
            style={[
              styles.glowRing,
              { opacity: glowAnim },
            ]}
          />

          <Text style={styles.emoji}>💘</Text>
          <Text style={styles.title}>{phrase}</Text>

          {matchedUserName && (
            <Text style={styles.subtitle}>
              Você e {matchedUserName} têm interesse mútuo!
            </Text>
          )}

          <Text style={styles.description}>
            A conexão é real. Que tal mandar a primeira mensagem?
          </Text>

          <View style={styles.buttonsRow}>
            {onSendMessage && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSendMessage}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>💬 Mandar mensagem</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>Agora não</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "85%",
    maxWidth: 380,
    backgroundColor: "#0c0c18",
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,77,109,0.3)",
    shadowColor: "#FF4D6D",
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  glowRing: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#FF4D6D",
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#FF8FAB",
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 19,
  },
  buttonsRow: {
    width: "100%",
    gap: 10,
  },
  primaryButton: {
    backgroundColor: "#FF4D6D",
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
    shadowColor: "#FF4D6D",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  secondaryButtonText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
});

const MatchCelebration = memo(MatchCelebrationComponent);
export default MatchCelebration;
