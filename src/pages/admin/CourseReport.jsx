import { Link } from "react-router-dom";
import styles from "./CourseReport.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CourseReport() {
  const report = {
    totalCourses: 18,
    activeCourses: 12,
    enrolledStudents: 520,
    completedCourses: 286,
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <h1 className="premium-title">Course Report</h1>
        <Link to="/admin/reports" className="premium-btn premium-btn-secondary">
          Back
        </Link>
      </div>

      <div className="premium-grid-2">

        <div className="premium-card">
          <h2 className="premium-subtitle">Total Courses</h2>
          <span className="premium-title">{report.totalCourses}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Active Courses</h2>
          <span className="premium-title">{report.activeCourses}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Enrolled Students</h2>
          <span className="premium-title">{report.enrolledStudents}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Course Completions</h2>
          <span className="premium-title">{report.completedCourses}</span>
        </div>

      </div>
    </div>
  );
}

export default CourseReport;