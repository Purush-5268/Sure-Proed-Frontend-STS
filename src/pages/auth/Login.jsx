import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaLinkedin, FaEye, FaEyeSlash, FaLaptopCode, FaGraduationCap, FaMicrochip, FaBrain } from "react-icons/fa";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/authService";
import { setAccessToken, setRefreshToken, setUserInfo, parseJwt } from "../../utils/tokenStorage";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import loginUrl from "../../assets/animations/Login.lottie?url";
import styles from "./Login.module.css";

function Login() {
  const navigate = useNavigate();
  const { login, updateUser } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rememberMe, setRememberMeState] = useState(true);

  // Check for LinkedIn OAuth redirect tokens in URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get("access");
    const refresh = params.get("refresh");
    const code = params.get("code");
    const state = params.get("state");

    const processTokens = (access_token, refresh_token, decoded_override = {}) => {
      setAccessToken(access_token);
      if (refresh_token) setRefreshToken(refresh_token);
      
      const decoded = parseJwt(access_token) || {};
      const firstName = decoded_override.firstName || params.get("firstName") || decoded.first_name || decoded.firstName || "";
      const lastName = decoded_override.lastName || params.get("lastName") || decoded.last_name || decoded.lastName || "";
      const email = decoded_override.email || params.get("email") || decoded.email || "linkedin_user@sureproed.com";
      const role = decoded_override.role || decoded.role || "STUDENT";
      
      const userObj = {
        id: decoded_override.id || decoded.user_id || decoded.id || undefined,
        email,
        first_name: firstName,
        last_name: lastName,
        firstName,
        lastName,
        role,
      };
      
      setUserInfo(userObj);
      updateUser(userObj);
      window.history.replaceState({}, "", "/login");
      
      // Route based on role
      setTimeout(() => {
        const returnUrl = params.get("returnUrl");
        if (returnUrl && returnUrl.startsWith("/student/") && role === "STUDENT") {
          navigate(returnUrl, { replace: true });
        } else if (role === "ADMIN") navigate("/admin/dashboard", { replace: true });
        else if (role === "MENTOR") navigate("/mentor/dashboard", { replace: true });
        else if (role === "VOLUNTEER") navigate("/trustee/volunteer/dashboard", { replace: true });
        else if (role === "TRUSTEE") navigate("/trustee/commercial/dashboard", { replace: true });
        else navigate("/student/profile", { replace: true });
      }, 500);
    };

    if (access) {
      processTokens(access, refresh);
    }
  }, [navigate, updateUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setSuccess(false);
    
    try {
      const res = await login(username, password, rememberMe);
      const userRole = res?.user?.role;
      setSuccess(true);
      
      // Delay navigation slightly for success animation
      setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const returnUrl = params.get("returnUrl");
        
        // Safe internal redirect check
        if (returnUrl && returnUrl.startsWith("/student/") && userRole === "STUDENT") {
          navigate(returnUrl);
          return;
        }

        if (userRole === "ADMIN") {
          navigate("/admin/dashboard");
        } else if (userRole === "MENTOR") {
          navigate("/mentor/dashboard");
        } else if (userRole === "VOLUNTEER") {
          navigate("/trustee/volunteer/dashboard");
        } else if (userRole === "TRUSTEE") {
          navigate("/trustee/commercial/dashboard");
        } else {
          navigate("/student/profile");
        }
      }, 800);
      
    } catch (err) {
      console.error("Login error:", err);
      const resData = err.response?.data;
      let msg = "Invalid credentials. Please try again.";
      if (resData) {
        if (typeof resData === "string") {
          msg = resData;
        } else if (resData.detail) {
          msg = resData.detail;
        } else if (resData.non_field_errors) {
          msg = Array.isArray(resData.non_field_errors)
            ? resData.non_field_errors.join(" ")
            : resData.non_field_errors;
        } else if (typeof resData === "object") {
          msg = Object.entries(resData)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`)
            .join(" | ");
        }
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
      setLoading(false);
    }
  };

  const handleLinkedInAuth = async () => {
    setError("");
    try {
      const data = await authService.getLinkedInConnectUrl();
      const targetUrl = data?.authorization_url || data?.auth_url;
      if (targetUrl) {
        window.location.href = targetUrl;
      } else {
        setError("Could not retrieve LinkedIn authorization URL.");
      }
    } catch (err) {
      console.error("LinkedIn Auth Error:", err);
      setError("Failed to connect to LinkedIn OAuth provider.");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginWrapper}>
        <div className={styles.leftSide}>
          <motion.div 
            className={styles.heroContent}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2>Welcome back to SURE ProEd</h2>
            <p>Access your dashboard to manage your learning journey, internships, and schedules.</p>
            <div style={{ position: "relative", width: "100%", maxWidth: "420px", margin: "0 auto" }}>
              <motion.div animate={{ y: [0, -10, 0], x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }} style={{ position: "absolute", top: "5%", left: "-3%", color: "var(--accent-color)", fontSize: "2rem", opacity: 0.6, zIndex: 0 }}>
                <FaGraduationCap />
              </motion.div>
              <motion.div animate={{ y: [0, 15, 0], x: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }} style={{ position: "absolute", top: "15%", right: "-3%", color: "var(--primary-color)", fontSize: "1.8rem", opacity: 0.55, zIndex: 0 }}>
                <FaMicrochip />
              </motion.div>
              <motion.div animate={{ y: [0, -20, 0] }} transition={{ repeat: Infinity, duration: 7, ease: "easeInOut", delay: 2 }} style={{ position: "absolute", bottom: "15%", left: "-3%", color: "var(--primary-hover)", fontSize: "1.8rem", opacity: 0.6, zIndex: 0 }}>
                <FaLaptopCode />
              </motion.div>
              <motion.div animate={{ y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 0.5 }} style={{ position: "absolute", bottom: "20%", right: "-3%", color: "var(--accent-color)", fontSize: "2rem", opacity: 0.55, zIndex: 0 }}>
                <FaBrain />
              </motion.div>
              <motion.div
                animate={{ y: [0, -15, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                whileHover={{ scale: 1.05, filter: "drop-shadow(0 20px 25px rgba(0,0,0,0.2))" }}
                style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "420px", margin: "0 auto", cursor: "pointer" }}
              >
                <DotLottieReact src={loginUrl} loop autoplay />
              </motion.div>
            </div>
          </motion.div>
        </div>

        <div className={styles.card}>
          <div className={styles.formContainer}>
            <div className={styles.cardHeader}>
            <h1>Sign In</h1>
            <p className={styles.subtitle}>Enter your credentials to access your account.</p>
          </div>

          <div className={`${styles.errorToast} ${error ? styles.showError : ''}`}>
            {error}
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <div className={styles.floatingInput}>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder=" "
                  required
                  disabled={loading || success}
                />
                <label htmlFor="username">Email address</label>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <div className={styles.floatingInput}>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                  required
                  disabled={loading || success}
                />
                <label htmlFor="password">Password</label>
                <button 
                  type="button" 
                  className={styles.passwordToggle} 
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex="-1"
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className={styles.rememberRow}>
              <label className={styles.checkboxLabel}>
                <input 
                  type="checkbox" 
                  checked={rememberMe} 
                  onChange={(e) => setRememberMeState(e.target.checked)} 
                  disabled={loading || success}
                />
                Remember Me
              </label>
              <div className={styles.forgotPassword}>
                <Link to="/forgot-password" tabIndex="-1">Forgot password?</Link>
              </div>
            </div>

            <button
              type="submit"
              className={`${styles.loginBtn} ${loading ? styles.loadingBtn : ''} ${success ? styles.successBtn : ''}`}
              disabled={loading || success}
            >
              <span className={styles.btnText}>
                {success ? "Success!" : loading ? "Authenticating" : "Sign In"}
              </span>
              {loading && !success && (
                <div className={styles.loadingDots}>
                  <span></span><span></span><span></span>
                </div>
              )}
            </button>
          </form>

          <div className={styles.divider}>
            <span>Or continue with</span>
          </div>

          <button className={styles.linkedinBtn} onClick={handleLinkedInAuth} type="button" disabled={loading || success}>
            <FaLinkedin className={styles.linkedinIcon} />
            <span>LinkedIn</span>
          </button>

          <div className={styles.footerInfo}>
            <div className={styles.signupLinkWrapper}>
            Don't have an account?{" "}
            <span
              className={styles.signupLink}
              onClick={() => {
                const returnUrl = new URLSearchParams(window.location.search).get("returnUrl");
                navigate(returnUrl ? `/signup?returnUrl=${encodeURIComponent(returnUrl)}` : "/signup");
              }}
            >
              Sign up here
            </span>
          </div>
            <Link to="/" className={styles.homeLink}>
              Return to Home
            </Link>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;