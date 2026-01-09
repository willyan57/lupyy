import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type StoryUser = {
  id: string | number;
  label: string;
  initials?: string;
  avatarUrl?: string;
  /**
   * Se o usuário tem story não visto (borda colorida).
   * Prioridade sobre `seen`. Se `hasUnseen === false`, desenha como visto.
   */
  hasUnseen?: boolean;
  /**
   * Se todos os stories desse usuário já foram vistos.
   */
  seen?: boolean;
  /**
   * Se é o próprio usuário logado (pra controlar o "Seu story" e o botão de +).
   */
  isCurrentUser?: boolean;
};

type StoriesBarProps = {
  data?: StoryUser[];
  onPressStory?: (user: StoryUser) => void;
  onPressAdd?: (user: StoryUser) => void;
};

const DEFAULT_DATA: StoryUser[] = [
  { id: "me", label: "Seu story", initials: "W", hasUnseen: true, isCurrentUser: true },
];

export default function StoriesBar({
  data = DEFAULT_DATA,
  onPressStory,
  onPressAdd,
}: StoriesBarProps) {
  const { theme } = useTheme();
  const [internalData, setInternalData] = useState<StoryUser[]>(data);

  useEffect(() => {
    setInternalData(data);
  }, [data]);

  return (
    <View style={styles.storiesContainer}>
      <FlatList
        data={internalData}
        keyExtractor={(item) => String(item.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const initials =
            item.initials ??
            (item.label?.[0] ? item.label[0].toUpperCase() : "S");

          const isMe = item.isCurrentUser || item.id === "me";
          const isFirst = index === 0 && isMe;

          const hasUnseen =
            item.hasUnseen === undefined ? !item.seen : item.hasUnseen;

          const outerStyle = hasUnseen
            ? styles.storyAvatarOuterGradient
            : styles.storyAvatarOuterSeen;

          return (
            <View style={styles.storyItem}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  onPressStory?.(item);
                  setInternalData((prev) =>
                    prev.map((u) =>
                      u.id === item.id
                        ? { ...u, hasUnseen: false, seen: true }
                        : u
                    )
                  );
                }}
              >
                <View>
                  {(() => {
                    const avatarNode = (
                      <View
                        style={[
                          styles.storyAvatarInner,
                          { backgroundColor: theme.colors.surface },
                        ]}
                      >
                        {item.avatarUrl ? (
                          <ExpoImage
                            source={{ uri: item.avatarUrl }}
                            style={styles.storyAvatarImage}
                            contentFit="cover"
                          />
                        ) : (
                          <Text
                            style={[
                              styles.storyInitials,
                              { color: theme.colors.text },
                            ]}
                          >
                            {initials}
                          </Text>
                        )}
                      </View>
                    );

                    return hasUnseen ? (
                      <LinearGradient
                        colors={[
                          "#f09433",
                          "#e6683c",
                          "#dc2743",
                          "#cc2366",
                          "#bc1888",
                        ]}
                        style={outerStyle}
                      >
                        {avatarNode}
                      </LinearGradient>
                    ) : (
                      <View
                        style={[
                          outerStyle,
                          { borderColor: theme.colors.border },
                        ]}
                      >
                        {avatarNode}
                      </View>
                    );
                  })()}

                  {isFirst && (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[
                        styles.storyAddBadge,
                        { backgroundColor: theme.colors.primary },
                      ]}
                      onPress={() =>
                        onPressAdd ? onPressAdd(item) : onPressStory?.(item)
                      }
                    >
                      <Ionicons name="add" size={14} color="#ffffff" />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
              <Text
                style={[
                  styles.storyLabel,
                  { color: theme.colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  storiesContainer: {
    paddingVertical: 10,
    paddingLeft: 12,
  },
  storyItem: {
    marginRight: 12,
    alignItems: "center",
    width: 72,
  },
  storyAvatarOuterGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  storyAvatarOuterSeen: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  storyAvatarInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  storyAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 29,
  },
  storyInitials: {
    fontWeight: "700",
    fontSize: 18,
  },
  storyLabel: {
    marginTop: 4,
    fontSize: 12,
  },
  storyAddBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
});
