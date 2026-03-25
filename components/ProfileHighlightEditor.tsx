// components/ProfileHighlightEditor.tsx — Create/edit highlights from archived stories
import { useTheme } from "@/contexts/ThemeContext";
import {
    type ArchivedStory,
    type Highlight,
    addStoriesToHighlight,
    createHighlight,
    deleteHighlight,
    fetchAllUserStories,
    fetchHighlightItems,
    removeStoryFromHighlight,
    updateHighlight,
} from "@/lib/profileHighlights";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

type Props = {
  visible: boolean;
  userId: string;
  /** If provided, editing existing highlight. If null, creating new. */
  highlight?: Highlight | null;
  onClose: () => void;
  onSaved: () => void;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const THUMB_GAP = 4;
const THUMB_COLS = 3;
const THUMB_SIZE = (Math.min(SCREEN_WIDTH, 500) - 32 - THUMB_GAP * (THUMB_COLS - 1)) / THUMB_COLS;

export default function ProfileHighlightEditor({ visible, userId, highlight, onClose, onSaved }: Props) {
  const { theme } = useTheme();
  const isEditing = !!highlight;

  const [title, setTitle] = useState(highlight?.title || "");
  const [stories, setStories] = useState<ArchivedStory[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [existingIds, setExistingIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load stories and existing items
  useEffect(() => {
    if (!visible || !userId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      const allStories = await fetchAllUserStories(userId);
      if (cancelled) return;
      setStories(allStories);

      if (highlight) {
        setTitle(highlight.title);
        const items = await fetchHighlightItems(highlight.id);
        if (cancelled) return;
        const ids = new Set(items.map((i) => i.story_id));
        setSelectedIds(ids);
        setExistingIds(ids);
      } else {
        setTitle("");
        setSelectedIds(new Set());
        setExistingIds(new Set());
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [visible, userId, highlight]);

  const toggleStory = useCallback((storyId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim() || "Destaque";
    if (selectedIds.size === 0) {
      Alert.alert("Selecione stories", "Escolha pelo menos um story para o destaque.");
      return;
    }

    setSaving(true);

    try {
      if (isEditing && highlight) {
        // Update title
        if (trimmedTitle !== highlight.title) {
          await updateHighlight(highlight.id, { title: trimmedTitle });
        }

        // Find added and removed
        const added = [...selectedIds].filter((id) => !existingIds.has(id));
        const removed = [...existingIds].filter((id) => !selectedIds.has(id));

        if (added.length > 0) {
          await addStoriesToHighlight(highlight.id, added);
        }
        for (const id of removed) {
          await removeStoryFromHighlight(highlight.id, id);
        }
      } else {
        // Create new
        await createHighlight(userId, trimmedTitle, [...selectedIds]);
      }

      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível salvar o destaque.");
    } finally {
      setSaving(false);
    }
  }, [title, selectedIds, existingIds, isEditing, highlight, userId, onSaved, onClose]);

  const handleDelete = useCallback(async () => {
    if (!highlight) return;

    Alert.alert("Excluir destaque", `Deseja excluir "${highlight.title}"? Esta ação é irreversível.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          await deleteHighlight(highlight.id);
          setSaving(false);
          onSaved();
          onClose();
        },
      },
    ]);
  }, [highlight, onSaved, onClose]);

  const renderStoryThumb = useCallback(
    ({ item }: { item: ArchivedStory }) => {
      const isSelected = selectedIds.has(item.id);
      const dateStr = new Date(item.created_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      });

      return (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => toggleStory(item.id)}
          style={[
            es.thumb,
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE * 1.5,
              borderColor: isSelected ? (theme.colors.primary || "#a855f7") : "transparent",
            },
          ]}
        >
          <ExpoImage
            source={{ uri: item.media_url }}
            style={es.thumbImage}
            contentFit="cover"
            cachePolicy="disk"
          />

          {/* Selection indicator */}
          <View
            style={[
              es.selectCircle,
              {
                borderColor: isSelected ? (theme.colors.primary || "#a855f7") : "rgba(255,255,255,0.5)",
                backgroundColor: isSelected ? (theme.colors.primary || "#a855f7") : "transparent",
              },
            ]}
          >
            {isSelected && <Text style={es.checkmark}>✓</Text>}
          </View>

          {/* Date badge */}
          <View style={es.dateBadge}>
            <Text style={es.dateText}>{dateStr}</Text>
          </View>

          {/* Video indicator */}
          {item.media_type === "video" && (
            <View style={es.videoBadge}>
              <Text style={es.videoIcon}>▶</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [selectedIds, theme, toggleStory]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[es.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[es.header, { borderBottomColor: theme.colors.border }]}>
          <TouchableOpacity onPress={onClose} style={es.headerBtn}>
            <Text style={[es.headerBtnText, { color: theme.colors.text }]}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={[es.headerTitle, { color: theme.colors.text }]}>
            {isEditing ? "Editar destaque" : "Novo destaque"}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={es.headerBtn}>
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.primary || "#a855f7"} />
            ) : (
              <Text style={[es.headerBtnText, { color: theme.colors.primary || "#a855f7", fontWeight: "700" }]}>
                {isEditing ? "Salvar" : "Criar"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Title input */}
        <View style={[es.titleSection, { borderBottomColor: theme.colors.border }]}>
          <Text style={[es.label, { color: theme.colors.textMuted }]}>Nome do destaque</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Destaque"
            placeholderTextColor={theme.colors.textMuted}
            style={[es.titleInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
            maxLength={30}
          />
          <Text style={[es.counter, { color: theme.colors.textMuted }]}>
            {selectedIds.size} {selectedIds.size === 1 ? "story selecionado" : "stories selecionados"}
          </Text>
        </View>

        {/* Stories grid */}
        {loading ? (
          <View style={es.loadingCenter}>
            <ActivityIndicator />
            <Text style={[es.loadingText, { color: theme.colors.textMuted }]}>Carregando stories…</Text>
          </View>
        ) : stories.length === 0 ? (
          <View style={es.loadingCenter}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📸</Text>
            <Text style={[es.emptyText, { color: theme.colors.textMuted }]}>
              Você ainda não publicou nenhum story.
            </Text>
          </View>
        ) : (
          <FlatList
            data={stories}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderStoryThumb}
            numColumns={THUMB_COLS}
            columnWrapperStyle={{ gap: THUMB_GAP }}
            contentContainerStyle={es.grid}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Delete button (edit mode only) */}
        {isEditing && (
          <TouchableOpacity style={es.deleteBtn} activeOpacity={0.7} onPress={handleDelete}>
            <Text style={es.deleteBtnText}>Excluir destaque</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const es = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerBtn: {
    width: 70,
  },
  headerBtnText: {
    fontSize: 15,
    fontWeight: "500",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  titleSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: "500",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  counter: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
  },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  grid: {
    padding: 16,
    gap: THUMB_GAP,
  },
  thumb: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2.5,
    position: "relative",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  selectCircle: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  dateBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dateText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  videoBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  videoIcon: {
    color: "#fff",
    fontSize: 10,
  },
  deleteBtn: {
    marginHorizontal: 16,
    marginBottom: Platform.OS === "ios" ? 40 : 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,60,60,0.12)",
    alignItems: "center",
  },
  deleteBtnText: {
    color: "#ff4444",
    fontSize: 15,
    fontWeight: "700",
  },
});
