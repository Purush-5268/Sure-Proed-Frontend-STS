import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { FaCheckCircle, FaArrowLeft, FaShieldAlt, FaKey, FaLock, FaUserShield } from "react-icons/fa";
import { motion } from "framer-motion";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import forgotPasswordUrl from "../../assets/animations/forgot-password.lottie";
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
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    length: false, upper: false, lower: false, number: false, special: false, score: 0, label: "Weak"
  });

  const evaluatePassword = (pwd) => {
    const length = pwd.length >= 8;
    const upper = /[A-Z]/.test(pwd);
    const lower = /[a-z]/.test(pwd);
    const number = /[0-9]/.test(pwd);
    const special = /[^A-Za-z0-9]/.test(pwd);

    let score = 0;
    if (length) score++;
    if (upper) score++;
    if (lower) score++;
    if (number) score++;
    if (special) score++;

    let label = "Weak";
    if (score >= 4) label = "Strong";
    if (score === 5) label = "Very Strong";
    if (score === 3) label = "Medium";

    setPasswordStrength({ length, upper, lower, number, special, score, label });
  };

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

    if (passwordStrength.score < 5) {
      setError("Please meet all password requirements.");
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
          <motion.div 
            className={styles.heroContent}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2>Account Recovery</h2>
            <p>Don't worry, we'll help you get back into your account securely and quickly.</p>
            
            <div style={{ position: "relative", width: "100%", maxWidth: "420px", margin: "0 auto" }}>
              <motion.div animate={{ y: [0, -15, 0], x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }} style={{ position: "absolute", top: "5%", left: "-3%", color: "#3b82f6", fontSize: "2rem", opacity: 0.7, zIndex: 0 }}>
                <FaShieldAlt />
              </motion.div>
              <motion.div animate={{ y: [0, 15, 0], x: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 1 }} style={{ position: "absolute", top: "15%", right: "-3%", color: "#10b981", fontSize: "1.8rem", opacity: 0.6, zIndex: 0 }}>
                <FaKey />
              </motion.div>
              <motion.div animate={{ y: [0, -20, 0] }} transition={{ repeat: Infinity, duration: 7, ease: "easeInOut", delay: 2 }} style={{ position: "absolute", bottom: "10%", left: "-3%", color: "#8b5cf6", fontSize: "2rem", opacity: 0.7, zIndex: 0 }}>
                <FaLock />
              </motion.div>
              <motion.div animate={{ y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 0.5 }} style={{ position: "absolute", bottom: "20%", right: "-3%", color: "#f59e0b", fontSize: "1.8rem", opacity: 0.6, zIndex: 0 }}>
                <FaUserShield />
              </motion.div>
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                whileHover={{ scale: 1.05, filter: "drop-shadow(0 20px 25px rgba(0,0,0,0.2))" }}
                style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "420px", margin: "0 auto", cursor: "pointer" }}
              >
                <DotLottieReact src={forgotPasswordUrl} loop autoplay />
              </motion.div>
            </div>
          </motion.div>
        </div>

        <motion.div 
          className={styles.card}
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        >
        <div className={styles.formContainer}>
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
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      evaluatePassword(e.target.value);
                    }}
                    placeholder="Enter strong password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={styles.eyeBtn}
                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Password Strength UI */}
              <div className={styles.passwordStrength}>
                <div className={styles.strengthHeader}>
                  <span>Password Strength</span>
                  <span className={`${styles.strengthLabel} ${styles[passwordStrength.label.replace(" ", "")]}`}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className={styles.strengthBars}>
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`${styles.bar} ${
                        level <= passwordStrength.score ? styles.active : ""
                      } ${styles[passwordStrength.label.replace(" ", "")]}`}
                    ></div>
                  ))}
                </div>
                <div className={styles.requirementsList}>
                  <div className={passwordStrength.length ? styles.met : styles.unmet}>
                    {passwordStrength.length ? <FaCheckCircle /> : <FaCheckCircle style={{opacity: 0.3}}/>} 8+ characters
                  </div>
                  <div className={passwordStrength.upper ? styles.met : styles.unmet}>
                    {passwordStrength.upper ? <FaCheckCircle /> : <FaCheckCircle style={{opacity: 0.3}}/>} Uppercase letter
                  </div>
                  <div className={passwordStrength.lower ? styles.met : styles.unmet}>
                    {passwordStrength.lower ? <FaCheckCircle /> : <FaCheckCircle style={{opacity: 0.3}}/>} Lowercase letter
                  </div>
                  <div className={passwordStrength.number ? styles.met : styles.unmet}>
                    {passwordStrength.number ? <FaCheckCircle /> : <FaCheckCircle style={{opacity: 0.3}}/>} Number
                  </div>
                  <div className={passwordStrength.special ? styles.met : styles.unmet}>
                    {passwordStrength.special ? <FaCheckCircle /> : <FaCheckCircle style={{opacity: 0.3}}/>} Special character
                  </div>
                </div>
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
        </motion.div>
      </div>
    </div>
  );
}

export default ForgotPassword;