import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useMemo, useRef } from "react";
import { Platform, StyleProp, StyleSheet, ViewStyle } from "react-native";

type CrossPlatformVideoProps = {
  uri: string;
  playing: boolean;
  muted: boolean;
  posterUri?: string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: "cover" | "contain";
  allowsFullscreen?: boolean;
  allowsPictureInPicture?: boolean;
};

function NativeVideo({
  uri,
  playing,
  muted,
  style,
  contentFit = "cover",
  allowsFullscreen = false,
  allowsPictureInPicture = false,
}: CrossPlatformVideoProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
    if (playing) p.play();
  });

  useEffect(() => {
    try {
      player.muted = muted;
      if (playing) player.play();
      else player.pause();
    } catch {}

    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [muted, playing, player]);

  return (
    <VideoView
      style={style}
      player={player}
      contentFit={contentFit}
      allowsFullscreen={allowsFullscreen}
      allowsPictureInPicture={allowsPictureInPicture}
    />
  );
}

function WebVideo({ uri, playing, muted, posterUri, style, contentFit = "cover" }: CrossPlatformVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const flattenedStyle = useMemo(() => StyleSheet.flatten(style) ?? {}, [style]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = muted;
    video.muted = muted;
    video.volume = muted ? 0 : 1;
    video.loop = true;
    video.playsInline = true;

    if (playing) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } else {
      video.pause();
    }
  }, [muted, playing, uri]);

  return (
    <video
      key={uri}
      ref={videoRef}
      src={uri}
      poster={posterUri ?? undefined}
      playsInline
      muted={muted}
      loop
      preload="metadata"
      controls={false}
      style={{ ...(flattenedStyle as object), objectFit: contentFit } as React.CSSProperties}
    />
  );
}

export function CrossPlatformVideo(props: CrossPlatformVideoProps) {
  if (Platform.OS === "web") return <WebVideo {...props} />;
  return <NativeVideo {...props} />;
}