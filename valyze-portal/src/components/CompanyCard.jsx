export default function CompanyCard({
  index,
  company,
  files = [],
  removable,
  onChange,
  onFilesChange,
  onRemove,
}) {
  function updateField(field, value) {
    onChange(index, { ...company, [field]: value });
  }

  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files || []);
    onFilesChange([...files, ...selectedFiles]);
    event.target.value = "";
  }

  function removeFile(fileIndex) {
    onFilesChange(files.filter((_, currentIndex) => currentIndex !== fileIndex));
  }

  function formatFileSize(file) {
    const mb = file.size / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;
  }

  const fileInputId = `company-files-${index}`;

  return (
    <div className="company-card">
      <div className="company-card-header">
        <h3>Company {index + 1}</h3>
        {removable && (
          <button className="ghost-button small" type="button" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      <div className="form-grid two-columns">
        <label className="field-label" htmlFor={`company-name-${index}`}>
          Company Name*
        </label>
        <input
          id={`company-name-${index}`}
          value={company.company_name || ""}
          onChange={(event) => updateField("company_name", event.target.value)}
          placeholder="Company name"
        />

        <label className="field-label" htmlFor={`country-${index}`}>
          Country*
        </label>
        <input
          id={`country-${index}`}
          value={company.country || ""}
          onChange={(event) => updateField("country", event.target.value)}
          placeholder="Country"
        />
      </div>

      <label className="field-label" htmlFor={`address-${index}`}>
        Address
      </label>
      <textarea
        id={`address-${index}`}
        value={company.address || ""}
        onChange={(event) => updateField("address", event.target.value)}
        placeholder="Street, city, postal code"
        rows={3}
      />

      <div className="form-grid three-columns">
        <div>
          <label className="field-label" htmlFor={`registration-${index}`}>
            Registration No
          </label>
          <input
            id={`registration-${index}`}
            value={company.registration_no || ""}
            onChange={(event) => updateField("registration_no", event.target.value)}
            placeholder="Registration number"
          />
        </div>

        <div>
          <label className="field-label" htmlFor={`vat-${index}`}>
            VAT No
          </label>
          <input
            id={`vat-${index}`}
            value={company.vat_no || ""}
            onChange={(event) => updateField("vat_no", event.target.value)}
            placeholder="VAT number"
          />
        </div>

        <div>
          <label className="field-label" htmlFor={`phone-${index}`}>
            Phone
          </label>
          <input
            id={`phone-${index}`}
            value={company.phone || ""}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="Phone number"
          />
        </div>
      </div>

      <div className="form-grid three-columns">
        <div>
          <label className="field-label" htmlFor={`fax-${index}`}>
            Fax
          </label>
          <input
            id={`fax-${index}`}
            value={company.fax || ""}
            onChange={(event) => updateField("fax", event.target.value)}
            placeholder="Fax number"
          />
        </div>

        <div>
          <label className="field-label" htmlFor={`limit-${index}`}>
            Requested Credit Limit
          </label>
          <input
            id={`limit-${index}`}
            value={company.requested_limit || ""}
            onChange={(event) => updateField("requested_limit", event.target.value)}
            placeholder="Requested limit"
          />
        </div>

      <div className="file-upload full-span">
        <label className="field-label" htmlFor={fileInputId}>
          Attached Documents
        </label>
        <label className="file-drop" htmlFor={fileInputId}>
          <input
            id={fileInputId}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.tiff,.xlsx,.xls,.csv,.txt"
            onChange={handleFileChange}
          />
          <span>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Choose files"}</span>
          <small>PDF, Word, Excel, CSV, TXT, images · max 100MB each</small>
        </label>

        {files.length > 0 && (
          <ul className="file-list">
            {files.map((file, fileIndex) => (
              <li className="file-item" key={`${file.name}-${file.lastModified}-${fileIndex}`}>
                <div className="file-item-main">
                  <strong className="file-name">{file.name}</strong>
                  <span className="file-meta">{formatFileSize(file)}</span>
                </div>
                <button className="file-remove" type="button" onClick={() => removeFile(fileIndex)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>

      <label className="field-label" htmlFor={`comments-${index}`}>
        Comments / Special Instructions
      </label>
      <textarea
        id={`comments-${index}`}
        value={company.comments || ""}
        onChange={(event) => updateField("comments", event.target.value)}
        placeholder="Additional instructions"
        rows={3}
      />
    </div>
  );
}
