import type { PlaylistItem } from "@promedia/shared";

export type ScheduleKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "youtube"
  | "bible"
  | "presentation";

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

/** Compact Bootstrap-style type glyph for schedule rows. */
export function ScheduleTypeIcon({ kind, className }: Props) {
  const common = {
    className: className ?? "schedule-type-icon",
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "currentColor",
    "aria-hidden": true as const,
  };

  if (kind === "text") {
    return (
      <svg {...common}>
        <path d="M2.5 3a.5.5 0 0 0 0 1h4.75v9.5a.5.5 0 0 0 1 0V4H13a.5.5 0 0 0 0-1z" />
      </svg>
    );
  }

  if (kind === "image") {
    return (
      <svg {...common}>
        <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0" />
        <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm12 1a.5.5 0 0 1 .5.5v8.354l-2.646-2.647a.5.5 0 0 0-.708 0L8.5 10.293 6.354 8.146a.5.5 0 0 0-.708 0L2.5 11.293V2.5A.5.5 0 0 1 3 2z" />
      </svg>
    );
  }

  if (kind === "youtube") {
    return (
      <svg {...common}>
        <path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.10.20.0.5.336 2.54v3.413s-.003 1.732-.335 2.54a2.01 2.01 0 0 1-1.416 1.42c-1.123.302-5.288.332-6.11.335h-.088c-.822-.003-4.987-.033-6.11-.335a2.01 2.01 0 0 1-1.415-1.42C.29 10.987.288 9.913.287 9.913V6.5s.002-1.732.335-2.54A2.01 2.01 0 0 1 2.038 2.334C3.16 2.032 7.326 2.002 8.15 2zM8 5.807 5 7.706v.844l3 1.9 3-1.9v-.844z" />
      </svg>
    );
  }

  if (kind === "bible") {
    return (
      <svg {...common}>
        <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893C5.949 1.795 7.385 2 8 2s2.051-.205 3.612-.065c1.234.124 2.503.523 3.388.893v9.823c-.885.37-2.154.769-3.388.893C10.051 13.795 8.615 14 8 14s-2.051.205-3.612.065c-1.234-.124-2.503-.523-3.388-.893zm1.5.795v8.206c.826.3 1.903.596 3.053.702C7.054 12.687 7.672 12.75 8 12.75s.946-.063 2.447-.219c1.15-.106 2.227-.402 3.053-.702V3.623c-.826.3-1.903.596-3.053.702C8.946 4.563 8.328 4.625 8 4.625s-.946.063-2.447.219c-1.15.106-2.227.402-3.053.702" />
      </svg>
    );
  }

  if (kind === "presentation") {
    return (
      <svg {...common}>
        <path d="M0 3.5A1.5 1.5 0 0 1 1.5 2h13A1.5 1.5 0 0 1 16 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 12.5zM1.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5z" />
        <path d="M5 8.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5" />
      </svg>
    );
  }

  if (kind === "audio") {
    return (
      <svg {...common}>
        <path d="M8 3a5 5 0 0 0-5 5v1h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a6 6 0 1 1 12 0v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1V8a5 5 0 0 0-5-5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm6.5 5.5v3.5L11 8z" />
    </svg>
  );
}
