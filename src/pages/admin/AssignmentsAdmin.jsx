import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AssignmentsAdmin.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AssignmentsAdmin() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadAssignments = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.BASE);
        if (isMounted) setAssignments(Array.isArray(response.data) ? response.data : []);
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Assignment Management</h1>
          <p>Manage all assignments</p>
        </div>

        <Link to="/admin/add-assignment" className={styles.addBtn}>
          + Add Assignment
        </Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : assignments.length === 0 ? (
        <p>No assignments have been created yet.</p>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Cohort</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>{assignment.title}</td>
                  <td>{assignment.cohort?.name || assignment.cohort || "N/A"}</td>
                  <td>{assignment.deadline || "N/A"}</td>
                  <td className={assignment.status === "ACTIVE" ? styles.active : assignment.status === "UPCOMING" ? styles.upcoming : styles.completed}>
                    {assignment.status || "DRAFT"}
                  </td>
                  <td className="actions" style={{ display: "flex", gap: "8px" }}>
                    <Link to="/admin/assignment-admin-details">View</Link>
                    <Link to="/admin/edit-assignment">Edit</Link>
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

export default AssignmentsAdmin;