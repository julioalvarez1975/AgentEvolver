import { Link } from "react-router-dom";

/** Output stub — audience render lands in later subtareas. */
export function OutputPage() {
  return (
    <main className="scaffold-page">
      <h1>ProMedia — scaffold</h1>
      <p>Ruta <code>/output</code> (sin funciones de producto).</p>
      <nav className="scaffold-nav">
        <Link to="/">Inicio</Link>
        <Link to="/control">/control</Link>
      </nav>
    </main>
  );
}
