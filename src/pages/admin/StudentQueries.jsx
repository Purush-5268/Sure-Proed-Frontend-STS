import { useEffect, useState } from "react";
import { attendanceService } from "../../services/attendanceService";
import styles from "./StudentQueries.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function StudentQueries() {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDomain, setExpandedDomain] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadQueries = async () => {
      try {
        const data = await attendanceService.getAdminQueries();
        if (isMounted) setQueries(data);
      } catch (err) {
        console.error("Failed to load queries:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadQueries();
    return () => { isMounted = false; };
  }, []);

  const handleAction = async (warningId, action) => {
    try {
      await attendanceService.updateQueryStatus(warningId, action);
      if (action === 'ACCEPT') {
        setQueries(prev => prev.filter(q => q.id !== warningId));
      } else {
        setQueries(prev => prev.map(q => q.id === warningId ? { ...q, status: 'REJECTED' } : q));
      }
      alert(`Query successfully ${action}ED.`);
    } catch (err) {
      alert(`Failed to ${action} query.`);
    }
  };

  // Group by Domain -> Group
  const groupedData = queries.reduce((acc, query) => {
    const domain = query.domain_name || "Unknown Domain";
    const group = query.group_name || "Unknown Group";

    if (!acc[domain]) acc[domain] = {};
    if (!acc[domain][group]) acc[domain][group] = [];

    acc[domain][group].push(query);
    return acc;
  }, {});

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Student Queries & Apologies</h1>
        <p>Review student apologies for low attendance.</p>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={4} />
      ) : Object.keys(groupedData).length === 0 ? (
        <div className={styles.emptyState}>No pending queries or apologies.</div>
      ) : (
        <div className={styles.hierarchyContainer}>
          {Object.entries(groupedData).map(([domain, groups]) => (
            <div key={domain} className={styles.domainBlock}>
              <div
                className={styles.domainHeader}
                onClick={() => setExpandedDomain(expandedDomain === domain ? null : domain)}
              >
                <h3>📁 {domain}</h3>
                <span>{expandedDomain === domain ? '▼' : '▶'}</span>
              </div>

              {expandedDomain === domain && (
                <div className={styles.groupsContainer}>
                  {Object.entries(groups).map(([group, students]) => (
                    <div key={group} className={styles.groupBlock}>
                      <div
                        className={styles.groupHeader}
                        onClick={() => setExpandedGroup(expandedGroup === group ? null : group)}
                      >
                        <h4>📂 {group} ({students.length})</h4>
                        <span>{expandedGroup === group ? '▼' : '▶'}</span>
                      </div>

                      {expandedGroup === group && (
                        <div className={styles.studentsContainer}>
                          {students.map((student) => (
                            <div key={student.id} className={styles.studentCard}>
                              <div className={styles.studentInfo}>
                                <strong>{student.student_name}</strong>
                                <span className={styles.dateText}>{student.session_title} - {student.class_date}</span>
                              </div>

                              <div className={styles.apologyBox}>
                                <p><strong>Apology:</strong> {student.apology_text || "No text provided."}</p>
                              </div>

                              <div className={styles.actionButtons}>
                                <button onClick={() => handleAction(student.id, 'ACCEPT')} className={styles.btnAccept}>Accept (Restore)</button>
                                {/* We can let admin reject here too, or just leave it */}
                                <button onClick={() => handleAction(student.id, 'REJECT')} className={styles.btnReject}>Reject</button>
                                <span className={styles.note}>(To remove completely, use the Students page)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default StudentQueries;
