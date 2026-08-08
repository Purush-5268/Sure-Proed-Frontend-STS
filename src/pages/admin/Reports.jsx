import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Reports.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadReports = async () => {
      try {
        const [studentsResponse, applicationsResponse, coursesResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.STUDENTS.BASE),
          apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE),
          apiClient.get(API_ENDPOINTS.COURSES.BASE),
        ]);

        if (isMounted) {
          setReports([
            {
              title: "Student Report",
              description: `${Array.isArray(studentsResponse.data) ? studentsResponse.data.length : 0} student profiles currently stored.`,
              link: "/admin/students",
            },
            {
              title: "Course Report",
              description: `${Array.isArray(coursesResponse.data) ? coursesResponse.data.length : 0} courses available in the database.`,
              link: "/admin/courses",
            },
            {
              title: "Application Report",
              description: `${Array.isArray(applicationsResponse.data) ? applicationsResponse.data.length : 0} applications currently recorded.`,
              link: "/admin/applications",
            },
            {
              title: "Student Queries",
              description: `View and resolve student absence warnings and apologies.`,
              link: "/admin/student-queries",
            },
          ]);
        }
      } catch (err) {
        console.error("Failed to load reports:", err);
        if (isMounted) setReports([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadReports();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Reports & Analytics</h1>
          <p className="premium-subtitle">View system reports and analytics.</p>
        </div>
      </div>

      {loading ? (
        <div className="premium-card premium-card-large skeleton-shimmer" style={{ height: "400px" }}></div>
      ) : reports.length === 0 ? (
        <div className="premium-empty-state">
          <span className="premium-empty-state-icon">📊</span>
          <h3>No Reports Available</h3>
          <p>There is no report data to display at this time.</p>
        </div>
      ) : (
        <div className="premium-grid-2">
          {reports.map((report, index) => (
            <div key={index} className="premium-card">
              <h2 className="premium-title" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{report.title}</h2>
              <p className="premium-subtitle" style={{ marginBottom: "1.5rem" }}>{report.description}</p>
              <Link to={report.link} className="premium-btn premium-btn-primary">View Report</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Reports;