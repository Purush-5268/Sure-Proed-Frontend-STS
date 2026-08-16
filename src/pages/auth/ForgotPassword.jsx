import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { FaCheckCircle, FaArrowLeft } from "react-icons/fa";
import styles from "./ForgotPassword.module.css";

function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password, 4: Success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to request OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authService.verifyOtp(email, otp);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid or expired OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await authService.resetPasswordOtp(email, otp, newPassword);
      setStep(4);
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err) {
      if (err.response?.data) {
        const data = err.response.data;
        const msg = data.detail || data.non_field_errors?.[0] || data.new_password?.[0] || data.otp?.[0] || data.email?.[0] || "Failed to reset password.";
        setError(msg);
      } else {
        setError("Failed to reset password. Please check your network.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginWrapper}>
        <div className={styles.leftSide}>
          <div className={styles.heroContent}>
            <h2>Account Recovery</h2>
            <p>Don't worry, we'll help you get back into your account securely.</p>
          </div>
        </div>

        <div className={styles.card}>
        {step < 4 && (
          <Link to="/login" className={styles.backLink}>
            <FaArrowLeft /> Back to Login
          </Link>
        )}

        <div className={styles.header}>
          {step === 1 && <h1>Reset Password</h1>}
          {step === 2 && <h1>Enter OTP</h1>}
          {step === 3 && <h1>New Password</h1>}
          {step === 4 && <h1>Success!</h1>}
          
          <p className={styles.subtitle}>
            {step === 1 && "Enter your email address and we'll send you an OTP to reset your password."}
            {step === 2 && `We've sent a 6-digit code to ${email}.`}
            {step === 3 && "Create a new strong password for your account."}
            {step === 4 && "Your password has been successfully reset."}
          </p>
        </div>

        {error && <div className={styles.errorToast}>{error}</div>}

        {step === 1 && (
          <form onSubmit={handleRequestOtp} className={styles.form}>
            <div className={styles.inputGroup}>
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your registered email"
                disabled={loading}
              />
            </div>
            <button type="submit" className={`${styles.submitBtn} ${loading ? styles.loadingBtn : ''}`} disabled={loading}>
              <span className={styles.btnText}>{loading ? "Sending..." : "Send OTP"}</span>
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className={styles.form}>
            <div className={styles.inputGroup}>
              <label>6-Digit OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                placeholder="000000"
                maxLength={6}
                disabled={loading}
                className={styles.otpInput}
              />
            </div>
            <button type="submit" className={`${styles.submitBtn} ${loading ? styles.loadingBtn : ''}`} disabled={loading || otp.length !== 6}>
              <span className={styles.btnText}>{loading ? "Verifying..." : "Verify OTP"}</span>
            </button>
            <div className={styles.resendWrapper}>
              <button type="button" onClick={handleRequestOtp} className={styles.resendBtn} disabled={loading}>
                Resend OTP
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword} className={styles.form}>
            <div className={styles.inputGroup}>
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Enter new password (min 8 chars)"
                disabled={loading}
              />
            </div>
            <div className={styles.inputGroup} style={{ marginTop: "1rem" }}>
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
                disabled={loading}
              />
            </div>
            <button type="submit" className={`${styles.submitBtn} ${loading ? styles.loadingBtn : ''}`} disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}>
              <span className={styles.btnText}>{loading ? "Resetting..." : "Reset Password"}</span>
            </button>
          </form>
        )}

        {step === 4 && (
          <div className={styles.successState}>
            <FaCheckCircle className={styles.successIcon} />
            <p>Redirecting you to login...</p>
            <div className={styles.redirectLoader}>
              <div className={styles.loadingBar}></div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;