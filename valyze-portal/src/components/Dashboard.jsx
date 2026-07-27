import { useCallback, useEffect, useState } from "react";
import { fetchMyOrders } from "../api.js";
import { serviceLevelLabel, shortDate, statusLabel, statusTone } from "../format.js";

export default function Dashboard({
  clientName,
  portalToken,
  onNewOrder,
  onOpenOrder,
  onSessionExpired,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchMyOrders(portalToken));
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
        return;
      }
      // Server-side faults carry internal detail (PostgREST text, status codes)
      // that a client should never be shown.
      setError(
        err.status >= 500
          ? "We couldn't load your orders just now. Please try again in a moment."
          : err.message || "Could not load your orders."
      );
    } finally {
      setLoading(false);
    }
  }, [portalToken, onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;
  const orders = data?.orders || [];

  return (
    <div className="portal-page">
      <div className="order-header">
        <div>
          <p className="eyebrow">Client Portal</p>
          <h1>My Orders — {clientName}</h1>
        </div>
        <div className="logo">VALYZE</div>
      </div>

      <div className="dashboard-actions">
        <button className="primary-button" type="button" onClick={onNewOrder}>
          New Order
        </button>
        <button className="secondary-button" type="button" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {summary && (
        <div className="summary-grid">
          <div className="summary-tile">
            <span>Total Orders</span>
            <strong>{summary.total_orders}</strong>
          </div>
          <div className="summary-tile">
            <span>Companies</span>
            <strong>{summary.total_companies}</strong>
          </div>
          <div className="summary-tile">
            <span>Completed</span>
            <strong className="tone-done">{summary.completed_companies}</strong>
          </div>
          <div className="summary-tile">
            <span>In Progress</span>
            <strong className="tone-active">{summary.in_progress_companies}</strong>
          </div>
        </div>
      )}

      {loading && !data && <div className="panel-note">Loading your orders…</div>}

      {error && (
        <div className="panel-note panel-error">
          <p>{error}</p>
          <button className="secondary-button" type="button" onClick={load}>
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <div className="panel-note">
          <p>You have no orders yet.</p>
          <button className="primary-button" type="button" onClick={onNewOrder}>
            Submit Your First Order
          </button>
        </div>
      )}

      {orders.length > 0 && (
        <ul className="order-list">
          {orders.map((order) => {
            const total = order.company_count || 0;
            const done = order.completed_count || 0;
            const percent = total ? Math.round((done / total) * 100) : 0;
            return (
              <li key={order.order_number}>
                <button
                  className="order-row"
                  type="button"
                  onClick={() => onOpenOrder(order)}
                  aria-label={`View order ${order.order_number}`}
                >
                  <div className="order-row-head">
                    <span className="order-row-number">{order.order_number}</span>
                    <span className={`status-pill tone-${statusTone(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </div>

                  <div className="order-row-meta">
                    <span>{serviceLevelLabel(order.service_level)}</span>
                    <span>Submitted {shortDate(order.date_received || order.created_at)}</span>
                    <span>Due {shortDate(order.due_date)}</span>
                  </div>

                  {order.companies?.length > 0 && (
                    <div className="order-row-companies">
                      {order.companies.map((company) => company.company_name).filter(Boolean).join(", ")}
                    </div>
                  )}

                  <div className="progress-line">
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="progress-label">
                      {done} of {total} completed
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
