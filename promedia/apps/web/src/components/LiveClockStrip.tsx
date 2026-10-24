import { useEffect, useState } from "react";
import type { MediaClock } from "@promedia/shared";
import { effectiveMediaClockPositionMs } from "@promedia/shared";
import { useLocale } from "../locale/LocaleContext";

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export type LiveClockStripProps = {
  mediaClock: MediaClock | null;
  durationMs: number;
  localeTag: string;
};

/**
 * En vivo: remaining time (not just elapsed) + live date/time clock.
 */
export function LiveClockStrip({
  mediaClock,
  durationMs,
  localeTag,
}: LiveClockStripProps) {
  const { t } = useLocale();
  const [now, setNow] = useState(() => new Date());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
      setTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  void tick;
  const pos = mediaClock ? effectiveMediaClockPositionMs(mediaClock) : 0;
  const remaining =
    durationMs > 0 ? Math.max(0, durationMs - pos) : null;

  const dateStr = now.toLocaleDateString(localeTag, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString(localeTag, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="live-clock-strip" aria-label={t("control.liveClock")}>
      <div className="live-clock-remaining">
        <span className="live-clock-label">{t("control.timeRemaining")}</span>
        <span className="live-clock-value">
          {remaining == null ? "−−:−−" : formatMs(remaining)}
        </span>
      </div>
      <div className="live-clock-datetime">
        <span className="live-clock-date">{dateStr}</span>
        <span className="live-clock-time">{timeStr}</span>
      </div>
    </div>
  );
}
