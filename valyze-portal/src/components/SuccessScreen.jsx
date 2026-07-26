import { useState } from "react";
import { fetchOrderDocumentHtml, fetchOrderDocumentBlob } from "../api.js";

function shortDate(value) {
  if (!value) return "N/A";
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

export default function SuccessScreen({ result, portalToken, onReset }) {
  const files = result?.files || [];
  const fileCount = files.length;

  // The portal creates ONE ORDER PER COMPANY, so a multi-company submission
  // comes back with several order numbers. The top-level order_number only ever
  // reflects the first one — showing just that hid the rest of the client's
  // orders and made their documents undownloadable.
  const orders = result?.orders?.length
    ? result.orders
    : [{ order_number: result?.order_number, due_date: result?.due_date }];
  const isBatch = orders.length > 1;

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function handlePdf(orderNumber) {
    if (!orderNumber || busy) return;
    // Open the tab synchronously, inside the click handler: a window.open()
    // issued after an await has lost the user gesture and the pop-up blocker
    // eats it — which shows up only on slow connections.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Please allow pop-ups for this site to download the PDF.");
      return;
    }
    printWindow.document.write(
      "<p style='font:16px sans-serif;padding:24px'>Preparing your order document…</p>"
    );
    setBusy(`pdf:${orderNumber}`);
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

  async function handleWord(orderNumber) {
    if (!orderNumber || busy) return;
    setBusy(`doc:${orderNumber}`);
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

  function downloadButtons(orderNumber) {
    return (
      <div className="success-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => handlePdf(orderNumber)}
          disabled={!!busy}
        >
          {busy === `pdf:${orderNumber}` ? "Preparing…" : "Download PDF"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => handleWord(orderNumber)}
          disabled={!!busy}
        >
          {busy === `doc:${orderNumber}` ? "Preparing…" : "Download Word"}
        </button>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <div className="success-card">
        <div className="success-mark" aria-hidden="true">✓</div>
        <p className="eyebrow">Order Received</p>
        <h1>{isBatch ? "Orders Submitted Successfully" : "Order Submitted Successfully"}</h1>

        {!isBatch && <div className="order-number">{orders[0]?.order_number || "N/A"}</div>}

        <div className="success-details">
          <div>
            <span>{isBatch ? "Orders Created" : "Order Number"}</span>
            <strong>{isBatch ? orders.length : orders[0]?.order_number || "N/A"}</strong>
          </div>
          <div>
            <span>Company Count</span>
            <strong>{result?.company_count || orders.length}</strong>
          </div>
          <div>
            <span>{isBatch ? "Attached Files" : "Due Date"}</span>
            <strong>{isBatch ? fileCount : shortDate(orders[0]?.due_date)}</strong>
          </div>
        </div>

        {isBatch && (
          <div className="success-orders">
            <span className="success-files-label">
              One order per company — download each below
            </span>
            {orders.map((order, index) => (
              <div className="review-block" key={order?.order_number || index}>
                <h3>{order?.company_name || `Company ${index + 1}`}</h3>
                <dl className="review-list">
                  <div>
                    <dt>Order Number</dt>
                    <dd>{order?.order_number || "N/A"}</dd>
                  </div>
                  <div>
                    <dt>Due Date</dt>
                    <dd>{shortDate(order?.due_date)}</dd>
                  </div>
                </dl>
                {downloadButtons(order?.order_number)}
              </div>
            ))}
          </div>
        )}

        {fileCount > 0 && (
          <div className="success-files">
            <span className="success-files-label">
              {fileCount} attached file{fileCount === 1 ? "" : "s"}
            </span>
            <ul>
              {files.map((file, index) => (
                <li key={file?.id || index}>{file?.filename || "file"}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="success-note">
          Your Valyze team has received your order and will begin processing shortly.
        </p>

        {error && <div className="form-error">{error}</div>}

        {!isBatch && downloadButtons(orders[0]?.order_number)}

        <button className="primary-button" type="button" onClick={onReset}>
          Submit Another Order
        </button>
      </div>
    </div>
  );
}
