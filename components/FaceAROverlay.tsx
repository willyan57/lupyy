// components/FaceAROverlay.tsx — AR Face effects overlay for camera
// Uses MediaPipe Face Mesh to detect faces and draw emoji/effect overlays

import {
    AR_EFFECTS,
    detectFaces,
    drawAREffect,
    isFaceDetectionAvailable,
    loadFaceDetection,
    type AREffectId,
    type FaceDetectionResult,
} from "@/lib/ar/faceDetection";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type FaceAROverlayProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  activeEffect: AREffectId;
  onEffectChange: (effect: AREffectId) => void;
  showPicker?: boolean;
  canvasWidth: number;
  canvasHeight: number;
};

export default function FaceAROverlay({
  videoRef,
  activeEffect,
  onEffectChange,
  showPicker = true,
  canvasWidth,
  canvasHeight,
}: FaceAROverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const detectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeRef = useRef(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(false);
  const facesRef = useRef<FaceDetectionResult[]>([]);

  const isNoneEffect = (activeEffect as string) === "none";
  const isEffectActive = !isNoneEffect;

  useEffect(() => {
    setAvailable(isFaceDetectionAvailable());
  }, []);

  const startDetection = useCallback(() => {
    if (!isEffectActive) return;

    const detect = async () => {
      if (!isEffectActive) return;
      const videoEl = videoRef.current;
      if (!videoEl || videoEl.readyState < 2) {
        if (isEffectActive) {
          detectTimeoutRef.current = setTimeout(() => {
            animFrameRef.current = requestAnimationFrame(detect);
          }, 180);
        }
        return;
      }

      try {
        const faces = await detectFaces(videoEl);
        facesRef.current = faces;
        setFaceDetected(faces.length > 0);
      } catch {
      }

      if (isEffectActive) {
        detectTimeoutRef.current = setTimeout(() => {
          animFrameRef.current = requestAnimationFrame(detect);
        }, 100);
      }
    };

    detect();
  }, [isEffectActive, videoRef]);

  useEffect(() => {
    if (!isEffectActive || !available) {
      setLoading(false);
      setFaceDetected(false);
      facesRef.current = [];
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadFaceDetection().then((loaded) => {
      if (cancelled) return;
      setLoading(false);
      if (loaded) startDetection();
    });

    return () => {
      cancelled = true;
      if (detectTimeoutRef.current) {
        clearTimeout(detectTimeoutRef.current);
        detectTimeoutRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [isEffectActive, available, startDetection]);

  useEffect(() => {
    if (!isEffectActive || !canvasRef.current) return;

    let running = true;

    const render = () => {
      if (!running || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      timeRef.current += 1 / 30;
      drawAREffect(
        ctx,
        facesRef.current,
        activeEffect,
        canvasWidth,
        canvasHeight,
        timeRef.current
      );

      requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
    };
  }, [activeEffect, isEffectActive, canvasWidth, canvasHeight]);

  useEffect(() => {
    return () => {
      if (detectTimeoutRef.current) clearTimeout(detectTimeoutRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  if (Platform.OS !== "web" || !available) return null;

  return (
    <>
      {isEffectActive && (
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasHeight,
            pointerEvents: "none",
            zIndex: 5,
          }}
        />
      )}

      {isEffectActive && !loading && (
        <View style={styles.faceIndicator}>
          <View
            style={[
              styles.faceIndicatorDot,
              faceDetected ? styles.faceDetectedDot : styles.faceNotDetectedDot,
            ]}
          />
          <Text style={styles.faceIndicatorText}>
            {faceDetected ? "Rosto detectado" : "Procurando rosto..."}
          </Text>
        </View>
      )}

      {loading && (
        <View style={styles.loadingBadge}>
          <Text style={styles.loadingText}>Carregando AR...</Text>
        </View>
      )}

      {showPicker && (
        <View style={styles.pickerContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pickerScroll}
          >
            {AR_EFFECTS.map((effect) => {
              const isActive = effect.id === activeEffect;

              return (
                <TouchableOpacity
                  key={effect.id}
                  activeOpacity={0.8}
                  onPress={() => onEffectChange(effect.id)}
                  style={[styles.effectItem, isActive && styles.effectItemActive]}
                >
                  <View style={[styles.effectIcon, isActive && styles.effectIconActive]}>
                    <Text style={styles.effectEmoji}>{effect.icon}</Text>
                  </View>
                  <Text
                    style={[styles.effectLabel, isActive && styles.effectLabelActive]}
                    numberOfLines={1}
                  >
                    {effect.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  faceIndicator: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  faceIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  faceDetectedDot: {
    backgroundColor: "#00e676",
  },
  faceNotDetectedDot: {
    backgroundColor: "#ff5722",
  },
  faceIndicatorText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingBadge: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  loadingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  pickerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 8,
    zIndex: 12,
  },
  pickerScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  effectItem: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    width: 64,
  },
  effectItemActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  effectIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 2,
    borderColor: "transparent",
  },
  effectIconActive: {
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  effectEmoji: {
    fontSize: 22,
  },
  effectLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  effectLabelActive: {
    color: "#fff",
  },
});