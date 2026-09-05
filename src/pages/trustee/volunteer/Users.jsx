import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getStudents, removeStudent, getLowAttendanceAlerts } from "../../../services/trusteeService";
import { normalizeListResponse } from "../../../services/apiClient";
import SkeletonLoader from "../../../components/common/SkeletonLoader";
import styles from "./Users.module.css";
import { FiAlertTriangle } from "react-icons/fi";

function VolunteerUsers() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [studentsData, alertsData] = await Promise.all([
        getStudents(),
        getLowAttendanceAlerts().catch(() => [])
      ]);
      setStudents(normalizeListResponse(studentsData));
      setAlerts(alertsData || []);
    } catch (err) {
      console.warn("Could not load data:", err);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRemoveUser = async (id, name) => {
    if (window.confirm(`Are you sure you want to permanently remove ${name}?`)) {
      try {
        await removeStudent(id);
        alert(`${name} has been removed.`);
        loadData();
      } catch (err) {
        alert("Failed to remove user: " + (err.response?.data?.detail || err.message));
      }
    }
  };

  const filteredStudents = students.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const streamName = s.stream?.streamName || s.Stream?.StreamName || "";
    return (
      (s.name || s.first_name || "").toLowerCase().includes(term) ||
      (s.email || "").toLowerCase().includes(term) ||
      (s.courseBatch || s.CourseBatch || "").toLowerCase().includes(term) ||
      streamName.toLowerCase().includes(term)
    );
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>User Moderation</h2>
        <Link to="/trustee/volunteer/dashboard" className="btn btnSecondary">
          ← Back to Dashboard
        </Link>
      </div>

      <div className={styles.searchBar}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by Name, Email, Batch (e.g., G2-26), or Domain..."
          className={styles.searchInput}
        />
      </div>

      <div className="tableContainer">
        {loading ? (
          <SkeletonLoader variant="table" rows={5} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email / Phone</th>
                <th>Stream / Batch</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="4" className={styles.emptyState}>
                    No students match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const sName = s.name || `${s.first_name || ""} ${s.last_name || ""}`;
                  const hasAlert = alerts.find(a => a.name === sName || a.student_id === s.id || a.user_id === s.user?.id);
                  return (
                  <tr key={s.id} style={{ backgroundColor: hasAlert ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                    <td className={styles.cellName}>
                      {sName}
                      {hasAlert && (
                        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>
                          <FiAlertTriangle size={14} /> Low Attendance Alert
                        </div>
                      )}
                    </td>
                    <td>
                      <div className={styles.contactInfo}>
                        <span>{s.email}</span>
                        {s.phone && <span>{s.phone}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={styles.badgeStream}>
                        {s.stream?.streamName ||
                          s.Stream?.StreamName ||
                          s.courseBatch ||
                          s.CourseBatch ||
                          "Global"}
                      </span>
                      <div className={styles.lstBatch}>
                        LST Batch: {s.lstBatch || s.LstBatch || "Unassigned"}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className={styles.btnRemove}
                        onClick={() =>
                          handleRemoveUser(
                            s.id,
                            sName || "User"
                          )
                        }
                      >
                        Remove User
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default VolunteerUsers;
