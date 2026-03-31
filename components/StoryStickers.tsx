// StoryStickers.tsx — Instagram-style interactive stickers rendered on stories
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import {
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

const { width: SW, height: SH } = Dimensions.get("window");

export type StickerConfig = {
  // Poll
  question?: string;
  options?: string[];
  // Question box
  prompt?: string;
  // Countdown
  title?: string;
  end_time?: string;
  // Quiz
  correct_option?: number;
  // Emoji slider
  emoji?: string;
};

export type StickerData = {
  id: string;
  sticker_type: "poll" | "question" | "countdown" | "quiz" | "emoji_slider";
  position_x: number;
  position_y: number;
  rotation: number;
  scale: number;
  config: StickerConfig;
  response_count: number;
  my_response: string | null;
};

type Props = {
  stickers: StickerData[];
  onRespond?: (stickerId: string, response: string) => void;
  isOwner?: boolean;
};

/* ── Poll Sticker ── */
function PollSticker({ sticker, onRespond }: { sticker: StickerData; onRespond?: (id: string, val: string) => void }) {
  const options = sticker.config.options || [];
  const [selected, setSelected] = useState<string | null>(sticker.my_response);
  const [results, setResults] = useState<Record<string, number>>({});
  const hasVoted = selected !== null;

  useEffect(() => {
    if (hasVoted) {
      supabase.rpc("get_sticker_results", { _sticker_id: sticker.id })
        .then(({ data }: { data: any }) => {
          if (data) {
            const r: Record<string, number> = {};
            (data as any[]).forEach(row => { r[row.response_value] = row.count; });
            setResults(r);
          }
        }).catch(() => {});
    }
  }, [hasVoted, sticker.id]);

  const totalVotes = Object.values(results).reduce((s, n) => s + n, 0) || 1;

  const handleVote = (idx: number) => {
    if (hasVoted) return;
    const val = String(idx);
    setSelected(val);
    onRespond?.(sticker.id, val);
  };

  return (
    <View style={pollStyles.container}>
      <Text style={pollStyles.question}>{sticker.config.question || "Enquete"}</Text>
      {options.map((opt, idx) => {
        const isSelected = selected === String(idx);
        const pct = hasVoted ? Math.round(((results[String(idx)] || 0) / totalVotes) * 100) : 0;
        return (
          <TouchableOpacity key={idx} style={pollStyles.option} onPress={() => handleVote(idx)} activeOpacity={0.8}>
            {hasVoted && (
              <View style={[pollStyles.bar, { width: `${Math.max(pct, 5)}%` }]} />
            )}
            <Text style={[pollStyles.optionText, isSelected && pollStyles.selectedText]}>
              {opt}
            </Text>
            {hasVoted && <Text style={pollStyles.pctText}>{pct}%</Text>}
          </TouchableOpacity>
        );
      })}
      <Text style={pollStyles.votesText}>{sticker.response_count} votos</Text>
    </View>
  );
}

const pollStyles = StyleSheet.create({
  container: { backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 16, width: SW * 0.7, maxWidth: 320 },
  question: { color: "#000", fontSize: 16, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  option: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.06)", borderRadius: 10, marginBottom: 6, paddingVertical: 12, paddingHorizontal: 14, overflow: "hidden" },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,149,246,0.2)", borderRadius: 10 },
  optionText: { flex: 1, color: "#000", fontSize: 15, fontWeight: "600", zIndex: 1 },
  selectedText: { color: "#0095f6" },
  pctText: { color: "#555", fontSize: 14, fontWeight: "700", marginLeft: 8, zIndex: 1 },
  votesText: { color: "#999", fontSize: 12, textAlign: "center", marginTop: 6 },
});

/* ── Question Sticker ── */
function QuestionSticker({ sticker }: { sticker: StickerData }) {
  return (
    <LinearGradient colors={["#833ab4", "#fd1d1d", "#fcb045"]} style={qStyles.container}>
      <Text style={qStyles.label}>Faça uma pergunta</Text>
      <View style={qStyles.inputBox}>
        <Text style={qStyles.prompt}>{sticker.config.prompt || "Me pergunte algo..."}</Text>
      </View>
      <Text style={qStyles.count}>{sticker.response_count} respostas</Text>
    </LinearGradient>
  );
}

const qStyles = StyleSheet.create({
  container: { borderRadius: 16, padding: 16, width: SW * 0.7, maxWidth: 320, alignItems: "center" },
  label: { color: "#fff", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  inputBox: { backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, width: "100%" },
  prompt: { color: "#999", fontSize: 15, fontWeight: "500", textAlign: "center" },
  count: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 8 },
});

/* ── Countdown Sticker ── */
function CountdownSticker({ sticker }: { sticker: StickerData }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const endTime = sticker.config.end_time ? new Date(sticker.config.end_time).getTime() : 0;
    if (!endTime) return;

    const tick = () => {
      const diff = Math.max(0, endTime - Date.now());
      if (diff <= 0) { setTimeLeft("🎉"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h > 0 ? `${h}h ` : ""}${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sticker.config.end_time]);

  return (
    <LinearGradient colors={["#6366f1", "#8b5cf6", "#a855f7"]} style={cdStyles.container}>
      <Text style={cdStyles.label}>CONTAGEM REGRESSIVA</Text>
      <Text style={cdStyles.title}>{sticker.config.title || "Evento"}</Text>
      <Text style={cdStyles.timer}>{timeLeft}</Text>
    </LinearGradient>
  );
}

const cdStyles = StyleSheet.create({
  container: { borderRadius: 16, padding: 20, width: SW * 0.65, maxWidth: 280, alignItems: "center" },
  label: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "800", letterSpacing: 2, marginBottom: 6 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 10 },
  timer: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: 1 },
});

/* ── Quiz Sticker ── */
function QuizSticker({ sticker, onRespond }: { sticker: StickerData; onRespond?: (id: string, val: string) => void }) {
  const options = sticker.config.options || [];
  const correct = sticker.config.correct_option ?? -1;
  const [selected, setSelected] = useState<string | null>(sticker.my_response);
  const hasAnswered = selected !== null;

  const OPTION_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"];

  const handleAnswer = (idx: number) => {
    if (hasAnswered) return;
    setSelected(String(idx));
    onRespond?.(sticker.id, String(idx));
  };

  return (
    <View style={quizStyles.container}>
      <Text style={quizStyles.question}>{sticker.config.question || "Quiz"}</Text>
      {options.map((opt, idx) => {
        const isCorrect = idx === correct;
        const isSelected = selected === String(idx);
        const bgColor = hasAnswered
          ? isCorrect ? "#27ae60" : isSelected ? "#e74c3c" : OPTION_COLORS[idx % OPTION_COLORS.length]
          : OPTION_COLORS[idx % OPTION_COLORS.length];
        return (
          <TouchableOpacity
            key={idx}
            style={[quizStyles.option, { backgroundColor: bgColor }]}
            onPress={() => handleAnswer(idx)}
            activeOpacity={0.8}
          >
            <Text style={quizStyles.optionText}>{opt}</Text>
            {hasAnswered && isCorrect && <Ionicons name="checkmark-circle" size={18} color="#fff" />}
            {hasAnswered && isSelected && !isCorrect && <Ionicons name="close-circle" size={18} color="#fff" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const quizStyles = StyleSheet.create({
  container: { backgroundColor: "rgba(0,0,0,0.85)", borderRadius: 16, padding: 16, width: SW * 0.7, maxWidth: 320 },
  question: { color: "#fff", fontSize: 16, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  option: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionText: { color: "#fff", fontSize: 15, fontWeight: "700", flex: 1 },
});

/* ── Main Stickers Renderer ── */
export default function StoryStickers({ stickers, onRespond, isOwner }: Props) {
  const handleRespond = useCallback(async (stickerId: string, response: string) => {
    try {
      await supabase.rpc("respond_to_sticker", { _sticker_id: stickerId, _response: response });
      onRespond?.(stickerId, response);
    } catch {}
  }, [onRespond]);

  if (!stickers || stickers.length === 0) return null;

  return (
    <>
      {stickers.map((sticker) => {
        const posStyle = {
          position: "absolute" as const,
          left: sticker.position_x * SW - (SW * 0.35),
          top: sticker.position_y * SH - 60,
          transform: [
            { rotate: `${sticker.rotation}deg` },
            { scale: sticker.scale },
          ],
          zIndex: 15,
        };

        let content: React.ReactNode = null;
        switch (sticker.sticker_type) {
          case "poll":
            content = <PollSticker sticker={sticker} onRespond={handleRespond} />;
            break;
          case "question":
            content = <QuestionSticker sticker={sticker} />;
            break;
          case "countdown":
            content = <CountdownSticker sticker={sticker} />;
            break;
          case "quiz":
            content = <QuizSticker sticker={sticker} onRespond={handleRespond} />;
            break;
          default:
            break;
        }

        return content ? <View key={sticker.id} style={posStyle}>{content}</View> : null;
      })}
    </>
  );
}
