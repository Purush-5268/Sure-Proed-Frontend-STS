import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./CertificatesAdmin.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CertificatesAdmin() {
  const [certificates, setCertificates] = useState([]);
  const [students, setStudents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [certificatesResponse, studentsResponse, applicationsResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.CERTIFICATES.BASE),
          apiClient.get(API_ENDPOINTS.STUDENTS.BASE),
          apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE),
        ]);

        if (isMounted) {
          setCertificates(Array.isArray(certificatesResponse.data) ? certificatesResponse.data : []);
          setStudents(Array.isArray(studentsResponse.data) ? studentsResponse.data : []);
          setApplications(Array.isArray(applicationsResponse.data) ? applicationsResponse.data : []);
        }
      } catch (err) {
        console.error("Failed to load certificates:", err);
        if (isMounted) {
          setCertificates([]);
          setStudents([]);
          setApplications([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const getStudentName = (studentId) => {
    const student = students.find((item) => item.id === studentId);
    if (!student) return "Unknown";
    return `${student.user?.first_name || ""} ${student.user?.last_name || ""}`.trim() || student.user?.email || student.student_code || "Unknown";
  };

  const getCourseName = (applicationId) => {
    const application = applications.find((item) => item.id === applicationId);
    return application?.course?.name || application?.course || "N/A";
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Certificate Management</h1>
          <p>Manage student certificates</p>
        </div>

        <Link to="/admin/add-certificate" className={styles.addBtn}>
          + Add Certificate
        </Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : certificates.length === 0 ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon">🎓</div>
          <h3>No Certificates Found</h3>
          <p>No certificates have been issued yet.</p>
        </div>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Issued On</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {certificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td>{getStudentName(certificate.student)}</td>
                  <td>{getCourseName(certificate.application)}</td>
                  <td>{formatDate(certificate.issued_at)}</td>

                  <td className={certificate.status === "ACTIVE" ? styles.issued : styles.pending}>
                    {certificate.status || "ACTIVE"}
                  </td>

                  <td className="actions" style={{ display: "flex", gap: "8px" }}>
                    <Link to="/admin/certificate-admin-details">View</Link>
                    <Link to="/admin/edit-certificate">Edit</Link>
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

export default CertificatesAdmin;