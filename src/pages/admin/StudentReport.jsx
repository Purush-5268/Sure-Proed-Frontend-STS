import { Link } from "react-router-dom";
import styles from "./StudentReport.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function StudentReport() {
  const report = {
    totalStudents: 520,
    activeStudents: 468,
    completedCourses: 312,
    placements: 186,
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <h1 className="premium-title">Student Report</h1>
        <Link to="/admin/reports" className="premium-btn premium-btn-secondary">
          Back
        </Link>
      </div>

      <div className="premium-grid-2">

        <div className="premium-card">
          <h2 className="premium-subtitle">Total Students</h2>
          <span className="premium-title">{report.totalStudents}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Active Students</h2>
          <span className="premium-title">{report.activeStudents}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Completed Courses</h2>
          <span className="premium-title">{report.completedCourses}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Placements</h2>
          <span className="premium-title">{report.placements}</span>
        </div>

      </div>
    </div>
  );
}

export default StudentReport;