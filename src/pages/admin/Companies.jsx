import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Companies.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Companies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadCompanies = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COMPANIES.BASE);
        if (isMounted) setCompanies(normalizeListResponse(response.data));
      } catch (err) {
        console.error("Failed to load companies:", err);
        if (isMounted) setCompanies([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCompanies();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="premium-card" style={{ padding: "var(--space-2xl)" }}>
      <div className={styles.header} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-lg)", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "var(--font-2xl)", color: "var(--text-primary)", margin: 0 }}>Companies</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Manage hiring companies.</p>
        </div>

        <Link to="/admin/add-company" className="premium-btn premium-btn-primary" style={{ height: "40px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px", fontWeight: "bold" }}>+</span> Add Company
        </Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={4} />
      ) : companies.length === 0 ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon">🏢</div>
          <h3>No companies found</h3>
          <p>No companies have been added yet.</p>
          <Link to="/admin/add-company" className="premium-btn premium-btn-primary">Add Company</Link>
        </div>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Industry</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>{company.name}</td>
                  <td>{company.location || "N/A"}</td>
                  <td>{company.industry || "N/A"}</td>
                  <td>
                    <span className={company.is_verified ? "premium-badge premium-badge-active" : "premium-badge premium-badge-pending"}>
                      {company.is_verified ? "Verified" : "Pending"}
                    </span>
                  </td>

                  <td className="actions" style={{ display: "flex", gap: "8px" }}>
                    <Link to={`/admin/company-details/${company.id}`} className="premium-btn premium-btn-secondary" style={{ height: "32px", padding: "0 12px" }}>View</Link>
                    <Link to={`/admin/edit-company/${company.id}`} className="premium-btn premium-btn-secondary" style={{ height: "32px", padding: "0 12px" }}>Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Companies;
