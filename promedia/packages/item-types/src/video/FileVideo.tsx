import { useEffect, useRef, useState } from "react";
import type { MediaClock, VideoFit } from "@promedia/shared";
import { shouldCorrectSeek } from "./clock.js";

export type FileVideoProps = {
  src: string;
  mediaClock?: MediaClock | null;
  preview?: boolean;
  loop?: boolean;
  muted?: boolean;
  fit?: VideoFit;
  onBlocked?: () => void;
};

export function FileVideo({
  src,
  mediaClock,
  preview = false,
  loop = false,
  muted = false,
  fit = "contain",
  onBlocked,
}: FileVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);

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
    el.muted = muted;
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
  }, [mediaClock, preview, loop, muted, onBlocked]);

  return (
    <div className="video-file-wrap">
      <video
        ref={ref}
        src={src}
        className="video-el"
        style={{ objectFit: fit }}
        playsInline
        controls={preview}
        loop={loop}
        muted={muted}
        // Unmuted by default for live (Q2); browsers may still block autoplay
        autoPlay={false}
      />
      {blocked ? (
        <button
          type="button"
          className="btn btn-primary video-unblock"
          onClick={() => {
            const el = ref.current;
            if (!el) {
              return;
            }
            el.muted = false;
            void el.play().then(() => setBlocked(false)).catch(() => undefined);
          }}
        >
          Clic para audio / play
        </button>
      ) : null}
    </div>
  );
}
