import { fetchOrderDocumentHtml, fetchOrderDocumentBlob } from "../api.js";

export default function SuccessScreen({ result, portalToken, onReset }) {
  const files = result?.files || [];
  const fileCount = files.length;
  const orderNumber = result?.order_number || "";

  async function handlePdf() {
    if (!orderNumber) return;
    try {
      const html = await fetchOrderDocumentHtml(portalToken, orderNumber);
      const w = window.open("", "_blank");
      if (!w) {
        alert("Please allow pop-ups to download the PDF.");
        return;
      }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    } catch (e) {
      alert(e.message || "Could not open the PDF view.");
    }
  }

  async function handleWord() {
    if (!orderNumber) return;
    try {
      const blob = await fetchOrderDocumentBlob(portalToken, orderNumber);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Order-${orderNumber}.doc`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Could not download the Word file.");
    }
  }

  return (
    <div className="portal-page">
      <div className="success-card">
        <div className="success-mark" aria-hidden="true">✓</div>
        <p className="eyebrow">Order Received</p>
        <h1>Order Submitted Successfully</h1>

        <div className="order-number">{result?.order_number || "N/A"}</div>

        <div className="success-details">
          <div>
            <span>Order Number</span>
            <strong>{result?.order_number || "N/A"}</strong>
          </div>
          <div>
            <span>Company Count</span>
            <strong>{result?.company_count || 0}</strong>
          </div>
          <div>
            <span>Due Date</span>
            <strong>{result?.due_date || "N/A"}</strong>
          </div>
        </div>

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

        <div className="success-actions">
          <button className="secondary-button" type="button" onClick={handlePdf}>
            Download PDF
          </button>
          <button className="secondary-button" type="button" onClick={handleWord}>
            Download Word
          </button>
        </div>

        <button className="primary-button" type="button" onClick={onReset}>
          Submit Another Order
        </button>
      </div>
    </div>
  );
}
