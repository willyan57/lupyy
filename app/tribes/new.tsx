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
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TribeCategory = {
  id: string;
  label: string;
  slug: string;
  group_name: string | null;
};

export default function NewTribeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [categoryText, setCategoryText] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );

  const [allCategories, setAllCategories] = useState<TribeCategory[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<TribeCategory[]>(
    []
  );
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);

  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

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
        const list = data as TribeCategory[];
        setAllCategories(list);
        setFilteredCategories(list);
      }

      setCategoriesLoading(false);
    };

    loadCategories();

    return () => {
      isMounted = false;
    };
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

    const filtered = allCategories
      .filter((cat) => {
        const label = cat.label.toLowerCase();
        const slug = cat.slug.toLowerCase();
        return label.includes(query) || slug.includes(query);
      })
      .slice(0, 30);

    setFilteredCategories(filtered);
    setShowCategorySuggestions(true);
  };

  const handleSelectCategory = (cat: TribeCategory) => {
    setCategoryText(cat.label);
    setSelectedCategoryId(cat.id);
    setShowCategorySuggestions(false);
  };

  const handleBlurCategory = () => {
    setTimeout(() => {
      setShowCategorySuggestions(false);
    }, 120);
  };

  const handleFocusCategory = () => {
    if (filteredCategories.length > 0) {
      setShowCategorySuggestions(true);
    }
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
      Alert.alert("Erro", "Não foi possível selecionar a imagem.");
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Nome obrigatório", "Dá um nome pra sua tribo.");
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData?.user) {
        throw new Error("Usuário não autenticado.");
      }

      const currentUserId = authData.user.id;

      let coverUrl: string | null = null;

      if (coverAsset?.uri) {
        try {
          const uri = coverAsset.uri;
          const mimeType =
            (coverAsset as any).mimeType ||
            (coverAsset as any).type ||
            "image/jpeg";
          const fileName = (coverAsset as any).fileName || "";

          let extension = "jpg";
          if (fileName.includes(".")) {
            extension = fileName.split(".").pop() || "jpg";
          } else if (typeof mimeType === "string") {
            if (mimeType.includes("png")) extension = "png";
            else if (mimeType.includes("webp")) extension = "webp";
            else if (mimeType.includes("jpg") || mimeType.includes("jpeg"))
              extension = "jpg";
          }

          const filePath = `${currentUserId}/${Date.now()}.${extension}`;

          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const bytes = Buffer.from(base64, "base64");

          const { error: uploadError } = await supabase.storage
            .from("tribes")
            .upload(filePath, bytes, {
              cacheControl: "3600",
              upsert: true,
              contentType: typeof mimeType === "string" ? mimeType : "image/jpeg",
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage
            .from("tribes")
            .getPublicUrl(filePath);

          coverUrl = publicUrlData.publicUrl;
        } catch (err: any) {
          console.error("Erro ao enviar capa:", err);
          Alert.alert(
            "Erro ao enviar capa",
            err?.message || "Não foi possível enviar a capa da tribo."
          );
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
          members_count: 1,
        })
        .select("id")
        .single();

      if (tribeError || !tribeData) {
        console.error("Erro ao criar tribo:", tribeError);
        throw tribeError || new Error("Erro ao criar tribo.");
      }

      const tribeId = tribeData.id as string;

      const { error: memberError } = await supabase
        .from("tribe_members")
        .insert({
          tribe_id: tribeId,
          user_id: currentUserId,
          role: "owner",
        } as any);

      if (memberError) {
        console.error("Erro ao adicionar membro inicial:", memberError);
      }

      const { error: channelError } = await supabase
        .from("tribe_channels")
        .insert({
          tribe_id: tribeId,
          name: "Geral",
          slug: "geral",
          description: "Canal principal da tribo.",
          type: "text",
          is_private: false,
          created_by: currentUserId,
        } as any);

      if (channelError) {
        console.error("Erro ao criar canal geral:", channelError);
      }

      Alert.alert(
        "✨ Tribo criada!",
        "Sua tribo foi criada com sucesso. Bora chamar a galera?"
      );

      router.replace("/tribes" as any);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Erro", err?.message ?? "Não foi possível criar a tribo.");
    } finally {
      setLoading(false);
    }
  };

  const renderCategorySuggestion = ({ item }: { item: TribeCategory }) => {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => handleSelectCategory(item)}
        style={[
          styles.categoryItem,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.categoryLabel,
              { color: theme.colors.text },
            ]}
          >
            {item.label}
          </Text>
          {item.group_name ? (
            <Text
              style={[
                styles.categoryGroup,
                { color: theme.colors.textMuted },
              ]}
            >
              {item.group_name}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.centerWrapper}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceElevated,
              },
            ]}
          >
            {/* Header */}
            <View
              style={[
                styles.headerRow,
                Platform.OS !== "web" && styles.headerRowMobile,
              ]}
            >
              <View style={styles.headerLeft}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  disabled={loading}
                  style={[
                    styles.backButton,
                    { backgroundColor: theme.colors.surface },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={theme.colors.text}
                  />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.title,
                      {
                        color: theme.colors.text,
                      },
                    ]}
                  >
                    Criar nova tribo
                  </Text>
                  <Text
                    style={[
                      styles.subtitle,
                      {
                        color: theme.colors.textMuted,
                      },
                    ]}
                  >
                    Monte um espaço pra quem vibra na mesma frequência que você.
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.pill,
                  { backgroundColor: theme.colors.primary + "22" },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: theme.colors.primary },
                  ]}
                >
                  Tribo pública · qualquer um pode entrar
                </Text>
              </View>
            </View>

            {/* Capa da tribo */}
            <View style={styles.fieldBlock}>
              <Text
                style={[
                  styles.label,
                  { color: theme.colors.text },
                ]}
              >
                Foto da tribo
              </Text>
              <Text
                style={[
                  styles.helper,
                  { color: theme.colors.textMuted },
                ]}
              >
                Essa imagem aparece no topo da sua tribo.
              </Text>

              <TouchableOpacity
                onPress={handlePickCover}
                activeOpacity={0.9}
                disabled={loading}
                style={[
                  styles.coverSelector,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                {coverPreview ? (
                  <Image
                    source={{ uri: coverPreview }}
                    style={styles.coverPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <Ionicons
                      name="image-outline"
                      size={22}
                      color={theme.colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.coverPlaceholderText,
                        { color: theme.colors.textMuted },
                      ]}
                    >
                      Escolher imagem de capa
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Campos */}
            <View style={styles.fields}>
              {/* Nome */}
              <View style={styles.fieldBlock}>
                <Text
                  style={[
                    styles.label,
                    { color: theme.colors.text },
                  ]}
                >
                  Nome da tribo
                </Text>
                <Text
                  style={[
                    styles.helper,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Escolha um nome direto e fácil de achar na busca.
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Ex.: Boxe e Performance"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.text,
                    },
                  ]}
                />
              </View>

              {/* Descrição */}
              <View style={styles.fieldBlock}>
                <Text
                  style={[
                    styles.label,
                    { color: theme.colors.text },
                  ]}
                >
                  Descrição
                </Text>
                <Text
                  style={[
                    styles.helper,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Em poucas palavras, explique o propósito da tribo.
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Aqui celebramos todos os tipos de RPG — de mesa, digital, narrativo, tático ou improvisado."
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  numberOfLines={3}
                  style={[
                    styles.input,
                    styles.inputMultiline,
                    {
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.text,
                    },
                  ]}
                />
              </View>

              {/* Categoria com autocomplete */}
              <View style={styles.fieldBlock}>
                <Text
                  style={[
                    styles.label,
                    { color: theme.colors.text },
                  ]}
                >
                  Categoria
                </Text>
                <Text
                  style={[
                    styles.helper,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Isso ajuda o LUPYY a recomendar sua tribo pras pessoas certas.
                </Text>

                <View>
                  <TextInput
                    value={categoryText}
                    onChangeText={handleCategoryChange}
                    onBlur={handleBlurCategory}
                    onFocus={handleFocusCategory}
                    placeholder="Ex.: Fitness, Programação, Espiritualidade..."
                    placeholderTextColor={theme.colors.textMuted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.colors.surface,
                        color: theme.colors.text,
                      },
                    ]}
                  />

                  {showCategorySuggestions && filteredCategories.length > 0 && (
                    <View
                      style={[
                        styles.suggestionsContainer,
                        {
                          backgroundColor: theme.colors.surfaceElevated,
                          borderColor: theme.colors.surface,
                        },
                      ]}
                    >
                      {categoriesLoading ? (
                        <View style={styles.suggestionsLoading}>
                          <ActivityIndicator size="small" />
                          <Text
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              color: theme.colors.textMuted,
                            }}
                          >
                            Carregando categorias...
                          </Text>
                        </View>
                      ) : (
                        <FlatList
                          data={filteredCategories}
                          keyExtractor={(item) => item.id}
                          renderItem={renderCategorySuggestion}
                          keyboardShouldPersistTaps="handled"
                        />
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Botões */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                disabled={loading}
                onPress={() => router.back()}
                style={[
                  styles.secondaryButton,
                  {
                    borderColor: theme.colors.surface,
                  },
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.secondaryText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={loading}
                onPress={handleCreate}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: theme.colors.primary,
                  },
                ]}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.primaryText,
                      { color: "#FFFFFF" },
                    ]}
                  >
                    Criar tribo
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: "100%",
    maxWidth: 640,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  headerRowMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  fields: {
    marginTop: 8,
    gap: 14,
  },
  fieldBlock: {
    gap: 4,
    marginTop: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
  helper: {
    fontSize: 11,
  },
  input: {
    marginTop: 4,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: {
    textAlignVertical: "top",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionsContainer: {
    marginTop: 4,
    borderRadius: 18,
    borderWidth: 1,
    maxHeight: 220,
    overflow: "hidden",
  },
  suggestionsLoading: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  categoryGroup: {
    fontSize: 11,
    marginTop: 2,
  },
  coverSelector: {
    marginTop: 6,
    borderRadius: 18,
    overflow: "hidden",
  },
  coverPreview: {
    width: "100%",
    height: 160,
    borderRadius: 18,
  },
  coverPlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    rowGap: 6,
  },
  coverPlaceholderText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
