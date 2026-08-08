import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./StudentDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function StudentDetails() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadStudent = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.STUDENTS.BY_ID(id));
        setStudent(response.data || null);
      } catch (err) {
        console.error("Failed to load student:", err);
        setError("Unable to load student details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadStudent();
    }
  }, [id]);

  if (loading) return <div className={styles.page}><div className="premium-card"><h1>Student Details</h1><SkeletonLoader variant="detail" /></div></div>;
  if (error) return <div className={styles.page}><div className="premium-card"><h1>Student Details</h1><p style={{ color: "#b91c1c" }}>{error}</p></div></div>;
  if (!student) return <div className={styles.page}><div className="premium-card"><h1>Student Details</h1><p>No student found.</p></div></div>;

  const user = student.user || {};
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Unknown";

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>Student Details</h1>
        <div className={styles.profile}>
          <div className={styles.avatar}>{fullName.charAt(0).toUpperCase()}</div>
          <div>
            <h2>{fullName}</h2>
            <p>{student.college || "Student profile"}</p>
          </div>
        </div>
        <div className={styles.info}>
          <div><strong>Email</strong><p>{user.email || "N/A"}</p></div>
          <div><strong>Phone</strong><p>{user.phone_number || "N/A"}</p></div>
          <div><strong>College</strong><p>{student.college || "N/A"}</p></div>
          <div><strong>Degree</strong><p>{student.degree || "N/A"}</p></div>
          <div><strong>Status</strong><p className="premium-badge premium-badge-active">{student.status || "AVAILABLE"}</p></div>
        </div>
        <div className={styles.buttons}>
          <Link to={`/admin/edit-student/${student.id}`} className={styles.edit}>Edit Student</Link>
          <Link to="/admin/students" className={styles.back}>Back</Link>
        </div>
      </div>
    </div>
  );
}

export default StudentDetails;
