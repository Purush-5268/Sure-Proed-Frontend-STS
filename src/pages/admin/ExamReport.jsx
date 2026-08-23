import { Link } from "react-router-dom";
import styles from "./ExamReport.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ExamReport() {
  const report = {
    totalExams: 24,
    completedExams: 19,
    passPercentage: "82%",
    averageScore: "74%",
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <h1 className="premium-title">Exam Report</h1>
        <Link to="/admin/reports" className="premium-btn premium-btn-secondary">
          Back
        </Link>
      </div>

      <div className="premium-grid-2">

        <div className="premium-card">
          <h2 className="premium-subtitle">Total Exams</h2>
          <span className="premium-title">{report.totalExams}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Completed Exams</h2>
          <span className="premium-title">{report.completedExams}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Pass Percentage</h2>
          <span className="premium-title">{report.passPercentage}</span>
        </div>

        <div className="premium-card">
          <h2 className="premium-subtitle">Average Score</h2>
          <span className="premium-title">{report.averageScore}</span>
        </div>

      </div>
    </div>
  );
}

export default ExamReport;