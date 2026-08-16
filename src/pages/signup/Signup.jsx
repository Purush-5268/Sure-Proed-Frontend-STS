import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { FaCheckCircle, FaTimesCircle, FaEye, FaEyeSlash } from "react-icons/fa";
import styles from "./Signup.module.css";

function Signup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    special: false,
    score: 0,
    label: "Weak"
  });

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
      setError("Please meet all password requirements.");
      return;
    }

    setLoading(true);

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

      await authService.register(payload);
      
      setSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 2500);

    } catch (err) {
      console.error("Registration error:", err);
      const resData = err.response?.data;
      let msg = "Failed to create account. Please check your inputs.";
      if (resData) {
        if (typeof resData === "string") {
          msg = resData;
        } else if (resData.email) {
          msg = `Email: ${Array.isArray(resData.email) ? resData.email.join(" ") : resData.email}`;
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
          <h2>Account Created Successfully!</h2>
          <p>Please sign in to continue to your dashboard.</p>
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
          <p>Join the Sure ProEd platform to start your journey.</p>
        </div>

        {error && (
          <div className={styles.errorToast}>
            {error}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
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
              {loading ? "Creating Account..." : "Create Account"}
            </span>
            {loading && (
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