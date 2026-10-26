import { useEffect, useRef, useState } from "react";
import type { MediaClock } from "@promedia/shared";
import { shouldCorrectSeek } from "../video/clock.js";

export type FileAudioProps = {
  src: string;
  mediaClock?: MediaClock | null;
  /** Local preview — ignore mediaClock sync. */
  preview?: boolean;
  loop?: boolean;
  onBlocked?: () => void;
  onDurationMs?: (ms: number) => void;
};

/**
 * Hidden &lt;audio&gt; synced to mediaClock (same drift rules as FileVideo).
 * Visual chrome lives in Preview / stage wrappers.
 */
export function FileAudio({
  src,
  mediaClock,
  preview = false,
  loop = false,
  onBlocked,
  onDurationMs,
}: FileAudioProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const report = () => {
      const ms = (el.duration || 0) * 1000;
      if (ms > 0) {
        onDurationMs?.(ms);
      }
    };
    el.addEventListener("loadedmetadata", report);
    el.addEventListener("durationchange", report);
    report();
    return () => {
      el.removeEventListener("loadedmetadata", report);
      el.removeEventListener("durationchange", report);
    };
  }, [src, onDurationMs]);

  useEffect(() => {
    const el = ref.current;
    if (!el || preview || !mediaClock) {
      return;
    }
    const localMs = el.currentTime * 1000;
    const { seek, targetMs } = shouldCorrectSeek(localMs, mediaClock);
    if (seek) {
      el.currentTime = targetMs / 1000;
    }
    el.loop = loop;
    if (mediaClock.playing) {
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          setBlocked(true);
          onBlocked?.();
        });
      }
    } else {
      el.pause();
    }
  }, [mediaClock, preview, loop, onBlocked]);

  return (
    <>
      <audio
        ref={ref}
        src={src}
        className="audio-el"
        preload="metadata"
        loop={loop}
        autoPlay={false}
      />
      {blocked ? (
        <button
          type="button"
          className="btn btn-primary audio-unblock"
          onClick={() => {
            const el = ref.current;
            if (!el) {
              return;
            }
            void el
              .play()
              .then(() => setBlocked(false))
              .catch(() => undefined);
          }}
        >
          Reproducir audio
        </button>
      ) : null}
    </>
  );
}
