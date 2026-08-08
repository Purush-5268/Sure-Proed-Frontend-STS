import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./AdminLogin.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AdminLogin() {
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
      if (userRole === "ADMIN") {
        navigate("/admin/dashboard");
      } else {
        setError(`Log in successful, but your account role is '${userRole}'. Admin privileges required.`);
      }
    } catch (err) {
      console.error("Admin Login Error:", err);
      const resData = err.response?.data;
      let msg = "Invalid Admin Credentials";
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
      <div className="premium-card">

        <h1>Admin Login</h1>

        <p>
          Login to access the Sure ProEd Admin Portal.
        </p>

        {error && <div style={{ color: "#dc2626", marginBottom: "1rem", fontSize: "14px", backgroundColor: "var(--bg-nested)", padding: "0.5rem", borderRadius: "4px" }}>❌ {error}</div>}

        <form onSubmit={handleLogin}>

          <div className={styles.group}>
            <label>Username / Email</label>

            <input
              type="text" className="premium-input" placeholder="Enter Admin Email or 'admin'"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className={styles.group}>
            <label>Password</label>

            <input
              type="password"
              placeholder="Enter Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className={styles.button}
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <p style={{ marginTop: "1rem", textAlign: "center", fontSize: "13px" }}>
            <Link to="/login">← Back to Student Login</Link>
          </p>

        </form>

      </div>
    </div>
  );
}

export default AdminLogin;