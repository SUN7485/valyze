import { useState, useRef, useCallback, useEffect } from "react";
import * as mammoth from "mammoth";

// Auth check — extractor requires a valid JWT token from the main app
const AUTH_API = import.meta.env.VITE_AUTH_API || "https://valyze-backend.vercel.app/api/auth/verify";

// Proxy URL for Anthropic API calls (server-to-server, avoids CORS issues).
// 1. VITE_PROXY_URL env var (set in Vercel dashboard) takes precedence.
// 2. Otherwise, derive from VITE_AUTH_API — e.g. https://valyze-backend.vercel.app/api/proxy
//    This works automatically in both production and local dev (FastAPI on port 8000).
// 3. For local Vite dev (port 5173) without FastAPI running, leave empty for direct calls.
let _proxyUrl = import.meta.env.VITE_PROXY_URL;
if (!_proxyUrl) {
  const derived = (import.meta.env.VITE_AUTH_API || "https://valyze-backend.vercel.app/api/auth/verify")
    .replace(/\/api\/auth\/verify$/, "")
    .replace(/\/api\/auth$/, "");
  _proxyUrl = derived + "/api/proxy";
}
const PROXY_URL = _proxyUrl;

function useAuthCheck() {
  const [authState, setAuthState] = useState("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";

    if (!token) {
      setAuthState("denied");
      return;
    }

    // Store token so the rest of the app can use it if needed
    localStorage.setItem("valyze_extractor_token", token);

    fetch(AUTH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (r) => {
        const contentType = r.headers.get("content-type") || ""
        const isJSON = contentType.includes("application/json")
        if (!r.ok || !isJSON) {
          setAuthState("denied");
          return;
        }
        const data = await r.json()
        if (data && data.valid === true) {
          setAuthState("ok")
        } else {
          setAuthState("denied")
        }
      })
      .catch(() => setAuthState("denied"));
  }, []);

  return authState;
}

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

const STAGES = ["Processing files", "Claude thinking", "Building JSON", "Done"];
const ACCEPT = ".pdf,image/*,.xlsx,.csv,.txt,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif";
const fIcon = f => f.type === "application/pdf" ? "📄" : f.type?.startsWith("image/") ? "🖼️" : f.name.match(/\.docx?$/i) ? "📝" : "📊";

export default function ValyzeExtractor() {
  const authState = useAuthCheck();

  // ALL hooks must be declared before any conditional returns (React rules of hooks)
  const [files, setFiles]               = useState([]);
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
  const [darkMode, setDarkMode]         = useState(true);

  // All hooks must be before any conditional returns
  useEffect(() => { if (apiKey) localStorage.setItem("valyze_api_key", apiKey); }, [apiKey]);

  const fileRef  = useRef();
  const abortRef = useRef(null);
  const clockRef = useRef(null);
  const addFiles = f => setFiles(p => [...p, ...[...f]].slice(0, 5));
  const onDrop = useCallback(e => { e.preventDefault(); addFiles(e.dataTransfer.files); }, []);

  // Block unauthenticated users (AFTER all hooks are declared)
  if (authState === "loading") {
    return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0f172a",color:"#94a3b8",fontFamily:"sans-serif" }}><div style={{ textAlign:"center" }}><div style={{ fontSize:40,marginBottom:16 }}>🔐</div><div style={{ fontWeight:700,fontSize:18,marginBottom:8,color:"#f1f5f9" }}>Verifying access...</div></div></div>;
  }

  if (authState === "denied") {
    return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0f172a",color:"#94a3b8",fontFamily:"sans-serif" }}>
      <div style={{ textAlign:"center",maxWidth:400 }}>
        <div style={{ fontSize:40,marginBottom:16 }}>🚫</div>
        <div style={{ fontWeight:700,fontSize:20,marginBottom:12,color:"#ef4444" }}>Access Denied</div>
        <div style={{ fontSize:14,lineHeight:1.7,marginBottom:20 }}>You must sign in to the Valyze system first.</div>
        <a href={import.meta.env.VITE_FRONTEND_URL || window.location.origin} style={{ display:"inline-block",padding:"12px 24px",borderRadius:8,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",color:"#fff",fontWeight:700,fontSize:14,textDecoration:"none",cursor:"pointer" }}>Go to Login →</a>
      </div>
    </div>;
  }

  const toggleDarkMode = () => setDarkMode(d => !d);
  const C = COLORS[darkMode ? 'dark' : 'light'];
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
        const useUrl = PROXY_URL || "https://api.anthropic.com/v1/messages";
        const isDirect = !PROXY_URL;
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
      const m = finalText.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("No valid JSON returned. Try again — if it persists, try splitting large PDFs.");
      setResult(JSON.parse(m[0]));
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
              "• Backend: valyze-backend.vercel.app/health\n" +
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
       const patchUseUrl = PROXY_URL || "https://api.anthropic.com/v1/messages";
       const patchIsDirect = !PROXY_URL;
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
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("No valid JSON returned.");
      setResult(JSON.parse(m[0])); setStatus("done"); setTab("json");
      setPatchStatus("done");
    } catch (e) { setPatchError(e.message); setPatchStatus("error"); }
  };

  const d  = result || {};
  const cf = d.financial_data || {};
  const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const Badge = ({ v, color }) => {
    const c = { Low:"#22c55e",Medium:"#f59e0b",High:"#ef4444",Critical:"#7c3aed",green:"#22c55e",yellow:"#f59e0b",red:"#ef4444" };
    const bg = color || c[v] || "#6b7280";
    return v ? <span style={{ background:bg,color:"#fff",borderRadius:6,padding:"2px 10px",fontSize:12,fontWeight:700 }}>{v}</span>
              : <span style={{ color:C.textMuted }}>—</span>;
  };
  const Bar = ({ label, val, color, invert }) => {
    const w = Math.max(0, Math.min(100, invert ? 100-(+val||0) : (+val||0)));
    const defaultBg = w>70?"#22c55e":w>40?"#f59e0b":"#ef4444";
    const bg = color || defaultBg;
    return <div style={{ marginBottom:10 }}><div style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3 }}><span style={{ color:C.textSecondary }}>{label}</span><span style={{ color:C.text,fontWeight:600 }}>{val??"—"}</span></div><div style={{ background:C.borderSoft,borderRadius:4,height:6 }}><div style={{ width:`${w}%`,background:bg,height:6,borderRadius:4,transition:"width 0.8s" }}/></div></div>;
  };
  const Sec = ({ title, ch }) => (
    <div style={{ background:C.surface,border:"1px solid "+C.borderSoft,borderRadius:10,padding:18,marginBottom:14 }}>
      <div style={{ color:C.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12 }}>{title}</div>
      {ch}
    </div>
  );
  const F = ({ l, v }) => (
    <div style={{ display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+C.borderSoft,fontSize:13 }}>
      <span style={{ color:C.textMuted,flexShrink:0,marginRight:8 }}>{l}</span>
      <span style={{ color:C.text,fontWeight:500,maxWidth:"62%",textAlign:"right" }}>{v??"—"}</span>
    </div>
  );
  const THead = ({ cols }) => <thead><tr>{cols.map(h=><th key={h} style={{ background:"linear-gradient(135deg,rgba(59,130,246,0.1),rgba(6,182,212,0.1))",color:C.info,padding:"6px 8px",textAlign:"left",fontSize:12,fontWeight:700,borderBottom:"2px solid "+C.border }}>{h}</th>)}</tr></thead>;
  const TRow  = ({ row }) => <tr>{row.map((c,i)=><td key={i} style={{ padding:"5px 8px",borderBottom:"1px solid "+C.borderSoft,fontSize:12,color:i===0?C.textSecondary:C.text }}>{c||"—"}</td>)}</tr>;
  const Table = ({ cols, rows }) => <table style={{ width:"100%",borderCollapse:"collapse" }}><THead cols={cols}/><tbody>{rows.map((r,i)=><TRow key={i} row={r}/>)}</tbody></table>;

  const TABS = ["summary","operations","financials","ratios","risk","legal","news","recommendation","json","patch"];

  return (
    <div style={{ background:C.bg,minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text }}>

      <div style={{ 
        borderBottom:"1px solid "+C.borderSoft,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,
        background:C.bg,
      }}>
        <div style={{ background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15 }}>⚡</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700,fontSize:14,color:C.text }}>Valyze Credit Intelligence v5</div>
          <div style={{ color:C.textMuted,fontSize:11 }}>Smart PDF Extraction · Hybrid OCR · Claude Sonnet 4</div>
        </div>
        <button 
          onClick={toggleDarkMode}
          style={{
            background:C.surface,
            border:"1px solid "+C.borderSoft,
            borderRadius:8,
            width:36,height:36,
            display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer",
            color:C.textSecondary,
            fontSize:16,
            transition:"all 0.2s"
          }}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        {!showKeyInput && !status.includes("loading") && !status.includes("done") && (
          <button onClick={()=>setShowKeyInput(true)} style={{ background:C.surface,border:"1px solid "+C.border,borderRadius:6,padding:"5px 10px",color:C.textSecondary,fontSize:11,cursor:"pointer" }}>
            🔑 Change Key
          </button>
        )}
      </div>

      {(showKeyInput || !apiKey) && status !== "loading" && status !== "done" && (
        <div style={{ background:`linear-gradient(135deg,${C.surface},${C.bg})`,borderBottom:"1px solid "+C.border,padding:"16px 20px" }}>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            <div style={{ flex:1,minWidth:200 }}>
              <div style={{ color:C.textSecondary,fontSize:12,marginBottom:6,fontWeight:600 }}>🔐 Anthropic API Key</div>
              <input 
                type="password" 
                value={apiKey} 
                onChange={e=>setApiKey(e.target.value)} 
                placeholder="sk-ant-api03-..."
                style={{ width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid "+C.border,background:C.bg,color:C.text,fontSize:13,fontFamily:"monospace",boxSizing:"border-box" }}
              />
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              <button 
                onClick={()=>{if(apiKey.startsWith("sk-ant-")){localStorage.setItem("valyze_api_key",apiKey);setShowKeyInput(false)}}} 
                disabled={!apiKey.startsWith("sk-ant-")}
                style={{ padding:"10px 20px",borderRadius:8,border:"none",background:apiKey.startsWith("sk-ant-")?"linear-gradient(135deg,#22c55e,#16a34a)":C.surface,color:apiKey.startsWith("sk-ant-")?"#fff":C.textMuted,fontWeight:700,fontSize:13,cursor:apiKey.startsWith("sk-ant-")?"pointer":"default" }}
              >
                ✓ Save Key
              </button>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{ color:C.textMuted,fontSize:11,textAlign:"center" }}>Get API Key →</a>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth:960,margin:"0 auto",padding:"20px 16px" }}>

        {status !== "done" && <>
          <div onDragOver={e=>e.preventDefault()} onDrop={onDrop} onClick={()=>fileRef.current.click()}
            style={{ border:"2px dashed "+C.border,borderRadius:12,padding:"36px 24px",textAlign:"center",cursor:"pointer",background:C.surface,marginBottom:12 }}>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{ display:"none" }} onChange={e=>addFiles(e.target.files)}/>
            <div style={{ fontSize:32,marginBottom:8 }}>📂</div>
            <div style={{ fontWeight:600,marginBottom:4,color:C.text }}>Drop company documents here</div>
            <div style={{ color:C.textSecondary,fontSize:13 }}>PDF · Word · Images · Excel · CSV · TXT — up to 5 files</div>
            <div style={{ color:C.textMuted,fontSize:12,marginTop:6 }}>Text pages → text · Scanned pages → vision</div>
          </div>
          {files.map((f,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",background:C.surface,border:"1px solid "+C.borderSoft,borderRadius:8,padding:"9px 14px",marginBottom:6 }}>
              <span style={{ fontSize:13,color:C.textSecondary }}>{fIcon(f)} {f.name} <span style={{ color:C.textMuted }}>({(f.size/1024).toFixed(0)} KB)</span></span>
              <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{ background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:16 }}>✕</button>
            </div>
          ))}
        </>}

        {status === "loading" && (
          <div style={{ background:C.surface,border:"1px solid "+C.borderSoft,borderRadius:12,padding:28,textAlign:"center",marginBottom:16 }}>
            <div style={{ fontSize:28,marginBottom:6 }}>⚙️</div>
            <div style={{ color:C.primary,fontSize:26,fontWeight:800,marginBottom:6,fontFamily:"monospace" }}>{fmtTime(elapsed)}</div>
            <div style={{ color:C.textSecondary,fontSize:13,marginBottom:16,minHeight:20 }}>{logMsg}</div>
            <div style={{ display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:16 }}>
              {STAGES.map((s,i)=>(
                <div key={i} style={{ padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,background:i<=stage?"linear-gradient(135deg,#3b82f6,#8b5cf6)":C.surface,color:i<=stage?"#fff":C.textMuted,transition:"all 0.4s" }}>
                  {i<stage?"✓":i===stage?"◐":"○"} {s}
                </div>
              ))}
            </div>
            <button onClick={cancel} style={{ padding:"7px 20px",borderRadius:8,border:"1px solid "+C.danger,background:"rgba(239,68,68,0.1)",color:C.danger,cursor:"pointer",fontSize:13,fontWeight:600 }}>✕ Cancel</button>
          </div>
        )}

        {status === "error" && (
          <div style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:14,marginBottom:16,color:C.danger,fontSize:13,whiteSpace:"pre-line" }}>⚠️ {error}</div>
        )}

        {status !== "done" && <>
          <button onClick={extract} disabled={!files.length||status==="loading"}
            style={{ width:"100%",padding:13,borderRadius:10,border:"none",background:!files.length||status==="loading"?C.surface:"linear-gradient(135deg,#3b82f6,#8b5cf6)",color:!files.length||status==="loading"?C.textMuted:"#fff",fontWeight:700,fontSize:15,cursor:!files.length||status==="loading"?"default":"pointer",marginBottom:10 }}>
            {status==="loading"?"Extracting...":"⚡ Run Credit Intelligence Extraction"}
          </button>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}>
            <div onClick={()=>setUseWebSearch(v=>!v)} style={{ width:36,height:20,borderRadius:10,background:useWebSearch?C.primary:C.surface,position:"relative",cursor:"pointer",flexShrink:0,transition:"background 0.2s",border:"1px solid "+C.borderSoft }}>
              <div style={{ position:"absolute",top:3,left:useWebSearch?18:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.2s" }}/>
            </div>
            <span style={{ fontSize:13,color:C.textSecondary,cursor:"pointer",userSelect:"none" }} onClick={()=>setUseWebSearch(v=>!v)}>
              🔍 Web search {useWebSearch?<span style={{ color:C.warning }}>ON</span>:<span style={{ color:C.success }}>OFF</span>}
            </span>
          </div>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:8,fontSize:12 }}>
            <span style={{ color:C.textMuted }}>OCR:</span>
            {["text","smart","vision"].map(m=>(
              <button key={m} onClick={()=>setExtractMode(m)} style={{ padding:"3px 8px",borderRadius:4,border:"none",background:extractMode===m?C.primary:C.surface,color:extractMode===m?"#fff":C.textSecondary,cursor:"pointer",textTransform:"capitalize",fontSize:11 }}>
                {m}
              </button>
            ))}
            <span style={{ color:C.textMuted,fontSize:10 }}>{extractMode==="text"?"(cheap)":extractMode==="vision"?"(max data)":"(balanced)"}</span>
          </div>
        </>}

        {status === "done" && result && (
          <div>
            <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginBottom:12,padding:4,background:C.surface,borderRadius:12,border:"1px solid "+C.borderSoft }}>
              {TABS.map(t=>(
                <button key={t} onClick={()=>setTab(t)} style={{ padding:"5px 11px",borderRadius:8,border:"none",background:tab===t?C.primary:"transparent",color:tab===t?"#fff":C.textSecondary,fontWeight:600,fontSize:12,cursor:"pointer",textTransform:"capitalize" }}>
                  {t==="json"?"Raw JSON":t==="patch"?"🔧 Patch":t}
                </button>
              ))}
            </div>

            <div style={{ display:"flex",gap:8,marginBottom:16,flexWrap:"wrap" }}>
              <button onClick={copyJSON} style={{ padding:"7px 12px",borderRadius:8,border:"1px solid "+C.border,background:C.surface,color:C.textSecondary,cursor:"pointer",fontSize:13 }}>{copied?"✓ Copied":"Copy JSON"}</button>
              <button onClick={downloadJSON} style={{ padding:"7px 12px",borderRadius:8,border:"none",background:C.success,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13 }}>⬇ Download JSON</button>
              <button onClick={()=>{setStatus("idle");setFiles([]);setResult(null);setLogMsg("");}} style={{ padding:"7px 12px",borderRadius:8,border:"1px solid "+C.border,background:C.surface,color:C.textSecondary,cursor:"pointer",fontSize:13 }}>New Report</button>
              <button 
onClick={() => {
                   if (result) {
                     setNavigating(true);
                     localStorage.setItem("valyze_pending_import", JSON.stringify(result));
                     const frontendUrl = import.meta.env.VITE_FRONTEND_URL || "http://localhost:1573";
                     window.location.href = frontendUrl;
                   }
                 }}
                disabled={navigating || !result}
                style={{
                  padding: "12px 24px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: navigating ? "wait" : "pointer",
                  boxShadow: "0 4px 15px rgba(99, 102, 241, 0.4), 0 0 30px rgba(139, 92, 246, 0.2)",
                  opacity: navigating ? 0.7 : 1,
                  transition: "all 0.2s ease"
                }}
              >
                {navigating ? "Opening..." : "Continue to Editor →"}
              </button>
            </div>

            {tab==="summary"&&<div>
              <Sec title="Company Identity" ch={<><F l="Legal Name" v={d.legal_name}/><F l="Trade Names" v={d.trade_names}/><F l="CR / Reg No." v={d.cr_number}/><F l="Unified No." v={d.unified_number}/><F l="Country / City" v={`${d.country||"—"} / ${d.city||"—"}`}/><F l="Industry" v={d.industry}/><F l="Type / Status" v={`${d.company_type||"—"} / ${d.company_status||"—"}`}/><F l="Incorporated" v={d.incorporation_date}/><F l="Capital" v={d.capital}/><F l="Employees" v={d.employee_count}/><F l="Website" v={d.website}/><F l="Email" v={d.email}/><F l="Phone" v={d.phone}/></>}/>
              <Sec title="Executive Summary" ch={<><div style={{ color:C.textSecondary,fontSize:13,lineHeight:1.7,marginBottom:10 }}>{d.executive_summary_text||"—"}</div><div style={{ color:C.textMuted,fontSize:12,fontStyle:"italic",lineHeight:1.6 }}>{d.company_history_text}</div></>}/>
              <Sec title="Key Ratios" ch={<><F l="Current Ratio" v={d.exec_current_ratio}/><F l="Equity Ratio" v={d.exec_equity_ratio}/><F l="EBIT Margin" v={d.exec_ebit_margin}/><F l="Debt/Equity" v={d.exec_debt_equity}/><F l="Net Margin" v={d.exec_profitability}/></>}/>
              <Sec title="Ownership" ch={<><F l="UBO" v={d.ultimate_beneficial_owner}/><F l="Parent" v={d.parent_company}/><F l="Subsidiaries" v={d.subsidiaries}/>{(d.shareholders||[]).map((s,i)=><F key={i} l={`Shareholder ${i+1}`} v={`${s.name} · ${s.percentage}% · ${s.nationality}`}/>)}</>}/>
              <Sec title="Management" ch={(d.management_team||[]).map((m,i)=><div key={i} style={{ borderBottom:"1px solid "+C.borderSoft,padding:"8px 0" }}><div style={{ color:C.info,fontWeight:600,fontSize:13 }}>{m.name} <span style={{ color:C.textMuted }}>· {m.title}</span></div><div style={{ color:C.textSecondary,fontSize:12,marginTop:3 }}>{m.bio}</div></div>)}/>
            </div>}

            {tab==="operations"&&<div>
              <Sec title="Activities" ch={<div style={{ color:C.textSecondary,fontSize:13,lineHeight:1.7 }}>{d.registration_activities_description||d.activities_full_description||"—"}</div>}/>
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
                <Sec key={title} title={`${title} Ratios`} ch={rows.map(([l,v,ind,lbl,interp])=><div key={l} style={{ borderBottom:"1px solid "+C.borderSoft,padding:"8px 0" }}><div style={{ display:"flex",justifyContent:"space-between",fontSize:13 }}><span style={{ color:C.textMuted }}>{l}</span><span style={{ color:C.text,fontWeight:600 }}>{v??"—"}</span></div><div style={{ fontSize:12,color:C.textSecondary,marginTop:2 }}>Industry avg: {ind??"—"} · {lbl??"—"}</div>{interp&&<div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>{interp}</div>}</div>)}/>
              ))}
            </div>}

            {tab==="risk"&&<div>
              <Sec title="Credit Rating" ch={<><div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}><div><div style={{ fontSize:28,fontWeight:800 }}>{d.credit_rating||"—"}</div><div style={{ color:C.textSecondary,fontSize:12 }}>Credit Rating</div></div><Badge v={d.risk_level} color={d.risk_color}/></div><Bar label="Health Score" val={d.health_score} color={d.viability_color}/><Bar label="Viability Score" val={d.viability_score} color={d.viability_color}/><Bar label="Payment Score" val={d.payment_score} color={d.payment_color}/><Bar label="Delinquency Risk" val={d.delinquency_score} color={d.delinquency_color} invert/><Bar label="Failure Risk" val={d.failure_score} color={d.failure_color} invert/><F l="PAYDEX" v={d.paydex_score}/><F l="Company Size" v={d.company_size}/><F l="Annual Revenue" v={d.annual_revenue}/></>}/>
              <Sec title="Payment Behavior" ch={<><F l="Avg Days Beyond Terms" v={d.avg_dbt!=null?`${d.avg_dbt} days`:null}/><F l="% On Time" v={d.pct_on_time!=null?`${d.pct_on_time}%`:null}/><F l="Prompt" v={d.prompt_pct!=null?`${d.prompt_pct}% · ${d.prompt_amount}`:null}/><F l="1–30 Days Slow" v={d.slow_30_pct!=null?`${d.slow_30_pct}% · ${d.slow_30_amount}`:null}/><F l="90+ Days Slow" v={d.slow_90plus_pct!=null?`${d.slow_90plus_pct}% · ${d.slow_90plus_amount}`:null}/></>}/>
              <Sec title="Alerts" ch={(d.alerts||[]).map((a,i)=><div key={i} style={{ background:a.alert_type==="danger"?"rgba(239,68,68,0.1)":a.alert_type==="warning"?"rgba(245,158,11,0.1)":a.alert_type==="success"?"rgba(16,185,129,0.1)":"rgba(59,130,246,0.1)",borderRadius:8,padding:"8px 12px",marginBottom:6,fontSize:13,border:"1px solid",borderColor:a.alert_type==="danger"?"rgba(239,68,68,0.2)":a.alert_type==="warning"?"rgba(245,158,11,0.2)":a.alert_type==="success"?"rgba(16,185,129,0.2)":"rgba(59,130,246,0.2)" }}>{a.alert_icon} {a.alert_message}</div>)}/>
            </div>}

            {tab==="legal"&&<div>
              <Sec title="Legal Summary" ch={[["Lawsuits",d.lawsuit_count,d.lawsuit_amount,d.lawsuit_status],["Liens",d.lien_count,d.lien_amount,d.lien_status],["Judgments",d.judgment_count,d.judgment_amount,d.judgment_status]].map(([t,c,a,s])=><div key={t} style={{ borderBottom:"1px solid "+C.borderSoft,padding:"8px 0" }}><div style={{ display:"flex",justifyContent:"space-between",fontSize:13 }}><span style={{ color:C.textMuted }}>{t}</span><span>Count: {c??"—"} · {a||"—"}</span></div><div style={{ fontSize:12,color:C.textSecondary }}>Status: {s||"—"}</div></div>)}/>
              <Sec title="Compliance" ch={<><F l="License" v={`${d.license_status||"—"} (exp: ${d.license_expiry||"—"})`}/><F l="Tax Status" v={d.tax_status}/></>}/>
              {(d.legal_details||[]).length>0&&<Sec title="Legal Details" ch={(d.legal_details).map((l,i)=><div key={i} style={{ background:C.surface,borderRadius:8,padding:12,marginBottom:8,fontSize:13,border:"1px solid "+C.borderSoft }}><strong style={{ color:C.info }}>{l.event_type} · {l.event_date}</strong><div style={{ color:C.textSecondary,marginTop:4 }}>{l.event_description}</div></div>)}/>}
            </div>}

            {tab==="news"&&<div>
              <Sec title="News & Events (2024+)" ch={!(d.news_events||[]).length?<div style={{ color:C.textMuted,fontSize:13 }}>No 2024+ news found.</div>:(d.news_events).map((n,i)=><div key={i} style={{ background:C.surface,borderRadius:8,padding:"10px 14px",marginBottom:8,fontSize:13,border:"1px solid "+C.borderSoft }}><div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}><span style={{ color:C.textMuted,fontSize:11 }}>{n.event_date}</span><span style={{ background:n.event_sentiment==="positive"?"rgba(16,185,129,0.1)":n.event_sentiment==="negative"?"rgba(239,68,68,0.1)":"rgba(59,130,246,0.1)",color:C.text,borderRadius:4,padding:"1px 8px",fontSize:11 }}>{n.event_sentiment_label}</span></div><strong style={{ color:C.info }}>{n.event_title}</strong><div style={{ color:C.textSecondary,marginTop:4 }}>{n.event_summary}</div></div>)}/>
            </div>}

            {tab==="recommendation"&&<div>
              <Sec title="Credit Decision" ch={<><div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}><div><div style={{ fontSize:26,fontWeight:800 }}>{d.final_credit_rating||"—"}</div><div style={{ color:C.textSecondary,fontSize:12 }}>Final Rating</div></div><Badge v={d.final_risk_level} color={d.final_risk_color}/></div><F l="Credit Limit (USD)" v={d.recommended_credit_limit}/><F l="Max Exposure (USD)" v={d.maximum_exposure}/><F l="Payment Terms" v={d.recommended_payment_terms}/><F l="Review Frequency" v={d.review_frequency}/><F l="Collateral" v={d.collateral_requirements}/>{d.credit_opinion_text&&<div style={{ background:C.surface,borderRadius:8,padding:14,marginTop:12,fontSize:13,color:C.textSecondary,lineHeight:1.7,border:"1px solid "+C.borderSoft }}><strong style={{ color:C.info,display:"block",marginBottom:6 }}>📋 Credit Opinion</strong>{d.credit_opinion_text}</div>}</>}/>
              {(d.risk_mitigations||[]).length>0&&<Sec title="Risk Mitigations" ch={(d.risk_mitigations).map((m,i)=><div key={i} style={{ borderBottom:"1px solid "+C.borderSoft,padding:"8px 0" }}><div style={{ color:C.info,fontSize:13,fontWeight:600 }}>{m.strategy}</div><div style={{ color:C.textSecondary,fontSize:12 }}>{m.expected_outcome}</div></div>)}/>}
              <Sec title="Monitoring Triggers" ch={(d.monitoring_triggers||[]).map((t,i)=><div key={i} style={{ borderBottom:"1px solid "+C.borderSoft,padding:"8px 0" }}><div style={{ color:C.warning,fontSize:13,fontWeight:600 }}>⚠️ {t.trigger_event}</div><div style={{ color:C.textSecondary,fontSize:12 }}>{t.trigger_action}</div></div>)}/>
            </div>}

            {tab==="json"&&<div style={{ background:C.surface,border:"1px solid "+C.borderSoft,borderRadius:10,padding:18 }}><pre style={{ color:C.success,fontSize:11,overflowX:"auto",margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word" }}>{JSON.stringify(result,null,2)}</pre></div>}

            {tab==="patch"&&(
              <div>
                <div style={{ background:C.surface,border:"1px solid rgba(59,130,246,0.3)",borderRadius:10,padding:18,marginBottom:14 }}>
                  <div style={{ color:C.info,fontSize:12,fontWeight:700,marginBottom:10 }}>🔧 PASTE YOUR JSON</div>
                  <textarea value={patchJSON} onChange={e=>setPatchJSON(e.target.value)} placeholder="Paste your credit report JSON here..."
                    style={{ width:"100%",minHeight:180,background:C.bg,border:"1px solid "+C.border,borderRadius:8,color:C.success,fontSize:11,padding:12,fontFamily:"monospace",resize:"vertical",boxSizing:"border-box" }}/>
                  {result&&<button onClick={()=>setPatchJSON(JSON.stringify(result,null,2))} style={{ marginTop:8,padding:"5px 12px",borderRadius:6,border:"none",background:"rgba(59,130,246,0.2)",color:C.info,cursor:"pointer",fontSize:12 }}>↑ Load current report JSON</button>}
                </div>
                <div style={{ background:C.surface,border:"1px solid "+C.borderSoft,borderRadius:10,padding:18,marginBottom:14 }}>
                  <div style={{ color:C.warning,fontSize:12,fontWeight:700,marginBottom:10 }}>📋 PATCH INSTRUCTIONS</div>
                  <textarea value={patchInstructions} onChange={e=>setPatchInstructions(e.target.value)}
                    placeholder={"## WRONG VALUES\n1. \"field\": \"old\" → \"new\"\n\n## EMPTY FIELDS\n2. \"field\": \"\" → \"value\"\n\n## ADD NEW FIELDS\n3. Add after \"field\":\n   \"new_field\": \"value\""}
                    style={{ width:"100%",minHeight:240,background:C.bg,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:12,padding:12,fontFamily:"monospace",resize:"vertical",boxSizing:"border-box" }}/>
                </div>
                {patchStatus==="error"&&<div style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:12,marginBottom:12,color:C.danger,fontSize:13 }}>⚠️ {patchError}</div>}
                {patchStatus==="done"&&<div style={{ background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:8,padding:12,marginBottom:12,color:C.success,fontSize:13 }}>✓ JSON patched! Switched to Raw JSON tab — download to save.</div>}
                {patchStatus==="loading"&&<div style={{ background:C.surface,border:"1px solid "+C.borderSoft,borderRadius:8,padding:10,marginBottom:12,color:C.textSecondary,fontSize:13,textAlign:"center" }}>⚙️ Applying patches with Haiku…</div>}
                <button onClick={runPatch} disabled={!patchJSON.trim()||!patchInstructions.trim()||patchStatus==="loading"}
                  style={{ width:"100%",padding:13,borderRadius:10,border:"none",background:!patchJSON.trim()||!patchInstructions.trim()||patchStatus==="loading"?C.surface:"linear-gradient(135deg,"+C.warning+",#d97706)",color:!patchJSON.trim()||!patchInstructions.trim()||patchStatus==="loading"?C.textMuted:"#fff",fontWeight:700,fontSize:15,cursor:patchStatus==="loading"?"default":"pointer" }}>
                  {patchStatus==="loading"?"Applying patches...":"🔧 Apply Patches"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
