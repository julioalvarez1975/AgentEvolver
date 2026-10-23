import { Link } from "react-router-dom";
import { t } from "@promedia/i18n";

export function HomePage() {
  return (
    <main className="scaffold-page">
      <h1>{t("es", "app.name")}</h1>
      <p>{t("es", "scaffold.placeholder")}</p>
      <nav className="scaffold-nav">
        <Link to="/control">/control</Link>
        <Link to="/output">/output</Link>
      </nav>
    </main>
  );
}
