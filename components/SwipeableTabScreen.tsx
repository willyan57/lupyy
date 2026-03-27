/**
 * SwipeableTabScreen – Instagram-style peek-swipe navigation between tabs.
 *
 * Wraps any tab screen and adds horizontal drag gesture that:
 *  • Translates the current screen following the finger
 *  • Reveals an edge shadow + destination label ("peek")
 *  • Navigates on release past threshold with smooth animation
 *  • Springs back if below threshold
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
const EDGE_SHADOW_W = 60;
const MAX_DRAG = SCREEN_W * 0.45; // max peek distance

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

  // On desktop web, render children directly
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

        // Reset after navigation
        setTimeout(() => {
          translateX.setValue(0);
          isNavigating.current = false;
        }, 100);
      });
    },
    [router, translateX]
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) => {
        // Only activate for horizontal drags
        if (isNavigating.current) return false;
        return Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 12;
      },
      onMoveShouldSetPanResponderCapture: () => false,

      onPanResponderMove: (_evt, gs) => {
        const { dx } = gs;

        // Right swipe (positive dx) → leftTarget
        if (dx > 0 && leftTarget) {
          const clamped = Math.min(dx * 0.7, MAX_DRAG);
          translateX.setValue(clamped);
        }
        // Left swipe (negative dx) → rightTarget
        else if (dx < 0 && rightTarget) {
          const clamped = Math.max(dx * 0.7, -MAX_DRAG);
          translateX.setValue(clamped);
        }
      },

      onPanResponderRelease: (_evt, gs) => {
        const { dx, vx } = gs;
        const velocityThreshold = 0.5;

        // Right swipe → leftTarget
        if (dx > 0 && leftTarget && (dx > threshold || vx > velocityThreshold)) {
          navigate(leftTarget, "right");
          return;
        }

        // Left swipe → rightTarget
        if (dx < 0 && rightTarget && (Math.abs(dx) > threshold || Math.abs(vx) > velocityThreshold)) {
          navigate(rightTarget, "left");
          return;
        }

        // Snap back
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

  // Edge shadows opacity based on drag
  const leftShadowOpacity = translateX.interpolate({
    inputRange: [0, MAX_DRAG],
    outputRange: [0, 0.6],
    extrapolate: "clamp",
  });

  const rightShadowOpacity = translateX.interpolate({
    inputRange: [-MAX_DRAG, 0],
    outputRange: [0.6, 0],
    extrapolate: "clamp",
  });

  // Destination label opacity
  const leftLabelOpacity = translateX.interpolate({
    inputRange: [0, threshold, MAX_DRAG],
    outputRange: [0, 0.4, 1],
    extrapolate: "clamp",
  });
  const rightLabelOpacity = translateX.interpolate({
    inputRange: [-MAX_DRAG, -threshold, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: "clamp",
  });

  // Destination icon scale
  const leftIconScale = translateX.interpolate({
    inputRange: [0, MAX_DRAG],
    outputRange: [0.6, 1],
    extrapolate: "clamp",
  });
  const rightIconScale = translateX.interpolate({
    inputRange: [-MAX_DRAG, 0],
    outputRange: [1, 0.6],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      {/* Left peek indicator (swipe right → shows left target) */}
      {leftTarget && (
        <Animated.View
          style={[
            styles.peekIndicator,
            styles.peekLeft,
            {
              opacity: leftLabelOpacity,
              transform: [{ scale: leftIconScale }],
            },
          ]}
          pointerEvents="none"
        >
          {leftTarget.icon && (
            <Ionicons
              name={leftTarget.icon}
              size={28}
              color={theme.colors.textMuted}
            />
          )}
          {leftTarget.label && (
            <Animated.Text
              style={[styles.peekLabel, { color: theme.colors.textMuted }]}
            >
              {leftTarget.label}
            </Animated.Text>
          )}
        </Animated.View>
      )}

      {/* Right peek indicator (swipe left → shows right target) */}
      {rightTarget && (
        <Animated.View
          style={[
            styles.peekIndicator,
            styles.peekRight,
            {
              opacity: rightLabelOpacity,
              transform: [{ scale: rightIconScale }],
            },
          ]}
          pointerEvents="none"
        >
          {rightTarget.icon && (
            <Ionicons
              name={rightTarget.icon}
              size={28}
              color={theme.colors.textMuted}
            />
          )}
          {rightTarget.label && (
            <Animated.Text
              style={[styles.peekLabel, { color: theme.colors.textMuted }]}
            >
              {rightTarget.label}
            </Animated.Text>
          )}
        </Animated.View>
      )}

      {/* Main screen content with translateX */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateX }],
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        {children}

        {/* Left edge shadow (visible when swiping right) */}
        <Animated.View
          style={[
            styles.edgeShadow,
            styles.edgeShadowLeft,
            { opacity: leftShadowOpacity },
          ]}
          pointerEvents="none"
        />

        {/* Right edge shadow (visible when swiping left) */}
        <Animated.View
          style={[
            styles.edgeShadow,
            styles.edgeShadowRight,
            { opacity: rightShadowOpacity },
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
  },
  content: {
    flex: 1,
    // Shadow for depth effect
    ...(Platform.OS === "web"
      ? {
          // @ts-ignore web shadow
          boxShadow: "0 0 30px rgba(0,0,0,0.3)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 15,
          elevation: 10,
        }),
  },
  edgeShadow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: EDGE_SHADOW_W,
  },
  edgeShadowLeft: {
    left: 0,
    // Gradient from dark to transparent going right
    backgroundColor: "rgba(0,0,0,0.15)",
    borderTopRightRadius: 0,
  },
  edgeShadowRight: {
    right: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  peekIndicator: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    zIndex: -1,
  },
  peekLeft: {
    left: 10,
  },
  peekRight: {
    right: 10,
  },
  peekLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
});
