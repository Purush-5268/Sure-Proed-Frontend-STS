import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./StudentDetails.module.css";
import { FiUser, FiMail, FiPhone, FiBook, FiUsers, FiAward, FiArrowLeft, FiAlertCircle, FiCheckCircle } from "react-icons/fi";

function StudentDetails() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchStudentDetails = async () => {
      try {
        setLoading(true);
        // Fetch Student Profile
        const res = await apiClient.get(API_ENDPOINTS.STUDENTS.BY_ID(id));
        if (isMounted) setStudent(res.data);
      } catch (err) {
        console.error("Failed to fetch student details:", err);
        if (isMounted) setError("Failed to load student details. You may not have permission to view this student.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (id) {
      fetchStudentDetails();
    }
    return () => { isMounted = false; };
  }, [id]);

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'ADMIN_APPROVED': return <Badge variant="success">Active</Badge>;
      case 'SUSPENDED': return <Badge variant="error">Suspended</Badge>;
      case 'DROPPED': return <Badge variant="error">Dropped</Badge>;
      default: return <Badge variant="default">{status || 'Pending'}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <PageHeader title="Student Details" description="Loading student information..." />
        <SkeletonLoader width="100%" height="400px" borderRadius="12px" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className={styles.container}>
        <PageHeader title="Student Details" />
        <EmptyState 
          icon={<FiAlertCircle />} 
          title="Student Not Found" 
          description={error || "The requested student does not exist or you do not have permission to view them."}
          action={<Link to="/mentor/students" className="premium-btn">Return to My Students</Link>}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div style={{ marginBottom: "24px" }}>
        <Link to="/mentor/students" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500" }}>
          <FiArrowLeft /> Back to My Students
        </Link>
      </div>

      <Card className={styles.detailsCard} style={{ padding: "32px", marginBottom: "32px" }}>
        <div className={styles.header} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", paddingBottom: "24px", borderBottom: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {student.profile_photo ? (
              <img src={student.profile_photo} alt="Profile" style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border-color)" }} />
            ) : (
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "var(--bg-nested)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", color: "var(--text-secondary)", border: "2px solid var(--border-color)" }}>
                <FiUser />
              </div>
            )}
            <div>
              <h1 style={{ margin: "0 0 8px 0", color: "var(--text-primary)", fontSize: "28px" }}>{student.first_name} {student.last_name}</h1>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)", fontFamily: "monospace", background: "var(--bg-nested)", padding: "4px 8px", borderRadius: "4px" }}>{student.student_code || "No Code"}</span>
                {getStatusBadge(student.status)}
              </div>
            </div>
          </div>
        </div>

        <h3 style={{ marginBottom: "16px", color: "var(--text-primary)", fontSize: "18px" }}>Contact & Academic Info</h3>
        <div className="premium-grid-2" style={{ marginBottom: "32px" }}>
          <div className="premium-form-group">
            <label className="premium-label"><FiMail /> Email</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {student.email || "N/A"}
            </div>
          </div>

          <div className="premium-form-group">
            <label className="premium-label"><FiPhone /> Phone</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {student.phone_number || "N/A"}
            </div>
          </div>

          <div className="premium-form-group">
            <label className="premium-label"><FiBook /> College</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {student.college || "N/A"}
            </div>
          </div>

          <div className="premium-form-group">
            <label className="premium-label"><FiAward /> Degree & Year</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {student.degree || "N/A"} ({student.graduation_year || "N/A"})
            </div>
          </div>
        </div>

        <h3 style={{ marginBottom: "16px", color: "var(--text-primary)", fontSize: "18px" }}>Enrollment Status</h3>
        <div className="premium-grid-2">
          <div className="premium-form-group">
            <label className="premium-label"><FiUsers /> Current Cohort</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {student.active_cohort?.name || student.cohort_code || "Not Assigned"}
            </div>
          </div>

          <div className="premium-form-group">
            <label className="premium-label"><FiCheckCircle /> Application Status</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {student.application_status || "No Application"}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default StudentDetails;