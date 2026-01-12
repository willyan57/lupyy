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
type PrivacyLevel = "public" | "followers" | "private";
type EffectPreset = "none" | "vintage" | "cinematic" | "bw" | "warm" | "cool";

const MAX_CAPTION_LENGTH = 2200;

export default function New() {
  const { theme } = useTheme();

  const params = useLocalSearchParams<{
    source?: string;
    uri?: string;
    mediaType?: string;
    filter?: string;
  }>();

  const [mediaItems, setMediaItems] = useState<Picked[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>("post");
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>("public");
  const filterFromCamera =
    typeof params.filter === "string" ? String(params.filter) : undefined;

  function mapFilterToEffectPreset(filter?: string | null): EffectPreset {
    switch (filter) {
      case "warm":
        return "warm";
      case "cool":
        return "cool";
      case "pink":
        return "vintage";
      case "gold":
        return "cinematic";
      case "night":
        return "bw";
      default:
        return "none";
    }
  }

  const [effectPreset, setEffectPreset] = useState<EffectPreset>(
    mapFilterToEffectPreset(filterFromCamera)
  );

  // Etapa 4 – ajustes de luz e cor (estado local, não mexe na mídia ainda)
  const [brightness, setBrightness] = useState(0); // -50 a +50
  const [contrast, setContrast] = useState(0); // -50 a +50

  const media = mediaItems[activeIndex] ?? null;

  function updateActiveMedia(updater: (m: Picked) => Picked) {
    setMediaItems((items) => {
      const current = items[activeIndex];
      if (!current) return items;
      const next = [...items];
      next[activeIndex] = updater(current);
      return next;
    });
  }

  useEffect(() => {
    const source = params.source;
    const uriParam = params.uri;
    const mediaType = params.mediaType;

    if (source === "camera" && typeof uriParam === "string" && mediaItems.length === 0) {
      const kind: "image" | "video" = mediaType === "video" ? "video" : "image";

      setMediaItems([
        {
          uri: uriParam,
          kind,
          width: null,
          height: null,
          duration: null,
          thumbUri: null,
        },
      ]);
      setActiveIndex(0);
    }
  }, [params, mediaItems]);

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
        selectionLimit: 10,
      });
      if (result.canceled) return;

      const picked: Picked[] = [];

      for (const asset of result.assets) {
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

        picked.push({
          uri: asset.uri,
          kind,
          width: asset.width ?? null,
          height: asset.height ?? null,
          duration: asset.duration ? Math.round(asset.duration * 1000) : null,
          thumbUri: thumbUri ?? null,
        });
      }

      setMediaItems((prev) => {
        const merged = [...prev, ...picked];
        if (merged.length === 0) return merged;
        if (prev.length === 0) {
          setActiveIndex(0);
        } else {
          setActiveIndex(prev.length);
        }
        return merged.slice(0, 10);
      });

      // sempre que trocar radicalmente a seleção, zera os ajustes
      setBrightness(0);
      setContrast(0);
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
      updateActiveMedia((current) => ({
        ...current,
        uri: res.uri,
        width: res.width,
        height: res.height,
      }));
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
      updateActiveMedia((current) => ({
        ...current,
        uri: res.uri,
        width: res.width,
        height: res.height,
      }));
    } catch (e: any) {
      Alert.alert("Falha ao recortar imagem", e?.message ?? String(e));
    }
  }

  async function cropAspect(targetRatio: number) {
    if (!media || media.kind !== "image" || !media.width || !media.height)
      return;
    try {
      const w = media.width;
      const h = media.height;
      const currentRatio = w / h;

      let cropWidth = w;
      let cropHeight = h;
      let originX = 0;
      let originY = 0;

      if (currentRatio > targetRatio) {
        cropWidth = Math.round(h * targetRatio);
        cropHeight = h;
        originX = Math.floor((w - cropWidth) / 2);
        originY = 0;
      } else if (currentRatio < targetRatio) {
        cropWidth = w;
        cropHeight = Math.round(w / targetRatio);
        originX = 0;
        originY = Math.floor((h - cropHeight) / 2);
      }

      const res = await ImageManipulator.manipulateAsync(
        media.uri,
        [
          {
            crop: {
              originX,
              originY,
              width: cropWidth,
              height: cropHeight,
            },
          },
        ],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );

      updateActiveMedia((current) => ({
        ...current,
        uri: res.uri,
        width: res.width,
        height: res.height,
      }));
    } catch (e: any) {
      Alert.alert("Falha ao recortar imagem", e?.message ?? String(e));
    }
  }

  async function cropPortrait4x5() {
    await cropAspect(4 / 5);
  }

  async function cropWide16x9() {
    await cropAspect(16 / 9);
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
      updateActiveMedia((current) => ({
        ...current,
        uri: res.uri,
        width: res.width,
        height: res.height,
      }));
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

  // Controles da Etapa 4 – apenas estado por enquanto (bake real na Etapa 7)
  function changeBrightness(delta: number) {
    setBrightness((prev) => {
      const next = Math.max(-50, Math.min(50, prev + delta));
      return next;
    });
  }

  function changeContrast(delta: number) {
    setContrast((prev) => {
      const next = Math.max(-50, Math.min(50, prev + delta));
      return next;
    });
  }

  function resetAdjustments() {
    setBrightness(0);
    setContrast(0);
  }

  async function uploadToBucket(
    bucket: "posts" | "stories",
    path: string,
    uri: string,
    contentType: string,
    maxRetries: number = 3
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (Platform.OS === "web") {
          const response = await fetch(uri);
          const blob = await response.blob();
          const { error } = await supabase.storage
            .from(bucket)
            .upload(path, blob, { contentType, upsert: true });
          if (error) throw error;
        } else {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

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
        return;
      } catch (err) {
        if (attempt === maxRetries) {
          throw err;
        }
      }
    }
  }

  function extractTags(text: string) {
    const hashtagMatches = text.match(/#(\w+)/g) ?? [];
    const mentionMatches = text.match(/@(\w+)/g) ?? [];

    const hashtags = Array.from(
      new Set(
        hashtagMatches.map((tag) =>
          tag.replace("#", "").trim().toLowerCase()
        )
      )
    );
    const mentions = Array.from(
      new Set(
        mentionMatches.map((m) =>
          m.replace("@", "").trim().toLowerCase()
        )
      )
    );

    return { hashtags, mentions };
  }

  async function upload() {
    try {
      if (!media || mediaItems.length === 0) {
        return Alert.alert("Selecione uma mídia primeiro.");
      }

      if (composerMode === "reel") {
        return Alert.alert(
          "Modo ainda não disponível",
          "Publicar como Reel estará disponível em uma próxima versão. No momento, este fluxo publica posts do feed e stories."
        );
      }

      setLoading(true);
      setUploadProgress(5);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setLoading(false);
        setUploadProgress(null);
        return Alert.alert("Sessão expirada", "Entre novamente para publicar.");
      }

      const stamp = Date.now();
      const bucketName = composerMode === "story" ? "stories" : "posts";

      // STORIES
      if (composerMode === "story") {
        setUploadProgress(10);

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

        setUploadProgress(30);

        const ext = isVideo ? "mp4" : "jpg";
        const ct = isVideo ? "video/mp4" : "image/jpeg";

        const basePath = `${user.id}/${stamp}`;
        const mediaPath = `${basePath}.${ext}`;

        await uploadToBucket(bucketName, mediaPath, uploadUri, ct);
        setUploadProgress(70);

        let thumbPath: string | null = null;
        if (isVideo && thumbUploadUri) {
          thumbPath = `${basePath}.jpg`;
          await uploadToBucket(bucketName, thumbPath, thumbUploadUri, "image/jpeg");
        }

        setUploadProgress(80);

        const { hashtags, mentions } = extractTags(caption);

        const { error: insStoryErr } = await supabase.from("stories").insert({
          user_id: user.id,
          media_type: media.kind,
          media_path: mediaPath,
          thumbnail_path: thumbPath,
          caption: caption || null,
          has_sound: isVideo ? true : false,
        });
        if (insStoryErr) throw insStoryErr;

        setUploadProgress(100);
        Alert.alert("Tudo certo", "Seu story foi publicado.");

        setMediaItems([]);
        setActiveIndex(0);
        setCaption("");
        setPrivacyLevel("public");
        setBrightness(0);
        setContrast(0);
        setUploadProgress(null);
        return;
      }

      // POSTS (carrossel)
      setUploadProgress(10);

      const total = mediaItems.length;
      const uploaded: {
        media: Picked;
        mediaPath: string;
        thumbPath: string | null;
      }[] = [];

      let index = 0;
      for (const item of mediaItems) {
        const isVideo = item.kind === "video";
        let uploadUri = item.uri;
        let thumbUploadUri = item.thumbUri ?? null;

        if (!isVideo) {
          uploadUri = await compressImage(item.uri);
        } else {
          const prepared = await prepareVideo(item.uri);
          uploadUri = prepared.videoUri;
          if (!thumbUploadUri && prepared.thumbUri) {
            thumbUploadUri = prepared.thumbUri;
          }
        }

        const ext = isVideo ? "mp4" : "jpg";
        const ct = isVideo ? "video/mp4" : "image/jpeg";

        const basePath = `${user.id}/${stamp}_${index}`;
        const mediaPath = `${basePath}.${ext}`;

        await uploadToBucket(bucketName, mediaPath, uploadUri, ct);

        let thumbPath: string | null = null;
        if (isVideo && thumbUploadUri) {
          thumbPath = `${basePath}.jpg`;
          await uploadToBucket(bucketName, thumbPath, thumbUploadUri, "image/jpeg");
        }

        uploaded.push({
          media: item,
          mediaPath,
          thumbPath,
        });

        index += 1;
        const baseProgress = 30;
        const maxProgress = 70;
        const ratio = index / total;
        const currentProgress = baseProgress + Math.round((maxProgress - baseProgress) * ratio);
        setUploadProgress(currentProgress);
      }

      setUploadProgress(80);

      const { hashtags, mentions } = extractTags(caption);

      const first = uploaded[0];

      const { data: insertedPosts, error: insPostErr } = await supabase
        .from("posts")
        .insert({
          user_id: user.id,
          media_type: first.media.kind,
          image_path: first.mediaPath,
          thumbnail_path: first.thumbPath,
          caption: caption || null,
          width: first.media.width,
          height: first.media.height,
          duration: first.media.duration,
          hashtags,
          mentions,
          privacy_level: privacyLevel,
          is_carousel: uploaded.length > 1,
        })
        .select("id")
        .single();

      if (insPostErr) throw insPostErr;
      const postId = insertedPosts.id;

      const rows = uploaded.map((item, position) => ({
        post_id: postId,
        media_type: item.media.kind,
        media_path: item.mediaPath,
        thumbnail_path: item.thumbPath,
        width: item.media.width,
        height: item.media.height,
        duration: item.media.duration,
        position,
      }));

      const { error: insMediaErr } = await supabase
        .from("post_media")
        .insert(rows);

      if (insMediaErr) throw insMediaErr;

      setUploadProgress(100);
      Alert.alert("Tudo certo", "Seu post foi publicado no feed.");

      setMediaItems([]);
      setActiveIndex(0);
      setCaption("");
      setPrivacyLevel("public");
      setBrightness(0);
      setContrast(0);
      setUploadProgress(null);
    } catch (e: any) {
      console.log("upload error", e);
      Alert.alert("Erro ao publicar", e?.message ?? String(e));
      setUploadProgress(null);
    } finally {
      setLoading(false);
    }
  }

  const gradStart = theme.colors.primary;
  const gradEnd = theme.colors.accent ?? theme.colors.primary;

  const captionLength = caption.length;

  function handleCaptionChange(text: string) {
    if (text.length <= MAX_CAPTION_LENGTH) {
      setCaption(text);
    } else {
      setCaption(text.slice(0, MAX_CAPTION_LENGTH));
    }
  }

  const hasAdjustments = brightness !== 0 || contrast !== 0;

  const effectPresetLabel =
    effectPreset === "none"
      ? "Padrão"
      : effectPreset === "vintage"
      ? "Vintage"
      : effectPreset === "cinematic"
      ? "Cinema"
      : effectPreset === "bw"
      ? "P&B"
      : effectPreset === "warm"
      ? "Quente"
      : "Frio";

  const adjustmentsSummary = hasAdjustments
    ? [
        brightness !== 0
          ? `Brilho ${brightness > 0 ? `+${brightness}` : brightness}`
          : null,
        contrast !== 0
          ? `Contraste ${contrast > 0 ? `+${contrast}` : contrast}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Nenhum ajuste de luz e cor";

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
            marginBottom: 4,
          }}
        >
          {media.kind.toUpperCase()} • {media.width ?? "?"}×
          {media.height ?? "?"}
          {media.duration ? ` • ${(media.duration / 1000).toFixed(1)}s` : ""}
        </Text>
      )}

      {media && (
        <View style={styles.previewAdjustInfo}>
          <Text
            style={[
              styles.previewAdjustText,
              { color: theme.colors.textMuted },
            ]}
          >
            Filtro: {effectPresetLabel} • {adjustmentsSummary}
          </Text>
        </View>
      )}

      {mediaItems.length > 1 && (
        <View style={{ marginBottom: 8 }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              marginBottom: 4,
            }}
          >
            Mídia {activeIndex + 1} de {mediaItems.length}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {mediaItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  setActiveIndex(index);
                  setBrightness(0);
                  setContrast(0);
                }}
                style={{
                  borderRadius: 8,
                  borderWidth: index === activeIndex ? 2 : 1,
                  borderColor:
                    index === activeIndex
                      ? theme.colors.primary
                      : theme.colors.border,
                  overflow: "hidden",
                  width: 56,
                  height: 56,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.colors.surface,
                }}
              >
                {item.kind === "image" ? (
                  <Image
                    source={{ uri: item.uri }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontSize: 10,
                    }}
                  >
                    Vídeo
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <TouchableOpacity onPress={pickMedia} style={styles.pickBtn}>
        <LinearGradient colors={[gradStart, gradEnd]} style={styles.pickBtnBg}>
          <Text style={styles.pickBtnText}>
            {mediaItems.length > 0 ? "Adicionar mídia" : "Escolher da galeria"}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {media?.kind === "image" && (
        <>
          <View style={styles.toolsRow}>
            <ToolButton label="Girar 90°" onPress={rotateImage} />
            <ToolButton label="Cortar 1:1" onPress={cropSquare} />
            <ToolButton label="Cortar 4:5" onPress={cropPortrait4x5} />
            <ToolButton label="Cortar 16:9" onPress={cropWide16x9} />
            <ToolButton label="Largura 1080px" onPress={resize1080} />
          </View>

          <View style={styles.adjustBlock}>
            <Text
              style={[
                styles.adjustTitle,
                { color: theme.colors.text },
              ]}
            >
              Ajustes de luz e cor (Etapa 4)
            </Text>

            <View style={styles.adjustRow}>
              <Text
                style={[
                  styles.adjustLabelInline,
                  { color: theme.colors.textMuted },
                ]}
              >
                Brilho
              </Text>
              <View style={styles.adjustButtons}>
                <SmallAdjustButton label="−" onPress={() => changeBrightness(-10)} />
                <Text
                  style={[
                    styles.adjustValue,
                    { color: theme.colors.text },
                  ]}
                >
                  {brightness > 0 ? `+${brightness}` : brightness}
                </Text>
                <SmallAdjustButton label="+" onPress={() => changeBrightness(10)} />
              </View>
            </View>

            <View style={styles.adjustRow}>
              <Text
                style={[
                  styles.adjustLabelInline,
                  { color: theme.colors.textMuted },
                ]}
              >
                Contraste
              </Text>
              <View style={styles.adjustButtons}>
                <SmallAdjustButton label="−" onPress={() => changeContrast(-10)} />
                <Text
                  style={[
                    styles.adjustValue,
                    { color: theme.colors.text },
                  ]}
                >
                  {contrast > 0 ? `+${contrast}` : contrast}
                </Text>
                <SmallAdjustButton label="+" onPress={() => changeContrast(10)} />
              </View>
            </View>

            <View style={styles.adjustFooterRow}>
              <TouchableOpacity
                onPress={resetAdjustments}
                disabled={!hasAdjustments}
                style={[
                  styles.adjustResetBtn,
                  {
                    opacity: hasAdjustments ? 1 : 0.5,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.adjustResetText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Resetar ajustes
                </Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.adjustHint,
                  { color: theme.colors.textMuted },
                ]}
              >
                Nesta etapa estamos montando o painel. A aplicação definitiva
                dos ajustes será feita junto com os filtros avançados.
              </Text>
            </View>
          </View>

          <View style={styles.effectsBlock}>
            <Text
              style={[
                styles.effectsTitle,
                { color: theme.colors.text },
              ]}
            >
              Efeitos rápidos (Etapa 5)
            </Text>

            <Text
              style={[
                styles.effectsSubtitle,
                { color: theme.colors.textMuted },
              ]}
            >
              Escolha um clima para sua foto. A aplicação visual completa
              será ligada ao pipeline de filtros nas Etapas 7 e 9.
            </Text>

            <View style={styles.effectsRow}>
              <EffectChip
                label="Padrão"
                description="Sem efeito extra"
                active={effectPreset === "none"}
                onPress={() => setEffectPreset("none")}
              />
              <EffectChip
                label="Vintage"
                description="Tons envelhecidos"
                active={effectPreset === "vintage"}
                onPress={() => setEffectPreset("vintage")}
              />
            </View>

            <View style={styles.effectsRow}>
              <EffectChip
                label="Cinema"
                description="Mais contraste"
                active={effectPreset === "cinematic"}
                onPress={() => setEffectPreset("cinematic")}
              />
              <EffectChip
                label="P&B"
                description="Preto e branco"
                active={effectPreset === "bw"}
                onPress={() => setEffectPreset("bw")}
              />
            </View>

            <View style={styles.effectsRow}>
              <EffectChip
                label="Quente"
                description="Tons alaranjados"
                active={effectPreset === "warm"}
                onPress={() => setEffectPreset("warm")}
              />
              <EffectChip
                label="Frio"
                description="Tons azulados"
                active={effectPreset === "cool"}
                onPress={() => setEffectPreset("cool")}
              />
            </View>
          </View>
        </>
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
      <View style={styles.captionWrapper}>
        <TextInput
          value={caption}
          onChangeText={handleCaptionChange}
          placeholder="Escreva algo... use @ para marcar e # para temas"
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
        <Text
          style={[
            styles.captionCounter,
            {
              color:
                captionLength >= MAX_CAPTION_LENGTH
                  ? "#ff4d4f"
                  : theme.colors.textMuted,
            },
          ]}
        >
          {captionLength}/{MAX_CAPTION_LENGTH}
        </Text>
      </View>

      <Text
        style={[styles.captionLabel, { color: theme.colors.textMuted }]}
      >
        Privacidade
      </Text>
      <View style={styles.privacyRow}>
        <PrivacyButton
          label="Público"
          value="public"
          active={privacyLevel === "public"}
          onPress={() => setPrivacyLevel("public")}
        />
        <PrivacyButton
          label="Seguidores"
          value="followers"
          active={privacyLevel === "followers"}
          onPress={() => setPrivacyLevel("followers")}
        />
        <PrivacyButton
          label="Somente eu"
          value="private"
          active={privacyLevel === "private"}
          onPress={() => setPrivacyLevel("private")}
        />
      </View>

      {loading && uploadProgress !== null && (
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${uploadProgress}%` },
              ]}
            />
          </View>
        </View>
      )}

      <TouchableOpacity
        onPress={upload}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
        <LinearGradient colors={[gradStart, gradEnd]} style={styles.publishBtn}>
          {loading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color="#fff" />
              <View style={{ flexDirection: "column" }}>
                <Text style={styles.publishText}>
                  {uploadProgress !== null
                    ? uploadProgress < 15
                      ? "Preparando mídia..."
                      : uploadProgress < 40
                      ? "Otimizando qualidade..."
                      : uploadProgress < 80
                      ? "Enviando para o Lupyy..."
                      : "Finalizando publicação..."
                    : "Publicando..."}
                </Text>
                {uploadProgress !== null && (
                  <Text style={styles.publishSubText}>
                    {uploadProgress}%
                  </Text>
                )}
              </View>
            </View>
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

function SmallAdjustButton({
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
        styles.adjustSmallBtn,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
      accessibilityRole="button"
    >
      <Text
        style={[
          styles.adjustSmallBtnText,
          { color: theme.colors.text },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function EffectChip({
  label,
  description,
  active,
  onPress,
}: {
  label: string;
  description: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.effectChip,
        {
          borderColor: active ? theme.colors.primary : theme.colors.border,
          backgroundColor: active
            ? "rgba(255,255,255,0.08)"
            : theme.colors.surface,
        },
      ]}
    >
      <Text
        style={[
          styles.effectChipLabel,
          { color: active ? theme.colors.primary : theme.colors.text },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.effectChipDescription,
          { color: theme.colors.textMuted },
        ]}
      >
        {description}
      </Text>
    </TouchableOpacity>
  );
}

function PrivacyButton({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: PrivacyLevel;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.privacyButton,
        {
          borderColor: active ? theme.colors.primary : theme.colors.border,
          backgroundColor: active
            ? "rgba(255,255,255,0.06)"
            : theme.colors.surface,
        },
      ]}
    >
      <Text
        style={[
          styles.privacyButtonText,
          {
            color: active ? theme.colors.primary : theme.colors.textMuted,
          },
        ]}
      >
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
  previewAdjustInfo: {
    marginBottom: 8,
  },
  previewAdjustText: {
    fontSize: 11,
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
  // Etapa 4 – estilos do painel de ajuste
  adjustBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    marginBottom: 12,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  adjustTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  adjustLabelInline: {
    fontSize: 13,
    fontWeight: "500",
  },
  adjustButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adjustValue: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "center",
  },
  adjustSmallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  adjustSmallBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  adjustFooterRow: {
    marginTop: 8,
  },
  adjustResetBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 4,
  },
  adjustResetText: {
    fontSize: 12,
    fontWeight: "500",
  },
  adjustHint: {
    fontSize: 11,
    lineHeight: 14,
  },
  effectsBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    marginBottom: 12,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  effectsTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  effectsSubtitle: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 10,
  },
  effectsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  effectChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  effectChipLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  effectChipDescription: {
    fontSize: 11,
  },
  captionLabel: {
    color: Colors.textMuted,
    marginBottom: 6,
    marginTop: 8,
  },
  captionWrapper: {
    position: "relative",
    marginBottom: 8,
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
  captionCounter: {
    position: "absolute",
    right: 8,
    bottom: 6,
    fontSize: 11,
  },
  privacyRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  privacyButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  privacyButtonText: {
    fontSize: 12,
    fontWeight: "600",
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
  publishSubText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
});
