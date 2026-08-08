import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./ForgotPassword.module.css";

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setSubmitted(true);
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <h2>Reset Password</h2>
        <p className={styles.subtitle}>Enter your new password below.</p>

        {submitted ? (
          <div className={styles.successMessage}>
            <p>Your password has been successfully reset.</p>
            <Link to="/login" className={styles.submitBtn} style={{ display: "inline-block", textAlign: "center", textDecoration: "none", marginTop: "1rem" }}>
              Proceed to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.inputGroup}>
              <label>New Password</label>
              <input
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className={styles.inputGroup}>
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className={styles.submitBtn}>
              Reset Password
            </button>
          </form>
        )}

        <div className={styles.footerLink}>
          <Link to="/login">Back to Login</Link>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
