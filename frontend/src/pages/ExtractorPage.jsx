import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as mammoth from 'mammoth'
import { useDarkMode } from '../hooks/useDarkMode'

const loadPdfJs = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    resolve(window.pdfjsLib);
  };
  s.onerror = () => reject(new Error("PDF.js failed to load"));
  document.head.appendChild(s);
});

const extractPdf = async (file, mode, opts = {}) => {
  const pdfjs = await loadPdfJs();
  const ab = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise;
  if (pdf.numPages > 100)
    throw new Error(`"${file.name}" has ${pdf.numPages} pages. API limit is 100.\n\nSplit into two PDFs and upload both.`);

  const quality = opts.quality ?? 0.85;
  const scale   = opts.scale   ?? 1.5;
  const blocks = [];
  let textPages = 0;
  let imagePages = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const pageText = tc.items.map(i => i.str).join(" ").trim();

    if (mode === "vision" || (mode === "smart" && pageText.length <= 30)) {
      imagePages++;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const b64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
    } else {
      textPages++;
      blocks.push({ type: "text", text: `[Page ${p}]\n${pageText}` });
    }
  }

  return { blocks, textPages, imagePages };
};

const SYSTEM_PROMPT = `You are a senior credit intelligence analyst for the Valyze Credit Intelligence Platform.

CORE SYSTEM RULES:

RULE 1 — DATA INTEGRITY: Prioritize source documents. For missing fields: (1) extract from docs, (2) web search, (3) calculate/derive, (4) industry estimates. Use "N/A" only as last resort. NEVER say "Not disclosed in source documents". Never invent registration numbers.

RULE 2 — AUDITOR: Per year, from that year's signature page only.

RULE 3 — EQUITY: Sum ALL equity components including shareholder current accounts. Use final total.

RULE 4 — EBITDA: Net profit before tax + Finance costs + ALL depreciation/amortisation. Source from notes, not just P&L.

RULE 5 — CONFLICTS: Audited statements > Notes > Schedules > Questionnaire > Management. Log in data_limitations.

RULE 5B — ORDER SUMMARY DISCREPANCIES: Before finalizing order_comment, compare every order-summary/order_comment item against the uploaded files. If the order summary contains information that is missing from the uploaded files or conflicts with them, preserve the original order_comment and append a clear comment in the same order_comment field. Format: "Comment: Order summary discrepancy — [field/value from order summary] differs from uploaded files: [value/source found]. Verify before report generation." If multiple discrepancies exist, list them as numbered comments under the same order_comment field.

RULE 6 — CONSISTENCY: credit_rating=final_credit_rating, recommended_limit=recommended_credit_limit, max_exposure=maximum_exposure.

RULE 11 — CURRENCY DISPLAY:
- Credit-related fields (recommended_credit_limit, maximum_exposure, recommended_limit, max_exposure, credit_opinion_text, collateral_requirements, all credit limit references) → always in USD
- All other financial figures (P&L, balance sheet, cash flow, ratios display) → local currency (fin_currency)
- Exchange rate field: name it exchange_rate_[local]_usd matching the company's currency (e.g. exchange_rate_sar_usd for Saudi, exchange_rate_aed_usd for UAE, exchange_rate_egp_usd for Egypt)

RULE 12 — COUNTRY REGISTRATION FIELDS:
- show_egypt_fields: true ONLY if country is Egypt. Populate: tax_registration_number, tax_card_number, trade_license_number, social_insurance_number, gafi_registration, industrial_license_number, import_license_number, export_license_number, lei_number
- show_saudi_fields: true ONLY if country is Saudi Arabia. Populate: zakat_certificate, zakat_number, zakat_status, zakat_alert, vat_registration_number, gosi_registration, nitaqat_band, municipality_license
- show_uae_fields: true ONLY if country is UAE. Populate: trade_license_number, trn_vat, ded_number, freezone_license
- For ANY OTHER country: set all three flags to false. Use extra_reg_fields:[{extra_reg_label, extra_reg_value}] for ALL country-specific registrations (tax ID, VAT, trade license, chamber of commerce, etc.)
- extra_reg_fields is also used for additional fields beyond the standard set for Egypt/Saudi/UAE
- other_registration_id: use this field for any other registration ID, certificate number, authority number, or miscellaneous registration reference that does not fit the standard fields. If multiple values exist, combine them with " / " or use extra_reg_fields for labeled pairs.

RULE 14 — REPORT ID FORMAT:
Generate report_id as VCR-[COUNTRY_CODE]-[4-DIGIT-NUMBER]
Country codes: EGY (Egypt), UAE (United Arab Emirates), KSA (Saudi Arabia), KWT (Kuwait), QAT (Qatar), BHR (Bahrain), OMN (Oman), JOR (Jordan), LBN (Lebanon), IRQ (Iraq), GBR (UK), DEU (Germany), IND (India), USA (United States), and standard ISO 3-letter codes for all others.
4-digit number: generate randomly e.g. 0047, 0123, 0891.
Example: VCR-EGY-0047, VCR-UAE-0183, VCR-KSA-0056

RULE 15 — MANAGEMENT TEAM INTEGRITY:
NEVER add a management_team entry with a placeholder name like "N/A", "Unknown", or a job title in the name field.
If a position exists but the person's name is not in source documents → do NOT add that entry at all.
Only add management_team entries where you have the actual person's name.
Each entry must include: name (real person), title, nationality (if known, else "N/A"), language (primary language, e.g. "Arabic", "English"), bio (real background, not invented).

RULE 16 — PHONE NUMBERS:
Populate phone_numbers as an array. Each number found in source documents gets its own entry:
phone_numbers: [{
  country_flag (emoji: 🇦🇪 UAE, 🇪🇬 Egypt, 🇸🇦 KSA, 🇰🇼 Kuwait, 🇶🇦 Qatar, 🇧🇭 Bahrain, 🇴🇲 Oman, 🇯🇴 Jordan, 🇱🇧 Lebanon, 🇮🇶 Iraq, 🌍 Other),
  country_code (+971 / +20 / +966 etc.),
  phone_number (digits only, formatted),
  national_id (if available, else ""),
  number_type (Mobile / Phone / Fax / WhatsApp),
  contact_person (person name or role e.g. "Reception"),
  comments (e.g. "Direct line", "Office hours", "Main office"),
  is_primary ("true" for primary, "false" for others)
}]
If only one number found, still use the array format with one entry.

RULE 17 — SHAREHOLDERS & MANAGEMENT NATIONALITY/LANGUAGE:
shareholders entries must include: name, position, percentage, nationality, type, language (primary language spoken).
management_team entries must include: name, title, department, nationality, language, contact_phone, contact_email, bio.
If nationality/language not in source documents, use best estimate based on name origin and flag in data_limitations.

RULE 18 — IMPORT/EXPORT COUNTRY FLAGS:
In import_countries and export_countries fields, prefix each country with its flag emoji.
Example: "🇨🇳 China, 🇮🇳 India, 🇩🇪 Germany" not just "China, India, Germany".
Same for primary_supply_countries, export_destinations in supply chain fields.

RULE 19 — ANNUAL TURNOVER:
Always populate annual_turnover as a string with local currency and USD equivalent.
Format: "SAR 496,941,199 (≈ USD 132.4M)" or "AED 185,000,000 (≈ USD 50.4M)"
Use the most recent year's revenue as the basis. This is separate from revenue_1.
cash_ratio, cash_ratio_prev, cash_ratio_industry, cash_ratio_status, cash_ratio_label, cash_ratio_interpretation
ebit_margin_prev, ebit_margin_industry, ebit_margin_status, ebit_margin_label, ebit_margin_interpretation
failure_badge (low/medium/high), payment_badge (low/medium/high)

RULE 7 — DATA TYPES: ALL values must be strings. "72" not 72.

RULE 8 — STATUS: Only "success", "warning", or "danger" for _status fields.

RULE 8B — COLORS: Always populate _color fields with valid hex colors:
- "#22c55e" or "green" for positive/low/healthy
- "#f59e0b" or "yellow" for warnings 
- "#ef4444" or "red" for negative/high-risk
- "#7c3aed" or "purple" for critical
- Use specific hex codes (e.g., "#22c55e") not color names

RULE 9 — BENCHMARKS: Never override analyst benchmarks.

RULE 10 — CONTACTS: management contact_email/contact_phone from source docs only. Not found → "N/A". Never invent.

SWOT: Max 4 per quadrant. Credit/payment risk focused. Include geopolitical threats when material.

SPEED: Max 3 web searches. Prioritize documents.

OUTPUT: Single valid JSON only. No markdown. No code blocks. Start { end }.

REQUIRED FIELDS:
report_id (VCR-YYYYMMDD-XXXX), report_date, current_year, client_name, client_reference, analyst_name, analyst_id, analyst_department, analyst_email, analyst_phone, qa_reviewer_name, qa_review_date, order_comment,
company_name, legal_name, trade_names, cr_number, unified_number, investment_license_no, license_type, issue_date, expiry_date, capital, company_type, company_duration, company_status, company_status_badge, status_badge, incorporation_date, incorporation_state, country, city, company_address, headquarters_address, phone, fax, email, website, auditor_name, sic_codes, industry, employee_count,
show_egypt_fields (bool), tax_registration_number, tax_card_number, trade_license_number, social_insurance_number, gafi_registration, industrial_license_number, import_license_number, export_license_number, lei_number,
show_saudi_fields (bool), zakat_certificate, zakat_number, zakat_status, zakat_alert, vat_registration_number, gosi_registration, nitaqat_band, municipality_license,
show_uae_fields (bool), trn_vat, ded_number, freezone_license,
other_registration_id,
extra_reg_fields:[{extra_reg_label, extra_reg_value}],
executive_summary_text (max 120 words), company_history_text (max 80 words), exec_current_ratio, exec_equity_ratio, exec_ebit_margin, exec_debt_equity, exec_profitability,
parent_company, subsidiaries, affiliates, ultimate_beneficial_owner,
annual_turnover,
phone_numbers:[{country_flag,country_code,phone_number,national_id,number_type,contact_person,comments,is_primary}],
shareholders:[{name,position,percentage,nationality,type,language}],
management_team:[{name,title,department,nationality,language,contact_phone,contact_email,bio}],
show_board_of_directors (bool), board_members:[{name,role,nationality,since,bio_short}],
show_related_concerns (bool), group_hq_name, group_hq_location,
branches:[{branch_name,branch_unified_no,branch_cr_no,branch_city,branch_function,branch_status,branch_status_badge}],
regional_affiliates:[{affiliate_name}],
registration_activities_description, activities_full_description, nace_codes, nace_description, hs_codes, hs_description, employee_location, facilities_count, main_facility_location, markets_count, markets_regions, premises_type, premises_size, premises_owned_rental, vehicles, equipment, brands, suppliers_number, clients_number,
main_suppliers, local_purchasing_pct, local_purchasing_detail, import_purchasing_pct, import_countries, import_items, supplier_payment_method, supplier_payment_terms,
key_customers, local_sales_pct, local_sales_detail, export_sales_pct, export_countries, export_items, customer_payment_method, customer_payment_terms,
banking_relationships:[{bank_name,facility_type,facility_usage}], total_banks, primary_bank, group_treasury_support, banking_notes,
fin_currency, fin_unit_scale, fin_statement_type, fin_period_end, fin_scope, fin_ratio_basis, fin_parent_note,
financial_data:{year_1:{cfo,cfi,cff,cash_end},year_2:{cfo,cfi,cff,cash_end},year_3:{cfo,cfi,cff,cash_end}},
cash_flow_operating_trend, cash_flow_investing_trend, cash_flow_financing_trend, cash_flow_end_trend,
year_1, year_2, year_3,
revenue_1,revenue_2,revenue_3,revenue_trend, cogs_1,cogs_2,cogs_3,cogs_trend, gross_profit_1,gross_profit_2,gross_profit_3,gross_profit_trend, opex_1,opex_2,opex_3,opex_trend, ebitda_1,ebitda_2,ebitda_3,ebitda_trend, net_income_1,net_income_2,net_income_3,net_income_trend, cash_1,cash_2,cash_3,cash_trend, ar_1,ar_2,ar_3,ar_trend, inventory_1,inventory_2,inventory_3,inventory_trend, current_assets_1,current_assets_2,current_assets_3,current_assets_trend, total_assets_1,total_assets_2,total_assets_3,total_assets_trend, current_liabilities_1,current_liabilities_2,current_liabilities_3,current_liabilities_trend, ltd_1,ltd_2,ltd_3,ltd_trend, total_liabilities_1,total_liabilities_2,total_liabilities_3,total_liabilities_trend, equity_1,equity_2,equity_3,equity_trend, ebit_margin,
current_ratio,current_ratio_prev,current_ratio_industry,current_ratio_status,current_ratio_label,current_ratio_interpretation,
quick_ratio,quick_ratio_prev,quick_ratio_industry,quick_ratio_status,quick_ratio_label,quick_ratio_interpretation,
gross_margin,gross_margin_prev,gross_margin_industry,gross_margin_status,gross_margin_label,gross_margin_interpretation,
ebitda_margin,ebitda_margin_prev,ebitda_margin_industry,ebitda_margin_status,ebitda_margin_label,ebitda_margin_interpretation,
net_margin,net_margin_prev,net_margin_industry,net_margin_status,net_margin_label,net_margin_interpretation,
roa,roa_prev,roa_industry,roa_status,roa_label,roa_interpretation,
roe,roe_prev,roe_industry,roe_status,roe_label,roe_interpretation,
debt_equity,debt_equity_prev,debt_equity_industry,debt_equity_status,debt_equity_label,debt_equity_interpretation,
debt_assets,debt_assets_prev,debt_assets_industry,debt_assets_status,debt_assets_label,debt_assets_interpretation,
equity_ratio,equity_ratio_prev,equity_ratio_industry,equity_ratio_status,equity_ratio_label,equity_ratio_interpretation,
interest_coverage,interest_coverage_prev,interest_coverage_industry,interest_coverage_status,interest_coverage_label,interest_coverage_interpretation,
asset_turnover,asset_turnover_prev,asset_turnover_industry,asset_turnover_status,asset_turnover_label,asset_turnover_interpretation,
dio,dio_prev,dio_industry,dio_status,dio_label,dio_interpretation,
dso,dso_prev,dso_industry,dso_status,dso_label,dso_interpretation,
dpo,dpo_prev,dpo_industry,dpo_status,dpo_label,dpo_interpretation,
ccc,ccc_prev,ccc_industry,ccc_status,ccc_label,ccc_interpretation,
cash_ratio, cash_ratio_prev, cash_ratio_industry, cash_ratio_status, cash_ratio_label, cash_ratio_interpretation,
ebit_margin_prev, ebit_margin_industry, ebit_margin_status, ebit_margin_label, ebit_margin_interpretation,
credit_rating, rating_color, risk_level, risk_color,
health_score, viability_score, viability_color, viability_level, viability_badge, viability_probability, viability_meaning,
delinquency_score, delinquency_color, delinquency_level, delinquency_badge, delinquency_probability, delinquency_meaning,
failure_score, failure_color, failure_level, failure_probability, failure_meaning, failure_badge,
payment_score, payment_color, payment_level, payment_probability, payment_meaning, payment_badge,
paydex_score, company_size, company_size_explanation, annual_revenue, payment_risk, financial_health, recommended_limit, max_exposure,
alerts:[{alert_type,alert_icon,alert_message}],
avg_dbt, pct_on_time, highest_past_due, prompt_pct, prompt_amount, slow_30_pct, slow_30_amount, slow_60_pct, slow_60_amount, slow_90plus_pct, slow_90plus_amount,
lawsuit_count,lawsuit_amount,lawsuit_last_date,lawsuit_status,lawsuit_badge,
lien_count,lien_amount,lien_last_date,lien_status,lien_badge,
judgment_count,judgment_amount,judgment_last_date,judgment_status,judgment_badge,
license_alert,license_icon,license_status,license_expiry,tax_alert,tax_icon,tax_status,
legal_details:[{event_type,event_date,event_amount,event_description}],
news_events:[{event_date,event_title,event_summary,event_sentiment,event_sentiment_label}],
industry_name, market_size, industry_growth_rate, sector_country_label, sector_year, sector_market_size, sector_market_size_comment, sector_forecast_period, sector_growth_forecast, sector_growth_comment, sector_local_share, sector_local_comment, sector_trade_flow, sector_trade_comment, sector_risks, sector_drivers, sector_major_players, sector_summary_text,
strengths:[], weaknesses:[], opportunities:[], threats:[] (max 4 each),
final_credit_rating, final_risk_level, final_risk_color, recommended_credit_limit, maximum_exposure, recommended_payment_terms, review_frequency, credit_opinion_text, collateral_requirements, exchange_rate_aed_usd,
risk_mitigations:[{strategy,expected_outcome}],
monitoring_triggers:[{trigger_event,trigger_action}], payment_delay_status, payment_delay_color, credit_utilization, utilization_color, financial_trend, trend_color, legal_threshold, payment_delay_threshold, next_review_date, next_review_note, assigned_analyst, escalation_contact,
data_quality_rating, data_limitations, data_source_analyst_comment

Trends: "↑ Growing +X%" / "↓ Declining X%" / "→ Stable". Financials: comma-formatted strings. All values: strings.`;

const COLORS = {
  dark: {
    bg: '#0f172a',
    surface: '#1e293b', 
    surfaceHover: '#334155',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    border: '#1e293b',
    borderSoft: '#0f172a',
    borderStrong: '#334155',
    primary: '#f59e0b',
    cta: '#8b5cf6',
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
  light: {
    bg: '#ffffff',
    surface: '#f8fafc',
    surfaceHover: '#f1f5f9', 
    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    border: '#e2e8f0',
    borderSoft: '#f1f5f9',
    borderStrong: '#cbd5e1',
    primary: '#f59e0b',
    cta: '#8b5cf6',
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  }
};

const STAGES = ["Processing files", "Claude thinking", "Building JSON", "Done"];
const ACCEPT = ".pdf,image/*,.xlsx,.csv,.txt,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif";
const fIcon = f => f.type === "application/pdf" ? "📄" : f.type?.startsWith("image/") ? "🖼️" : f.name.match(/\.docx?$/i) ? "📝" : "📊";

export default function ExtractorPage() {
  const navigate = useNavigate()
  const { reportId } = useParams()
  const { darkMode } = useDarkMode()
  const proxyUrl = `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')}/api/proxy`
  const hasReportId = Boolean(reportId)
  const [themeDarkMode, setThemeDarkMode] = useState(darkMode)

  useEffect(() => {
    const handleThemeChange = (event) => setThemeDarkMode(event.detail?.darkMode ?? document.documentElement.classList.contains('dark'))
    window.addEventListener('valyze:theme-change', handleThemeChange)
    return () => window.removeEventListener('valyze:theme-change', handleThemeChange)
  }, [])

  const [files, setFiles]               = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [status, setStatus]             = useState("idle");
  const [stage, setStage]               = useState(0);
  const [elapsed, setElapsed]           = useState(0);
  const [logMsg, setLogMsg]             = useState("");
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState("");
  const [tab, setTab]                   = useState("summary");
  const [copied, setCopied]             = useState(false);
  const [navigating, setNavigating]     = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [extractMode, setExtractMode] = useState("smart");
  const [patchJSON, setPatchJSON]       = useState("");
  const [patchInstructions, setPatchInstructions] = useState("");
  const [patchStatus, setPatchStatus]   = useState("idle");
  const [patchError, setPatchError]     = useState("");
  const [apiKey, setApiKey]             = useState(() => localStorage.getItem("valyze_api_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem("valyze_api_key"));

  useEffect(() => { if (apiKey) localStorage.setItem("valyze_api_key", apiKey); }, [apiKey]);

  useEffect(() => {
    if (!reportId) return
    const loadPortalFiles = async () => {
      setFilesLoading(true)
      try {
        const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
        const token = localStorage.getItem('valyze_token') || ''
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`${baseUrl}/api/upload/portal-files/${reportId}`, { headers: authHeaders })
        if (!res.ok) return
        const data = await res.json()
        if (!data.files?.length) return
        const fetched = []
        for (const f of data.files) {
          if (!f.download_path) continue
          try {
            const fileRes = await fetch(`${baseUrl}${f.download_path}`, { headers: authHeaders })
            if (!fileRes.ok) continue
            const blob = await fileRes.blob()
            const mimeMap = {
              pdf: 'application/pdf',
              word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              image: 'image/jpeg',
              spreadsheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              text: 'text/plain',
            }
            const mimeType = mimeMap[f.file_type] || 'application/octet-stream'
            fetched.push(new File([blob], f.filename, { type: mimeType }))
          } catch {}
        }
        if (fetched.length) setFiles(fetched)
      } catch {} finally {
        setFilesLoading(false)
      }
    }
    loadPortalFiles()
  }, [reportId])

  const fileRef  = useRef();
  const abortRef = useRef(null);
  const clockRef = useRef(null);
  const addFiles = f => setFiles(p => [...p, ...[...f]].slice(0, 5));
  const onDrop = useCallback(e => { e.preventDefault(); addFiles(e.dataTransfer.files); }, []);

  const C = COLORS[themeDarkMode ? 'dark' : 'light'];
  const toB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });

  const stopClock = () => { clearInterval(clockRef.current); clockRef.current = null; };

  const cancel = () => {
    abortRef.current?.abort();
    stopClock();
    setStatus("idle"); setStage(0); setElapsed(0); setLogMsg(""); setError("");
  };

  const compressBody = async (obj) => {
    const json = JSON.stringify(obj);
    const pako = (await import("pako")).default;
    return pako.gzip(json);
  };

  // Estimate JSON payload size in bytes (rough but fast)
  const estimateJsonSize = (obj) => {
    try { return new Blob([JSON.stringify(obj)]).size; }
    catch { return 0; }
  };

  // Compressed size estimate — gzip typically achieves 3-5x on JSON
  const estimateCompressedSize = (obj) => Math.ceil(estimateJsonSize(obj) * 0.3);

  // Vercel's safe body limit (compressed). We use 3.5 MB as the ceiling
  // because the 4.5 MB limit includes multipart overhead, headers, etc.
  const MAX_SAFE_COMPRESSED_BYTES = 3.5 * 1024 * 1024;

  const extract = async () => {
    if (!files.length) return;
    if (!apiKey || !apiKey.startsWith("sk-ant-")) {
      setError("Please enter your Anthropic API key (starts with sk-ant-)\n\nGet it from: https://console.anthropic.com/settings/keys");
      setStatus("error");
      return;
    }
    setStatus("loading"); setStage(0); setResult(null); setError(""); setElapsed(0); setLogMsg("Reading files…");
    clockRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    abortRef.current = new AbortController();
    const hardTimeout = setTimeout(() => abortRef.current?.abort(), 360000);

    try {
      const blocks = [];

      // Detect large payloads upfront and degrade image quality/scale
      const totalFileSize = files.reduce((s, f) => s + f.size, 0);
      const largePayload = totalFileSize > 5 * 1024 * 1024; // > 5 MB source
      const pdfQuality = largePayload ? 0.55 : 0.85;
      const pdfScale   = largePayload ? 1.0  : 1.5;

      for (const f of files) {
        setLogMsg(`Reading ${f.name}…`);

        if (f.type === "application/pdf") {
          const { blocks: pdfBlocks, textPages, imagePages } = await extractPdf(f, extractMode, { quality: pdfQuality, scale: pdfScale });
          setLogMsg(`✓ ${f.name} — ${textPages} text, ${imagePages} image${extractMode !== "smart" ? ` (${extractMode})` : ""}`);
          blocks.push(...pdfBlocks);
        } else if (f.type?.startsWith("image/") || f.name.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
          blocks.push({ type: "image", source: { type: "base64", media_type: f.type || "image/jpeg", data: await toB64(f) } });
          setLogMsg(`✓ ${f.name} — image`);
        } else if (f.name.match(/\.docx?$/i)) {
          const { value } = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
          blocks.push({ type: "text", text: `[Word: ${f.name}]\n\n${value}` });
          setLogMsg(`✓ ${f.name} — Word doc`);
        } else {
          blocks.push({ type: "text", text: `[File: ${f.name}]\n\n${await f.text().catch(() => "n/a")}` });
          setLogMsg(`✓ ${f.name}`);
        }
      }

      blocks.push({ type: "text", text: `Analyse all the above documents and return the complete Valyze credit intelligence JSON. ${useWebSearch ? "Use web_search AT MOST 3 times for critical missing data." : "Do NOT use web search — extract from documents only."}` });

      setStage(1); setLogMsg("Preparing payload…");

      const msgs = [{ role: "user", content: blocks }];
      let finalText = "";

      const apiBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: msgs,
      };
      if (useWebSearch) apiBody.tools = [{ type: "web_search_20250305", name: "web_search" }];

      // Pre-flight size check — warn before sending
      const compressedEstimate = estimateCompressedSize(apiBody);
      if (compressedEstimate > MAX_SAFE_COMPRESSED_BYTES) {
        const sizeMB = (compressedEstimate / 1024 / 1024).toFixed(1);
        throw new Error(
          `Documents too large (~${sizeMB} MB compressed, limit ~3.5 MB).\n\n` +
          `To fix this:\n` +
          `• Switch OCR mode from "vision" to "smart" or "text"\n` +
          `• Split large PDFs into smaller parts and extract separately\n` +
          `• Use fewer files at once\n\n` +
          `The server cannot process payloads this large — Vercel has a 4.5 MB body limit.`
        );
      }

      const maxLoops = useWebSearch ? 8 : 1;

      for (let i = 0; i < maxLoops; i++) {
        const useUrl = proxyUrl || "https://api.anthropic.com/v1/messages";
        const isDirect = !proxyUrl;
        const payload = i === 0 ? apiBody : { ...apiBody, messages: msgs };
        let fetchBody = JSON.stringify(payload);
        const headers = isDirect
          ? { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
          : { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Encoding": "gzip" };
        if (!isDirect) {
          const compressed = await compressBody(payload);
          fetchBody = compressed;
        }
        const res = await fetch(useUrl, {
          method: "POST",
          headers,
          signal: abortRef.current.signal,
          body: fetchBody,
        });
        if (!res.ok) {
          let errMsg;
          try {
            const e = await res.json();
            // Handle both Anthropic format (error.message) and FastAPI format (detail)
            errMsg = e?.error?.message || e?.detail || JSON.stringify(e);
          } catch { errMsg = `HTTP ${res.status}`; }
          throw new Error(`[${res.status}] ${errMsg}`);
        }
        let data = await res.json();
        if (Array.isArray(data)) data = data[0];
        if (!data || typeof data !== "object") {
          throw new Error(`Invalid API response: ${JSON.stringify(data)}`);
        }
        // Validate response structure
        if (!data.content || !Array.isArray(data.content)) {
          const errMsg = data?.error?.message || data?.detail || JSON.stringify(data);
          throw new Error(`Invalid API response: ${errMsg}`);
        }
        const txt = data.content.filter(b => b.type === "text").map(b => b.text).join("");
        if (txt) finalText = txt;
        if (data.stop_reason === "end_turn") break;
        if (data.stop_reason === "tool_use") {
          setLogMsg("Claude is searching the web…");
          msgs.push({ role: "assistant", content: data.content });
          msgs.push({ role: "user", content: data.content.filter(b => b.type === "tool_use").map(b => ({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(b.input) })) });
        } else break;
      }

      setStage(2); setLogMsg("Parsing JSON…");

      // Robust JSON extraction: find the first { then count brackets to find matching }
      // (The old greedy regex /\{[\s\S]*\}/ captured trailing text, breaking JSON.parse)
      const extractJsonObject = (text) => {
        const start = text.indexOf("{");
        if (start === -1) return null;
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < text.length; i++) {
          const ch = text[i];
          if (escape) { escape = false; continue; }
          if (ch === "\\") { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
}

        }
        // Fallback: if bracket matching failed, try greedy match
        const greedy = text.match(/\{[\s\S]*\}/);
        return greedy ? greedy[0] : null;
      };

      const jsonStr = extractJsonObject(finalText);
      if (!jsonStr) throw new Error("No valid JSON returned. Try again — if it persists, try splitting large PDFs.");
      setResult(JSON.parse(jsonStr));
      setStage(3); setLogMsg("Done!"); setStatus("done");

      } catch (e) {
      let msg;
      if (e.name === "AbortError") {
        msg = "Timed out after 6 minutes.\n\n• Make sure Web Search is OFF\n• Try splitting large PDFs\n• Try again";
      } else if (e.message?.includes("too large") || e.message?.includes("limit") || e.message?.includes("4.5 MB") || e.message?.includes("3.5 MB")) {
        // Pre-flight size check or server-side 413
        msg = e.message;
      } else if (e.message?.includes("[413]") || e.message?.includes("Content Too Large")) {
        msg = "Documents too large for the server (exceeded 4.5 MB limit).\n\n" +
              "To fix this:\n" +
              "• Switch OCR mode from \"vision\" to \"smart\" or \"text\"\n" +
              "• Split large PDFs into smaller parts\n" +
              "• Use fewer files at once";
      } else if (e.message?.includes("Failed to fetch") || e.message?.toLowerCase()?.includes("network") || e.message?.includes("CORS")) {
        msg = "Network error — could not reach the proxy server.\n\n" +
              "This often happens when the request is too large for the server (Vercel 4.5 MB limit).\n\n" +
              "Try:\n" +
              "• Switch OCR mode from \"vision\" to \"smart\" or \"text\"\n" +
              "• Split large PDFs into smaller parts\n" +
              "• Use fewer files at once\n\n" +
              "If the problem persists, check:\n" +
              "• Backend health endpoint: /health\n" +
              "• Your API key is valid (starts with sk-ant-)";
      } else if (e.message?.includes("[401]") || e.message?.includes("[403]")) {
        msg = "API key rejected by proxy.\n\n• Verify your key is correct\n• Make sure key starts with sk-ant-\n• Check API key quota at console.anthropic.com";
      } else if (e.message?.includes("[502]")) {
        msg = "Backend proxy connection failed.\n\nThe proxy could not reach the Anthropic API. This usually means:\n• Backend proxy is not properly configured\n• Backend needs redeployment\n\nTry again in a few moments.";
      } else if (e.message?.includes("[504]") || e.message?.includes("timed out")) {
        msg = "Request timed out.\n\n• Try smaller documents\n• Turn OFF web search\n• Split large PDFs into parts";
      } else {
        msg = e.message || "Unknown error occurred.";
      }
      setError(msg); setStatus("error");
    } finally {
      clearTimeout(hardTimeout); stopClock();
    }
  };

  const downloadJSON = () => {
    try {
      const uri = "data:application/octet-stream;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
      const a = document.createElement("a");
      a.href = uri;
      a.download = `valyze_${(result?.company_name || "report").replace(/[^a-z0-9]/gi, "_")}.json`;
      a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(() => document.body.removeChild(a), 500);
    } catch (e) { alert("Download failed: " + e.message); }
  };

  const copyJSON = () => {
    const json = JSON.stringify(result, null, 2);
    const fallbackCopy = () => {
      const ta = document.createElement("textarea");
      ta.value = json; ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(fallbackCopy);
    } else { fallbackCopy(); }
  };

  const runPatch = async () => {
    if (!patchJSON.trim() || !patchInstructions.trim()) return;
    if (!apiKey || !apiKey.startsWith("sk-ant-")) {
      setPatchError("Please enter your API key first");
      setPatchStatus("error");
      return;
    }
    setPatchStatus("loading"); setPatchError("");
    try {
       let parsed;
       try { parsed = JSON.parse(patchJSON); } catch { throw new Error("Invalid JSON — please check your pasted JSON."); }
       const patchUseUrl = proxyUrl || "https://api.anthropic.com/v1/messages";
       const patchIsDirect = !proxyUrl;
       const patchPayload = {
         model: "claude-haiku-4-5-20251001",
         max_tokens: 16000,
         system: "You are a JSON patch engine. Apply ONLY the listed changes. DO NOT rename fields, reorder, or add fields unless explicitly told. Return ONLY the complete updated JSON. Start with { end with }. No markdown.",
         messages: [{ role: "user", content: `Here is the full JSON:\n${JSON.stringify(parsed, null, 2)}\n\n## CHANGES TO APPLY:\n${patchInstructions}\n\nReturn only the complete patched JSON.` }]
       };
       const bodyStr = JSON.stringify(patchPayload);
       const headers = patchIsDirect
         ? { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
         : { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Encoding": "gzip" };
       const fetchBody = patchIsDirect ? bodyStr : await compressBody(patchPayload);
       const res = await fetch(patchUseUrl, {
         method: "POST",
         headers,
         body: fetchBody,
       });
      if (!res.ok) { const e = await res.json(); throw new Error(e?.error?.message || "API error"); }
      let data = await res.json();
      if (Array.isArray(data)) data = data[0];
      if (!data || typeof data !== "object" || !data.content) throw new Error("Invalid patch API response");
      const raw = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      // Use same bracket-counting extraction as main extract()
      const patchStart = raw.indexOf("{");
      if (patchStart === -1) throw new Error("No valid JSON returned.");
      let pDepth = 0, pInStr = false, pEsc = false;
      let patchJson = null;
      for (let pi = patchStart; pi < raw.length; pi++) {
        const ch = raw[pi];
        if (pEsc) { pEsc = false; continue; }
        if (ch === "\\") { pEsc = true; continue; }
        if (ch === '"') { pInStr = !pInStr; continue; }
        if (pInStr) continue;
        if (ch === "{") pDepth++;
        else if (ch === "}") { pDepth--; if (pDepth === 0) { patchJson = raw.slice(patchStart, pi + 1); break; } }
      }
      if (!patchJson) { const gm = raw.match(/\{[\s\S]*\}/); patchJson = gm?.[0]; }
      if (!patchJson) throw new Error("No valid JSON returned.");
      setResult(JSON.parse(patchJson)); setStatus("done"); setTab("json");
      setPatchStatus("done");
    } catch (e) { setPatchError(e.message); setPatchStatus("error"); }
  };

  const saveResultForEditor = useCallback(async () => {
    if (!result) return;
    setNavigating(true);
    setError("");
    try {
      if (hasReportId) {
        // Save to backend immediately before navigating
        const { default: api } = await import("../api/client");
        const token = localStorage.getItem("valyze_token") || "";
        const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
        const saveRes = await fetch(`${baseUrl}/api/report/${reportId}/easy-way`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(result),
        });
        if (!saveRes.ok) {
          const errData = await saveRes.json().catch(() => ({}));
          throw new Error(errData.detail || `Failed to save report (HTTP ${saveRes.status})`);
        }
        // Navigate to editor — no autoImport param, data is already in backend
        navigate("/editor/" + reportId, { replace: true });
      } else {
        localStorage.setItem("valyze_pending_import", JSON.stringify(result));
        navigate("/", { replace: true });
      }
    } catch (e) {
      setNavigating(false);
      setError("Could not save report: " + (e.message || e));
      setStatus("error");
    }
  }, [hasReportId, navigate, reportId, result]);

  const d  = result || {};
  const cf = d.financial_data || {};
  const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const colorClass = (color) => {
    const key = String(color || "").toLowerCase();
    const colors = {
      "#10b981": "bg-emerald-500",
      "#22c55e": "bg-emerald-500",
      green: "bg-emerald-500",
      "#f59e0b": "bg-amber-500",
      yellow: "bg-amber-500",
      "#ef4444": "bg-rose-500",
      red: "bg-rose-500",
      "#7c3aed": "bg-violet-500",
      purple: "bg-violet-500",
      "#3b82f6": "bg-blue-500",
      blue: "bg-blue-500",
    };
    return colors[key];
  };

  const Badge = ({ v, color }) => {
    const c = { Low: "bg-emerald-500", Medium: "bg-amber-500", High: "bg-rose-500", Critical: "bg-violet-500", green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-rose-500" };
    const bg = colorClass(color) || c[v] || "bg-slate-500";
    return v ? <span className={`rounded-full px-3 py-0.5 text-[11px] font-bold text-white ${bg}`}>{v}</span>
      : <span className="text-[var(--color-text-muted)]">—</span>;
  };
  const Bar = ({ label, val, color, invert }) => {
    const w = Math.max(0, Math.min(100, invert ? 100 - (+val || 0) : (+val || 0)));
    const widthSteps = ["w-0", "w-5", "w-10", "w-15", "w-20", "w-25", "w-30", "w-35", "w-40", "w-45", "w-50", "w-55", "w-60", "w-65", "w-70", "w-75", "w-80", "w-85", "w-90", "w-95", "w-100"];
    const widthClass = widthSteps[Math.round(w / 5)];
    const defaultBg = w > 70 ? "bg-emerald-500" : w > 40 ? "bg-amber-500" : "bg-rose-500";
    const bg = colorClass(color) || defaultBg;
    return <div className="mb-2.5"><div className="mb-0.5 flex items-center justify-between text-xs"><span className="text-[var(--color-text-secondary)]">{label}</span><span className="font-semibold text-[var(--color-text)]">{val ??"—"}</span></div><div className="h-1.5 overflow-hidden rounded bg-[var(--color-border-soft)]"><div className={`h-full rounded ${bg} ${widthClass} transition-all duration-700`} /></div></div>;
  };
  const Sec = ({ title, ch }) => (
    <div className="mb-3.5 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{title}</div>
      {ch}
    </div>
  );
  const F = ({ l, v }) => (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-soft)] py-1 text-xs">
      <span className="flex-shrink-0 text-[var(--color-text-muted)]">{l}</span>
      <span className="max-w-[65%] break-words text-right font-medium text-[var(--color-text)]">{v ??"—"}</span>
    </div>
  );
  const THead = ({ cols }) => <thead><tr>{cols.map(h=><th key={h} className="border-b-2 border-[var(--color-border)] bg-blue-500/10 px-2 py-1.5 text-left text-[11px] font-bold text-blue-500">{h}</th>)}</tr></thead>;
  const TRow  = ({ row }) => <tr>{row.map((c,i)=><td key={i} className={`border-b border-[var(--color-border-soft)] px-2 py-1 text-xs ${i === 0 ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text)]"}`}>{c||"—"}</td>)}</tr>;
  const Table = ({ cols, rows }) => <table className="w-full border-collapse"><THead cols={cols}/><tbody>{rows.map((r,i)=><TRow key={i} row={r}/>)}</tbody></table>;

  const alertClass = a => {
    if (a.alert_type === "danger") return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    if (a.alert_type === "warning") return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    if (a.alert_type === "success") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  };

  const sentimentClass = n => {
    if (n.event_sentiment === "positive") return "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (n.event_sentiment === "negative") return "border border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    return "border border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  };

  const TABS = ["summary","operations","financials","ratios","risk","legal","news","recommendation","json","patch"];

  return (
    <div className="min-h-[calc(100vh-96px)] w-full">
      <div className="bg-[var(--color-surface)] dark:bg-white/5 border border-[var(--color-border)] rounded-3xl shadow-sm overflow-hidden">

        <div className="border-b border-[var(--color-border)] p-5 md:p-6 flex items-center justify-between gap-4 bg-white/70 dark:bg-white/[0.03]">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xl shadow-lg shadow-blue-500/20 flex-shrink-0">⚡</div>
            <div className="min-w-0">
              <div className="text-base md:text-lg font-black text-[var(--color-text)] truncate">Valyze AI Document Extractor</div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">Smart PDF extraction · Hybrid OCR · Claude Sonnet 4</div>
              {hasReportId && <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono truncate">Report: {reportId}</div>}
            </div>
          </div>
          {!showKeyInput && !status.includes("loading") && !status.includes("done") && (
            <button onClick={()=>setShowKeyInput(true)} className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] hover:text-primary hover:border-primary/50 transition-all text-xs font-bold">
              🔑 Change Key
            </button>
          )}
        </div>

      {(showKeyInput || !apiKey) && status !== "loading" && status !== "done" && (
        <div className="border-b border-[var(--color-border)] p-5 md:p-6 bg-white/60 dark:bg-white/[0.02]">
          <div className="flex flex-col md:flex-row gap-4 md:items-center">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-2">🔐 Anthropic API Key</div>
              <input 
                type="password" 
                value={apiKey} 
                onChange={e=>setApiKey(e.target.value)} 
                placeholder="sk-ant-api03-..."
                className="input-field font-mono"
              />
            </div>
            <div className="flex flex-col gap-2 md:w-44">
              <button 
                onClick={()=>{if(apiKey.startsWith("sk-ant-")){localStorage.setItem("valyze_api_key",apiKey);setShowKeyInput(false)}}} 
                disabled={!apiKey.startsWith("sk-ant-")}
                className="px-4 py-3 rounded-xl border border-transparent bg-emerald-500 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-muted)] hover:bg-emerald-600 transition-all"
              >
                ✓ Save Key
              </button>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--color-text-muted)] hover:text-primary text-center">Get API Key →</a>
            </div>
          </div>
        </div>
      )}

        <div className="p-5 md:p-6 lg:p-8">

        {status !== "done" && <>
          <div onDragOver={e=>e.preventDefault()} onDrop={onDrop} onClick={()=>fileRef.current.click()}
            className="border-2 border-dashed border-[var(--color-border)] hover:border-primary/70 rounded-3xl p-8 md:p-10 text-center cursor-pointer bg-white/70 dark:bg-white/5 hover:bg-primary/5 transition-all mb-4">
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={e=>addFiles(e.target.files)}/>
            <div className="text-4xl mb-3">📂</div>
            <div className="font-black text-[var(--color-text)] text-lg mb-1">Drop company documents here</div>
            <div className="text-sm text-[var(--color-text-secondary)]">PDF · Word · Images · Excel · CSV · TXT — up to 5 files</div>
            <div className="text-xs text-[var(--color-text-muted)] mt-2">Text pages → text · Scanned pages → vision</div>
          </div>
          {filesLoading && (
            <div className="text-center text-sm text-[var(--color-text-secondary)] py-2 mb-2">
              ⏳ Loading portal files…
            </div>
          )}
          {files.map((f,i)=>(
            <div key={i} className="flex items-center justify-between gap-4 bg-white/70 dark:bg-white/5 border border-[var(--color-border)] rounded-2xl px-4 py-3 mb-2">
              <span className="text-sm text-[var(--color-text-secondary)] truncate">{fIcon(f)} {f.name} <span className="text-[var(--color-text-muted)]">({(f.size/1024).toFixed(0)} KB)</span></span>
              <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} className="text-xl text-rose-500 hover:text-rose-600">✕</button>
            </div>
          ))}
        </>}

        {status === "loading" && (
          <div className="bg-white/70 dark:bg-white/5 border border-[var(--color-border)] rounded-3xl p-8 text-center mb-4">
            <div className="text-4xl mb-2">⚙️</div>
            <div className="text-primary text-3xl font-black font-mono mb-2">{fmtTime(elapsed)}</div>
            <div className="text-sm text-[var(--color-text-secondary)] mb-5 min-h-5">{logMsg}</div>
            <div className="flex gap-2 justify-center flex-wrap mb-5">
              {STAGES.map((s,i)=>(
                <div key={i} className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/70 dark:bg-white/5 text-[var(--color-text-muted)] border border-[var(--color-border)]">
                  {i<stage?"✓":i===stage?"◐":"○"} {s}
                </div>
              ))}
            </div>
            <button onClick={cancel} className="px-5 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-600 font-bold text-sm hover:bg-rose-100">✕ Cancel</button>
          </div>
        )}

        {status === "error" && (
          <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl p-4 mb-4 text-rose-700 dark:text-rose-300 text-sm whitespace-pre-line">⚠️ {error}</div>
        )}

        {status !== "done" && <>
          <button onClick={extract} disabled={!files.length||status==="loading"}
            className="w-full py-4 rounded-2xl border border-transparent bg-gradient-to-r from-blue-500 to-violet-500 text-white font-black text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:from-[var(--color-surface)] disabled:to-[var(--color-surface)] disabled:text-[var(--color-text-muted)] hover:shadow-xl hover:shadow-blue-500/20 transition-all mb-3">
            {status==="loading"?"Extracting...":"⚡ Run Credit Intelligence Extraction"}
          </button>
          <div className="flex items-center justify-center gap-3 mb-3">
            <div onClick={()=>setUseWebSearch(v=>!v)} className="w-11 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] relative cursor-pointer flex-shrink-0">
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary transition-all ${useWebSearch ? "left-[calc(100%-1.5rem)]" : "left-1"}`}/>
            </div>
            <span className="text-sm text-[var(--color-text-secondary)] cursor-pointer select-none" onClick={()=>setUseWebSearch(v=>!v)}>
              🔍 Web search {useWebSearch?<span className="text-amber-500">ON</span>:<span className="text-emerald-500">OFF</span>}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs">
            <span className="text-[var(--color-text-muted)]">OCR:</span>
            {["text","smart","vision"].map(m=>(
              <button key={m} onClick={()=>setExtractMode(m)} className={`px-3 py-1 rounded-lg border border-transparent text-[11px] font-bold ${extractMode===m ? 'bg-primary text-white' : 'bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-primary'}`}>
                {m}
              </button>
            ))}
            <span className="text-[var(--color-text-muted)] text-[10px]">{extractMode==="text"?"(cheap)":extractMode==="vision"?"(max data)":"(balanced)"}</span>
          </div>
        </>}

        {status === "done" && result && (
          <div>
            <div className="flex gap-2 flex-wrap mb-4 p-2 bg-white/70 dark:bg-white/5 border border-[var(--color-border)] rounded-2xl">
              {TABS.map(t=>(
                <button key={t} onClick={()=>setTab(t)} className={`px-3 py-2 rounded-xl border border-transparent text-xs font-black uppercase tracking-wide ${tab===t ? 'bg-primary text-white' : 'bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] hover:text-primary hover:border-primary/50'}`}>
                  {t==="json"?"Raw JSON":t==="patch"?"🔧 Patch":t}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mb-6 flex-wrap">
              <button onClick={copyJSON} className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] hover:text-primary hover:border-primary/50 text-sm font-bold">{copied?"✓ Copied":"Copy JSON"}</button>
              <button onClick={downloadJSON} className="px-4 py-2 rounded-xl border border-transparent bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600">⬇ Download JSON</button>
              <button onClick={()=>{setStatus("idle");setFiles([]);setResult(null);setLogMsg("");}} className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] hover:text-primary hover:border-primary/50 text-sm font-bold">New Report</button>
              <button
                onClick={saveResultForEditor}
                disabled={navigating || !result}
                className="px-5 py-3 rounded-xl border border-transparent bg-gradient-to-r from-blue-500 to-violet-500 text-white font-black text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl hover:shadow-violet-500/20 transition-all"
              >
                {navigating ? "Opening..." : hasReportId ? "Continue to Editor →" : "Save for Easy Import →"}
              </button>
            </div>

            {tab==="summary"&&<div>
              <Sec title="Company Identity" ch={<><F l="Legal Name" v={d.legal_name}/><F l="Trade Names" v={d.trade_names}/><F l="CR / Reg No." v={d.cr_number}/><F l="Unified No." v={d.unified_number}/><F l="Country / City" v={`${d.country||"—"} / ${d.city||"—"}`}/><F l="Industry" v={d.industry}/><F l="Type / Status" v={`${d.company_type||"—"} / ${d.company_status||"—"}`}/><F l="Incorporated" v={d.incorporation_date}/><F l="Capital" v={d.capital}/><F l="Employees" v={d.employee_count}/><F l="Website" v={d.website}/><F l="Email" v={d.email}/><F l="Phone" v={d.phone}/></>}/>
              <Sec title="Executive Summary" ch={<><div className="mb-2.5 text-sm leading-7 text-[var(--color-text-secondary)]">{d.executive_summary_text||"—"}</div><div className="text-xs leading-6 italic text-[var(--color-text-muted)]">{d.company_history_text}</div></>}/>
              <Sec title="Key Ratios" ch={<><F l="Current Ratio" v={d.exec_current_ratio}/><F l="Equity Ratio" v={d.exec_equity_ratio}/><F l="EBIT Margin" v={d.exec_ebit_margin}/><F l="Debt/Equity" v={d.exec_debt_equity}/><F l="Net Margin" v={d.exec_profitability}/></>}/>
              <Sec title="Ownership" ch={<><F l="UBO" v={d.ultimate_beneficial_owner}/><F l="Parent" v={d.parent_company}/><F l="Subsidiaries" v={d.subsidiaries}/>{(d.shareholders||[]).map((s,i)=><F key={i} l={`Shareholder ${i+1}`} v={`${s.name} · ${s.percentage}% · ${s.nationality}`}/>)}</>}/>
              <Sec title="Management" ch={(d.management_team||[]).map((m,i)=><div key={i} className="border-b border-[var(--color-border-soft)] py-2 last:border-b-0"><div className="text-sm font-semibold text-blue-500">{m.name} <span className="text-[var(--color-text-muted)]">· {m.title}</span></div><div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{m.bio}</div></div>)}/>
            </div>}

            {tab==="operations"&&<div>
              <Sec title="Activities" ch={<div className="text-sm leading-7 text-[var(--color-text-secondary)]">{d.registration_activities_description||d.activities_full_description||"—"}</div>}/>
              <Sec title="Classification" ch={<><F l="NACE" v={`${d.nace_codes||"—"} — ${d.nace_description||""}`}/><F l="HS Codes" v={`${d.hs_codes||"—"} — ${d.hs_description||""}`}/><F l="SIC" v={d.sic_codes}/></>}/>
              <Sec title="Operations" ch={<><F l="Employees" v={`${d.employee_count||"—"} · ${d.employee_location||""}`}/><F l="Facilities" v={`${d.facilities_count||"—"} · ${d.main_facility_location||""}`}/><F l="Markets" v={`${d.markets_count||"—"} · ${d.markets_regions||""}`}/></>}/>
              <Sec title="Supply Chain — Purchasing" ch={<><F l="Main Suppliers" v={d.main_suppliers}/><F l="Local Sourcing" v={`${d.local_purchasing_pct||0}% — ${d.local_purchasing_detail||""}`}/><F l="Imports" v={`${d.import_purchasing_pct||0}% from ${d.import_countries||"—"}`}/><F l="Items" v={d.import_items}/><F l="Payment" v={`${d.supplier_payment_method||"—"} · ${d.supplier_payment_terms||""}`}/></>}/>
              <Sec title="Supply Chain — Sales" ch={<><F l="Key Customers" v={d.key_customers}/><F l="Local Sales" v={`${d.local_sales_pct||0}% — ${d.local_sales_detail||""}`}/><F l="Exports" v={`${d.export_sales_pct||0}% to ${d.export_countries||"—"}`}/><F l="Items" v={d.export_items}/><F l="Payment" v={`${d.customer_payment_method||"—"} · ${d.customer_payment_terms||""}`}/></>}/>
              <Sec title="Banking" ch={<><F l="Primary Bank" v={d.primary_bank}/><F l="Total Partners" v={d.total_banks}/><F l="Group Treasury" v={d.group_treasury_support}/>{(d.banking_relationships||[]).map((b,i)=><F key={i} l={b.bank_name||`Bank ${i+1}`} v={`${b.facility_type} · ${b.facility_usage}`}/>)}</>}/>
            </div>}

            {tab==="financials"&&<div>
              <Sec title="Statement Info" ch={<><F l="Currency" v={d.fin_currency}/><F l="Scale" v={d.fin_unit_scale}/><F l="Type" v={d.fin_statement_type}/><F l="Period End" v={d.fin_period_end}/></>}/>
              <Sec title="Income Statement" ch={<Table cols={["Item",d.year_3||"Y-2",d.year_2||"Y-1",d.year_1||"Latest","Trend"]} rows={[["Revenue",d.revenue_3,d.revenue_2,d.revenue_1,d.revenue_trend],["COGS",d.cogs_3,d.cogs_2,d.cogs_1,d.cogs_trend],["Gross Profit",d.gross_profit_3,d.gross_profit_2,d.gross_profit_1,d.gross_profit_trend],["OPEX",d.opex_3,d.opex_2,d.opex_1,d.opex_trend],["EBITDA",d.ebitda_3,d.ebitda_2,d.ebitda_1,d.ebitda_trend],["Net Income",d.net_income_3,d.net_income_2,d.net_income_1,d.net_income_trend]]}/>}/>
              <Sec title="Balance Sheet" ch={<Table cols={["Item",d.year_3||"Y-2",d.year_2||"Y-1",d.year_1||"Latest","Trend"]} rows={[["Cash",d.cash_3,d.cash_2,d.cash_1,d.cash_trend],["Accounts Rec.",d.ar_3,d.ar_2,d.ar_1,d.ar_trend],["Total Assets",d.total_assets_3,d.total_assets_2,d.total_assets_1,d.total_assets_trend],["Current Liab.",d.current_liabilities_3,d.current_liabilities_2,d.current_liabilities_1,d.current_liabilities_trend],["Total Liab.",d.total_liabilities_3,d.total_liabilities_2,d.total_liabilities_1,d.total_liabilities_trend],["Equity",d.equity_3,d.equity_2,d.equity_1,d.equity_trend]]}/>}/>
              <Sec title="Cash Flow" ch={<Table cols={["Item",d.year_3||"Y-2",d.year_2||"Y-1",d.year_1||"Latest","Trend"]} rows={[["Operating",cf.year_3?.cfo||"—",cf.year_2?.cfo||"—",cf.year_1?.cfo||"—",d.cash_flow_operating_trend||"—"],["Investing",cf.year_3?.cfi||"—",cf.year_2?.cfi||"—",cf.year_1?.cfi||"—",d.cash_flow_investing_trend||"—"],["Financing",cf.year_3?.cff||"—",cf.year_2?.cff||"—",cf.year_1?.cff||"—",d.cash_flow_financing_trend||"—"],["Cash at End",cf.year_3?.cash_end||"—",cf.year_2?.cash_end||"—",cf.year_1?.cash_end||"—",d.cash_flow_end_trend||"—"]]}/>}/>
            </div>}

            {tab==="ratios"&&<div>
              {[["Liquidity",[["Current Ratio",d.current_ratio,d.current_ratio_industry,d.current_ratio_label,d.current_ratio_interpretation],["Quick Ratio",d.quick_ratio,d.quick_ratio_industry,d.quick_ratio_label,d.quick_ratio_interpretation]]],["Profitability",[["Gross Margin",`${d.gross_margin||"—"}%`,`${d.gross_margin_industry||"—"}%`,d.gross_margin_label,d.gross_margin_interpretation],["EBITDA Margin",`${d.ebitda_margin||"—"}%`,`${d.ebitda_margin_industry||"—"}%`,d.ebitda_margin_label,d.ebitda_margin_interpretation],["EBIT Margin",`${d.ebit_margin||"—"}%`,`${d.ebit_margin_industry||"—"}%`,d.ebit_margin_label,d.ebit_margin_interpretation],["Net Margin",`${d.net_margin||"—"}%`,`${d.net_margin_industry||"—"}%`,d.net_margin_label,d.net_margin_interpretation]]],["Leverage",[["Debt/Equity",d.debt_equity,d.debt_equity_industry,d.debt_equity_label,d.debt_equity_interpretation],["Equity Ratio",`${d.equity_ratio||"—"}%`,`${d.equity_ratio_industry||"—"}%`,d.equity_ratio_label,d.equity_ratio_interpretation]]],["Efficiency",[["Asset Turnover",d.asset_turnover,d.asset_turnover_industry,d.asset_turnover_label,d.asset_turnover_interpretation],["DSO",`${d.dso||"—"}d`,`${d.dso_industry||"—"}d`,d.dso_label,d.dso_interpretation],["DPO",`${d.dpo||"—"}d`,`${d.dpo_industry||"—"}d`,d.dpo_label,d.dpo_interpretation]]]].map(([title,rows])=>(
                <Sec key={title} title={`${title} Ratios`} ch={rows.map(([l,v,ind,lbl,interp])=><div key={l} className="border-b border-[var(--color-border-soft)] py-2 last:border-b-0"><div className="flex items-start justify-between gap-3 text-xs"><span className="text-[var(--color-text-muted)]">{l}</span><span className="font-semibold text-[var(--color-text)]">{v??"—"}</span></div><div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">Industry avg: {ind??"—"} · {lbl??"—"}</div>{interp&&<div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{interp}</div>}</div>)}/>
              ))}
            </div>}

            {tab==="risk"&&<div>
              <Sec title="Credit Rating" ch={<><div className="mb-4 flex items-center justify-between gap-3"><div><div className="text-3xl font-black text-[var(--color-text)]">{d.credit_rating||"—"}</div><div className="text-xs text-[var(--color-text-secondary)]">Credit Rating</div></div><Badge v={d.risk_level} color={d.risk_color}/></div><Bar label="Health Score" val={d.health_score} color={d.viability_color}/><Bar label="Viability Score" val={d.viability_score} color={d.viability_color}/><Bar label="Payment Score" val={d.payment_score} color={d.payment_color}/><Bar label="Delinquency Risk" val={d.delinquency_score} color={d.delinquency_color} invert/><Bar label="Failure Risk" val={d.failure_score} color={d.failure_color} invert/><F l="PAYDEX" v={d.paydex_score}/><F l="Company Size" v={d.company_size}/><F l="Annual Revenue" v={d.annual_revenue}/></>}/>
              <Sec title="Payment Behavior" ch={<><F l="Avg Days Beyond Terms" v={d.avg_dbt!=null?`${d.avg_dbt} days`:null}/><F l="% On Time" v={d.pct_on_time!=null?`${d.pct_on_time}%`:null}/><F l="Prompt" v={d.prompt_pct!=null?`${d.prompt_pct}% · ${d.prompt_amount}`:null}/><F l="1–30 Days Slow" v={d.slow_30_pct!=null?`${d.slow_30_pct}% · ${d.slow_30_amount}`:null}/><F l="90+ Days Slow" v={d.slow_90plus_pct!=null?`${d.slow_90plus_pct}% · ${d.slow_90plus_amount}`:null}/></>}/>
              <Sec title="Alerts" ch={(d.alerts||[]).map((a,i)=><div key={i} className={`mb-1.5 rounded-lg border px-3 py-2 text-xs ${alertClass(a)}`}>{a.alert_icon} {a.alert_message}</div>)}/>
            </div>}

            {tab==="legal"&&<div>
              <Sec title="Legal Summary" ch={[["Lawsuits",d.lawsuit_count,d.lawsuit_amount,d.lawsuit_status],["Liens",d.lien_count,d.lien_amount,d.lien_status],["Judgments",d.judgment_count,d.judgment_amount,d.judgment_status]].map(([t,c,a,s])=><div key={t} className="border-b border-[var(--color-border-soft)] py-2 last:border-b-0"><div className="flex items-start justify-between gap-3 text-xs"><span className="text-[var(--color-text-muted)]">{t}</span><span>Count: {c??"—"} · {a||"—"}</span></div><div className="text-xs text-[var(--color-text-secondary)]">Status: {s||"—"}</div></div>)}/>
              <Sec title="Compliance" ch={<><F l="License" v={`${d.license_status||"—"} (exp: ${d.license_expiry||"—"})`}/><F l="Tax Status" v={d.tax_status}/></>}/>
              {(d.legal_details||[]).length>0&&<Sec title="Legal Details" ch={(d.legal_details).map((l,i)=><div key={i} className="mb-2 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-3 text-xs last:mb-0"><strong className="text-blue-500">{l.event_type} · {l.event_date}</strong><div className="mt-1 text-[var(--color-text-secondary)]">{l.event_description}</div></div>)}/>}
            </div>}

            {tab==="news"&&<div>
              <Sec title="News & Events (2024+)" ch={!(d.news_events||[]).length?<div className="text-sm text-[var(--color-text-muted)]">No 2024+ news found.</div>:(d.news_events).map((n,i)=><div key={i} className="mb-2 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-3.5 text-xs last:mb-0"><div className="mb-1 flex items-center justify-between gap-3"><span className="text-[11px] text-[var(--color-text-muted)]">{n.event_date}</span><span className={`rounded px-2 py-0.5 text-[11px] ${sentimentClass(n)}`}>{n.event_sentiment_label}</span></div><strong className="text-blue-500">{n.event_title}</strong><div className="mt-1 text-[var(--color-text-secondary)]">{n.event_summary}</div></div>)}/>
            </div>}

            {tab==="recommendation"&&<div>
              <Sec title="Credit Decision" ch={<><div className="mb-4 flex items-center justify-between gap-3"><div><div className="text-3xl font-black text-[var(--color-text)]">{d.final_credit_rating||"—"}</div><div className="text-xs text-[var(--color-text-secondary)]">Final Rating</div></div><Badge v={d.final_risk_level} color={d.final_risk_color}/></div><F l="Credit Limit (USD)" v={d.recommended_credit_limit}/><F l="Max Exposure (USD)" v={d.maximum_exposure}/><F l="Payment Terms" v={d.recommended_payment_terms}/><F l="Review Frequency" v={d.review_frequency}/><F l="Collateral" v={d.collateral_requirements}/>{d.credit_opinion_text&&<div className="mt-3 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-3.5 text-xs leading-6 text-[var(--color-text-secondary)]"><strong className="mb-1.5 block text-blue-500">📋 Credit Opinion</strong>{d.credit_opinion_text}</div>}</>}/>
              {(d.risk_mitigations||[]).length>0&&<Sec title="Risk Mitigations" ch={(d.risk_mitigations).map((m,i)=><div key={i} className="border-b border-[var(--color-border-soft)] py-2 last:border-b-0"><div className="text-sm font-semibold text-blue-500">{m.strategy}</div><div className="text-xs text-[var(--color-text-secondary)]">{m.expected_outcome}</div></div>)}/>}
              <Sec title="Monitoring Triggers" ch={(d.monitoring_triggers||[]).map((t,i)=><div key={i} className="border-b border-[var(--color-border-soft)] py-2 last:border-b-0"><div className="text-sm font-semibold text-amber-500">⚠️ {t.trigger_event}</div><div className="text-xs text-[var(--color-text-secondary)]">{t.trigger_action}</div></div>)}/>
            </div>}

            {tab==="json"&&<div className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-4"><pre className="m-0 max-h-[70vh] overflow-auto break-words text-[11px] leading-5 text-emerald-500">{JSON.stringify(result,null,2)}</pre></div>}

            {tab==="patch"&&(
              <div>
                <div className="mb-3.5 rounded-2xl border border-blue-500/30 bg-[var(--color-surface)] p-4">
                  <div className="mb-2.5 text-xs font-bold text-blue-500">🔧 PASTE YOUR JSON</div>
                  <textarea value={patchJSON} onChange={e=>setPatchJSON(e.target.value)} placeholder="Paste your credit report JSON here..."
                    className="input-field min-h-[180px] font-mono text-[11px] text-emerald-500"/>
                  {result&&<button onClick={()=>setPatchJSON(JSON.stringify(result,null,2))} className="mt-2 rounded-lg bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-500 transition-all hover:bg-blue-500/30">↑ Load current report JSON</button>}
                </div>
                <div className="mb-3.5 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-4">
                  <div className="mb-2.5 text-xs font-bold text-amber-500">📋 PATCH INSTRUCTIONS</div>
                  <textarea value={patchInstructions} onChange={e=>setPatchInstructions(e.target.value)}
                    placeholder={"## WRONG VALUES\n1. \"field\": \"old\" → \"new\"\n\n## EMPTY FIELDS\n2. \"field\": \"\" → \"value\"\n\n## ADD NEW FIELDS\n3. Add after \"field\":\n   \"new_field\": \"value\""}
                    className="input-field min-h-[240px] font-mono text-xs text-[var(--color-text)]"/>
                </div>
                {patchStatus==="error"&&<div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">⚠️ {patchError}</div>}
                {patchStatus==="done"&&<div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">✓ JSON patched! Switched to Raw JSON tab — download to save.</div>}
                {patchStatus==="loading"&&<div className="mb-3 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-2.5 text-center text-sm text-[var(--color-text-secondary)]">⚙️ Applying patches with Haiku…</div>}
                <button onClick={runPatch} disabled={!patchJSON.trim()||!patchInstructions.trim()||patchStatus==="loading"}
                  className={`w-full rounded-xl border-none px-4 py-3 text-sm font-bold transition-all ${!patchJSON.trim()||!patchInstructions.trim()||patchStatus==="loading" ? "cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-text-muted)]" : "bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:shadow-lg"}`}>
                  {patchStatus==="loading"?"Applying patches...":"🔧 Apply Patches"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
  );
}