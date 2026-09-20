import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

function money(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function Chart({ points }) {
  const path = useMemo(() => {
    if (!points.length) return "";
    const values = points.map((point) => Number(point.price));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * 100;
        const y = 100 - ((Number(point.price) - min) / span) * 100;
        return `${index === 0 ? "M" : "L"} ${x},${y}`;
      })
      .join(" ");
  }, [points]);

  if (points.length < 2) return <p className="muted">Need two successful scrapes before a chart appears.</p>;
  return (
    <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="#9c3b1e" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setData(await api.product(id));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [id]);

  async function scrape() {
    setBusy(true);
    setError("");
    const previousCount = data?.logs?.length || 0;
    try {
      await api.scrapeNow(id);
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        const next = await api.product(id);
        setData(next);
        if ((next.logs?.length || 0) > previousCount) {
          const latest = next.logs[0];
          if (latest?.outcome === "failed") setError(latest.error_message || "Scrape failed and was logged.");
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeInterval(scrapeIntervalMinutes) {
    await api.updateProduct(id, { scrapeIntervalMinutes: Number(scrapeIntervalMinutes) });
    await load();
  }

  async function remove() {
    await api.untrack(id);
    navigate("/");
  }

  if (!data) return <p className="muted">{error || "Loading…"}</p>;
  const product = data.product;
  const info = product.catalog_products || {};
  const specs = info.specs || {};

  return (
    <div>
      <p><Link to="/">‹ Dashboard</Link></p>
      <div className="section-title">
        <div>
          <div className="sku">{info.brand} · {info.sku}</div>
          <h2>{info.name}</h2>
        </div>
        <div className="row">
          <select
            value={product.scrape_interval_minutes}
            onChange={(event) => changeInterval(event.target.value)}
          >
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every 60 minutes</option>
            <option value={120}>Every 2 hours</option>
            <option value={240}>Every 4 hours</option>
            <option value={360}>Every 6 hours</option>
          </select>
          <button className="btn" disabled={busy} onClick={scrape}>
            {busy ? "Scraping…" : "Scrape now"}
          </button>
          <button className="btn secondary" onClick={remove}>Untrack</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="grid">
        <div className="panel">
          <div className="muted">Latest trusted price</div>
          <div className="price">{money(product.last_price)}</div>
          <p>{info.description}</p>
        </div>
        <div className="panel">
          <h3>Specifications</h3>
          <dl className="specs">
            {Object.entries({
              Category: info.category,
              Warranty: specs.warranty,
              Material: specs.material,
              Colour: specs.colour,
              Origin: specs.countryOfOrigin,
              Support: specs.support,
            }).map(([key, value]) =>
              value ? (
                <div key={key} style={{ display: "contents" }}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ) : null
            )}
          </dl>
        </div>
      </div>

      <div className="section-title"><h2>Price history</h2></div>
      <div className="panel">
        <Chart points={data.history} />
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Price</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {[...data.history].reverse().map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.scraped_at).toLocaleString()}</td>
                <td>{money(row.price)}</td>
                <td>{row.stock_text || (row.in_stock ? "In stock" : "Out of stock")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.history.length === 0 && <p className="muted">No successful scrapes yet.</p>}
      </div>

      <div className="section-title"><h2>Scrape log</h2></div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Outcome</th>
              <th>Attempts</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {data.logs.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.started_at).toLocaleString()}</td>
                <td>
                  <span className={`badge ${row.outcome === "success" ? "ok" : row.outcome === "failed" ? "fail" : "warn"}`}>
                    {row.outcome}
                  </span>
                </td>
                <td>{row.attempts}</td>
                <td>
                  {row.error_message || (row.details?.steps || []).slice(-2).join(" → ") || "ok"}
                  <div className="muted">{row.duration_ms ? `${row.duration_ms} ms` : ""}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.logs.length === 0 && <p className="muted">No scrape attempts yet.</p>}
      </div>
    </div>
  );
}
