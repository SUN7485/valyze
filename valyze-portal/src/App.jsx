import { useEffect, useState } from "react";
import LoginScreen from "./components/LoginScreen.jsx";
import OrderForm from "./components/OrderForm.jsx";
import SuccessScreen from "./components/SuccessScreen.jsx";

export default function App() {
  const [state, setState] = useState("login");
  const [portalToken, setPortalToken] = useState("");
  const [clientName, setClientName] = useState("Client");
  const [portalError, setPortalError] = useState("");
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";

    if (!token) {
      setPortalError("Invalid portal link. Contact Valyze.");
      return;
    }

    setPortalToken(token);
    setPortalError("");
  }, []);

  function handleAuthenticated({ portalToken: nextToken, clientName: name }) {
    setPortalToken(nextToken);
    setClientName(name);
    setLastResult(null);
    setState("form");
  }

  function handleSubmitSuccess(result) {
    setLastResult(result);
    setState("success");
  }

  function resetForm() {
    setLastResult(null);
    setState("form");
  }

  return (
    <>
      {portalError && state === "login" && !portalToken && (
        <LoginScreen token="" onAuthenticated={handleAuthenticated} />
      )}

      {!portalError && state === "login" && (
        <LoginScreen token={portalToken} onAuthenticated={handleAuthenticated} />
      )}

      {state === "form" && (
        <OrderForm
          clientName={clientName}
          portalToken={portalToken}
          onSubmitSuccess={handleSubmitSuccess}
          onReset={resetForm}
        />
      )}

      {state === "success" && (
        <SuccessScreen result={lastResult} onReset={resetForm} />
      )}
    </>
  );
}
