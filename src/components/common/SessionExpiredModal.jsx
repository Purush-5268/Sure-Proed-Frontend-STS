import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./SessionExpiredModal.module.css";
import { FaExclamationTriangle } from "react-icons/fa";
import {
  extendSession,
  getSessionRemainingMs,
} from "../../utils/tokenStorage";

function SessionExpiredModal() {
  const [mode, setMode] = useState(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const handleSessionExpired = () => {
      setMode("expired");
      setRemainingMs(0);
    };

    const handleSessionExpiring = (event) => {
      setRemainingMs(event.detail?.remainingMs || getSessionRemainingMs());
      setMode("warning");
    };

    const handleSessionExtended = () => {
      setMode((currentMode) => currentMode === "warning" ? null : currentMode);
    };

    window.addEventListener("sure_session_expired", handleSessionExpired);
    window.addEventListener("sure_session_expiring", handleSessionExpiring);
    window.addEventListener("sure_session_extended", handleSessionExtended);
    return () => {
      window.removeEventListener("sure_session_expired", handleSessionExpired);
      window.removeEventListener("sure_session_expiring", handleSessionExpiring);
      window.removeEventListener("sure_session_extended", handleSessionExtended);
    };
  }, []);

  useEffect(() => {
    if (mode !== "warning") return undefined;
    const countdown = window.setInterval(() => {
      setRemainingMs(getSessionRemainingMs());
    }, 1000);
    return () => window.clearInterval(countdown);
  }, [mode]);

  const handleContinue = () => {
    extendSession();
    setMode(null);
    window.dispatchEvent(new CustomEvent("sure_session_started"));
  };

  const handleLogin = () => {
    setMode(null);
    navigate("/login", { replace: true });
  };

  if (!mode) return null;

  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const isWarning = mode === "warning";

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.iconWrapper}>
          <FaExclamationTriangle className={styles.icon} />
        </div>
        <h3>{isWarning ? "Session Expiring Soon" : "Session Expired"}</h3>
        <p>
          {isWarning
            ? `You will be signed out in about ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"} because there has been no activity.`
            : "Your session expired after 60 minutes of inactivity. Please sign in again to continue."}
        </p>
        <button
          onClick={isWarning ? handleContinue : handleLogin}
          className={styles.loginBtn}
        >
          {isWarning ? "Stay Signed In" : "Sign In"}
        </button>
      </div>
    </div>
  );
}

export default SessionExpiredModal;
