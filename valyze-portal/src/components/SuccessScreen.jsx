export default function SuccessScreen({ result, onReset }) {
  const fileCount = result?.files?.length || 0;

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

        <p className="success-note">
          Your Valyze team has received your order and will begin processing shortly.
        </p>
        {fileCount > 0 && (
          <p className="success-note">
            {fileCount} attached file{fileCount === 1 ? "" : "s"} submitted with this order.
          </p>
        )}

        <button className="primary-button" type="button" onClick={onReset}>
          Submit Another Order
        </button>
      </div>
    </div>
  );
}
