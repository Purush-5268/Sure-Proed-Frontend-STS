import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./CohortDetails.module.css";
import { FiUsers, FiBook, FiCalendar, FiArrowLeft, FiAlertCircle } from "react-icons/fi";

function CohortDetails() {
  const { id } = useParams();
  const [cohort, setCohort] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchCohortDetails = async () => {
      try {
        setLoading(true);
        // Fetch Cohort Details
        const cohortRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id));
        if (isMounted) setCohort(cohortRes.data);

        // Fetch Enrolled Students for this cohort
        const studentsRes = await apiClient.get(API_ENDPOINTS.COHORTS.STUDENTS(id));
        if (isMounted) {
          const arr = Array.isArray(studentsRes.data?.results) ? studentsRes.data.results : (Array.isArray(studentsRes.data) ? studentsRes.data : []);
          setStudents(arr);
        }
      } catch (err) {
        console.error("Failed to fetch cohort details:", err);
        if (isMounted) setError("Failed to load cohort details. You may not have permission to view this cohort.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (id) {
      fetchCohortDetails();
    }
    return () => { isMounted = false; };
  }, [id]);

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE': return <Badge variant="success">Active</Badge>;
      case 'OPEN': return <Badge variant="primary">Open</Badge>;
      case 'COMPLETED': return <Badge variant="default">Completed</Badge>;
      case 'CANCELLED': return <Badge variant="error">Cancelled</Badge>;
      default: return <Badge variant="default">{status || 'Draft'}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <PageHeader title="Cohort Details" description="Loading cohort information..." />
        <SkeletonLoader width="100%" height="300px" borderRadius="12px" />
      </div>
    );
  }

  if (error || !cohort) {
    return (
      <div className={styles.container}>
        <PageHeader title="Cohort Details" />
        <EmptyState 
          icon={<FiAlertCircle />} 
          title="Cohort Not Found" 
          description={error || "The requested cohort does not exist or you do not have permission to view it."}
          action={<Link to="/mentor/cohorts" className="premium-btn">Return to My Cohorts</Link>}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div style={{ marginBottom: "24px" }}>
        <Link to="/mentor/cohorts" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500" }}>
          <FiArrowLeft /> Back to My Cohorts
        </Link>
      </div>

      <Card className={styles.detailsCard} style={{ padding: "32px", marginBottom: "32px" }}>
        <div className={styles.header} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ margin: "0 0 8px 0", color: "var(--text-primary)", fontSize: "24px" }}>{cohort.name}</h1>
            <span style={{ color: "var(--text-secondary)", fontFamily: "monospace", background: "var(--bg-nested)", padding: "4px 8px", borderRadius: "4px" }}>{cohort.code}</span>
          </div>
          <div>
            {getStatusBadge(cohort.status)}
          </div>
        </div>

        <div className="premium-grid-2">
          <div className="premium-form-group">
            <label className="premium-label"><FiBook /> Course</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {cohort.course_name || cohort.course?.name || "General Course"}
            </div>
          </div>

          <div className="premium-form-group">
            <label className="premium-label"><FiUsers /> Total Enrolled</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {students.length} / {cohort.max_students || "∞"} Students
            </div>
          </div>

          <div className="premium-form-group">
            <label className="premium-label"><FiCalendar /> Start Date</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {cohort.start_date ? new Date(cohort.start_date).toLocaleDateString() : "TBD"}
            </div>
          </div>

          <div className="premium-form-group">
            <label className="premium-label"><FiCalendar /> End Date</label>
            <div className="premium-input" style={{ background: "var(--bg-nested)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "8px", cursor: "default" }}>
              {cohort.end_date ? new Date(cohort.end_date).toLocaleDateString() : "TBD"}
            </div>
          </div>
        </div>
      </Card>

      <h2 style={{ marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)", fontSize: "20px" }}>Enrolled Students</h2>
      
      {students.length === 0 ? (
        <EmptyState 
          icon={<FiUsers />}
          title="No Students Enrolled"
          description="There are currently no students assigned to this cohort."
        />
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>College</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map(student => (
                <tr key={student.id}>
                  <td style={{ fontWeight: "500", color: "var(--text-primary)" }}>{student.first_name} {student.last_name}</td>
                  <td>{student.email || student.user?.email || "N/A"}</td>
                  <td>{student.college || "N/A"}</td>
                  <td>
                    {student.status === "ADMIN_APPROVED" ? <Badge variant="success">Active</Badge> : <Badge variant="default">{student.status}</Badge>}
                  </td>
                  <td>
                    <Link to={`/mentor/students/${student.id}`} style={{ color: "var(--primary-color)", fontWeight: "600", textDecoration: "none" }}>
                      View Profile
                    </Link>
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

export default CohortDetails;