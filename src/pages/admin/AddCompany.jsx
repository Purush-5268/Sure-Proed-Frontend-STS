import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddCompany.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AddCompany() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    user: "",
    name: "",
    description: "",
    website: "",
    industry: "",
    location: "",
    is_verified: false,
  });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.USERS.BASE);
        setUsers(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error("Failed to load users for company form:", err);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name.trim() || !form.user) {
      setError("Please provide a company name and a linked user account.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        user: form.user,
        name: form.name.trim(),
        description: form.description.trim() || null,
        website: form.website.trim() || null,
        industry: form.industry.trim() || null,
        location: form.location.trim() || null,
        is_verified: form.is_verified,
      };

      await apiClient.post(API_ENDPOINTS.COMPANIES.BASE, payload);
      setSuccess("Company created successfully.");
      navigate("/admin/companies");
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Unable to create the company right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <h1>Add Company</h1>

        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {success ? <p style={{ color: "#166534" }}>{success}</p> : null}

        {loadingUsers ? (
          <SkeletonLoader variant="form" rows={3} />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.grid}>
              <div>
                <label>Company Name</label>
                <input type="text" name="name" value={form.name} onChange={handleChange} required />
              </div>

              <div>
                <label>Linked User</label>
                <select name="user" value={form.user} onChange={handleChange} required>
                  <option value="">Select a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.first_name || user.email} {user.last_name ? `(${user.last_name})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Location</label>
                <input type="text" name="location" value={form.location} onChange={handleChange} />
              </div>

              <div>
                <label>Website</label>
                <input type="url" name="website" value={form.website} onChange={handleChange} />
              </div>

              <div>
                <label>Industry</label>
                <input type="text" name="industry" value={form.industry} onChange={handleChange} />
              </div>

              <div>
                <label>
                  <input type="checkbox" name="is_verified" checked={form.is_verified} onChange={handleChange} />
                  Verified
                </label>
              </div>
            </div>

            <div>
              <label>Description</label>
              <textarea name="description" rows="4" value={form.description} onChange={handleChange} />
            </div>

            <div className={styles.buttons}>
              <button type="button" onClick={() => navigate("/admin/companies")} style={{ backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", marginRight: "1rem" }}>
                Cancel
              </button>
              <button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Add Company"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default AddCompany;
