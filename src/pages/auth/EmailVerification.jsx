import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./ForgotPassword.module.css";

function EmailVerification() {
  const [verified, setVerified] = useState(false);

  const handleVerify = () => {
    setVerified(true);
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <h2>Email Verification</h2>
        <p className={styles.subtitle}>Confirm your email address to complete your registration.</p>

        {verified ? (
          <div className={styles.successMessage}>
            <p>Your email has been verified successfully!</p>
            <Link to="/login" className={styles.submitBtn} style={{ display: "inline-block", textAlign: "center", textDecoration: "none", marginTop: "1rem" }}>
              Proceed to Sign In
            </Link>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
            <p style={{ marginBottom: "1.5rem", color: "#64748b" }}>
              We sent a verification link to your registered email. Click the button below to simulate verification.
            </p>
            <button onClick={handleVerify} className={styles.submitBtn}>
              Verify My Email
            </button>
          </div>
        )}

        <div className={styles.footerLink}>
          <Link to="/login">Back to Login</Link>
        </div>
      </div>
    </div>
  );
}

export default EmailVerification;
