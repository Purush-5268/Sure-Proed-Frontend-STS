import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./CompanyDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CompanyDetails() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COMPANIES.BY_ID(id));
        setCompany(response.data || null);
      } catch (err) {
        console.error("Failed to load company details:", err);
        setError("Unable to load the company details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadCompany();
    }
  }, [id]);

  if (loading) return <div className={styles.container}><div className="premium-card"><h1>Company Details</h1><SkeletonLoader variant="detail" /></div></div>;
  if (error) return <div className={styles.container}><div className="premium-card"><h1>Company Details</h1><p style={{ color: "#b91c1c" }}>{error}</p></div></div>;
  if (!company) return <div className={styles.container}><div className="premium-card"><h1>Company Details</h1><p>No company data found.</p></div></div>;

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <h1>Company Details</h1>

        <div className={styles.info}>
          <div>
            <span>Company Name</span>
            <h3>{company.name}</h3>
          </div>

          <div>
            <span>Location</span>
            <h3>{company.location || "N/A"}</h3>
          </div>

          <div>
            <span>Website</span>
            <h3>{company.website || "N/A"}</h3>
          </div>

          <div>
            <span>Industry</span>
            <h3>{company.industry || "N/A"}</h3>
          </div>

          <div>
            <span>Description</span>
            <h3>{company.description || "N/A"}</h3>
          </div>

          <div>
            <span>Status</span>
            <h3 className={company.is_verified ? styles.active : styles.inactive}>
              {company.is_verified ? "Verified" : "Pending"}
            </h3>
          </div>
        </div>

        <div className={styles.buttons}>
          <Link to={`/admin/edit-company/${company.id}`} className={styles.edit}>
            Edit Company
          </Link>

          <Link to="/admin/companies" className={styles.back}>
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CompanyDetails;
