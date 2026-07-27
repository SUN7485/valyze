import { useCallback, useEffect, useState } from "react";
import LoginScreen from "./components/LoginScreen.jsx";
import OrderForm from "./components/OrderForm.jsx";
import SuccessScreen from "./components/SuccessScreen.jsx";
import Dashboard from "./components/Dashboard.jsx";
import OrderDetail from "./components/OrderDetail.jsx";

// Tab-scoped, so a refresh doesn't force a fresh sign-in on every page load but
// the session still dies with the tab. Keyed by the link token: opening another
// client's link in the same tab must never resume the previous client's session.
const SESSION_KEY_PREFIX = "valyze_portal_session:";

export default function App() {
  const [state, setState] = useState("login");
  // The link token comes from the URL and is what /portal/auth checks; the
  // portal token is the short-lived JWT it returns. Keeping them apart matters —
  // every authenticated call must send the JWT, never the link token.
  const [linkToken, setLinkToken] = useState("");
  const [portalToken, setPortalToken] = useState("");
  const [clientName, setClientName] = useState("Client");
  const [portalError, setPortalError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";

    if (!token) {
      setPortalError("Invalid portal link. Contact Valyze.");
      return;
    }

    setLinkToken(token);
    setPortalError("");

    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY_PREFIX + token) || "null");
      if (saved?.portalToken) {
        setPortalToken(saved.portalToken);
        setClientName(saved.clientName || "Client");
        setState("dashboard");
      }
    } catch {
      // Unreadable or blocked storage just means a normal sign-in.
    }
  }, []);

  function handleAuthenticated({ portalToken: nextToken, clientName: name }) {
    setPortalToken(nextToken);
    setClientName(name);
    setLastResult(null);
    setNotice("");
    try {
      sessionStorage.setItem(
        SESSION_KEY_PREFIX + linkToken,
        JSON.stringify({ portalToken: nextToken, clientName: name })
      );
    } catch {
      // Storage denied — the session simply won't survive a refresh.
    }
    setState("dashboard");
  }

  // The portal JWT lasts 4 hours; when it lapses every call 401s, so bounce
  // back to sign-in with an honest reason instead of an unexplained error.
  const handleSessionExpired = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY_PREFIX + linkToken);
    } catch {
      // Nothing to clean up.
    }
    setPortalToken("");
    setActiveOrder(null);
    setLastResult(null);
    setNotice("Your session expired. Please sign in again.");
    setState("login");
  }, [linkToken]);

  function handleSubmitSuccess(result) {
    setLastResult(result);
    setState("success");
  }

  function openOrder(order) {
    setActiveOrder(order);
    setState("detail");
  }

  function goToDashboard() {
    setActiveOrder(null);
    setLastResult(null);
    setState("dashboard");
  }

  return (
    <>
      {portalError && !linkToken && <LoginScreen token="" onAuthenticated={handleAuthenticated} />}

      {!portalError && state === "login" && (
        <LoginScreen token={linkToken} notice={notice} onAuthenticated={handleAuthenticated} />
      )}

      {state === "dashboard" && (
        <Dashboard
          clientName={clientName}
          portalToken={portalToken}
          onNewOrder={() => setState("form")}
          onOpenOrder={openOrder}
          onSessionExpired={handleSessionExpired}
        />
      )}

      {state === "detail" && (
        <OrderDetail
          order={activeOrder}
          portalToken={portalToken}
          onBack={goToDashboard}
          onSessionExpired={handleSessionExpired}
        />
      )}

      {state === "form" && (
        <OrderForm
          clientName={clientName}
          portalToken={portalToken}
          onSubmitSuccess={handleSubmitSuccess}
          onBack={goToDashboard}
        />
      )}

      {state === "success" && (
        <SuccessScreen
          result={lastResult}
          portalToken={portalToken}
          onReset={() => setState("form")}
          onViewOrders={goToDashboard}
        />
      )}
    </>
  );
}
