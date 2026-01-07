import Colors from "@/constants/Colors";
import { useTheme } from "@/contexts/ThemeContext";
import { compressImage, prepareVideo } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Picked = {
  uri: string;
  kind: "image" | "video";
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbUri?: string | null;
};

type ComposerMode = "post" | "story" | "reel";

export default function New() {
  const { theme } = useTheme();

  const params = useLocalSearchParams<{
    source?: string;
    uri?: string;
    mediaType?: string;
  }>();

  const [media, setMedia] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("post");

  useEffect(() => {
    const source = params.source;
    const uriParam = params.uri;
    const mediaType = params.mediaType;

    if (source === "camera" && typeof uriParam === "string" && !media) {
      const kind: "image" | "video" = mediaType === "video" ? "video" : "image";

      setMedia({
        uri: uriParam,
        kind,
        width: null,
        height: null,
        duration: null,
        thumbUri: null,
      });
    }
  }, [params, media]);

  const player = useVideoPlayer(
    media?.kind === "video" ? media.uri : null,
    (p: VideoPlayer) => {
      p.loop = true;
      if (media?.kind === "video") p.play();
    }
  );

  async function pickMedia() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        return Alert.alert(
          "Permissão negada",
          "Permita o acesso à galeria para escolher fotos e vídeos."
        );
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.95,
        videoMaxDuration: 120,
        selectionLimit: 1,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const kind: "image" | "video" =
        asset.type === "video" ? "video" : "image";

      let thumbUri: string | undefined;
      if (kind === "video") {
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, {
            time: 500,
          });
          thumbUri = uri;
        } catch (e) {
          console.warn("thumbnail error", e);
        }
      }

      setMedia({
        uri: asset.uri,
        kind,
        width: asset.width ?? null,
        height: asset.height ?? null,
        duration: asset.duration ? Math.round(asset.duration * 1000) : null,
        thumbUri: thumbUri ?? null,
      });
    } catch (e: any) {
      Alert.alert("Erro ao abrir galeria", e?.message ?? String(e));
    }
  }

  async function rotateImage() {
    if (!media || media.kind !== "image") return;
    try {
      const res = await ImageManipulator.manipulateAsync(
        media.uri,
        [{ rotate: 90 }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      setMedia({
        ...media,
        uri: res.uri,
        width: res.width,
        height: res.height,
      });
    } catch (e: any) {
      Alert.alert("Falha ao girar imagem", e?.message ?? String(e));
    }
  }

  async function cropSquare() {
    if (!media || media.kind !== "image" || !media.width || !media.height)
      return;
    try {
      const size = Math.min(media.width, media.height);
      const originX = Math.floor((media.width - size) / 2);
      const originY = Math.floor((media.height - size) / 2);
      const res = await ImageManipulator.manipulateAsync(
        media.uri,
        [{ crop: { originX, originY, width: size, height: size } }],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );
      setMedia({
        ...media,
        uri: res.uri,
        width: res.width,
        height: res.height,
      });
    } catch (e: any) {
      Alert.alert("Falha ao recortar imagem", e?.message ?? String(e));
    }
  }

  async function resize1080() {
    if (!media || media.kind !== "image" || !media.width || !media.height)
      return;
    try {
      const targetW = 1080;
      const scale = targetW / media.width;
      const res = await ImageManipulator.manipulateAsync(
        media.uri,
        [
          {
            resize: {
              width: targetW,
              height: Math.round((media.height || 0) * scale),
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      setMedia({
        ...media,
        uri: res.uri,
        width: res.width,
        height: res.height,
      });
    } catch (e: any) {
      Alert.alert("Falha ao redimensionar imagem", e?.message ?? String(e));
    }
  }

  function trimVideo_0_10() {
    if (!media || media.kind !== "video") return;
    Alert.alert(
      "Em breve",
      "Edição avançada de vídeo estará disponível em uma próxima versão do Lupyy."
    );
  }

  function speed2x() {
    if (!media || media.kind !== "video") return;
    Alert.alert(
      "Em breve",
      "Controle de velocidade (2×) estará disponível em uma próxima versão do Lupyy."
    );
  }
  async function uploadToBucket(
    bucket: "posts" | "stories",
    path: string,
    uri: string,
    contentType: string
  ) {
    // Web: usa fetch -> blob normalmente
    if (Platform.OS === "web") {
      const response = await fetch(uri);
      const blob = await response.blob();
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType, upsert: true });
      if (error) throw error;
    } else {
      // APK / iOS: lê o arquivo como base64 e converte para ArrayBuffer,
      // evitando uso de Buffer (que não existe no ambiente nativo).
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Converte base64 -> ArrayBuffer usando APIs padrão
      // (atob + Uint8Array), compatíveis com Hermes/React Native.
      const binaryString = global.atob ? global.atob(base64) : atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, arrayBuffer, { contentType, upsert: true });
      if (error) throw error;
    }
  }


  async function upload() {
    try {
      if (!media) {
        return Alert.alert("Selecione uma mídia primeiro.");
      }

      if (composerMode === "reel") {
        return Alert.alert(
          "Modo ainda não disponível",
          "Publicar como Reel estará disponível em uma próxima versão. No momento, este fluxo publica posts do feed e stories."
        );
      }

      setLoading(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setLoading(false);
        return Alert.alert("Sessão expirada", "Entre novamente para publicar.");
      }

      const isVideo = media.kind === "video";

      let uploadUri = media.uri;
      let thumbUploadUri = media.thumbUri ?? null;

      if (!isVideo) {
        uploadUri = await compressImage(media.uri);
      } else {
        const prepared = await prepareVideo(media.uri);
        uploadUri = prepared.videoUri;
        if (!thumbUploadUri && prepared.thumbUri) {
          thumbUploadUri = prepared.thumbUri;
        }
      }

      const ext = isVideo ? "mp4" : "jpg";
      const ct = isVideo ? "video/mp4" : "image/jpeg";

      const stamp = Date.now();
      const basePath = `${user.id}/${stamp}`;
      const mediaPath = `${basePath}.${ext}`;

      const bucketName = composerMode === "story" ? "stories" : "posts";

      await uploadToBucket(bucketName, mediaPath, uploadUri, ct);


      let thumbPath: string | null = null;
      if (isVideo && thumbUploadUri) {
        thumbPath = `${basePath}.jpg`;
        await uploadToBucket(bucketName, thumbPath, thumbUploadUri, "image/jpeg");
      }
      if (composerMode === "story") {
        const { error: insStoryErr } = await supabase.from("stories").insert({
          user_id: user.id,
          media_type: media.kind,
          media_path: mediaPath,
          thumbnail_path: thumbPath,
          caption: caption || null,
          has_sound: isVideo ? true : false,
        });
        if (insStoryErr) throw insStoryErr;

        Alert.alert("Tudo certo", "Seu story foi publicado.");
      } else {
        const { error: insPostErr } = await supabase.from("posts").insert({
          user_id: user.id,
          media_type: media.kind,
          image_path: mediaPath,
          thumbnail_path: thumbPath,
          caption: caption || null,
          width: media.width,
          height: media.height,
          duration: media.duration,
        });
        if (insPostErr) throw insPostErr;

        Alert.alert("Tudo certo", "Seu post foi publicado no feed.");
      }

      setMedia(null);
      setCaption("");
    } catch (e: any) {
      console.log("upload error", e);
      Alert.alert("Erro ao publicar", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const gradStart = theme.colors.primary;
  const gradEnd = theme.colors.accent ?? theme.colors.primary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Criar conteúdo
      </Text>

      <View style={styles.modeSwitcher}>
        <ModeButton
          label="Post"
          active={composerMode === "post"}
          onPress={() => setComposerMode("post")}
        />
        <ModeButton
          label="Story"
          active={composerMode === "story"}
          onPress={() => setComposerMode("story")}
        />
        <ModeButton
          label="Reel"
          active={composerMode === "reel"}
          onPress={() => setComposerMode("reel")}
        />
      </View>

      {media ? (
        media.kind === "image" ? (
          <Image source={{ uri: media.uri }} style={styles.previewImage} />
        ) : (
          <View style={styles.videoWrap}>
            <VideoView
              style={styles.video}
              player={player}
              contentFit="cover"
              allowsFullscreen={false}
              allowsPictureInPicture
            />
          </View>
        )
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <Text style={{ color: theme.colors.textMuted }}>
            Nenhuma mídia selecionada
          </Text>
        </View>
      )}

      {media && (
        <Text
          style={{
            color: theme.colors.textMuted,
            marginBottom: 8,
          }}
        >
          {media.kind.toUpperCase()} • {media.width ?? "?"}×
          {media.height ?? "?"}
          {media.duration ? ` • ${(media.duration / 1000).toFixed(1)}s` : ""}
        </Text>
      )}

      <TouchableOpacity onPress={pickMedia} style={styles.pickBtn}>
        <LinearGradient colors={[gradStart, gradEnd]} style={styles.pickBtnBg}>
          <Text style={styles.pickBtnText}>
            {media ? "Trocar mídia" : "Escolher da galeria"}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {media?.kind === "image" && (
        <View style={styles.toolsRow}>
          <ToolButton label="Girar 90°" onPress={rotateImage} />
          <ToolButton label="Cortar 1:1" onPress={cropSquare} />
          <ToolButton label="Largura 1080px" onPress={resize1080} />
        </View>
      )}

      {media?.kind === "video" && (
        <View style={styles.toolsRow}>
          <ToolButton label="Cortar 0–10s" onPress={trimVideo_0_10} />
          <ToolButton label="Velocidade 2×" onPress={speed2x} />
        </View>
      )}

      <Text
        style={[
          styles.captionLabel,
          { color: theme.colors.textMuted },
        ]}
      >
        Legenda
      </Text>
      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder="Escreva algo..."
        placeholderTextColor={theme.colors.textMuted}
        multiline
        style={[
          styles.captionInput,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          },
        ]}
      />

      <TouchableOpacity
        onPress={upload}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
        <LinearGradient colors={[gradStart, gradEnd]} style={styles.publishBtn}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.publishText}>
              {composerMode === "post"
                ? "Publicar no feed"
                : composerMode === "story"
                ? "Publicar story"
                : "Publicar reel"}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.modeButton,
        {
          backgroundColor: active ? "#fff" : "rgba(0,0,0,0.25)",
        },
      ]}
    >
      <Text
        style={[
          styles.modeButtonText,
          {
            color: active ? theme.colors.background : "#fff",
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ToolButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.toolBtn,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
      accessibilityRole="button"
    >
      <Text style={[styles.toolText, { color: theme.colors.text }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
  },
  modeSwitcher: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
    marginBottom: 16,
  },
  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  previewImage: {
    width: "100%",
    height: 360,
    borderRadius: 12,
    marginBottom: 12,
  },
  videoWrap: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  video: { width: "100%", height: "100%" },
  placeholder: {
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    backgroundColor: Colors.surface,
  },
  pickBtn: { marginBottom: 16 },
  pickBtnBg: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  pickBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  toolsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  toolBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
  },
  toolText: { color: Colors.text, fontWeight: "600" },
  captionLabel: {
    color: Colors.textMuted,
    marginBottom: 6,
    marginTop: 8,
  },
  captionInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    textAlignVertical: "top",
  },
  publishBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  publishText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});