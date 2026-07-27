import { useMemo, useState } from "react";
import CompanyCard from "./CompanyCard.jsx";
import { submitOrderWithFiles } from "../api.js";
import { SERVICE_LEVELS, serviceLevelLabel } from "../format.js";

const EMPTY_COMPANY = {
  company_name: "",
  country: "",
  address: "",
  registration_no: "",
  vat_no: "",
  phone: "",
  fax: "",
  requested_limit: "",
  comments: "",
};

const emptyOrder = {
  client_ref: "",
  service_level: "standard",
  report_type: "standard",
  due_date: "",
  notes: "",
};

const MAX_FILES_PER_COMPANY = 5;
// Every attachment in a submission travels in ONE multipart request, and the
// serverless platform rejects request bodies above ~4.5 MB before they ever reach
// the API — which arrives in the browser as an opaque network failure. So cap the
// whole submission here, where we can name the actual problem.
const MAX_UPLOAD_MB = 4;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".png",
  ".jpg",
  ".jpeg",
  ".tiff",
  ".xlsx",
  ".xls",
  ".csv",
  ".txt",
]);

function getExtension(file) {
  return file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
}

export default function OrderForm({
  clientName,
  portalToken,
  onSubmitSuccess,
  onBack,
}) {
  const [order, setOrder] = useState(emptyOrder);
  const [companies, setCompanies] = useState([{ ...EMPTY_COMPANY }]);
  const [filesByCompany, setFilesByCompany] = useState([[]]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const estimate = useMemo(() => {
    const multiplier = order.report_type === "full" ? 1.1 : 1;
    const total = Math.round(35 * companies.length * multiplier);
    return total;
  }, [order.report_type, companies.length]);

  function updateOrder(field, value) {
    setOrder((current) => ({ ...current, [field]: value }));
  }

  function updateCompany(index, nextCompany) {
    setCompanies((current) =>
      current.map((company, companyIndex) =>
        companyIndex === index ? nextCompany : company
      )
    );
  }

  function addCompany() {
    setCompanies((current) => [...current, { ...EMPTY_COMPANY }]);
    setFilesByCompany((current) => [...current, []]);
  }

  function removeCompany(index) {
    setCompanies((current) => current.filter((_, companyIndex) => companyIndex !== index));
    setFilesByCompany((current) => current.filter((_, companyIndex) => companyIndex !== index));
  }

  function validate() {
    if (!order.client_ref.trim()) {
      return "Client reference is required.";
    }

    if (!order.service_level) {
      return "Service level is required.";
    }

    if (!order.due_date) {
      return "Due date is required.";
    }

    if (!companies.length) {
      return "At least one company is required.";
    }

    const incompleteIndex = companies.findIndex(
      (company) => !company.company_name.trim() || !company.country.trim()
    );

    if (incompleteIndex !== -1) {
      return `Company ${incompleteIndex + 1} must include company name and country.`;
    }

    return "";
  }

  function validateFiles() {
    let totalBytes = 0;

    for (let companyIndex = 0; companyIndex < filesByCompany.length; companyIndex += 1) {
      const companyFiles = filesByCompany[companyIndex] || [];

      if (companyFiles.length > MAX_FILES_PER_COMPANY) {
        return `Company ${companyIndex + 1} can have at most ${MAX_FILES_PER_COMPANY} files.`;
      }

      for (const file of companyFiles) {
        if (file.size > MAX_UPLOAD_BYTES) {
          return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_MB} MB per file. Please compress or split it.`;
        }

        if (!ALLOWED_EXTENSIONS.has(getExtension(file))) {
          return `${file.name} is not an allowed file type.`;
        }

        totalBytes += file.size;
      }
    }

    if (totalBytes > MAX_UPLOAD_BYTES) {
      return `Your attachments total ${(totalBytes / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_MB} MB per order. Please remove or compress some files, or submit the companies in separate orders.`;
    }

    return "";
  }

  // Step 1: validate, then show the read-only review instead of submitting.
  function handleReview(event) {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const fileError = validateFiles();
    if (fileError) {
      setError(fileError);
      return;
    }

    setError("");
    setReviewing(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildPayload() {
    return {
      client_ref: order.client_ref.trim(),
      service_level: order.service_level,
      report_type: order.report_type,
      due_date: order.due_date,
      notes: order.notes.trim(),
      companies: companies.map((company) => ({
        company_name: company.company_name.trim(),
        country: company.country.trim(),
        address: company.address.trim(),
        registration_no: company.registration_no.trim(),
        vat_no: company.vat_no.trim(),
        phone: company.phone.trim(),
        fax: company.fax.trim(),
        requested_limit: company.requested_limit.trim(),
        comments: company.comments.trim(),
      })),
    };
  }

  // Step 2: the client confirmed the review — actually submit the order.
  async function confirmSubmit() {
    setLoading(true);
    setError("");

    try {
      const result = await submitOrderWithFiles(portalToken, buildPayload(), filesByCompany);
      onSubmitSuccess(result);
    } catch (err) {
      setError(err.message || "Failed to submit order. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setOrder({ ...emptyOrder });
    setCompanies([{ ...EMPTY_COMPANY }]);
    setFilesByCompany([[]]);
    setError("");
    setLoading(false);
  }

  return (
    <div className="portal-page">
      <div className="order-header">
        <div>
          <p className="eyebrow">Client Order Portal</p>
          <h1>New Order — {clientName}</h1>
        </div>
        <div className="logo">VALYZE</div>
      </div>

      {!reviewing && (
      <form className="order-form" onSubmit={handleReview}>
        <section className="form-section">
          <div className="section-heading">
            <span className="section-number">01</span>
            <div>
              <h2>Order Details</h2>
              <p>Set the reference, delivery target, and reporting scope.</p>
            </div>
          </div>

          <div className="form-grid two-columns">
            <label className="field-label" htmlFor="client-ref">
              Client Reference
            </label>
            <input
              id="client-ref"
              value={order.client_ref}
              onChange={(event) => updateOrder("client_ref", event.target.value)}
              placeholder="Client reference"
              required
            />

            <label className="field-label" htmlFor="service-level">
              Service Level
            </label>
            <select
              id="service-level"
              value={order.service_level}
              onChange={(event) => updateOrder("service_level", event.target.value)}
              required
            >
              {SERVICE_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </div>

          <div className="estimate-box">
            Estimated: $35 per report (× {companies.length} companies = ${estimate})
            {order.report_type === "full" && (
              <span> Full Report includes financials and applies +10%.</span>
            )}
          </div>

          <fieldset className="radio-group">
            <legend className="field-label">Report Type</legend>
            <label className="radio-option">
              <input
                type="radio"
                name="report_type"
                value="standard"
                checked={order.report_type === "standard"}
                onChange={(event) => updateOrder("report_type", event.target.value)}
              />
              <span>Standard Report</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="report_type"
                value="full"
                checked={order.report_type === "full"}
                onChange={(event) => updateOrder("report_type", event.target.value)}
              />
              <span>Full Report (includes financials, +10%)</span>
            </label>
          </fieldset>

          <div className="form-grid two-columns">
            <label className="field-label" htmlFor="due-date">
              Due Date
            </label>
            <input
              id="due-date"
              type="date"
              value={order.due_date}
              onChange={(event) => updateOrder("due_date", event.target.value)}
              required
            />

            <label className="field-label" htmlFor="notes">
              Notes
            </label>
            <input
              id="notes"
              value={order.notes}
              onChange={(event) => updateOrder("notes", event.target.value)}
              placeholder="Optional order notes"
            />
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <span className="section-number">02</span>
            <div>
              <h2>Companies</h2>
              <p>Add each company that should be included in this order.</p>
            </div>
          </div>

          {companies.map((company, index) => (
            <CompanyCard
              key={index}
              index={index}
              company={company}
              files={filesByCompany[index] || []}
              removable={companies.length > 1}
              onChange={updateCompany}
              onFilesChange={(nextFiles) => setFilesByCompany((current) =>
                current.map((files, companyIndex) => companyIndex === index ? nextFiles : files)
              )}
              onRemove={() => removeCompany(index)}
            />
          ))}

          <button className="secondary-button full-width" type="button" onClick={addCompany}>
            + Add Another Company
          </button>
        </section>

        {error && <div className="form-error">{error}</div>}

        <div className="submit-row">
          <button className="secondary-button" type="button" onClick={resetForm}>
            Reset Form
          </button>
          <button className="primary-button" type="submit">
            {`Review Order (${companies.length} ${companies.length === 1 ? "Company" : "Companies"})`}
          </button>
        </div>
      </form>
      )}

      {reviewing && (
        <div className="order-form review-panel">
          <section className="form-section">
            <div className="section-heading">
              <span className="section-number">✓</span>
              <div>
                <h2>Review Your Order</h2>
                <p>Check everything below, then confirm to submit. Nothing is sent until you confirm.</p>
              </div>
            </div>

            <div className="review-block">
              <h3>Order Details</h3>
              <dl className="review-list">
                <div><dt>Client Reference</dt><dd>{order.client_ref.trim() || "—"}</dd></div>
                <div><dt>Service Level</dt><dd>{serviceLevelLabel(order.service_level)}</dd></div>
                <div><dt>Report Type</dt><dd>{order.report_type === "full" ? "Full" : "Standard"}</dd></div>
                <div><dt>Due Date</dt><dd>{order.due_date || "—"}</dd></div>
                {order.notes.trim() && (<div><dt>Notes</dt><dd>{order.notes.trim()}</dd></div>)}
              </dl>
            </div>

            {companies.map((company, index) => (
              <div className="review-block" key={index}>
                <h3>Company {index + 1}: {company.company_name.trim() || "—"}</h3>
                <dl className="review-list">
                  {company.country.trim() && (<div><dt>Country</dt><dd>{company.country.trim()}</dd></div>)}
                  {company.registration_no.trim() && (<div><dt>Registration No</dt><dd>{company.registration_no.trim()}</dd></div>)}
                  {company.vat_no.trim() && (<div><dt>VAT No</dt><dd>{company.vat_no.trim()}</dd></div>)}
                  {company.address.trim() && (<div><dt>Address</dt><dd>{company.address.trim()}</dd></div>)}
                  {company.phone.trim() && (<div><dt>Phone</dt><dd>{company.phone.trim()}</dd></div>)}
                  {company.requested_limit.trim() && (<div><dt>Requested Limit</dt><dd>{company.requested_limit.trim()}</dd></div>)}
                  {company.comments.trim() && (<div><dt>Comments</dt><dd>{company.comments.trim()}</dd></div>)}
                  <div><dt>Attached Files</dt><dd>{(filesByCompany[index] || []).length} file(s)</dd></div>
                </dl>
                {(filesByCompany[index] || []).length > 0 && (
                  <ul className="review-files">
                    {(filesByCompany[index] || []).map((file, fileIndex) => (
                      <li key={fileIndex}>{file.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {error && <div className="form-error">{error}</div>}

            <div className="submit-row">
              <button className="secondary-button" type="button" onClick={() => setReviewing(false)} disabled={loading}>
                Back to Edit
              </button>
              <button className="primary-button" type="button" onClick={confirmSubmit} disabled={loading}>
                {loading ? "Submitting..." : "Confirm & Submit"}
              </button>
            </div>
          </section>
        </div>
      )}

      <button className="text-button" type="button" onClick={onBack}>
        ← Back to My Orders
      </button>
    </div>
  );
}
