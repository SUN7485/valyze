// Talking to Anthropic through /api/proxy: headers, session expiry, and error decoding.
import { ANTHROPIC_VERSION } from '../../config/ai.js'

// /api/proxy is auth-gated (Depends(get_current_user)), so every proxied call must
// carry the Valyze JWT as well as the Anthropic key — without it the proxy 401s and
// the error surfaces as a misleading "API key rejected".
//
// The proxy can answer 401 for FIVE different reasons: three from the auth
// dependency (below), a missing/malformed x-api-key, and Anthropic's own
// rejection. They need opposite fixes, so the status code alone must never be
// mapped to a cause — always branch on the server's detail first.
export const SESSION_ERROR_DETAILS = ["Not authenticated", "Token expired", "Invalid token"];
export const isSessionError = (message = "") =>
  SESSION_ERROR_DETAILS.some((detail) => message.includes(detail));
export const SESSION_EXPIRED_MSG =
  "Your Valyze session has expired.\n\n" +
  "• Sign in again, then re-run the extraction\n" +
  "• Sessions last 24 hours";

// Login JWTs last 24h. Reading `exp` locally (no network call) lets us stop before
// minutes of file processing are spent on a request the proxy will reject.
export const sessionIsExpired = () => {
  const token = localStorage.getItem("valyze_token") || "";
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload?.exp) return false; // no expiry claim — let the server decide
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true; // unparseable token — the server would reject it too
  }
};

// Read the real cause out of a failed proxy/Anthropic response. Two error shapes
// arrive here: FastAPI's {detail} and Anthropic's {error:{message}}.
export const readProxyError = async (res) => {
  let errMsg;
  let prefix = "";
  try {
    const body = await res.json();
    errMsg = body?.error?.message || body?.detail || JSON.stringify(body);
    // The proxy tags which key Anthropic refused (see api/proxy.py).
    if (body?.valyze_key_source === "server") prefix = "SERVER_KEY_REJECTED ";
  } catch {
    errMsg = `HTTP ${res.status}`;
  }
  return `${prefix}[${res.status}] ${errMsg}`;
};

export const buildApiHeaders = (apiKey, isDirect) => {
  if (isDirect) {
    return {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }
  const token = localStorage.getItem("valyze_token") || "";
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "Content-Encoding": "gzip",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};
