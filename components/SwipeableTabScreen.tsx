/**
 * SwipeableTabScreen – Instagram-style peek-swipe navigation between tabs.
 *
 * Full-screen destination panels slide in from the edges with parallax,
 * while the current screen slides and scales slightly — matching Instagram's
 * camera/reels swipe feel.
 *
 * Mobile only (APK + mobile web). Desktop web is no-op.
 */

import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
  View,
} from "react-native";

export type SwipeTarget = {
  route: string;
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  /** Use router.push instead of replace (e.g. for Camera) */
  push?: boolean;
};

type Props = {
  children: React.ReactNode;
  /** Swipe right → (previous screen) */
  leftTarget?: SwipeTarget;
  /** Swipe left → (next screen) */
  rightTarget?: SwipeTarget;
  /** Override threshold (default 80) */
  threshold?: number;
  /** Disable on desktop web (default true) */
  disableOnDesktop?: boolean;
  /** Pass true when using on mobile web too */
  enableOnMobileWeb?: boolean;
};

const SCREEN_W = Dimensions.get("window").width;
const MAX_DRAG = SCREEN_W * 0.45;
const PARALLAX_FACTOR = 0.35; // destination moves at 35% of drag speed
const SCALE_MIN = 0.92; // current screen scales down to 92%
const BORDER_RADIUS_MAX = 14; // rounded corners when scaling

export default function SwipeableTabScreen({
  children,
  leftTarget,
  rightTarget,
  threshold = 80,
  disableOnDesktop = true,
  enableOnMobileWeb = true,
}: Props) {
  const router = useRouter();
  const { theme } = useTheme();

  const translateX = useRef(new Animated.Value(0)).current;
  const isNavigating = useRef(false);

  const isDesktopWeb =
    Platform.OS === "web" &&
    disableOnDesktop &&
    typeof window !== "undefined" &&
    window.innerWidth >= 900;

  const navigate = useCallback(
    (target: SwipeTarget, direction: "left" | "right") => {
      if (isNavigating.current) return;
      isNavigating.current = true;

      const toValue = direction === "right" ? SCREEN_W : -SCREEN_W;

      Animated.timing(translateX, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        if (target.push) {
          router.push(target.route as any);
        } else {
          router.replace(target.route as any);
        }
        setTimeout(() => {
          translateX.setValue(0);
          isNavigating.current = false;
        }, 100);
      });
    },
    [router, translateX]
  );

  const touchStartX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt, gs) => {
        if (isNavigating.current) return false;
        // Only claim if touch started in edge zone AND is a clear horizontal swipe
        const startX = evt.nativeEvent.pageX - gs.dx;
        const inLeftEdge = leftTarget && startX < EDGE_WIDTH;
        const inRightEdge = rightTarget && startX > SCREEN_W - EDGE_WIDTH;
        if (!inLeftEdge && !inRightEdge) return false;
        return Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 12;
      },

      onPanResponderMove: (_evt, gs) => {
        const { dx } = gs;
        if (dx > 0 && leftTarget) {
          translateX.setValue(Math.min(dx * 0.7, MAX_DRAG));
        } else if (dx < 0 && rightTarget) {
          translateX.setValue(Math.max(dx * 0.7, -MAX_DRAG));
        }
      },

      onPanResponderRelease: (_evt, gs) => {
        const { dx, vx } = gs;
        const velocityThreshold = 0.5;

        if (dx > 0 && leftTarget && (dx > threshold || vx > velocityThreshold)) {
          navigate(leftTarget, "right");
          return;
        }
        if (dx < 0 && rightTarget && (Math.abs(dx) > threshold || Math.abs(vx) > velocityThreshold)) {
          navigate(rightTarget, "left");
          return;
        }

        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 12,
        }).start();
      },

      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 12,
        }).start();
      },
    })
  ).current;

  if (isDesktopWeb) {
    return <>{children}</>;
  }

  // --- Interpolations ---

  // Current screen scale: shrinks slightly as you drag
  const contentScale = translateX.interpolate({
    inputRange: [-MAX_DRAG, 0, MAX_DRAG],
    outputRange: [SCALE_MIN, 1, SCALE_MIN],
    extrapolate: "clamp",
  });

  // Current screen border radius: increases as you drag
  const contentBorderRadius = translateX.interpolate({
    inputRange: [-MAX_DRAG, 0, MAX_DRAG],
    outputRange: [BORDER_RADIUS_MAX, 0, BORDER_RADIUS_MAX],
    extrapolate: "clamp",
  });

  // Left destination: starts off-screen left, slides in with parallax
  const leftDestTranslateX = translateX.interpolate({
    inputRange: [0, MAX_DRAG],
    outputRange: [-SCREEN_W * (1 - PARALLAX_FACTOR), 0],
    extrapolate: "clamp",
  });

  // Right destination: starts off-screen right, slides in with parallax
  const rightDestTranslateX = translateX.interpolate({
    inputRange: [-MAX_DRAG, 0],
    outputRange: [0, SCREEN_W * (1 - PARALLAX_FACTOR)],
    extrapolate: "clamp",
  });

  // Destination opacity
  const leftDestOpacity = translateX.interpolate({
    inputRange: [0, threshold * 0.5, MAX_DRAG],
    outputRange: [0, 0.6, 1],
    extrapolate: "clamp",
  });
  const rightDestOpacity = translateX.interpolate({
    inputRange: [-MAX_DRAG, -threshold * 0.5, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  // Overlay darkening on current screen edges
  const overlayOpacity = translateX.interpolate({
    inputRange: [-MAX_DRAG, 0, MAX_DRAG],
    outputRange: [0.3, 0, 0.3],
    extrapolate: "clamp",
  });

  const EDGE_WIDTH = SCREEN_W * 0.15;

  return (
    <View style={styles.root}>
      {/* Left destination panel (full screen behind) */}
      {leftTarget && (
        <Animated.View
          style={[
            styles.destinationPanel,
            {
              backgroundColor: theme.colors.background,
              transform: [{ translateX: leftDestTranslateX }],
              opacity: leftDestOpacity,
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.destinationContent}>
            {leftTarget.icon && (
              <Ionicons
                name={leftTarget.icon}
                size={48}
                color={theme.colors.textMuted}
                style={styles.destIcon}
              />
            )}
            {leftTarget.label && (
              <Animated.Text
                style={[
                  styles.destLabel,
                  { color: theme.colors.textMuted },
                ]}
              >
                {leftTarget.label}
              </Animated.Text>
            )}
          </View>
        </Animated.View>
      )}

      {/* Right destination panel (full screen behind) */}
      {rightTarget && (
        <Animated.View
          style={[
            styles.destinationPanel,
            {
              backgroundColor: theme.colors.background,
              transform: [{ translateX: rightDestTranslateX }],
              opacity: rightDestOpacity,
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.destinationContent}>
            {rightTarget.icon && (
              <Ionicons
                name={rightTarget.icon}
                size={48}
                color={theme.colors.textMuted}
                style={styles.destIcon}
              />
            )}
            {rightTarget.label && (
              <Animated.Text
                style={[
                  styles.destLabel,
                  { color: theme.colors.textMuted },
                ]}
              >
                {rightTarget.label}
              </Animated.Text>
            )}
          </View>
        </Animated.View>
      )}

      {/* Main screen content — slides + scales */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.content,
          {
            backgroundColor: theme.colors.background,
            transform: [
              { translateX },
              { scale: contentScale },
            ],
            borderRadius: contentBorderRadius,
          },
        ]}
      >
        {children}

        {/* Dark overlay on current screen during drag */}
        <Animated.View
          style={[
            styles.overlay,
            { opacity: overlayOpacity },
          ]}
          pointerEvents="none"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  content: {
    flex: 1,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          // @ts-ignore web shadow
          boxShadow: "0 0 40px rgba(0,0,0,0.5)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
          elevation: 15,
        }),
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  destinationPanel: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  destinationContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  destIcon: {
    marginBottom: 12,
    opacity: 0.6,
  },
  destLabel: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.5,
  },
});
