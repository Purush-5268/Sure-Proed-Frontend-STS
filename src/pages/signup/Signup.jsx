/**
 * Signup.jsx — OTP-gated student self-registration
 *
 * UX Flow:
 *   1. User fills the full registration form.
 *   2. Next to the Email field is a "Verify Email" button.
 *      → Only enabled when a valid email is typed.
 *      → Clicking it (and ONLY clicking it) triggers send-verification-otp.
 *   3. An OTP modal/inline section appears.
 *   4. User enters OTP. On backend success: email shown as ✓ Verified.
 *   5. If user changes email after verification, verified state resets immediately.
 *   6. "Create Account" button only enabled when email is verified.
 *
 * Backend authority:
 *   - verifyEmailOTP() returns JWT on success → user created.
 *   - We store JWT and navigate to dashboard.
 *   - No frontend-only verification flag used to bypass backend.
 *
 * Endpoints used (Phase 1, already in authService):
 *   POST /api/auth/send-verification-otp/
 *   POST /api/auth/verify-email-otp/
 */
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { useAuth } from "../../context/AuthContext";
import {
  FaCheckCircle, FaTimesCircle, FaEye, FaEyeSlash,
  FaRedo, FaEnvelopeOpenText
} from "react-icons/fa";
import { setAccessToken, setRefreshToken, setUserInfo } from "../../utils/tokenStorage";
import styles from "./Signup.module.css";

const RESEND_COOLDOWN_S = 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function evaluatePassword(pwd) {
  const length  = pwd.length >= 8;
  const upper   = /[A-Z]/.test(pwd);
  const lower   = /[a-z]/.test(pwd);
  const number  = /[0-9]/.test(pwd);
  const special = /[^A-Za-z0-9]/.test(pwd);
  const score   = [length, upper, lower, number, special].filter(Boolean).length;
  const label   = score === 5 ? "Very Strong" : score >= 4 ? "Strong" : score === 3 ? "Medium" : "Weak";
  return { length, upper, lower, number, special, score, label };
}

function Signup() {
  const navigate   = useNavigate();
  const { updateUser } = useAuth();

  // ─── Form data ───────────────────────────────────────
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "",
    phoneNumber: "", password: "", confirmPassword: "",
    gender: "", dateOfBirth: "",
  });

  const [showPassword, setShowPassword]           = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength]   = useState(evaluatePassword(""));

  // ─── Email verification state ─────────────────────────
  // emailVerified is only set to true when the backend verifyEmailOTP succeeds
  // and returns JWT tokens.
  const [emailVerified, setEmailVerified]         = useState(false);
  const [verifiedEmail, setVerifiedEmail]         = useState(""); // the email that was verified
  const [showOtpPanel, setShowOtpPanel]           = useState(false);
  const [otp, setOtp]                             = useState(["", "", "", "", "", ""]);
  const [deliveryHint, setDeliveryHint]           = useState("");
  const [sendingOtp, setSendingOtp]               = useState(false);
  const [verifyingOtp, setVerifyingOtp]           = useState(false);
  const [otpError, setOtpError]                   = useState("");
  const [resendTimer, setResendTimer]             = useState(RESEND_COOLDOWN_S);
  const [canResend, setCanResend]                 = useState(false);
  const timerRef                                  = useRef(null);
  const otpRefs                                   = useRef([]);

  // ─── Form-level state ─────────────────────────────────
  const [loading, setLoading]   = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess]   = useState(false);

  // ─── Watch email field: reset verification if email changes ──
  useEffect(() => {
    if (emailVerified && formData.email.toLowerCase() !== verifiedEmail.toLowerCase()) {
      setEmailVerified(false);
      setVerifiedEmail("");
      setShowOtpPanel(false);
      setOtp(["", "", "", "", "", ""]);
      setOtpError("");
    }
  }, [formData.email, emailVerified, verifiedEmail]);

  // ─── Resend countdown ────────────────────────────────
  const startResendTimer = () => {
    setResendTimer(RESEND_COOLDOWN_S);
    setCanResend(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current); setCanResend(true); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  // ─── Handlers ────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === "password") setPasswordStrength(evaluatePassword(value));
  };

  // All required fields for the backend send-verification-otp call
  // Backend serializer: first_name, last_name, password (min 8 + strong) are validated
  const formReady =
    formData.firstName.trim().length >= 2 &&
    formData.lastName.trim().length >= 1 &&
    EMAIL_REGEX.test(formData.email.trim()) &&
    formData.phoneNumber.trim().length >= 10 &&
    formData.gender !== "" &&
    formData.dateOfBirth !== "" &&
    formData.password === formData.confirmPassword &&
    passwordStrength.score >= 5;

  // Only fires when user explicitly clicks "Verify Email"
  const handleSendOtp = async () => {
    setOtpError("");
    const email = formData.email.trim().toLowerCase();

    // ── Pre-flight checks — mirror backend validation ──────────────────────
    if (!EMAIL_REGEX.test(email)) {
      setOtpError("Please enter a valid email address."); return;
    }
    if (formData.firstName.trim().length < 2) {
      setOtpError("Please fill in your first name before verifying."); return;
    }
    if (!formData.lastName.trim()) {
      setOtpError("Please fill in your last name before verifying."); return;
    }
    if (formData.phoneNumber.trim().length < 10) {
      setOtpError("Please enter a valid 10-digit phone number."); return;
    }
    if (!formData.gender) {
      setOtpError("Please select your gender before verifying."); return;
    }
    if (!formData.dateOfBirth) {
      setOtpError("Please enter your date of birth before verifying."); return;
    }
    if (passwordStrength.score < 5) {
      setOtpError("Please set a very strong password (all 5 requirements) before verifying your email."); return;
    }
    if (formData.password !== formData.confirmPassword) {
      setOtpError("Passwords do not match. Please fix before verifying."); return;
    }
    // ── End pre-flight ─────────────────────────────────────────────────────

    setSendingOtp(true);
    try {
      const payload = {
        first_name:    formData.firstName.trim(),
        last_name:     formData.lastName.trim(),
        email,
        phone_number:  formData.phoneNumber.trim() || null,
        password:      formData.password,
        role:          "STUDENT",
        gender:        formData.gender || null,
        date_of_birth: formData.dateOfBirth || null,
      };
      const res = await authService.sendEmailVerificationOTP(payload);
      const detail = res?.detail || "";
      const match  = detail.match(/dispatched to (.+?)\./i);
      setDeliveryHint(match ? match[1] : email);
      setShowOtpPanel(true);
      setOtp(["", "", "", "", "", ""]);
      startResendTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (err) {
      const data = err?.response?.data;
      // Show the most useful error from the backend without exposing internals
      const msg =
        data?.detail ||
        data?.password?.[0] ||
        data?.email?.[0] ||
        data?.first_name?.[0] ||
        data?.last_name?.[0] ||
        data?.message ||
        (typeof data === "string" ? data : null) ||
        "Failed to send OTP. Please check your details and try again.";
      setOtpError(msg);
    } finally {
      setSendingOtp(false);
    }
  };

  // Resend: re-send OTP for the same email
  const handleResend = async () => {
    if (!canResend) return;
    setOtpError("");
    setOtp(["", "", "", "", "", ""]);
    await handleSendOtp();
  };

  // OTP input box handling
  const handleOtpChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val; setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const handleOtpKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };
  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) { setOtp(pasted.split("")); otpRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  // Verify OTP — backend is authority
  const handleVerifyOtp = async () => {
    const otpVal = otp.join("");
    if (otpVal.length !== 6) { setOtpError("Enter the full 6-digit code."); return; }
    setOtpError("");
    setVerifyingOtp(true);
    try {
      const email = formData.email.trim().toLowerCase();
      const res   = await authService.verifyEmailOTP(email, otpVal);
      // Backend confirmed email is valid. Store tokens and mark as verified.
      if (res.access) {
        setAccessToken(res.access);
        if (res.refresh)    setRefreshToken(res.refresh);
        if (res.user)       { setUserInfo(res.user); updateUser(res.user); }
      }
      // Mark email as verified (backend authority confirmed)
      setEmailVerified(true);
      setVerifiedEmail(email);
      setShowOtpPanel(false);
      clearInterval(timerRef.current);
      setSuccess(true);
      setTimeout(() => navigate("/student/profile", { replace: true }), 1800);
    } catch (err) {
      const data = err?.response?.data;
      const msg  = data?.detail || data?.otp?.[0] || data?.message ||
        (typeof data === "string" ? data : null) || "Invalid or expired code. Try again.";
      setOtpError(msg);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setVerifyingOtp(false);
    }
  };

  const emailValid = EMAIL_REGEX.test(formData.email.trim());

  // ─── Success screen ───────────────────────────────────
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

  return (
    <div className={styles.container}>
      <div className={styles.signupCard}>
        <div className={styles.header}>
          <h1>Student Registration</h1>
          <p>Fill in your details and verify your email to create your account.</p>
        </div>

        {formError && <div className={styles.errorToast}>{formError}</div>}

        <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
          {/* Name row */}
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

          {/* Email + Verify button */}
          <div className={styles.inputGroup}>
            <label>
              Email Address *{" "}
              {!emailVerified && (
                <span className={styles.labelHint}>
                  — fill all fields &amp; set password first, then click Verify Email
                </span>
              )}
            </label>

            <div className={styles.emailRow}>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="john.doe@example.com"
                disabled={emailVerified}
                className={emailVerified ? styles.inputVerified : ""}
              />
              {emailVerified ? (
                <span className={styles.verifiedBadge}>
                  <FaCheckCircle /> Verified
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.verifyEmailBtn}
                  onClick={handleSendOtp}
                  disabled={sendingOtp || showOtpPanel || emailVerified}
                  title={!formReady ? "Fill in all fields with a strong password before verifying" : "Click to send OTP to your email"}
                >
                  {sendingOtp ? "Sending..." : showOtpPanel ? "Code Sent ✓" : "Verify Email"}
                </button>
              )}
            </div>
            {/* Pre-flight / OTP send error shown under email row */}
            {otpError && !showOtpPanel && (
              <div className={styles.otpError} style={{ marginTop: "6px" }}>{otpError}</div>
            )}
          </div>

          {/* OTP Panel — shown inline after "Verify Email" is clicked */}
          {showOtpPanel && !emailVerified && (
            <div className={styles.otpPanel}>
              <div className={styles.otpPanelHeader}>
                <FaEnvelopeOpenText className={styles.otpPanelIcon} />
                <span>Enter the 6-digit code sent to <strong>{deliveryHint}</strong></span>
              </div>
              {otpError && <div className={styles.otpError}>{otpError}</div>}
              <div className={styles.otpRow} onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => (otpRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className={styles.otpInput}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    aria-label={`OTP digit ${i + 1}`}
                  />
                ))}
              </div>
              <div className={styles.otpActions}>
                <button
                  type="button"
                  className={styles.verifyOtpBtn}
                  onClick={handleVerifyOtp}
                  disabled={verifyingOtp || otp.join("").length !== 6}
                >
                  {verifyingOtp ? "Verifying..." : "Verify Code"}
                </button>
                <div className={styles.resendRow}>
                  {canResend ? (
                    <button type="button" className={styles.resendBtn} onClick={handleResend} disabled={sendingOtp}>
                      <FaRedo /> {sendingOtp ? "Sending..." : "Resend Code"}
                    </button>
                  ) : (
                    <span className={styles.resendTimer}>Resend in <strong>{resendTimer}s</strong></span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Phone */}
          <div className={styles.inputGroup}>
            <label>Phone Number *</label>
            <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} required placeholder="9876543210" />
          </div>

          {/* Gender + DOB */}
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

          {/* Password */}
          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>Password *</label>
              <div className={styles.passwordInputWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password" value={formData.password}
                  onChange={handleChange} required placeholder="••••••••"
                />
                <button type="button" className={styles.togglePasswordBtn} onClick={() => setShowPassword(s => !s)}>
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>
            <div className={styles.inputGroup}>
              <label>Confirm Password *</label>
              <div className={styles.passwordInputWrapper}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword" value={formData.confirmPassword}
                  onChange={handleChange} required placeholder="••••••••"
                />
                <button type="button" className={styles.togglePasswordBtn} onClick={() => setShowConfirmPassword(s => !s)}>
                  {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>
          </div>

          {/* Password Strength */}
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
                {[
                  [passwordStrength.length,  "Min 8 characters"],
                  [passwordStrength.upper,   "Uppercase"],
                  [passwordStrength.lower,   "Lowercase"],
                  [passwordStrength.number,  "Number"],
                  [passwordStrength.special, "Special char"],
                ].map(([ok, label]) => (
                  <div key={label} className={ok ? styles.ruleValid : styles.ruleInvalid}>
                    {ok ? <FaCheckCircle /> : <FaTimesCircle />} {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit — only enabled after email verified by backend */}
          {!emailVerified && (
            <p className={styles.verifyNotice}>
              ⚠️ Please verify your email above before creating your account.
            </p>
          )}

          <button
            type="button"
            className={`${styles.submitBtn} ${loading ? styles.loadingBtn : ""}`}
            disabled={loading || !emailVerified || passwordStrength.score < 5}
            onClick={async () => {
              setFormError("");
              if (formData.password !== formData.confirmPassword) {
                setFormError("Passwords do not match.");
                return;
              }
              // At this point email is verified by backend (JWT already stored).
              // Account was already created by verifyEmailOTP — just navigate.
              setSuccess(true);
              setTimeout(() => navigate("/student/profile", { replace: true }), 1000);
            }}
          >
            <span className={styles.btnText}>
              {loading ? "Creating Account..." : "Create Account"}
            </span>
            {loading && <div className={styles.loadingDots}><span></span><span></span><span></span></div>}
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