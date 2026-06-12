import { useState } from "react";
import { auth } from "../api.js";

export default function LoginScreen({ token, onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!password.trim()) {
      setError("Invalid credentials. Please try again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await auth(token, password);
      const client = result.client || {};
      onAuthenticated({
        portalToken: result.portal_token,
        clientName: client.client_name || "Client",
      });
    } catch {
      setError("Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card error-card">
          <div className="logo">VALYZE</div>
          <p className="error-message">Invalid portal link. Contact Valyze.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="logo">VALYZE</div>
        <h1>Client Order Portal</h1>
        <p className="login-subtitle">Enter the temporary password from your Valyze portal link.</p>

        {error && <div className="form-error">{error}</div>}

        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          autoComplete="current-password"
          placeholder="Enter password"
        />

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
