import { useEffect, useState } from "react";
import { fetchOrderStatus, fetchOrderDocumentHtml, fetchOrderDocumentBlob } from "../api.js";
import { serviceLevelLabel, shortDate, statusLabel, statusTone } from "../format.js";

export default function OrderDetail({ order, portalToken, onBack, onSessionExpired }) {
  const orderNumber = order?.order_number;
  // The dashboard payload already carries companies and dates; this call adds
  // the attached files and re-reads status straight from the source.
  const [live, setLive] = useState(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!orderNumber) return undefined;

    (async () => {
      setLoadingLive(true);
      try {
        const result = await fetchOrderStatus(portalToken, orderNumber);
        if (!cancelled) setLive(result);
      } catch (err) {
        if (err.status === 401) {
          onSessionExpired();
          return;
        }
        if (!cancelled) setError(err.message || "Could not load the latest order status.");
      } finally {
        if (!cancelled) setLoadingLive(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderNumber, portalToken, onSessionExpired]);

  const companies = live?.companies?.length ? live.companies : order?.companies || [];
  const files = live?.files || [];
  const total = companies.length || order?.company_count || 0;
  const done = companies.filter((company) => company.status === "completed").length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  async function handlePdf() {
    if (!orderNumber || busy) return;
    // Opened synchronously so the click's user gesture still counts — a
    // window.open() after the await gets eaten by the pop-up blocker.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Please allow pop-ups for this site to download the PDF.");
      return;
    }
    printWindow.document.write(
      "<p style='font:16px sans-serif;padding:24px'>Preparing your order document…</p>"
    );
    setBusy("pdf");
    setError("");
    try {
      const html = await fetchOrderDocumentHtml(portalToken, orderNumber);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 400);
    } catch (err) {
      printWindow.close();
      setError(err.message || "Could not open the PDF view.");
    } finally {
      setBusy("");
    }
  }

  async function handleWord() {
    if (!orderNumber || busy) return;
    setBusy("doc");
    setError("");
    try {
      const blob = await fetchOrderDocumentBlob(portalToken, orderNumber);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Order-${orderNumber}.doc`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Could not download the Word file.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="portal-page">
      <div className="order-header">
        <div>
          <p className="eyebrow">Order Details</p>
          <h1>{orderNumber || "Order"}</h1>
        </div>
        <div className="logo">VALYZE</div>
      </div>

      <div className="dashboard-actions">
        <button className="secondary-button" type="button" onClick={onBack}>
          ← Back to My Orders
        </button>
      </div>

      <div className="order-form">
        <section className="form-section">
          <div className="review-block">
            <h3>Summary</h3>
            <dl className="review-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`status-pill tone-${statusTone(order?.status)}`}>
                    {statusLabel(order?.status)}
                  </span>
                </dd>
              </div>
              <div><dt>Service Level</dt><dd>{serviceLevelLabel(order?.service_level)}</dd></div>
              <div><dt>Report Type</dt><dd>{order?.report_type === "full" ? "Full" : "Standard"}</dd></div>
              {order?.client_ref && (<div><dt>Your Reference</dt><dd>{order.client_ref}</dd></div>)}
              <div><dt>Submitted</dt><dd>{shortDate(order?.date_received || order?.created_at)}</dd></div>
              <div><dt>Due Date</dt><dd>{shortDate(order?.due_date)}</dd></div>
            </dl>

            <div className="progress-line">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <span className="progress-label">{done} of {total} completed</span>
            </div>
          </div>

          <div className="review-block">
            <h3>Companies ({total})</h3>
            {companies.length === 0 && <p className="panel-note">No companies on this order.</p>}
            <ul className="company-status-list">
              {companies.map((company, index) => (
                <li key={company.id || index}>
                  <span className="company-status-name">{company.company_name || `Company ${index + 1}`}</span>
                  <span className={`status-pill tone-${statusTone(company.status)}`}>
                    {statusLabel(company.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="review-block">
            <h3>Attached Documents</h3>
            {loadingLive && <p className="panel-note">Loading attachments…</p>}
            {!loadingLive && files.length === 0 && (
              <p className="panel-note">No documents were attached to this order.</p>
            )}
            {files.length > 0 && (
              <ul className="review-files">
                {files.map((file, index) => (
                  <li key={file.id || index}>{file.filename || "file"}</li>
                ))}
              </ul>
            )}
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="success-actions">
            <button className="secondary-button" type="button" onClick={handlePdf} disabled={!!busy}>
              {busy === "pdf" ? "Preparing…" : "Download PDF"}
            </button>
            <button className="secondary-button" type="button" onClick={handleWord} disabled={!!busy}>
              {busy === "doc" ? "Preparing…" : "Download Word"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
