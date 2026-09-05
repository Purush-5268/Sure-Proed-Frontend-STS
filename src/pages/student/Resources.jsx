import React from "react";
import { Link } from "react-router-dom";
import { FiFileText } from "react-icons/fi";
import styles from "./Dashboard.module.css"; // Reuse dashboard styles for simplicity or create a new one

function Resources() {
  return (
    <div className="premium-page-container">
      <div className="premium-card" style={{ maxWidth: '800px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
        <FiFileText size={48} color="var(--primary-color)" style={{ marginBottom: "16px" }} />
        <h2>Cohort Resources</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
          Resources for your cohort will be posted here by your mentors. Currently, there are no resources available.
        </p>
        <Link to="/student" className="premium-btn premium-btn-primary">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default Resources;
