import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import * as mammoth from 'mammoth'
import { companiesAPI, reportAPI } from '../api/client'
import { MODEL_EXTRACT, MODEL_PATCH, TOOL_WEB_SEARCH, MAX_TOKENS_EXTRACT, EFFORT_EXTRACT } from '../config/ai'
import { runToCompletion, parseJsonResult } from '../lib/claudeTurns'
import { ACCEPT, fIcon, extractPdf } from '../lib/extractor/files'
import { SYSTEM_PROMPT, referenceSubset, priorReportPromptBlock } from '../lib/extractor/prompt'
import { isSessionError, SESSION_EXPIRED_MSG, sessionIsExpired, readProxyError, buildApiHeaders } from '../lib/extractor/proxy'
import { Badge, Bar, Sec, F, Table } from '../components/extractor/PreviewParts'


const STAGES = ["Processing files", "Claude thinking", "Building JSON", "Done"];

export default function ExtractorPage() {
  const navigate = useNavigate()
  const { reportId } = useParams()
  const proxyUrl = `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')}/api/proxy`
  const hasReportId = Boolean(reportId)

  /* The order details the backend already seeded onto this report when the
     analyst clicked Start (see start_company_work in api/orders.py). Shown in
     the header so the analyst can see which company they are working on
     before any extraction has run. */
  const [orderContext, setOrderContext] = useState(null)

  /* A prior Valyze report on the same company, pulled BEFORE extraction and fed
     to the model as reference data so it can record history (former name,
     former address, former owners) and flag conflicts. Reference only — it must
     never populate a current field. */
  const [priorRef, setPriorRef]         = useState({ status: "idle", data: null, meta: null });
  const [usePriorRef, setUsePriorRef]   = useState(true);

  // When the lookup inputs change, drop any previous prior-report result while the
  // new lookup (effect below) runs. Adjusted during render rather than in the effect.
  const [priorRefInputs, setPriorRefInputs] = useState({ orderContext, reportId })
  if (priorRefInputs.orderContext !== orderContext || priorRefInputs.reportId !== reportId) {
    setPriorRefInputs({ orderContext, reportId })
    if (orderContext?.company_name || orderContext?.cr_number) {
      setPriorRef({ status: "loading", data: null, meta: null })
    }
  }

  useEffect(() => {
    if (!reportId) return
    let cancelled = false
    const val = (f) => {
      const d = f
      const v = (d && typeof d === 'object') ? d.value : d
      return (v === null || v === undefined) ? '' : String(v).trim()
    }
    reportAPI.getReport(reportId)
      .then((res) => {
        if (cancelled) return
        const fields = res?.data?.fields || {}
        setOrderContext({
          company_name: val(fields.company_name),
          cr_number: val(fields.cr_number),
          country: val(fields.country),
          client_name: val(fields.client_name),
        })
      })
      .catch(() => { /* header context is a nicety — never block extraction on it */ })
    return () => { cancelled = true }
  }, [reportId])

  /* Look for a prior report on this company using the seeded order details,
     before any extraction has run. Uses the same normalized name/CR matcher
     the duplicate check already relies on (services/company_intel.py). */
  useEffect(() => {
    const cn = orderContext?.company_name
    const cr = orderContext?.cr_number
    if (!cn && !cr) return
    let cancelled = false
    companiesAPI.lookup({ company_name: cn, cr_number: cr, country: orderContext?.country })
      .then((res) => {
        if (cancelled) return
        const priors = (res.data?.reports || []).filter((r) => String(r.id) !== String(reportId))
        if (!priors.length) { setPriorRef({ status: "none", data: null, meta: null }); return }
        const newest = priors[0]  // company_intel sorts by updated_at desc
        return reportAPI.getReport(newest.id).then((full) => {
          if (cancelled) return
          setPriorRef({ status: "done", data: referenceSubset(full?.data), meta: newest })
        })
      })
      .catch(() => { if (!cancelled) setPriorRef({ status: "error", data: null, meta: null }) })
    return () => { cancelled = true }
  }, [orderContext, reportId])

  const [files, setFiles]               = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [portalFileWarning, setPortalFileWarning] = useState("");
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
  const [dupCheck, setDupCheck]         = useState({ status: "idle", dossier: null });

  useEffect(() => { if (apiKey) localStorage.setItem("valyze_api_key", apiKey); }, [apiKey]);

  // After extraction, check whether Valyze already holds this company — surfaces
  // prior reports so the analyst doesn't create a duplicate and can reuse work.
  // The idle/loading reset happens during render when the inputs change; the
  // effect only runs the lookup.
  const [dupCheckInputs, setDupCheckInputs] = useState({ status, result, reportId });
  if (dupCheckInputs.status !== status || dupCheckInputs.result !== result || dupCheckInputs.reportId !== reportId) {
    setDupCheckInputs({ status, result, reportId });
    const cn = result?.company_name || result?.legal_name;
    const cr = result?.cr_number;
    setDupCheck({ status: status !== "done" || (!cn && !cr) ? "idle" : "loading", dossier: null });
  }

  useEffect(() => {
    const cn = result?.company_name || result?.legal_name;
    const cr = result?.cr_number;
    if (status !== "done" || (!cn && !cr)) return;
    let cancelled = false;
    companiesAPI.lookup({ company_name: cn, cr_number: cr, country: result?.country })
      .then((res) => {
        if (cancelled) return;
        const dossier = res.data || {};
        // The report we're working on now shouldn't count as a prior duplicate.
        const priorReports = (dossier.reports || []).filter((r) => String(r.id) !== String(reportId));
        setDupCheck({ status: "done", dossier: { ...dossier, reports: priorReports } });
      })
      .catch(() => { if (!cancelled) setDupCheck({ status: "error", dossier: null }); });
    return () => { cancelled = true; };
  }, [status, result, reportId]);

  useEffect(() => {
    if (!reportId) return
    const loadPortalFiles = async () => {
      setFilesLoading(true)
      setPortalFileWarning("")
      try {
        const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
        const token = localStorage.getItem('valyze_token') || ''
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`${baseUrl}/api/upload/portal-files/${reportId}`, { headers: authHeaders })
        if (!res.ok) {
          setPortalFileWarning(`Could not check for portal files (server said ${res.status}). Attach documents manually.`)
          return
        }
        const data = await res.json()
        if (!data.files?.length) return
        const fetched = []
        const failed = []
        for (const f of data.files) {
          if (!f.download_path) { failed.push(f.filename || 'unnamed file'); continue }
          try {
            const fileRes = await fetch(`${baseUrl}${f.download_path}`, { headers: authHeaders })
            if (!fileRes.ok) { failed.push(f.filename || 'unnamed file'); continue }
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
          } catch { failed.push(f.filename || 'unnamed file') }
        }
        if (fetched.length) setFiles(fetched)
        // Never fail silently: extracting against a partial document set produces a
        // confidently wrong report, which is worse than not extracting at all.
        if (failed.length) {
          setPortalFileWarning(
            `${failed.length} of ${data.files.length} portal file(s) failed to load: ${failed.join(', ')}. ` +
            `Attach them manually before extracting — the report would otherwise be built from incomplete documents.`
          )
        }
      } catch (e) {
        setPortalFileWarning(`Could not load portal files (${e.message || e}). Attach documents manually.`)
      } finally {
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

  const toB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });

  const stopClock = () => { clearInterval(clockRef.current); clockRef.current = null; };

  const cancel = () => {
    abortRef.current?.abort();
    stopClock();
    setStatus("idle"); setStage(0); setElapsed(0); setLogMsg(""); setError("");
  };

  // Upfront size check. The hard guard at extract time only fires after every file
  // has been read and rasterised, so an oversized batch costs a long wait before it
  // fails. Warn from the raw sizes instead — approximate (PDFs are downscaled and
  // the body is gzipped, text shrinks a lot, scans much less), so this flags risk
  // rather than predicting failure.
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const SERVER_LIMIT_BYTES = 4.5 * 1024 * 1024;
  const sizeRisk = totalBytes > SERVER_LIMIT_BYTES
    ? "over"
    : totalBytes > 0.75 * SERVER_LIMIT_BYTES ? "near" : null;

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

  // Each Messages call is capped at 300s by the proxy; allow a little over that client-side.
  const PER_CALL_TIMEOUT_MS = 360000;
  // A whole run: the first call plus up to four continuations.
  const RUN_TIMEOUT_MS = 15 * 60 * 1000;

  const extract = async () => {
    if (!files.length) return;
    if (!apiKey || !apiKey.startsWith("sk-ant-")) {
      setError("Please enter your Anthropic API key (starts with sk-ant-)\n\nGet it from: https://console.anthropic.com/settings/keys");
      setStatus("error");
      return;
    }
    if (proxyUrl && sessionIsExpired()) {
      setError(SESSION_EXPIRED_MSG);
      setStatus("error");
      return;
    }
    setStatus("loading"); setStage(0); setResult(null); setError(""); setElapsed(0); setLogMsg("Reading files…");
    clockRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    abortRef.current = new AbortController();
    // Whole-run ceiling. Each call has its own limit (PER_CALL_TIMEOUT_MS); this only
    // stops a run that keeps needing continuations from going on indefinitely.
    const hardTimeout = setTimeout(() => abortRef.current?.abort(), RUN_TIMEOUT_MS);

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

      const apiBody = {
        model: MODEL_EXTRACT,
        max_tokens: MAX_TOKENS_EXTRACT,
        output_config: { effort: EFFORT_EXTRACT },
        system: SYSTEM_PROMPT + (
          usePriorRef && priorRef.status === "done"
            ? priorReportPromptBlock(priorRef.data, priorRef.meta)
            : ""
        ),
        messages: [{ role: "user", content: blocks }],
      };
      if (useWebSearch) apiBody.tools = [{ type: TOOL_WEB_SEARCH, name: "web_search" }];

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

      // One Messages call, through the proxy (gzipped) or straight to Anthropic.
      // A run may make several of these (continuations, paused searches), so the
      // time limit is per call — the proxy already caps each one at 300s.
      const send = async (payload) => {
        const useUrl = proxyUrl || "https://api.anthropic.com/v1/messages";
        const isDirect = !proxyUrl;
        const headers = buildApiHeaders(apiKey, isDirect);
        const fetchBody = isDirect ? JSON.stringify(payload) : await compressBody(payload);
        const callTimer = setTimeout(() => abortRef.current?.abort(), PER_CALL_TIMEOUT_MS);
        try {
          const res = await fetch(useUrl, { method: "POST", headers, signal: abortRef.current.signal, body: fetchBody });
          if (!res.ok) throw new Error(await readProxyError(res));
          const data = await res.json();
          // The proxy has been seen wrapping the message in a one-element array.
          return Array.isArray(data) ? data[0] : data;
        } finally {
          clearTimeout(callTimer);
        }
      };

      // Cut-off answers, paused web searches and refusals are all handled — and
      // tested — in lib/claudeTurns.js.
      const run = await runToCompletion({ send, request: apiBody, onProgress: setLogMsg });
      if (run.continuations || run.pauses) {
        console.info("[extractor] run needed extra turns", {
          continuations: run.continuations, pauses: run.pauses, usage: run.usage,
        });
      }

      setStage(2); setLogMsg("Parsing JSON…");
      setResult(parseJsonResult(run));
      setStage(3); setLogMsg("Done!"); setStatus("done");

      } catch (e) {
      let msg;
      if (e.name === "AbortError") {
        msg = "The extraction timed out.\n\n• Make sure Web Search is OFF\n• Try splitting large PDFs\n• Try again";
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
      } else if (isSessionError(e.message)) {
        // The proxy is auth-gated, so a dead Valyze session 401s exactly like a bad
        // Anthropic key would. Keep them distinct — they need opposite fixes.
        msg = SESSION_EXPIRED_MSG;
      } else if (e.message?.includes("Missing or invalid Anthropic API key")) {
        msg = "The server did not receive a valid Anthropic API key.\n\n• Click \"Change Key\" and paste your key again\n• It must start with sk-ant-";
      } else if (e.message?.includes("SERVER_KEY_REJECTED")) {
        // The backend has its own ANTHROPIC_API_KEY set, and that key is what
        // Anthropic refused — changing the key in this UI cannot fix it.
        msg = "Anthropic rejected the API key configured on the server.\n\n" +
              e.message.replace("SERVER_KEY_REJECTED ", "").replace(/^\[\d+\]\s*/, "") + "\n\n" +
              "Your own key is not the problem — the backend's ANTHROPIC_API_KEY env var needs fixing or removing.";
      } else if (e.message?.includes("[401]") || e.message?.includes("[403]")) {
        // Anthropic's own rejection — quote its wording, never invent a cause.
        msg = "Anthropic rejected your API key.\n\n" +
              e.message.replace(/^\[\d+\]\s*/, "") + "\n\n" +
              "• Verify the key at console.anthropic.com\n• Check the key's credit balance and rate limits";
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
    if (proxyUrl && sessionIsExpired()) {
      setPatchError(SESSION_EXPIRED_MSG);
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
         model: MODEL_PATCH,
         max_tokens: 16000,
         system: "You are a JSON patch engine. Apply ONLY the listed changes. DO NOT rename fields, reorder, or add fields unless explicitly told. Return ONLY the complete updated JSON. Start with { end with }. No markdown.",
         messages: [{ role: "user", content: `Here is the full JSON:\n${JSON.stringify(parsed, null, 2)}\n\n## CHANGES TO APPLY:\n${patchInstructions}\n\nReturn only the complete patched JSON.` }]
       };
       const bodyStr = JSON.stringify(patchPayload);
       const headers = buildApiHeaders(apiKey, patchIsDirect);
       const fetchBody = patchIsDirect ? bodyStr : await compressBody(patchPayload);
       const res = await fetch(patchUseUrl, {
         method: "POST",
         headers,
         body: fetchBody,
       });
      if (!res.ok) throw new Error(await readProxyError(res));
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
    } catch (e) {
      setPatchError(isSessionError(e.message) ? SESSION_EXPIRED_MSG : e.message);
      setPatchStatus("error");
    }
  };

  const saveResultForEditor = useCallback(async () => {
    if (!result) return;
    setNavigating(true);
    setError("");
    try {
      if (hasReportId) {
        // Save to backend immediately before navigating
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
              {orderContext?.company_name ? (
                <>
                  <div className="text-base md:text-lg font-black text-[var(--color-text)] truncate">{orderContext.company_name}</div>
                  <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">
                    {[orderContext.cr_number, orderContext.country, orderContext.client_name].filter(Boolean).join(' · ')
                      || 'Smart PDF extraction · Hybrid OCR · Claude Sonnet 4'}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-base md:text-lg font-black text-[var(--color-text)] truncate">Valyze AI Document Extractor</div>
                  <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">Smart PDF extraction · Hybrid OCR · Claude Sonnet 4</div>
                </>
              )}
              {hasReportId && <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono truncate">Report: {reportId}</div>}
            </div>
          </div>
          {!showKeyInput && !status.includes("loading") && !status.includes("done") && (
            <button onClick={()=>setShowKeyInput(true)} className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] hover:text-primary hover:border-primary/50 transition-all text-xs font-bold">
              🔑 Change Key
            </button>
          )}
        </div>

      {priorRef.status === "done" && status !== "done" && (
        <div className="border-b border-[var(--color-border)] p-4 md:p-5 bg-amber-50/60 dark:bg-amber-400/5">
          <div className="flex items-start gap-3">
            <div className="text-lg leading-none mt-0.5">🗂️</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[var(--color-text)]">
                Prior report found — {priorRef.data?.report_date || priorRef.meta?.updated_at?.slice(0, 10) || 'date unknown'}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                Its name, address, registration details and owners will be sent as <strong>reference data</strong>.
                The attached documents always win — the prior report is only used to record history
                (former name / address / owners) and to flag conflicts into the order comment.
              </div>
              <label className="mt-2.5 flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={usePriorRef}
                  onChange={(e) => setUsePriorRef(e.target.checked)}
                  className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                />
                <span className="text-xs font-semibold text-[var(--color-text)]">Use as reference data</span>
              </label>
            </div>
          </div>
        </div>
      )}

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
          {portalFileWarning && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-2xl p-4 mb-3 text-amber-800 dark:text-amber-200 text-sm">
              ⚠️ {portalFileWarning}
            </div>
          )}
          {files.map((f,i)=>(
            <div key={i} className="flex items-center justify-between gap-4 bg-white/70 dark:bg-white/5 border border-[var(--color-border)] rounded-2xl px-4 py-3 mb-2">
              <span className="text-sm text-[var(--color-text-secondary)] truncate">{fIcon(f)} {f.name} <span className="text-[var(--color-text-muted)]">({(f.size/1024).toFixed(0)} KB)</span></span>
              <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} className="text-xl text-rose-500 hover:text-rose-600">✕</button>
            </div>
          ))}
          {sizeRisk && (
            <div className={`rounded-2xl p-4 mb-2 text-sm border ${
              sizeRisk === "over"
                ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300"
                : "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-200"
            }`}>
              {sizeRisk === "over" ? "⛔" : "⚠️"} {files.length} file{files.length === 1 ? "" : "s"}, {(totalBytes/1024/1024).toFixed(1)} MB total
              {sizeRisk === "over"
                ? " — over the server's 4.5 MB limit. Extraction will likely fail. Remove some files and run them as a second extraction."
                : " — close to the server's 4.5 MB limit. Scanned PDFs may push it over; consider splitting into two runs."}
            </div>
          )}
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

            {dupCheck.status === "done" && dupCheck.dossier?.reports?.length > 0 && (
              <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none">⚠</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-amber-700 dark:text-amber-300">
                      We already have {dupCheck.dossier.reports.length} report{dupCheck.dossier.reports.length > 1 ? "s" : ""} on {dupCheck.dossier.canonical_name || "this company"}
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                      Reuse existing work instead of creating a duplicate — open a prior report:
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {dupCheck.dossier.reports.slice(0, 6).map((r) => (
                        <Link key={r.id} to={`/editor/${r.id}`}
                          className="px-3 py-1.5 rounded-lg bg-white/70 dark:bg-white/10 border border-amber-500/30 text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-white dark:hover:bg-white/20 transition-all">
                          {r.company_name || "Report"} · {r.status || "—"}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {dupCheck.status === "done" && dupCheck.dossier?.reports?.length === 0 && (dupCheck.dossier?.matched
              ? (dupCheck.dossier?.order_count > 0 && (
                  <div className="mb-5 rounded-2xl border border-[var(--color-border)] bg-white/60 dark:bg-white/5 p-3 text-xs font-semibold text-[var(--color-text-secondary)]">
                    On file: {dupCheck.dossier.order_count} order{dupCheck.dossier.order_count > 1 ? "s" : ""} for {dupCheck.dossier.canonical_name || "this company"} — no prior report yet.
                  </div>
                ))
              : (
                  <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    ✓ New to Valyze — this is the first report on {result?.company_name || result?.legal_name || "this company"}.
                  </div>
                ))}

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