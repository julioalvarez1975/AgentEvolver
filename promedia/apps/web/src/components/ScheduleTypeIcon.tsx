import type { PlaylistItem } from "@promedia/shared";

export type ScheduleKind = "text" | "image" | "video" | "youtube" | "bible";

export function scheduleKindOf(item: PlaylistItem): ScheduleKind {
  if (item.type === "video" && item.payload.sourceKind === "youtube") {
    return "youtube";
  }
  return item.type;
}

type Props = {
  kind: ScheduleKind;
  className?: string;
};

/** Compact type glyph for schedule rows (Quelea/EasyWorship-style). */
export function ScheduleTypeIcon({ kind, className }: Props) {
  const common = {
    className: className ?? "schedule-type-icon",
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": true as const,
  };

  if (kind === "text") {
    return (
      <svg {...common}>
        <path
          d="M3 3.5h10M3 8h7M3 12.5h9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === "image") {
    return (
      <svg {...common}>
        <rect
          x="2"
          y="3"
          width="12"
          height="10"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="5.5" cy="6.5" r="1.2" fill="currentColor" />
        <path
          d="M2.5 11.5 6 8.5l2.2 2 2.3-2.8 3 3.8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "youtube") {
    return (
      <svg {...common}>
        <rect
          x="1.5"
          y="4"
          width="13"
          height="8"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M7 6.2v3.6L10.2 8 7 6.2Z" fill="currentColor" />
      </svg>
    );
  }

  if (kind === "bible") {
    return (
      <svg {...common}>
        <path
          d="M3.5 2.5h7.2c.9 0 1.8.7 1.8 1.6v9.4c0-.8-.8-1.4-1.7-1.4H3.5V2.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M3.5 12.1h7.3c.9 0 1.7.5 1.7 1.2v.2H3.5v-1.4Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M5.2 5.2h4.2M5.2 7.4h3.2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect
        x="2"
        y="3.5"
        width="12"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M6.5 6v4l4-2-4-2Z" fill="currentColor" />
    </svg>
  );
}
