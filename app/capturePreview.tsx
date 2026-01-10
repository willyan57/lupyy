import Colors from "@/constants/Colors";
import { OffscreenLutRenderer } from "@/lib/gl/OffscreenLutRenderer";
import { uploadStoryMediaFromUri } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

type CaptureMode = "post" | "story" | "reel";
type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";

const FILTERS: {
  id: FilterId;
  name: string;
  overlay?: string;
  blur?: number;
  vignette?: boolean;
  glow?: boolean;
}[] = [
  { id: "none", name: "Normal" },
  { id: "warm", name: "Quente", overlay: "rgba(255,140,90,0.18)", glow: true },
  { id: "cool", name: "Frio", overlay: "rgba(70,150,255,0.18)", glow: true },
  { id: "pink", name: "Rosé", overlay: "rgba(255,80,160,0.16)", glow: true },
  {
    id: "gold",
    name: "Dourado",
    overlay: "rgba(255,220,120,0.16)",
    glow: true,
    vignette: true,
  },
  {
    id: "night",
    name: "Night",
    overlay: "rgba(0,0,0,0.28)",
    blur: 18,
    vignette: true,
  },
];

const ITEM_W = 92;

export default function CapturePreview() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const uri = useMemo(() => String(params.uri ?? ""), [params.uri]);
  const mediaType = useMemo(
    () => String(params.mediaType ?? "image") as "image" | "video",
    [params.mediaType]
  );
  const mode = useMemo(
    () => String(params.mode ?? "post") as CaptureMode,
    [params.mode]
  );
  const nonce = useMemo(() => String(params.nonce ?? ""), [params.nonce]);

  const insets = useSafeAreaInsets();

  const initialFilter = useMemo(
    () => String(params.filter ?? "none") as FilterId,
    [params.filter]
  );
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showInlineFilters, setShowInlineFilters] = useState(false);

  const activeFilter = useMemo(
    () => FILTERS.find((f) => f.id === filter) ?? FILTERS[0],
    [filter]
  );
  const filterIndex = useMemo(
    () => Math.max(0, FILTERS.findIndex((f) => f.id === filter)),
    [filter]
  );

  const transition = useRef(new Animated.Value(1)).current;
  const [prevOverlay, setPrevOverlay] = useState<string | null>(null);
  const [nextOverlay, setNextOverlay] = useState<string | null>(null);

  const blurOpacity = useRef(new Animated.Value(0)).current;
  const [blurIntensity, setBlurIntensity] = useState(0);

  const labelOpacity = useRef(new Animated.Value(0)).current;
  const labelScale = useRef(new Animated.Value(0.96)).current;
  const hideLabelRef = useRef<any>(null);

  const listRef = useRef<FlatList<any> | null>(null);
  const syncScrollRef = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  // começa COLAPSADO por padrão, igual Instagram
  const [toolsCollapsed, setToolsCollapsed] = useState(true);
  const [caption, setCaption] = useState("");
  const [activeToolSheet, setActiveToolSheet] = useState<
    | null
    | "text"
    | "stickers"
    | "music"
    | "mention"
    | "effects"
    | "draw"
    | "save"
  >(null);
  const [quickAdjustment, setQuickAdjustment] = useState<
    "none" | "bright" | "dark" | "punch"
  >("none");



  useEffect(() => {
    setMediaLoaded(false);
  }, [uri, nonce, mediaType]);

  useEffect(() => {
    const next = activeFilter.overlay ?? null;
    const prev = nextOverlay ?? prevOverlay ?? null;

    setPrevOverlay(prev);
    setNextOverlay(next);

    transition.stopAnimation();
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    const b = activeFilter.blur ?? 0;
    setBlurIntensity(b);
    blurOpacity.stopAnimation();
    blurOpacity.setValue(0);
    if (b > 0)
      Animated.timing(blurOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();

    if (hideLabelRef.current) clearTimeout(hideLabelRef.current);
    labelOpacity.stopAnimation();
    labelScale.stopAnimation();
    labelOpacity.setValue(0);
    labelScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.spring(labelScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 0,
      }),
    ]).start();
    hideLabelRef.current = setTimeout(() => {
      Animated.timing(labelOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }, 900);
  }, [activeFilter.id]);

  useEffect(() => {
    if (syncScrollRef.current) return;
    listRef.current?.scrollToOffset({
      offset: filterIndex * ITEM_W,
      animated: true,
    });
  }, [filterIndex]);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    };
    loadUser();
  }, []);

  useEffect(() => {
    setMediaLoaded(false);
  }, [uri, nonce]);

  const handleBack = () => router.back();

  const performSendWithUri = async (finalUri: string) => {
    if (!uri) return;

    if (mode === "story") {
      try {
        setSending(true);
        const uploaded = await uploadStoryMediaFromUri(
          finalUri,
          mediaType,
          filter
        );
        if (!uploaded) {
          setSending(false);
          return;
        }

        const expiresAt = new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString();

        const { error: dbError } = await supabase.from("stories").insert({
          user_id: userId,
          media_type: mediaType,
          media_path: uploaded.fileName,
          expires_at: expiresAt,
          filter,
        });

        const ok = !dbError;
        setSending(false);
        if (ok) router.replace("/feed");
      } catch {
        setSending(false);
      }
      return;
    }

    router.push({
      pathname: "/new" as any,
      params: { source: "camera", uri: finalUri, mediaType, filter },
    });
  };

  const handleSend = () => {
    if (!uri || sending || exporting) return;

    if (mediaType === "image" && filter !== "none") {
      setExporting(true);
      return;
    }

    void performSendWithUri(uri);
  };

  const label =
    mode === "story" ? "Publicar Story" : mode === "reel" ? "Avançar" : "Avançar";

  const onCarouselMomentumEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / ITEM_W);
    const safe = Math.max(0, Math.min(FILTERS.length - 1, idx));
    syncScrollRef.current = true;
    setFilter(FILTERS[safe].id);
    setTimeout(() => (syncScrollRef.current = false), 0);
  };

  const renderFilterItem = ({ item }: { item: any }) => {
    const active = item.id === filter;
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setFilter(item.id)}
        style={[styles.carouselItem, active && styles.carouselItemActive]}
      >
        <View
          style={[
            styles.carouselThumb,
            { backgroundColor: item.overlay ?? "rgba(255,255,255,0.18)" },
          ]}
        />
        <Text
          style={[styles.carouselText, active && styles.carouselTextActive]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const prevOpacity = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const nextOpacity = transition;

  // lista base de ferramentas (todas, sem "Mais/Menos")
  const baseTools = [
    { key: "text", label: "Texto", icon: "Aa" },
    // ícone sem emoji colorido, para ficar branco como os outros
    { key: "stickers", label: "Figurinhas", icon: "☻" },
    { key: "music", label: "Músicas", icon: "♫" },
    { key: "restyle", label: "Reestilizar", icon: "✧" },
    { key: "mention", label: "Mencionar", icon: "@" },
    { key: "effects", label: "Efeitos", icon: "✺" },
    { key: "draw", label: "Desenhar", icon: "✎" },
    { key: "save", label: "Salvar", icon: "⇣" },
  ] as const;
  const quickAdjustments = [
    { key: "none", label: "Normal" },
    { key: "bright", label: "Claro" },
    { key: "dark", label: "Escuro" },
    { key: "punch", label: "Punch" },
  ] as const;


  // quando estiver colapsado: mostra só as 4 primeiras + botão de expandir
  // quando expandido: mostra todas + botão de recolher
  const tools = toolsCollapsed
    ? [
        ...baseTools.slice(0, 4),
        { key: "more", label: "Mais", icon: "⋮" },
      ]
    : [
        ...baseTools,
        { key: "more", label: "Menos", icon: "⋮" },
      ];

  const handleToolPress = (key: string) => {
    if (key === "restyle") {
      setShowInlineFilters((prev) => !prev);
      return;
    }
    if (key === "more") {
      setToolsCollapsed((prev) => !prev);
      return;
    }

    if (
      key === "text" ||
      key === "stickers" ||
      key === "music" ||
      key === "mention" ||
      key === "effects" ||
      key === "draw" ||
      key === "save"
    ) {
      setActiveToolSheet(key as any);
      return;
    }

    // outros botões podem ser tratados aqui no futuro
  };

  return (
    <View style={styles.container}>
      {exporting && mediaType === "image" && uri ? (
        <OffscreenLutRenderer
          sourceUri={uri}
          filter={filter}
          onFinish={(processedUri) => {
            setExporting(false);
            const finalUri = processedUri || uri;
            void performSendWithUri(finalUri);
          }}
        />
      ) : null}

      {mediaType === "image" ? (
        <Image
          key={`${uri}::${nonce}::${filter}`}
          source={{ uri }}
          style={styles.preview}
          resizeMode="cover"
          onLoadEnd={() => setMediaLoaded(true)}
        />
      ) : (
        <Video
          key={`${uri}::${nonce}`}
          source={{ uri }}
          style={styles.preview}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          onLoad={() => setMediaLoaded(true)}
        />
      )}

      {prevOverlay && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.filterOverlay,
            { backgroundColor: prevOverlay, opacity: prevOpacity },
          ]}
        />
      )}
      {nextOverlay && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.filterOverlay,
            { backgroundColor: nextOverlay, opacity: nextOpacity },
          ]}
        />
      )}

      {blurIntensity > 0 && Platform.OS !== "web" && (
        <Animated.View
          pointerEvents="none"
          style={[styles.blurWrap, { opacity: blurOpacity }]}
        >
          <BlurView
            intensity={blurIntensity}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {activeFilter.vignette && (
        <View pointerEvents="none" style={styles.vignetteWrap}>
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vTop}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vBottom}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vLeft}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vRight}
          />
        </View>
      )}

      {activeFilter.glow && (
        <View pointerEvents="none" style={styles.glowWrap}>
          <LinearGradient
            colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]}
            style={styles.glowTop}
          />
        </View>
      )}

      {quickAdjustment === "bright" && (
        <View
          pointerEvents="none"
          style={[styles.adjustmentOverlay, styles.adjustmentBright]}
        />
      )}
      {quickAdjustment === "dark" && (
        <View
          pointerEvents="none"
          style={[styles.adjustmentOverlay, styles.adjustmentDark]}
        />
      )}
      {quickAdjustment === "punch" && (
        <View
          pointerEvents="none"
          style={[styles.adjustmentOverlay, styles.adjustmentPunch]}
        />
      )}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.filterLabel,
          { opacity: labelOpacity, transform: [{ scale: labelScale }] },
        ]}
      >
        <Text style={styles.filterLabelText}>{activeFilter.name}</Text>
      </Animated.View>

      {!mediaLoaded && !exporting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.75)", "rgba(0,0,0,0.0)"]}
        style={styles.topGradient}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.85)"]}
        style={styles.bottomGradient}
      />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.85}>
          <Text style={styles.topIcon}>←</Text>
        </TouchableOpacity>

        <View style={styles.topBadge}>
          <Text style={styles.topBadgeText}>
            {mode === "story" ? "Story" : mode === "reel" ? "Reel" : "Post"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setFiltersOpen(true)}
          activeOpacity={0.85}
          style={styles.topRight}
        >
          <Text style={styles.topRightIcon}>✦</Text>
        </TouchableOpacity>
      </View>

      {/* Ferramentas laterais estilo Instagram */}
      <View style={styles.rightTools}>
        {tools.map((tool) => (
          <TouchableOpacity
            key={tool.key}
            activeOpacity={0.9}
            onPress={() => handleToolPress(tool.key)}
            style={styles.rightToolButton}
          >
            {/* texto primeiro, bolinha depois */}
            {!toolsCollapsed && tool.key !== "more" && (
              <Text style={styles.rightToolLabel}>{tool.label}</Text>
            )}
            {!toolsCollapsed && tool.key === "more" && (
              <Text style={styles.rightToolLabel}>{tool.label}</Text>
            )}

            <View style={styles.rightToolCircle}>
              <Text style={styles.rightToolIcon}>{tool.icon}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.quickAdjustRow}>
          {quickAdjustments.map((item) => {
            const active = quickAdjustment === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.9}
                onPress={() => setQuickAdjustment(item.key as any)}
                style={[
                  styles.quickAdjustChip,
                  active && styles.quickAdjustChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.quickAdjustText,
                    active && styles.quickAdjustTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <TextInput
            style={styles.legendInput}
            placeholder="Adicione uma legenda..."
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={caption}
            onChangeText={setCaption}
            multiline
          />
        </View>

        <View style={styles.audienceRow}>
          <TouchableOpacity activeOpacity={0.9} style={styles.audienceChip}>
            <Text style={styles.audienceChipText}>Seus stories</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.9} style={styles.audienceChipAlt}>
            <Text style={styles.audienceChipAltText}>Amigos próximos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleSend}
            style={styles.sendButton}
            disabled={sending || exporting}
          >
            {sending || exporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendIcon}>➜</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Carrossel de filtros inline ao tocar em Reestilizar */}
      <View
        style={[styles.carouselWrap, !showInlineFilters && { opacity: 0 }]}
        pointerEvents={showInlineFilters ? "auto" : "none"}
      >
        <FlatList
          ref={(r) => {
            listRef.current = r;
          }}
          data={FILTERS}
          keyExtractor={(i) => i.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_W}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: (width - ITEM_W) / 2,
          }}
          renderItem={renderFilterItem}
          onMomentumScrollEnd={onCarouselMomentumEnd}
          getItemLayout={(_, index) => ({
            length: ITEM_W,
            offset: ITEM_W * index,
            index,
          })}
        />
      </View>

      {/* Modal de filtros completo */}

      {/* Modais de ferramentas (Etapa 1) */}
      <Modal
        visible={activeToolSheet === "text"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveToolSheet(null)}
      >
        <View style={styles.toolModalOverlay}>
          <View style={[styles.textToolContainer, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.textToolHeader}>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}>
                <Text style={styles.textToolHeaderButton}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={styles.textToolHeaderTitle}>Texto</Text>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}>
                <Text style={styles.textToolHeaderButton}>Concluir</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.textToolFormattingRow}>
              <Text style={styles.textToolFormattingLabel}>Aa</Text>
              <View style={styles.textToolColorDotRow}>
                <View style={styles.textToolColorDot} />
                <View style={styles.textToolColorDot} />
                <View style={styles.textToolColorDot} />
              </View>
            </View>

            <TextInput
              style={styles.textToolInput}
              placeholder="Toque para digitar..."
              placeholderTextColor="#ccc"
              multiline
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={
          activeToolSheet === "stickers" ||
          activeToolSheet === "music" ||
          activeToolSheet === "mention" ||
          activeToolSheet === "effects" ||
          activeToolSheet === "draw" ||
          activeToolSheet === "save"
        }
        transparent
        animationType="slide"
        onRequestClose={() => setActiveToolSheet(null)}
      >
        <Pressable
          style={styles.toolModalOverlay}
          onPress={() => setActiveToolSheet(null)}
        >
          <Pressable style={styles.bottomSheet} onPress={() => {}}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeaderRow}>
              <Text style={styles.bottomSheetTitle}>
                {activeToolSheet === "stickers" && "Figurinhas"}
                {activeToolSheet === "music" && "Músicas"}
                {activeToolSheet === "mention" && "Mencionar"}
                {activeToolSheet === "effects" && "Efeitos"}
                {activeToolSheet === "draw" && "Desenhar"}
                {activeToolSheet === "save" && "Salvar"}
              </Text>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}>
                <Text style={styles.bottomSheetClose}>Fechar</Text>
              </TouchableOpacity>
            </View>

            {/* Barra de busca genérica */}
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar..."
                placeholderTextColor="#888"
              />
            </View>

            {/* Conteúdo de exemplo por ferramenta (Etapa 1 - estático) */}
            {activeToolSheet === "stickers" && (
              <View style={styles.stickersGrid}>
                {[
                  "LOCALIZAÇÃO",
                  "MENÇÃO",
                  "MÚSICA",
                  "GIF",
                  "PERGUNTAS",
                  "ENQUETE",
                  "LINK",
                  "HASHTAG",
                ].map((label) => (
                  <View key={label} style={styles.stickerChip}>
                    <Text style={styles.stickerChipText}>{label}</Text>
                  </View>
                ))}
              </View>
            )}

            {activeToolSheet === "music" && (
              <ScrollView style={styles.musicList}>
                {[
                  "Fim de Tarde – JrOliveira",
                  "Dias De Luta, Dias De Glória – Charlie Brown Jr.",
                  "Disciplina Blindada – Jamal Natuê",
                  "De uns Dias pra Cá – Mc Luuky",
                  "Um Centímetro – Toque Dez",
                  "Onde Nós Chegou – Toque Dez",
                ].map((track) => (
                  <View key={track} style={styles.musicRow}>
                    <View style={styles.musicThumb} />
                    <View style={styles.musicInfo}>
                      <Text style={styles.musicTitle}>{track}</Text>
                      <Text style={styles.musicSubtitle}>Pré-visualização</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            {activeToolSheet === "mention" && (
              <ScrollView style={styles.mentionList}>
                {[
                  "kaka_piecho",
                  "julyanags",
                  "sthefandambros",
                  "regisrafael",
                  "alexandre.da.fonseca",
                ].map((user) => (
                  <View key={user} style={styles.mentionRow}>
                    <View style={styles.mentionAvatar} />
                    <Text style={styles.mentionName}>{user}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            {(activeToolSheet === "effects" ||
              activeToolSheet === "draw" ||
              activeToolSheet === "save") && (
              <View style={styles.placeholderContent}>
                <Text style={styles.placeholderText}>
                  Em breve aqui vão os recursos completos de{" "}
                  {activeToolSheet === "effects" && "efeitos"}
                  {activeToolSheet === "draw" && "desenho"}
                  {activeToolSheet === "save" && "salvar / rascunho"}{" "}
                  do seu Story.
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={filtersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setFiltersOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filtros</Text>

            <View style={styles.filtersGrid}>
              {FILTERS.map((f) => {
                const active = f.id === filter;
                return (
                  <TouchableOpacity
                    key={f.id}
                    activeOpacity={0.9}
                    onPress={() => setFilter(f.id)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <View
                      style={[
                        styles.filterThumb,
                        {
                          backgroundColor:
                            f.overlay ?? "rgba(255,255,255,0.18)",
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {f.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setFiltersOpen(false)}
              style={styles.sheetDone}
            >
              <Text style={styles.sheetDoneText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  preview: { width, height, position: "absolute", top: 0, left: 0 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  filterOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blurWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  vignetteWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  vTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  vBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    transform: [{ rotate: "180deg" }],
  },
  vLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 140,
    transform: [{ rotate: "90deg" }],
  },
  vRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 140,
    transform: [{ rotate: "-90deg" }],
  },
  glowWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  glowTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  adjustmentOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  adjustmentBright: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  adjustmentDark: {
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  adjustmentPunch: {
    backgroundColor: "rgba(0,0,0,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  filterLabel: {
    position: "absolute",
    top: height * 0.18,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterLabelText: { color: "#fff", fontWeight: "900", letterSpacing: 0.3 },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.25,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.42,
  },
  topBar: {
    position: "absolute",
    top: 26,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topIcon: { color: "#fff", fontSize: 26, fontWeight: "700" },
  topBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  topBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  topRight: { width: 40, alignItems: "flex-end" },
  topRightIcon: { color: "#fff", fontSize: 22 },
  rightTools: {
    position: "absolute",
    right: 12,
    top: height * 0.16,
  },
  rightToolButton: {
    flexDirection: "row-reverse", // texto primeiro, ícone depois
    alignItems: "center",
    marginBottom: 10,
  },
  rightToolCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  rightToolIcon: { color: "#fff", fontSize: 18, fontWeight: "800" },
  rightToolLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  quickAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  quickAdjustChip: {
    flex: 1,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  quickAdjustChipActive: {
    backgroundColor: "rgba(255,51,85,0.2)",
    borderColor: "rgba(255,51,85,0.6)",
  },
  quickAdjustText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "700",
  },
  quickAdjustTextActive: {
    color: "#fff",
  },
  legendRow: {
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
  },
  legendInput: {
    color: "#fff",
    fontSize: 14,
    maxHeight: 70,
  },
  audienceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  audienceChip: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  audienceChipText: {
    color: "#000",
    fontWeight: "800",
    fontSize: 13,
  },
  audienceChipAlt: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  audienceChipAltText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: "rgba(0,149,246,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  sendIcon: { color: "#fff", fontSize: 20, fontWeight: "900" },
  carouselWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 110,
    height: 86,
  },
  carouselItem: {
    width: ITEM_W,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  carouselItemActive: {
    backgroundColor: "rgba(255,51,85,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,51,85,0.45)",
  },
  carouselThumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    marginBottom: 8,
  },
  carouselText: {
    color: "rgba(255,255,255,0.78)",
    fontWeight: "900",
    fontSize: 12,
    maxWidth: 80,
    textAlign: "center",
  },
  carouselTextActive: { color: "#fff" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "rgba(18,18,18,0.98)",
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 10,
  },
  sheetTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 14,
    alignSelf: "center",
  },
  filtersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  filterChip: {
    width: (width - 18 * 2 - 10 * 2) / 3,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  filterChipActive: {
    backgroundColor: "rgba(255,51,85,0.18)",
    borderColor: "rgba(255,51,85,0.45)",
  },
  filterThumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    marginBottom: 8,
  },
  filterChipText: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "800",
    fontSize: 12,
  },
  filterChipTextActive: { color: "#fff" },
  sheetDone: {
    marginTop: 16,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,51,85,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDoneText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  toolModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  textToolContainer: {
    backgroundColor: "#000",
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  textToolHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  textToolHeaderTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  textToolHeaderButton: {
    color: "#0095F6",
    fontSize: 14,
    fontWeight: "600",
  },
  textToolFormattingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  textToolFormattingLabel: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  textToolColorDotRow: {
    flexDirection: "row",
    gap: 8,
  },
  textToolColorDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  textToolInput: {
    minHeight: 120,
    color: "#fff",
    fontSize: 18,
    textAlignVertical: "top",
  },
  bottomSheet: {
    backgroundColor: Colors.surface,
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomSheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)",
    marginBottom: 12,
  },
  bottomSheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  bottomSheetTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  bottomSheetClose: {
    color: "#0095F6",
    fontSize: 14,
    fontWeight: "600",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
    color: "#888",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  stickersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginTop: 4,
  },
  stickerChip: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  stickerChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111",
  },
  musicList: {
    maxHeight: 260,
    marginTop: 4,
  },
  musicRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  musicThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 10,
  },
  musicInfo: {
    flex: 1,
  },
  musicTitle: {
    color: Colors.text,
    fontSize: 14,
    marginBottom: 2,
  },
  musicSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  mentionList: {
    maxHeight: 260,
    marginTop: 4,
  },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  mentionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginRight: 10,
  },
  mentionName: {
    color: Colors.text,
    fontSize: 14,
  },
  placeholderContent: {
    marginTop: 16,
    paddingVertical: 16,
  },
  placeholderText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    lineHeight: 18,
  },
});

