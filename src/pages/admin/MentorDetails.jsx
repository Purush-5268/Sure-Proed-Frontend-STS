import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./MentorDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function MentorDetails() {
  const { id } = useParams();
  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadMentor = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.USERS.BY_ID(id));
        setMentor(response.data || null);
      } catch (err) {
        console.error("Failed to load mentor details:", err);
        setError("Unable to load mentor details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadMentor();
    }
  }, [id]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="premium-card">
          <h1>Mentor Details</h1>
          <SkeletonLoader variant="detail" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className="premium-card">
          <h1>Mentor Details</h1>
          <p style={{ color: "#b91c1c" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!mentor) {
    return (
      <div className={styles.page}>
        <div className="premium-card">
          <h1>Mentor Details</h1>
          <p>No mentor found.</p>
        </div>
      </div>
    );
  }

  const fullName = `${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email;

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <div className={styles.header}>
          <h1>Mentor Details</h1>
          <Link to="/admin/mentors" className={styles.backBtn}>← Back</Link>
        </div>

        <div className={styles.profile}>
          <div className={styles.avatar}>{fullName.charAt(0).toUpperCase()}</div>
          <div>
            <h2>{fullName}</h2>
            <p>{mentor.role === "MENTOR" ? "Mentor account" : mentor.role}</p>
          </div>
        </div>

        <div className={styles.infoGrid}>
          <div className={styles.item}>
            <h3>Mentor ID</h3>
            <p>{mentor.id?.slice(0, 8) || "N/A"}</p>
          </div>
          <div className={styles.item}>
            <h3>Email</h3>
            <p>{mentor.email}</p>
          </div>
          <div className={styles.item}>
            <h3>Phone</h3>
            <p>{mentor.phone_number || "N/A"}</p>
          </div>
          <div className={styles.item}>
            <h3>Status</h3>
            <p className={mentor.is_active ? styles.active : styles.inactive}>{mentor.is_active ? "Active" : "Inactive"}</p>
          </div>
        </div>

        <div className={styles.buttons}>
          <Link to={`/admin/edit-mentor/${mentor.id}`} className={styles.editBtn}>Edit Mentor</Link>
          <Link to="/admin/mentors" className={styles.cancelBtn}>Back</Link>
        </div>
      </div>
    </div>
  );
}

export default MentorDetails;
