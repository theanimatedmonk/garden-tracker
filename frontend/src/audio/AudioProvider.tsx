import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type AudioState = {
  src: string | null;
  playing: boolean;
  progress: number;
  toggle: (src: string) => void;
  stop: () => void;
};

const AudioContext = createContext<AudioState | null>(null);

/** One shared <audio> element so only one call plays at a time across the app. */
export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    const onTime = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = useCallback(
    (next: string) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      if (src === next) {
        if (audio.paused) {
          void audio.play().catch(() => setPlaying(false));
        } else {
          audio.pause();
        }
        return;
      }
      audio.src = next;
      setSrc(next);
      setProgress(0);
      void audio.play().catch(() => setPlaying(false));
    },
    [src],
  );

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setProgress(0);
  }, []);

  const value = useMemo(() => ({ src, playing, progress, toggle, stop }), [src, playing, progress, toggle, stop]);
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

function useAudioContext(): AudioState {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error("useAudio must be used inside <AudioProvider>");
  }
  return ctx;
}

export function useCall(src: string) {
  const ctx = useAudioContext();
  const active = ctx.src === src;
  return {
    playing: active && ctx.playing,
    progress: active ? ctx.progress : 0,
    toggle: () => ctx.toggle(src),
  };
}

export function useStopAudio() {
  return useAudioContext().stop;
}
