import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./AssignmentList.module.css";

function AssignmentList() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadAssignments = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.BASE);
        if (isMounted) {
          setAssignments(Array.isArray(response.data) ? response.data : []);
        }
      } catch (err) {
        console.error("Failed to load assignments:", err);
        if (isMounted) setAssignments([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAssignments();
    return () => {
      isMounted = false;
    };
  }, []);

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="premium-page-container">
      <PageHeader 
        title="Assignments" 
        description="Complete and submit your internship assignments before the deadline."
      />

      <div className="premium-card" style={{ maxWidth: '900px', margin: '0 auto', padding: '1.75rem' }}>
        <h2 className="sr-only">Active Assignments</h2>
        {loading ? (
          <SkeletonLoader variant="table" rows={4} />
        ) : assignments.length === 0 ? (
          <EmptyState 
            icon={<span style={{ fontSize: '2rem' }}>📝</span>}
            title="No Assignments Found" 
            description="You don't have any pending assignments at the moment."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {assignments.map((assignment, idx) => (
              <div 
                key={assignment.id} 
                className={styles.assignmentCard}
                style={{ 
                  background: 'var(--bg-nested)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  transition: 'transform 0.15s ease'
                }}
              >
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="premium-badge premium-badge-info">
                      {assignment.assignment_type || "Assignment"}
                    </span>
                    <span className={`premium-badge ${assignment.status === "SUBMITTED" ? "premium-badge-active" : "premium-badge-pending"}`}>
                      {assignment.status || "PENDING"}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', color: 'var(--text-primary)' }}>{assignment.title}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    📅 <strong>Due Date:</strong> {formatDate(assignment.deadline)}
                  </p>
                </div>
                
                <div>
                  <Link 
                    to="/student/assignment-details"
                    state={{ assignment }}
                    className="premium-btn premium-btn-primary"
                    aria-label={`View details for ${assignment.title}`}
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="actions" style={{ display: "flex", gap: "8px", marginTop: "1.5rem" }}>
          <Link to="/student/certificates" className="premium-btn premium-btn-secondary" aria-label="Go to certificates page">
            Continue to Certificates →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AssignmentList;