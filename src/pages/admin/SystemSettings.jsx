import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import styles from "./SystemSettings.module.css";
import ThemeToggle from "../../components/common/ThemeToggle";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import apiClient from "../../services/apiClient";
import { FaTrash, FaPlus } from "react-icons/fa";

function SystemSettings() {
  const [tickers, setTickers] = useState([]);
  const [newTicker, setNewTicker] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTickers();
  }, []);

  const fetchTickers = async () => {
    try {
      const res = await apiClient.get("/system-information/SCROLLING_TICKER/");
      if (res.data && res.data.value) {
        setTickers(JSON.parse(res.data.value));
      }
    } catch (err) {
      if (err.response?.status === 404) {
        // Default fallbacks if not found
        setTickers([
          "🔥 Registrations are now OPEN for the upcoming batch!",
          "🚀 Welcome to SURE ProEd - Empowering your career journey.",
        ]);
      } else {
        console.error("Failed to fetch tickers", err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddTicker = () => {
    if (newTicker.trim()) {
      setTickers([...tickers, newTicker.trim()]);
      setNewTicker("");
    }
  };

  const handleRemoveTicker = (index) => {
    setTickers(tickers.filter((_, i) => i !== index));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        key: "SCROLLING_TICKER",
        value: JSON.stringify(tickers),
        is_active: true
      };
      
      // Try to GET to see if it exists, if not POST, else PATCH
      try {
        await apiClient.get("/system-information/SCROLLING_TICKER/");
        await apiClient.patch("/system-information/SCROLLING_TICKER/", payload);
      } catch (err) {
        if (err.response?.status === 404) {
          await apiClient.post("/system-information/", payload);
        } else {
          throw err;
        }
      }
      alert("Settings saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>System Settings</h1>

          <Link to="/admin/settings">
            Back
          </Link>
        </div>

        {loading ? (
          <SkeletonLoader count={4} />
        ) : (
          <form className={styles.form} onSubmit={handleSave}>
            
            <div className={styles.group} style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "16px", fontWeight: "bold", color: "var(--primary-color)", marginBottom: "15px", display: "block" }}>
                Public Announcement Banner (Scrolling Ticker)
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "15px" }}>
                {tickers.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>No announcements currently showing.</span>}
                {tickers.map((t, index) => (
                  <div key={index} style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--bg-card)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    <span style={{ flex: 1, fontSize: "14px", color: "var(--text-primary)" }}>{t}</span>
                    <button type="button" onClick={() => handleRemoveTicker(index)} style={{ color: "var(--status-danger, #ef4444)", background: "none", border: "none", cursor: "pointer", padding: "5px" }}>
                      <FaTrash size={14} />
                    </button>
                  </div>
                ))}
              </div>
              
              <div style={{ display: "flex", gap: "10px" }}>
                <input 
                  type="text" 
                  value={newTicker} 
                  onChange={(e) => setNewTicker(e.target.value)} 
                  placeholder="e.g. 🚀 Check out our new Upcoming Cohorts!" 
                  style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                />
                <button type="button" onClick={handleAddTicker} style={{ padding: "0 20px", flex: "none", background: "var(--primary-color)", color: "white", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}>
                  <FaPlus size={12} style={{ marginRight: "5px" }} /> Add
                </button>
              </div>
            </div>
            <hr style={{ gridColumn: "1 / -1", margin: "10px 0", borderTop: "1px solid var(--border-color)", opacity: 0.5 }} />
            <div className={styles.group}>
              <label>Application Name</label>
              <input
                type="text"
                defaultValue="Student Tracking Application"
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)" }}
              />
            </div>

            <div className={styles.group}>
              <label>Default Language</label>

              <select defaultValue="English" style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)" }}>
                <option>English</option>
                <option>Telugu</option>
                <option>Hindi</option>
              </select>
            </div>

            <div className={styles.group}>
              <label>Timezone</label>

              <select defaultValue="Asia/Kolkata" style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)" }}>
                <option>Asia/Kolkata</option>
                <option>UTC</option>
              </select>
            </div>

            <div className={styles.group}>
              <ThemeToggle />
            </div>

            <div className={styles.group}>
              <label>Maintenance Mode</label>

              <select defaultValue="Disabled" style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)" }}>
                <option>Disabled</option>
                <option>Enabled</option>
              </select>
            </div>

            <button type="submit" disabled={saving} style={{ padding: "12px 20px", background: "var(--primary-color)", color: "white", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", width: "100%", marginTop: "15px" }}>
              {saving ? "Saving..." : "Save Settings"}
            </button>

          </form>
        )}
      </div>
    </div>
  );
}

export default SystemSettings;