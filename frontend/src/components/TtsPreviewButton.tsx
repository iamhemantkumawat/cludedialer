import { useEffect, useRef, useState } from "react";

interface TtsPreviewButtonProps {
  text: string;
  language: string;
  voiceType?: string;
}

export function TtsPreviewButton({ text, language, voiceType = "female" }: TtsPreviewButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  async function handleClick() {
    if (!text.trim()) return;

    // If playing, stop
    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }

    setState("loading");
    try {
      const params = new URLSearchParams({
        text: text.trim(),
        language,
        voice: voiceType,
      });
      const url = `/api/tts/preview?${params.toString()}`;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.oncanplay = () => {
        setState("playing");
        void audio.play();
      };
      audio.onended = () => setState("idle");
      audio.onerror = () => {
        setState("idle");
        // Fallback: browser speechSynthesis if backend preview fails
        const utterance = new SpeechSynthesisUtterance(text.trim());
        utterance.lang = language;
        utterance.onend = () => setState("idle");
        window.speechSynthesis.speak(utterance);
      };

      audio.load();
    } catch {
      setState("idle");
    }
  }

  const label = state === "loading" ? "Loading…" : state === "playing" ? "■ Stop" : "▶ Preview";

  return (
    <button
      className="btn btn-ghost"
      type="button"
      onClick={() => void handleClick()}
      disabled={!text.trim() || state === "loading"}
    >
      {label}
    </button>
  );
}
