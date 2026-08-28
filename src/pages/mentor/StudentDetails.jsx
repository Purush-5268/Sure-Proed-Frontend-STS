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
  const [activeTab, setActiveTab] = useState("overview");
  const [certificates, setCertificates] = useState([]);
  const [certsLoading, setCertsLoading] = useState(false);

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

  useEffect(() => {
    let isMounted = true;
    const fetchCertificates = async () => {
      if (activeTab === "certificates") {
        try {
          setCertsLoading(true);
          const data = await fetchAllPages(API_ENDPOINTS.CERTIFICATES.BASE);
          // Filter locally because the backend endpoint does not support ?student=id directly
          const studentCerts = data.filter(c => String(c.student?.id) === String(id) || String(c.student) === String(id));
          if (isMounted) {
            setCertificates(studentCerts);
          }
        } catch (err) {
          console.error("Failed to load certificates:", err);
        } finally {
          if (isMounted) setCertsLoading(false);
        }
      }
    };
    fetchCertificates();
    return () => { isMounted = false; };
  }, [id, activeTab]);

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

      <div className={styles.tabs} style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--border-color)", marginBottom: "2rem" }}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.active : ''}`}
          onClick={() => setActiveTab('overview')}
          style={{ padding: "0.5rem 1rem", border: "none", background: "none", cursor: "pointer", borderBottom: activeTab === 'overview' ? "2px solid var(--primary-color)" : "none", color: activeTab === 'overview' ? "var(--primary-color)" : "var(--text-secondary)", fontWeight: activeTab === 'overview' ? "600" : "400" }}
        >
          Overview
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'certificates' ? styles.active : ''}`}
          onClick={() => setActiveTab('certificates')}
          style={{ padding: "0.5rem 1rem", border: "none", background: "none", cursor: "pointer", borderBottom: activeTab === 'certificates' ? "2px solid var(--primary-color)" : "none", color: activeTab === 'certificates' ? "var(--primary-color)" : "var(--text-secondary)", fontWeight: activeTab === 'certificates' ? "600" : "400" }}
        >
          Certificates
        </button>
      </div>

      <Card className={styles.detailsCard} style={{ padding: "32px", marginBottom: "32px" }}>
        {activeTab === 'overview' && (
          <>
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
          </>
        )}

        {activeTab === 'certificates' && (
          <div>
            {certsLoading ? (
              <SkeletonLoader width="100%" height="150px" borderRadius="12px" />
            ) : certificates.length === 0 ? (
              <EmptyState 
                icon={<FiAward />} 
                title="No Certificates" 
                description="This student has not earned any certificates yet." 
              />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
                {certificates.map(cert => (
                  <Card key={cert.id} hoverable style={{ padding: "1.5rem", borderLeft: "4px solid var(--primary-color)" }}>
                    <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-primary)" }}>{cert.title || cert.certificate_type}</h3>
                    <p style={{ margin: "0 0 1rem 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      Number: <span style={{ fontFamily: "monospace" }}>{cert.certificate_number}</span>
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Badge variant={cert.status === "ACTIVE" ? "success" : "default"}>{cert.status}</Badge>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {new Date(cert.issued_at).toLocaleDateString()}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default StudentDetails;