import { useMemo, useState } from "react";
import CompanyCard from "./CompanyCard.jsx";
import { submitOrderWithFiles } from "../api.js";

const SERVICE_LEVELS = [
  { value: "basic", label: "Basic (5-7 days)" },
  { value: "standard", label: "Standard (3 days)" },
  { value: "express", label: "Express (1-2 days)" },
  { value: "urgent", label: "Urgent (24 hrs)" },
];

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
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
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
  onReset,
}) {
  const [order, setOrder] = useState(emptyOrder);
  const [companies, setCompanies] = useState([{ ...EMPTY_COMPANY }]);
  const [filesByCompany, setFilesByCompany] = useState([[]]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    for (let companyIndex = 0; companyIndex < filesByCompany.length; companyIndex += 1) {
      const companyFiles = filesByCompany[companyIndex] || [];

      if (companyFiles.length > MAX_FILES_PER_COMPANY) {
        return `Company ${companyIndex + 1} can have at most ${MAX_FILES_PER_COMPANY} files.`;
      }

      for (const file of companyFiles) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          return `${file.name} is larger than ${MAX_FILE_SIZE_MB}MB.`;
        }

        if (!ALLOWED_EXTENSIONS.has(getExtension(file))) {
          return `${file.name} is not an allowed file type.`;
        }
      }
    }

    return "";
  }

  async function handleSubmit(event) {
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

    setLoading(true);
    setError("");

    try {
      const payload = {
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

      const result = await submitOrderWithFiles(portalToken, payload, filesByCompany);
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

      <form className="order-form" onSubmit={handleSubmit}>
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
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Submitting..." : `Submit Order (${companies.length} Companies)`}
          </button>
        </div>
      </form>

      <button className="text-button" type="button" onClick={onReset}>
        Submit Another Order
      </button>
    </div>
  );
}
