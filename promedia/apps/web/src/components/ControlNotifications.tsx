import { useLocale } from "../locale/LocaleContext";

export type ProMediaNotice = {
  id: string;
  at: number;
  tone: "info" | "warn" | "error" | "ok";
  text: string;
};

export type ControlNotificationsProps = {
  notices: ProMediaNotice[];
};

/**
 * Bottom-right ProMedia message panel — WS / projection / errors only.
 */
export function ControlNotifications({ notices }: ControlNotificationsProps) {
  const { t } = useLocale();

  return (
    <section
      className="zone zone-notifications"
      aria-label={t("control.notifications")}
    >
      <header className="zone-notifications-head">
        <h2>{t("control.notifications")}</h2>
      </header>
      <div className="zone-notifications-list" role="log" aria-live="polite">
        {notices.length === 0 ? (
          <p className="zone-notifications-empty">
            {t("control.notificationsEmpty")}
          </p>
        ) : (
          <ul>
            {notices.map((n) => (
              <li key={n.id} className={`notice notice-${n.tone}`}>
                <time dateTime={new Date(n.at).toISOString()}>
                  {new Date(n.at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
