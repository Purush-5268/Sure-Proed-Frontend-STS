import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./EditCompany.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditCompany() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState({
    user: "",
    name: "",
    description: "",
    website: "",
    industry: "",
    location: "",
    is_verified: false,
  });
  const [logo, setLogo] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [companyResponse, usersResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COMPANIES.BY_ID(id)),
          apiClient.get(API_ENDPOINTS.USERS.BASE),
        ]);

        const company = companyResponse.data || {};
        setForm({
          user: company.user || "",
          name: company.name || "",
          description: company.description || "",
          website: company.website || "",
          industry: company.industry || "",
          location: company.location || "",
          is_verified: Boolean(company.is_verified),
        });
        setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);
      } catch (err) {
        console.error("Failed to load company data:", err);
        setError("Unable to load the company details.");
      } finally {
        setLoadingData(false);
      }
    };

    if (id) {
      loadData();
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setLogo(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Please provide a company name.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      if (form.user) {
        formData.append("user", form.user);
      }
      formData.append("name", form.name.trim());
      // For PUT, we append fields. If they are empty, we might need to send empty string or handle null
      formData.append("description", form.description.trim());
      formData.append("website", form.website.trim());
      formData.append("industry", form.industry.trim());
      formData.append("location", form.location.trim());
      formData.append("is_verified", form.is_verified);
      
      if (logo) {
        formData.append("logo", logo);
      }

      await apiClient.put(API_ENDPOINTS.COMPANIES.BY_ID(id), formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setSuccess("Company updated successfully.");
      navigate("/admin/companies");
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Unable to update the company right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <h1>Edit Company</h1>

        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {success ? <p style={{ color: "#166534" }}>{success}</p> : null}

        {loadingData ? (
          <SkeletonLoader variant="form" rows={5} />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.grid}>
              <div>
                <label>Company Name</label>
                <input type="text" name="name" value={form.name} onChange={handleChange} required />
              </div>

              <div>
                <label>Linked User (Optional)</label>
                <select name="user" value={form.user} onChange={handleChange}>
                  <option value="">Select a user (Optional)</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.first_name || user.email} {user.last_name ? `(${user.last_name})` : ""}
                    </option>
                  ))}
                </select>
                <small style={{ color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                  Leave this blank if you are only editing the company for the Partners page showcase.
                </small>
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

            <div>
              <label>Company Logo</label>
              <input type="file" name="logo" accept="image/*" onChange={handleFileChange} />
              <small style={{ color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                Optional. Upload a new image to replace the existing logo.
              </small>
            </div>

            <div className={styles.buttons}>
              <button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Update Company"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default EditCompany;
