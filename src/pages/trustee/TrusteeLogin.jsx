import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./TrusteeLogin.module.css";

function TrusteeLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await login(username, password);
      const userRole = res?.user?.role;

      if (userRole === "TRUSTEE") {
        navigate("/trustee/commercial/dashboard");
      } else if (userRole === "VOLUNTEER") {
        navigate("/trustee/volunteer/dashboard");
      } else {
        setError(
          `Login successful, but your account role is '${userRole}'. Trustee or Volunteer privileges required.`
        );
      }
    } catch (err) {
      console.error("Trustee Login Error:", err);
      const resData = err.response?.data;
      let msg = "Invalid Trustee Credentials";
      if (resData) {
        if (typeof resData === "string") {
          msg = resData;
        } else if (resData.detail) {
          msg = resData.detail;
        } else if (resData.non_field_errors) {
          msg = Array.isArray(resData.non_field_errors)
            ? resData.non_field_errors.join(" ")
            : resData.non_field_errors;
        }
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Animated background orbs */}
      <div className={styles.orbOne} />
      <div className={styles.orbTwo} />

      <div className="premium-card">
        <div className={styles.cardHeader}>
          <div className={styles.iconBadge}>🛡️</div>
          <h1>Trustee Portal</h1>
          <p>
            Secure access for board trustees, volunteer coordinators, and
            board advisors.
          </p>
        </div>

        {error && <div className={styles.errorBar}>❌ {error}</div>}

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.group}>
            <label htmlFor="trustee-email">Email Address</label>
            <input
              id="trustee-email"
              type="text" className="premium-input" placeholder="Enter your trustee email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="trustee-password">Password</label>
            <input
              id="trustee-password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className={styles.button}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : null}
            {loading ? "Authenticating..." : "Sign In"}
          </button>

          <p className={styles.backLink}>
            <Link to="/">← Back to Home</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default TrusteeLogin;
