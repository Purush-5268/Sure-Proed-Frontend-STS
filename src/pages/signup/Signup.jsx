import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { courseService } from "../../services/courseService";
import { FaCheckCircle, FaTimesCircle, FaExclamationTriangle } from "react-icons/fa";
import styles from "./Signup.module.css";

function Signup() {
  const navigate = useNavigate();
  const [role, setRole] = useState("STUDENT"); // STUDENT, MENTOR, TRUSTEE
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    gender: "",
    dateOfBirth: "",
    password: "",
    confirmPassword: "",
    // Mentor specific
    domain: "",
    linkedinUrl: "",
    experienceYears: "",
    // Trustee specific
    trusteeType: "",
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

  useEffect(() => {
    if (role === "MENTOR" && courses.length === 0) {
      const fetchCourses = async () => {
        try {
          const res = await courseService.getCourses();
          setCourses(res.results || res || []);
        } catch (err) {
          console.error("Failed to fetch courses:", err);
        }
      };
      fetchCourses();
    }
  }, [role, courses.length]);

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
      const payload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone_number: formData.phoneNumber.trim(),
        gender: formData.gender,
        date_of_birth: formData.dateOfBirth,
        password: formData.password,
        role: role,
      };

      if (role === "MENTOR") {
        payload.domain = formData.domain;
        payload.linkedin_url = formData.linkedinUrl;
        payload.experience_years = formData.experienceYears;
      } else if (role === "TRUSTEE") {
        payload.trustee_type = formData.trusteeType;
      }

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
          <h1>Create your account</h1>
          <p>Join the Sure ProEd platform to start your journey.</p>
        </div>

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${role === "STUDENT" ? styles.activeTab : ""}`}
            onClick={() => setRole("STUDENT")}
            type="button"
          >
            Student
          </button>
          <button 
            className={`${styles.tab} ${role === "MENTOR" ? styles.activeTab : ""}`}
            onClick={() => setRole("MENTOR")}
            type="button"
          >
            Mentor
          </button>
          <button 
            className={`${styles.tab} ${role === "TRUSTEE" ? styles.activeTab : ""}`}
            onClick={() => setRole("TRUSTEE")}
            type="button"
          >
            Trustee
          </button>
        </div>

        {error && (
          <div className={styles.errorToast}>
            {error}
          </div>
        )}

        {role === "STUDENT" && (
          <div className={styles.infoAlert}>
            <FaExclamationTriangle className={styles.alertIcon} />
            <p><strong>Note:</strong> LinkedIn authentication will become mandatory in production. It is currently optional for testing purposes.</p>
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Common Fields */}
          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>First Name *</label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required />
            </div>
            <div className={styles.inputGroup}>
              <label>Last Name *</label>
              <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Email Address *</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} required />
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup} style={{ flex: role !== 'TRUSTEE' ? '1' : '0.5' }}>
              <label>Phone Number *</label>
              <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} required />
            </div>
            {role === "TRUSTEE" && (
              <div className={styles.inputGroup}>
                <label>Gender *</label>
                <select name="gender" value={formData.gender} onChange={handleChange} required>
                  <option value="">Select Gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            )}
          </div>

          {role === "TRUSTEE" && (
            <div className={styles.inputGroup}>
              <label>Date of Birth *</label>
              <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} required />
            </div>
          )}

          {/* Mentor Specific Fields */}
          {role === "MENTOR" && (
            <>
              <div className={styles.inputGroup}>
                <label>Course / Domain *</label>
                <select name="domain" value={formData.domain} onChange={handleChange} required>
                  <option value="">Select a Course Domain</option>
                  {courses.map(course => (
                    <option key={course.id} value={course.domain || course.title}>
                      {course.title} {course.domain ? `(${course.domain})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.row}>
                <div className={styles.inputGroup}>
                  <label>LinkedIn Profile (Optional)</label>
                  <input type="url" name="linkedinUrl" value={formData.linkedinUrl} onChange={handleChange} />
                </div>
                <div className={styles.inputGroup}>
                  <label>Years of Experience (Optional)</label>
                  <input type="number" name="experienceYears" value={formData.experienceYears} onChange={handleChange} min="0" />
                </div>
              </div>
            </>
          )}

          {/* Trustee Specific Fields */}
          {role === "TRUSTEE" && (
            <div className={styles.inputGroup}>
              <label>Trustee Type *</label>
              <select name="trusteeType" value={formData.trusteeType} onChange={handleChange} required>
                <option value="">Select Trustee Type</option>
                <option value="EXECUTIVE">Executive Trustee</option>
                <option value="VOLUNTEER">Volunteer Trustee</option>
                <option value="COMMERCIAL">Commercial Trustee</option>
              </select>
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>Password *</label>
              <input type="password" name="password" value={formData.password} onChange={handleChange} required />
            </div>
            <div className={styles.inputGroup}>
              <label>Confirm Password *</label>
              <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required />
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
                  {passwordStrength.upper ? <FaCheckCircle /> : <FaTimesCircle />} Uppercase letter
                </div>
                <div className={passwordStrength.lower ? styles.ruleValid : styles.ruleInvalid}>
                  {passwordStrength.lower ? <FaCheckCircle /> : <FaTimesCircle />} Lowercase letter
                </div>
                <div className={passwordStrength.number ? styles.ruleValid : styles.ruleInvalid}>
                  {passwordStrength.number ? <FaCheckCircle /> : <FaTimesCircle />} Number
                </div>
                <div className={passwordStrength.special ? styles.ruleValid : styles.ruleInvalid}>
                  {passwordStrength.special ? <FaCheckCircle /> : <FaTimesCircle />} Special character
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
              {loading ? "Creating Account" : "Create Account"}
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