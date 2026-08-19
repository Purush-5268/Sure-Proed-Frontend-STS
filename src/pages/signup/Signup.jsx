/**
 * Signup.jsx — OTP-gated student self-registration
 *
 * Flow:
 *   Step 1: Collect full form data → "Send OTP" → calls /api/auth/send-verification-otp/
 *   Step 2: Enter 6-digit OTP → "Verify & Create Account" → calls /api/auth/verify-email-otp/
 *            Backend is the authority on whether OTP is valid.
 *            On success, backend returns JWT tokens + creates user.
 *            We store the JWT and navigate to dashboard.
 *
 * Rules:
 *   - Never expose OTP or backend internals in UI
 *   - Resend timer: 60s
 *   - Handles: expired OTP, wrong OTP, already registered, rate limit, backend errors
 *   - Submit only available after backend confirms OTP via JWT response
 */
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { useAuth } from "../../context/AuthContext";
import {
  FaCheckCircle, FaTimesCircle, FaEye, FaEyeSlash,
  FaEnvelope, FaArrowRight, FaRedo
} from "react-icons/fa";
import { setAccessToken, setRefreshToken, setUserInfo } from "../../utils/tokenStorage";
import styles from "./Signup.module.css";

const RESEND_COOLDOWN_S = 60;

function Signup() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  // ─── Step control ─────────────────────────────────
  const [step, setStep] = useState(1); // 1 = form, 2 = OTP

  // ─── Step 1 state ─────────────────────────────────
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
    gender: "",
    dateOfBirth: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    length: false, upper: false, lower: false, number: false, special: false,
    score: 0, label: "Weak",
  });

  // ─── Step 2 state ─────────────────────────────────
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN_S);
  const [canResend, setCanResend] = useState(false);
  const timerRef = useRef(null);
  const otpInputRefs = useRef([]);

  // ─── Shared state ──────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  // deliveryEmail is what backend confirmed OTP was sent to (may be mapped email)
  const [deliveryHint, setDeliveryHint] = useState("");

  // Start countdown when step = 2
  useEffect(() => {
    if (step !== 2) return;
    setResendTimer(RESEND_COOLDOWN_S);
    setCanResend(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setCanResend(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step]);

  // ─── Helpers ───────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === "password") evaluatePassword(value);
  };

  const evaluatePassword = (pwd) => {
    const length = pwd.length >= 8;
    const upper = /[A-Z]/.test(pwd);
    const lower = /[a-z]/.test(pwd);
    const number = /[0-9]/.test(pwd);
    const special = /[^A-Za-z0-9]/.test(pwd);
    let score = [length, upper, lower, number, special].filter(Boolean).length;
    const label = score === 5 ? "Very Strong" : score >= 4 ? "Strong" : score === 3 ? "Medium" : "Weak";
    setPasswordStrength({ length, upper, lower, number, special, score, label });
  };

  // ─── Step 1: Send OTP ──────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (passwordStrength.score < 5) {
      setError("Please meet all password requirements before requesting OTP.");
      return;
    }

    setSendingOtp(true);
    try {
      const payload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone_number: formData.phoneNumber.trim() || null,
        password: formData.password,
        role: "STUDENT",
        gender: formData.gender || null,
        date_of_birth: formData.dateOfBirth || null,
      };
      const res = await authService.sendEmailVerificationOTP(payload);
      // Backend returns { detail: "...dispatched to <email>..." }
      // Extract delivery hint from detail message (do NOT expose raw OTP)
      const detail = res?.detail || "";
      const match = detail.match(/dispatched to (.+?)\./i);
      setDeliveryHint(match ? match[1] : formData.email.trim().toLowerCase());
      setStep(2);
      setOtp(["", "", "", "", "", ""]);
    } catch (err) {
      const data = err?.response?.data;
      const msg = data?.detail || data?.email?.[0] || data?.message ||
        (typeof data === "string" ? data : null) || "Failed to send OTP. Please try again.";
      setError(msg);
    } finally {
      setSendingOtp(false);
    }
  };

  // ─── Step 2: OTP input handling ────────────────────
  const handleOtpChange = (index, value) => {
    if (!/^\d?$/.test(value)) return; // digits only
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(""));
      otpInputRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const otpValue = otp.join("");

  // ─── Step 2: Resend OTP ────────────────────────────
  const handleResend = async () => {
    if (!canResend) return;
    setError("");
    setCanResend(false);
    setOtp(["", "", "", "", "", ""]);
    setSendingOtp(true);
    try {
      const payload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone_number: formData.phoneNumber.trim() || null,
        password: formData.password,
        role: "STUDENT",
        gender: formData.gender || null,
        date_of_birth: formData.dateOfBirth || null,
      };
      await authService.sendEmailVerificationOTP(payload);
      setResendTimer(RESEND_COOLDOWN_S);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setResendTimer((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            setCanResend(true);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } catch (err) {
      const data = err?.response?.data;
      const msg = data?.detail || "Failed to resend OTP.";
      setError(msg);
      setCanResend(true);
    } finally {
      setSendingOtp(false);
    }
  };

  // ─── Step 2: Verify OTP ────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpValue.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      // Backend is the authority — on success it returns JWT + creates user
      const res = await authService.verifyEmailOTP(
        formData.email.trim().toLowerCase(),
        otpValue
      );
      // Store tokens and user info
      if (res.access) {
        setAccessToken(res.access);
        if (res.refresh) setRefreshToken(res.refresh);
        if (res.user) {
          setUserInfo(res.user);
          updateUser(res.user);
        }
      }
      setSuccess(true);
      setTimeout(() => navigate("/student/profile", { replace: true }), 2000);
    } catch (err) {
      const data = err?.response?.data;
      const msg = data?.detail || data?.otp?.[0] || data?.message ||
        (typeof data === "string" ? data : null) ||
        "Invalid or expired code. Please check and try again.";
      setError(msg);
      // Clear OTP on wrong attempt
      setOtp(["", "", "", "", "", ""]);
      otpInputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ─── Success screen ────────────────────────────────
  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.successCard}>
          <div className={styles.successIconWrapper}>
            <FaCheckCircle className={styles.successIcon} />
          </div>
          <h2>Welcome to SURE ProEd!</h2>
          <p>Your account has been verified and created. Taking you to your dashboard...</p>
          <div className={styles.redirectLoader}>
            <div className={styles.loadingBar}></div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 2: OTP entry ─────────────────────────────
  if (step === 2) {
    return (
      <div className={styles.container}>
        <div className={styles.signupCard}>
          <div className={styles.header}>
            <div className={styles.otpIcon}><FaEnvelope /></div>
            <h1>Verify Your Email</h1>
            <p>
              We sent a 6-digit code to <strong>{deliveryHint}</strong>.
              Enter it below to create your account.
            </p>
          </div>

          {error && <div className={styles.errorToast}>{error}</div>}

          <form className={styles.form} onSubmit={handleVerifyOtp}>
            <div className={styles.otpRow} onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (otpInputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className={styles.otpInput}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  autoFocus={i === 0}
                  aria-label={`OTP digit ${i + 1}`}
                />
              ))}
            </div>

            <button
              type="submit"
              className={`${styles.submitBtn} ${loading ? styles.loadingBtn : ""}`}
              disabled={loading || otpValue.length !== 6}
            >
              <span className={styles.btnText}>
                {loading ? "Verifying..." : "Verify & Create Account"}
              </span>
              {loading && (
                <div className={styles.loadingDots}>
                  <span></span><span></span><span></span>
                </div>
              )}
            </button>

            <div className={styles.resendRow}>
              {canResend ? (
                <button
                  type="button"
                  className={styles.resendBtn}
                  onClick={handleResend}
                  disabled={sendingOtp}
                >
                  <FaRedo /> {sendingOtp ? "Sending..." : "Resend Code"}
                </button>
              ) : (
                <span className={styles.resendTimer}>
                  Resend in <strong>{resendTimer}s</strong>
                </span>
              )}
            </div>

            <button
              type="button"
              className={styles.backBtn}
              onClick={() => { setStep(1); setError(""); }}
            >
              ← Edit registration details
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Step 1: Registration form ─────────────────────
  return (
    <div className={styles.container}>
      <div className={styles.signupCard}>
        <div className={styles.header}>
          <h1>Student Registration</h1>
          <p>Fill in your details. We'll send a verification code to your email.</p>
        </div>

        {error && <div className={styles.errorToast}>{error}</div>}

        <form className={styles.form} onSubmit={handleSendOtp}>
          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>First Name *</label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required placeholder="John" />
            </div>
            <div className={styles.inputGroup}>
              <label>Last Name *</label>
              <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required placeholder="Doe" />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Email Address *</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="john.doe@example.com" />
          </div>

          <div className={styles.inputGroup}>
            <label>Phone Number *</label>
            <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} required placeholder="9876543210" />
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>Gender *</label>
              <select name="gender" value={formData.gender} onChange={handleChange} required>
                <option value="">Select Gender</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className={styles.inputGroup}>
              <label>Date of Birth *</label>
              <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} required />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>Password *</label>
              <div className={styles.passwordInputWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                />
                <button type="button" className={styles.togglePasswordBtn} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>
            <div className={styles.inputGroup}>
              <label>Confirm Password *</label>
              <div className={styles.passwordInputWrapper}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                />
                <button type="button" className={styles.togglePasswordBtn} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>
          </div>

          {formData.password && (
            <div className={styles.passwordStrengthContainer}>
              <div className={styles.strengthHeader}>
                <span>Password Strength</span>
                <span className={styles[`strengthText${passwordStrength.label.replace(" ", "")}`]}>
                  {passwordStrength.label}
                </span>
              </div>
              <div className={styles.strengthBars}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`${styles.strengthBar} ${i < passwordStrength.score ? styles[`strengthBar${passwordStrength.score}`] : ""}`} />
                ))}
              </div>
              <div className={styles.passwordRules}>
                <div className={passwordStrength.length ? styles.ruleValid : styles.ruleInvalid}>
                  {passwordStrength.length ? <FaCheckCircle /> : <FaTimesCircle />} Min 8 characters
                </div>
                <div className={passwordStrength.upper ? styles.ruleValid : styles.ruleInvalid}>
                  {passwordStrength.upper ? <FaCheckCircle /> : <FaTimesCircle />} Uppercase
                </div>
                <div className={passwordStrength.lower ? styles.ruleValid : styles.ruleInvalid}>
                  {passwordStrength.lower ? <FaCheckCircle /> : <FaTimesCircle />} Lowercase
                </div>
                <div className={passwordStrength.number ? styles.ruleValid : styles.ruleInvalid}>
                  {passwordStrength.number ? <FaCheckCircle /> : <FaTimesCircle />} Number
                </div>
                <div className={passwordStrength.special ? styles.ruleValid : styles.ruleInvalid}>
                  {passwordStrength.special ? <FaCheckCircle /> : <FaTimesCircle />} Special char
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className={`${styles.submitBtn} ${sendingOtp ? styles.loadingBtn : ""}`}
            disabled={sendingOtp || passwordStrength.score < 5}
          >
            <span className={styles.btnText}>
              {sendingOtp ? "Sending OTP..." : "Send Verification Code"}
            </span>
            <FaArrowRight style={{ marginLeft: "8px" }} />
            {sendingOtp && (
              <div className={styles.loadingDots}>
                <span></span><span></span><span></span>
              </div>
            )}
          </button>

          <p className={styles.loginText}>
            Already have an account? <Link to="/login">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default Signup;