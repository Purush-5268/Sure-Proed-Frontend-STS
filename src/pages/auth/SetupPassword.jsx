import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FaCheckCircle, FaTimesCircle, FaEye, FaEyeSlash } from "react-icons/fa";
import apiClient from "../../services/apiClient";
import styles from "../signup/Signup.module.css"; // Reuse signup styles for consistency

function SetupPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uidb64 = searchParams.get("uidb64");
  const token = searchParams.get("token");

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    special: false,
    score: 0,
    label: "Weak"
  });

  if (!uidb64 || !token) {
    return (
      <div className={styles.container}>
        <div className={styles.signupCard} style={{ textAlign: "center" }}>
          <h2>Invalid Link</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "10px" }}>
            The password setup link is invalid or missing required parameters.
          </p>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    if (name === "password") {
      evaluatePassword(value);
    }
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (passwordStrength.score < 5) {
      setError("Please meet all password requirements.");
      return;
    }

    setLoading(true);

    try {
      await apiClient.post("/api/users/setup_password/", {
        uidb64,
        token,
        new_password: formData.password
      });
      
      setSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 3000);

    } catch (err) {
      const resData = err.response?.data;
      let msg = "Failed to setup password. The link might be expired or invalid.";
      if (resData) {
        if (typeof resData === "string") {
          msg = resData;
        } else if (resData.detail) {
          msg = resData.detail;
        } else if (typeof resData === "object") {
          msg = Object.entries(resData)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`)
            .join(" | ");
        }
      }
      setError(msg);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.successCard}>
          <div className={styles.successIconWrapper}>
            <FaCheckCircle className={styles.successIcon} />
          </div>
          <h2>Password Set Successfully!</h2>
          <p>Your account is now ready. Redirecting to login...</p>
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
          <h1>Setup Your Password</h1>
          <p>Create a secure password to access your staff account.</p>
        </div>

        {error && (
          <div className={styles.errorToast}>
            {error}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label>New Password *</label>
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

          {/* Password Strength Meter */}
          {formData.password && (
            <div className={styles.passwordStrengthContainer}>
              <div className={styles.strengthHeader}>
                <span>Password Strength</span>
                <span className={styles[`strengthText${passwordStrength.label.replace(' ', '')}`]}>{passwordStrength.label}</span>
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
            className={`${styles.submitBtn} ${loading ? styles.loadingBtn : ''}`}
            disabled={loading || passwordStrength.score < 5}
          >
            <span className={styles.btnText}>
              {loading ? "Saving Password..." : "Set Password"}
            </span>
            {loading && (
              <div className={styles.loadingDots}>
                <span></span><span></span><span></span>
              </div>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SetupPassword;
