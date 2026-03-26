
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TribeCategory = {
  id: string;
  label: string;
  slug: string;
  group_name: string | null;
};

/* ─── Categorias built-in expandidas ─── */
const BUILTIN_CATEGORIES: { label: string; group: string; emoji: string }[] = [
  // Lifestyle
  { label: "Fitness & Treino", group: "Lifestyle", emoji: "💪" },
  { label: "Nutrição & Dieta", group: "Lifestyle", emoji: "🥗" },
  { label: "Meditação & Mindfulness", group: "Lifestyle", emoji: "🧘" },
  { label: "Viagens", group: "Lifestyle", emoji: "✈️" },
  { label: "Moda & Estilo", group: "Lifestyle", emoji: "👗" },
  { label: "Beleza & Skincare", group: "Lifestyle", emoji: "💅" },
  { label: "Culinária", group: "Lifestyle", emoji: "🍳" },
  { label: "Pets & Animais", group: "Lifestyle", emoji: "🐶" },
  // Tech
  { label: "Programação", group: "Tecnologia", emoji: "💻" },
  { label: "Design & UI/UX", group: "Tecnologia", emoji: "🎨" },
  { label: "Inteligência Artificial", group: "Tecnologia", emoji: "🤖" },
  { label: "Startups & Negócios", group: "Tecnologia", emoji: "🚀" },
  { label: "Crypto & Web3", group: "Tecnologia", emoji: "🪙" },
  { label: "Cybersecurity", group: "Tecnologia", emoji: "🔐" },
  { label: "DevOps & Cloud", group: "Tecnologia", emoji: "☁️" },
  { label: "Mobile Dev", group: "Tecnologia", emoji: "📱" },
  // Games & Entretenimento
  { label: "Games & E-Sports", group: "Entretenimento", emoji: "🎮" },
  { label: "Anime & Mangá", group: "Entretenimento", emoji: "⛩️" },
  { label: "Filmes & Séries", group: "Entretenimento", emoji: "🎬" },
  { label: "Música", group: "Entretenimento", emoji: "🎵" },
  { label: "Podcasts", group: "Entretenimento", emoji: "🎙️" },
  { label: "Cosplay", group: "Entretenimento", emoji: "🦸" },
  { label: "RPG & Board Games", group: "Entretenimento", emoji: "🎲" },
  { label: "Streaming & Content", group: "Entretenimento", emoji: "📺" },
  // Educação & Conhecimento
  { label: "Idiomas", group: "Educação", emoji: "🌍" },
  { label: "Filosofia", group: "Educação", emoji: "🧠" },
  { label: "Ciência", group: "Educação", emoji: "🔬" },
  { label: "Finanças & Investimentos", group: "Educação", emoji: "📈" },
  { label: "Marketing Digital", group: "Educação", emoji: "📣" },
  { label: "Direito", group: "Educação", emoji: "⚖️" },
  { label: "Psicologia", group: "Educação", emoji: "🧩" },
  // Arte & Criatividade
  { label: "Fotografia", group: "Arte & Criatividade", emoji: "📷" },
  { label: "Escrita & Poesia", group: "Arte & Criatividade", emoji: "✍️" },
  { label: "Ilustração & Arte Digital", group: "Arte & Criatividade", emoji: "🖌️" },
  { label: "Produção Musical", group: "Arte & Criatividade", emoji: "🎹" },
  { label: "Cinema Independente", group: "Arte & Criatividade", emoji: "🎥" },
  // Esportes
  { label: "Futebol", group: "Esportes", emoji: "⚽" },
  { label: "Basquete", group: "Esportes", emoji: "🏀" },
  { label: "Artes Marciais", group: "Esportes", emoji: "🥋" },
  { label: "Corrida & Running", group: "Esportes", emoji: "🏃" },
  { label: "Skate & Surf", group: "Esportes", emoji: "🛹" },
  // Comunidade
  { label: "LGBTQIA+", group: "Comunidade", emoji: "🏳️‍🌈" },
  { label: "Saúde Mental", group: "Comunidade", emoji: "💚" },
  { label: "Voluntariado", group: "Comunidade", emoji: "🤝" },
  { label: "Espiritualidade", group: "Comunidade", emoji: "✨" },
  { label: "Parentalidade", group: "Comunidade", emoji: "👶" },
  { label: "Empreendedorismo Feminino", group: "Comunidade", emoji: "👩‍💼" },
];

const GROUPS_ORDER = [
  "Lifestyle",
  "Tecnologia",
  "Entretenimento",
  "Educação",
  "Arte & Criatividade",
  "Esportes",
  "Comunidade",
];

export default function NewTribeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<TribeCategory[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<TribeCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadCategories = async () => {
      setCategoriesLoading(true);
      const { data, error } = await supabase
        .from("tribe_categories")
        .select("id, label, slug, group_name")
        .eq("is_active", true)
        .order("group_name", { ascending: true })
        .order("label", { ascending: true });

      if (!isMounted) return;
      if (!error && data) {
        setAllCategories(data as TribeCategory[]);
        setFilteredCategories(data as TribeCategory[]);
      }
      setCategoriesLoading(false);
    };
    loadCategories();
    return () => { isMounted = false; };
  }, []);

  const handleCategoryChange = (text: string) => {
    setCategoryText(text);
    setSelectedCategoryId(null);
    const query = text.trim().toLowerCase();
    if (!query) {
      setFilteredCategories(allCategories);
      setShowCategorySuggestions(true);
      return;
    }
    const filtered = allCategories.filter((cat) => {
      return cat.label.toLowerCase().includes(query) || cat.slug.toLowerCase().includes(query);
    }).slice(0, 30);
    setFilteredCategories(filtered);
    setShowCategorySuggestions(true);
  };

  const handleSelectCategory = (label: string, id?: string | null) => {
    setCategoryText(label);
    setSelectedCategoryId(id ?? null);
    setShowCategorySuggestions(false);
    setCategoryModalVisible(false);
  };

  const handlePickCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset?.uri) {
        setCoverPreview(asset.uri);
        setCoverAsset(asset);
      }
    } catch (err: any) {
      console.error("Erro ao selecionar imagem de capa:", err);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      if (Platform.OS === "web") {
        window.alert("Dá um nome pra sua tribo.");
      } else {
        Alert.alert("Nome obrigatório", "Dá um nome pra sua tribo.");
      }
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) throw new Error("Usuário não autenticado.");
      const currentUserId = authData.user.id;

      let coverUrl: string | null = null;
      if (coverAsset?.uri) {
        try {
          const uri = coverAsset.uri;
          const mimeType = (coverAsset as any).mimeType || (coverAsset as any).type || "image/jpeg";
          const fileName = (coverAsset as any).fileName || "";
          let extension = "jpg";
          if (fileName.includes(".")) {
            extension = fileName.split(".").pop() || "jpg";
          } else if (typeof mimeType === "string") {
            if (mimeType.includes("png")) extension = "png";
            else if (mimeType.includes("webp")) extension = "webp";
          }
          const filePath = `${currentUserId}/${Date.now()}.${extension}`;
          let bytes: ArrayBuffer | Buffer;
          if (Platform.OS === "web") {
            const response = await fetch(uri);
            const blob = await response.blob();
            bytes = await blob.arrayBuffer();
          } else {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            bytes = Buffer.from(base64, "base64");
          }
          const { error: uploadError } = await supabase.storage.from("tribes").upload(filePath, bytes, {
            cacheControl: "3600",
            upsert: true,
            contentType: typeof mimeType === "string" ? mimeType : "image/jpeg",
          });
          if (uploadError) throw uploadError;
          const { data: publicUrlData } = supabase.storage.from("tribes").getPublicUrl(filePath);
          coverUrl = publicUrlData.publicUrl;
        } catch (err: any) {
          console.error("Erro ao enviar capa:", err);
          setLoading(false);
          return;
        }
      }

      const { data: tribeData, error: tribeError } = await supabase
        .from("tribes")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          category: categoryText.trim() || null,
          category_id: selectedCategoryId ?? null,
          owner_id: currentUserId,
          cover_url: coverUrl,
          is_public: isPublic,
          members_count: 1,
        })
        .select("id")
        .single();

      if (tribeError || !tribeData) throw tribeError || new Error("Erro ao criar tribo.");
      const tribeId = tribeData.id as string;

      await supabase.from("tribe_members").insert({
        tribe_id: tribeId,
        user_id: currentUserId,
        role: "owner",
      } as any);

      await supabase.from("tribe_channels").insert({
        tribe_id: tribeId,
        name: "Geral",
        slug: "geral",
        description: "Canal principal da tribo.",
        type: "text",
        is_private: false,
        created_by: currentUserId,
      } as any);

      if (Platform.OS === "web") {
        window.alert("✨ Tribo criada com sucesso!");
      } else {
        Alert.alert("✨ Tribo criada!", "Sua tribo foi criada com sucesso. Bora chamar a galera?");
      }
      router.replace("/tribes" as any);
    } catch (err: any) {
      console.error(err);
      if (Platform.OS === "web") {
        window.alert(err?.message ?? "Não foi possível criar a tribo.");
      } else {
        Alert.alert("Erro", err?.message ?? "Não foi possível criar a tribo.");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ─── Category modal with groups ─── */
  const filteredBuiltin = categorySearch.trim()
    ? BUILTIN_CATEGORIES.filter(
        (c) =>
          c.label.toLowerCase().includes(categorySearch.toLowerCase()) ||
          c.group.toLowerCase().includes(categorySearch.toLowerCase())
      )
    : BUILTIN_CATEGORIES;

  const groupedCategories = GROUPS_ORDER.map((group) => ({
    group,
    items: filteredBuiltin.filter((c) => c.group === group),
  })).filter((g) => g.items.length > 0);

  const renderCategoryModal = () => (
    <Modal transparent visible={categoryModalVisible} animationType="fade" onRequestClose={() => setCategoryModalVisible(false)}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { backgroundColor: theme.colors.surfaceElevated, maxHeight: "85%" }]}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View>
              <Text style={[s.modalTitle, { color: theme.colors.text }]}>Escolha uma categoria</Text>
              <Text style={[s.modalSub, { color: theme.colors.textMuted }]}>
                Ou digite uma categoria personalizada
              </Text>
            </View>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setCategoryModalVisible(false)} style={[s.closeBtn, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[s.searchBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput
              value={categorySearch}
              onChangeText={setCategorySearch}
              placeholder="Buscar ou digitar categoria..."
              placeholderTextColor={theme.colors.textMuted}
              style={[s.searchInput, { color: theme.colors.text }]}
              autoFocus
            />
          </View>

          {/* Custom category option */}
          {categorySearch.trim().length > 0 && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleSelectCategory(categorySearch.trim())}
              style={[s.customCatBtn, { backgroundColor: theme.colors.primary + "18", borderColor: theme.colors.primary + "40" }]}
            >
              <Ionicons name="add-circle" size={20} color={theme.colors.primary} />
              <Text style={[s.customCatText, { color: theme.colors.primary }]}>
                Criar "{categorySearch.trim()}"
              </Text>
            </TouchableOpacity>
          )}

          {/* Grouped list */}
          <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {groupedCategories.map((section) => (
              <View key={section.group} style={{ marginBottom: 16 }}>
                <Text style={[s.groupLabel, { color: theme.colors.textMuted }]}>{section.group}</Text>
                <View style={s.catGrid}>
                  {section.items.map((cat) => {
                    const isSelected = categoryText === cat.label;
                    return (
                      <TouchableOpacity
                        key={cat.label}
                        activeOpacity={0.85}
                        onPress={() => handleSelectCategory(cat.label)}
                        style={[
                          s.catChip,
                          {
                            backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 16 }}>{cat.emoji}</Text>
                        <Text
                          style={[
                            s.catChipText,
                            { color: isSelected ? "#fff" : theme.colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
    >
      <View style={[s.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom, backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={s.centerWrapper} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[s.card, { backgroundColor: theme.colors.surfaceElevated }]}>
            {/* Header */}
            <View style={s.headerRow}>
              <TouchableOpacity onPress={() => router.back()} disabled={loading} style={[s.backButton, { backgroundColor: theme.colors.surface }]} activeOpacity={0.8}>
                <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[s.title, { color: theme.colors.text }]}>Criar nova tribo</Text>
                <Text style={[s.subtitle, { color: theme.colors.textMuted }]}>
                  Monte um espaço pra quem vibra na mesma frequência.
                </Text>
              </View>
            </View>

            {/* Public/Private toggle */}
            <View style={s.visibilityRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setIsPublic(true)}
                style={[s.visibilityOption, { backgroundColor: isPublic ? theme.colors.primary + "18" : theme.colors.surface, borderColor: isPublic ? theme.colors.primary : theme.colors.border }]}
              >
                <Ionicons name="globe-outline" size={16} color={isPublic ? theme.colors.primary : theme.colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.visibilityLabel, { color: isPublic ? theme.colors.primary : theme.colors.text }]}>Pública</Text>
                  <Text style={[s.visibilityDesc, { color: theme.colors.textMuted }]}>Qualquer um pode entrar</Text>
                </View>
                {isPublic && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setIsPublic(false)}
                style={[s.visibilityOption, { backgroundColor: !isPublic ? theme.colors.primary + "18" : theme.colors.surface, borderColor: !isPublic ? theme.colors.primary : theme.colors.border }]}
              >
                <Ionicons name="lock-closed-outline" size={16} color={!isPublic ? theme.colors.primary : theme.colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.visibilityLabel, { color: !isPublic ? theme.colors.primary : theme.colors.text }]}>Privada</Text>
                  <Text style={[s.visibilityDesc, { color: theme.colors.textMuted }]}>Entrada por solicitação</Text>
                </View>
                {!isPublic && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
              </TouchableOpacity>
            </View>

            {/* Capa */}
            <View style={s.fieldBlock}>
              <Text style={[s.label, { color: theme.colors.text }]}>Capa da tribo</Text>
              <Text style={[s.helper, { color: theme.colors.textMuted }]}>Imagem de capa que aparece no topo.</Text>
              <TouchableOpacity onPress={handlePickCover} activeOpacity={0.9} disabled={loading} style={[s.coverSelector, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                {coverPreview ? (
                  <Image source={{ uri: coverPreview }} style={s.coverPreview} resizeMode="cover" />
                ) : (
                  <View style={s.coverPlaceholder}>
                    <View style={[s.coverIconWrap, { backgroundColor: theme.colors.primary + "18" }]}>
                      <Ionicons name="image-outline" size={28} color={theme.colors.primary} />
                    </View>
                    <Text style={[s.coverPlaceholderText, { color: theme.colors.textMuted }]}>Escolher imagem de capa</Text>
                    <Text style={[s.coverPlaceholderHint, { color: theme.colors.textMuted }]}>JPG, PNG · Proporção 16:9 ideal</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Nome */}
            <View style={s.fieldBlock}>
              <Text style={[s.label, { color: theme.colors.text }]}>Nome da tribo</Text>
              <Text style={[s.helper, { color: theme.colors.textMuted }]}>Escolha um nome direto e fácil de achar.</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ex.: Boxe e Performance"
                placeholderTextColor={theme.colors.textMuted}
                style={[s.input, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                maxLength={60}
              />
              <Text style={[s.charCount, { color: theme.colors.textMuted }]}>{name.length}/60</Text>
            </View>

            {/* Descrição */}
            <View style={s.fieldBlock}>
              <Text style={[s.label, { color: theme.colors.text }]}>Descrição</Text>
              <Text style={[s.helper, { color: theme.colors.textMuted }]}>Explique o propósito da tribo em poucas palavras.</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Aqui celebramos todos os tipos de..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={4}
                style={[s.input, s.inputMultiline, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                maxLength={300}
              />
              <Text style={[s.charCount, { color: theme.colors.textMuted }]}>{description.length}/300</Text>
            </View>

            {/* Categoria */}
            <View style={s.fieldBlock}>
              <Text style={[s.label, { color: theme.colors.text }]}>Categoria</Text>
              <Text style={[s.helper, { color: theme.colors.textMuted }]}>Ajuda o LUPYY a recomendar sua tribo.</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { setCategorySearch(""); setCategoryModalVisible(true); }}
                style={[s.categorySelector, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              >
                <Text style={[s.categorySelectorText, { color: categoryText ? theme.colors.text : theme.colors.textMuted }]} numberOfLines={1}>
                  {categoryText || "Selecionar categoria..."}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {categoryText ? (
                <TouchableOpacity onPress={() => { setCategoryText(""); setSelectedCategoryId(null); }} style={s.clearCategory}>
                  <Text style={[s.clearCategoryText, { color: theme.colors.textMuted }]}>✕ Limpar categoria</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Actions */}
            <View style={s.actionsRow}>
              <TouchableOpacity disabled={loading} onPress={() => router.back()} style={[s.secondaryButton, { borderColor: theme.colors.border }]} activeOpacity={0.85}>
                <Text style={[s.secondaryText, { color: theme.colors.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={loading || !name.trim()} onPress={handleCreate} style={[s.primaryButton, { backgroundColor: loading || !name.trim() ? theme.colors.surface : theme.colors.primary }]} activeOpacity={0.9}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <View style={s.btnContent}>
                    <Ionicons name="rocket-outline" size={16} color="#FFFFFF" />
                    <Text style={s.primaryText}>Criar tribo</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

      {renderCategoryModal()}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centerWrapper: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 20 },
  card: { width: "100%", maxWidth: 560, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 22 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backButton: { width: 38, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: 3, lineHeight: 18 },
  visibilityRow: { flexDirection: "column", gap: 8, marginBottom: 18 },
  visibilityOption: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  visibilityLabel: { fontSize: 14, fontWeight: "700" },
  visibilityDesc: { fontSize: 11, marginTop: 1 },
  fieldBlock: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  helper: { fontSize: 12, marginBottom: 8, lineHeight: 16 },
  input: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  inputMultiline: { textAlignVertical: "top", minHeight: 90 },
  charCount: { fontSize: 11, marginTop: 4, textAlign: "right" },
  coverSelector: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderStyle: "dashed" },
  coverPreview: { width: "100%", height: 180, borderRadius: 16 },
  coverPlaceholder: { width: "100%", height: 140, alignItems: "center", justifyContent: "center", gap: 8 },
  coverIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  coverPlaceholderText: { fontSize: 14, fontWeight: "600" },
  coverPlaceholderHint: { fontSize: 11 },
  categorySelector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1 },
  categorySelectorText: { fontSize: 15, flex: 1 },
  clearCategory: { marginTop: 6, alignSelf: "flex-start" },
  clearCategoryText: { fontSize: 12, fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  secondaryButton: { flex: 1, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingVertical: 13 },
  secondaryText: { fontSize: 15, fontWeight: "700" },
  primaryButton: { flex: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingVertical: 13 },
  primaryText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  btnContent: { flexDirection: "row", alignItems: "center", gap: 6 },

  // Category modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 520, borderRadius: 22, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalSub: { fontSize: 13, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  customCatBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginTop: 10, borderWidth: 1 },
  customCatText: { fontSize: 14, fontWeight: "700" },
  groupLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginLeft: 2 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1 },
  catChipText: { fontSize: 13, fontWeight: "600" },
});
