import { Link } from "react-router-dom";

/** Control stub — product UI lands in later subtareas. */
export function ControlPage() {
  return (
    <main className="scaffold-page">
      <h1>ProMedia — scaffold</h1>
      <p>Ruta <code>/control</code> (sin funciones de producto).</p>
      <nav className="scaffold-nav">
        <Link to="/">Inicio</Link>
        <Link to="/output">/output</Link>
      </nav>
    </main>
  );
}
