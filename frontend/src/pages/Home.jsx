import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

function money(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    Number(value)
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [dashboard, setDashboard] = useState({ products: [], alerts: [], layout: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Search the mock store, then track a product.");

  async function refresh() {
    const data = await api.dashboard();
    setDashboard(data);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const handle = setTimeout(() => {
      api.search(query)
        .then((data) => setResults(data.items || []))
        .catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  async function track(storeId) {
    setBusy(true);
    setError("");
    try {
      await api.track(storeId);
      setStatus("Tracked. First scrape started in the background.");
      setQuery("");
      setResults([]);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const unread = useMemo(
    () => (dashboard.alerts || []).filter((alert) => !alert.read_at),
    [dashboard.alerts]
  );

  return (
    <>
      <section className="hero">
        <div>
          <h1>Watch the awkward store without guessing.</h1>
          <p>
            Search 1,000 INE demo products, track the ones you care about, and scrape price plus
            stock every two hours. Failures stay in the log. Wrong prices never hit history.
          </p>
        </div>
        <div>
          <div className="search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, brand, or SKU"
            />
            <button className="btn" disabled={busy} onClick={() => api.syncCatalog().then(refresh)}>
              Sync catalog
            </button>
          </div>
          {results.length > 0 && (
            <div className="results">
              {results.map((item) => (
                <div className="result" key={item.store_id}>
                  <div>
                    <strong>{item.name}</strong>
                    <div className="sku">
                      {item.brand} · {item.sku}
                    </div>
                  </div>
                  <button className="btn secondary" disabled={busy} onClick={() => track(item.store_id)}>
                    Track
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="muted">{status}</p>
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      {unread.length > 0 && (
        <div className="alerts">
          {unread.slice(0, 4).map((alert) => (
            <div className="alert" key={alert.id}>
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {dashboard.layout?.changed && (
        <p className="alert">
          Store layout changed: {dashboard.layout.snapshot?.change_summary || "class names or markup shifted."}
        </p>
      )}

      <div className="section-title">
        <h2>Tracked products</h2>
        <span className="muted">{dashboard.products.length} watching</span>
      </div>
      {dashboard.products.length === 0 ? (
        <p className="muted">Nothing tracked yet. Search above and pick a product.</p>
      ) : (
        <div className="grid">
          {dashboard.products.map((product) => (
            <Link className="card" key={product.id} to={`/product/${product.id}`}>
              <span className="badge">{product.catalog_products?.category}</span>
              <h3>{product.catalog_products?.name}</h3>
              <div className="sku">{product.catalog_products?.sku}</div>
              <div className="price">{money(product.last_price)}</div>
              <div className="row">
                <span className={`badge ${product.last_in_stock ? "ok" : "fail"}`}>
                  {product.last_in_stock ? "In stock" : product.last_in_stock === false ? "Out of stock" : "Awaiting scrape"}
                </span>
                <span className="muted">every {product.scrape_interval_minutes}m</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
