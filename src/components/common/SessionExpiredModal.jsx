import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./SessionExpiredModal.module.css";
import { FaExclamationTriangle } from "react-icons/fa";

function SessionExpiredModal() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleSessionExpired = () => {
      setIsOpen(true);
    };

    window.addEventListener("sure_session_expired", handleSessionExpired);
    return () => {
      window.removeEventListener("sure_session_expired", handleSessionExpired);
    };
  }, []);

  const handleLogin = () => {
    setIsOpen(false);
    navigate("/login", { replace: true });
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.iconWrapper}>
          <FaExclamationTriangle className={styles.icon} />
        </div>
        <h3>Session Expired</h3>
        <p>Your session has expired for security reasons. Please sign in again to continue.</p>
        <button onClick={handleLogin} className={styles.loginBtn}>
          Sign In
        </button>
      </div>
    </div>
  );
}

export default SessionExpiredModal;
