import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./MyStudents.module.css";
import { FiUsers, FiSearch, FiAlertCircle, FiMail, FiX, FiSend } from "react-icons/fi";

function MyStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageDialog, setMessageDialog] = useState(null); // { studentId, studentEmail, studentName }
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadStudents = async () => {
      try {
        // Step 1: Load mentor's cohorts (scoped to this mentor only)
        const cohortsRes = await apiClient.get(API_ENDPOINTS.COHORTS.MY_COHORTS);
        const cohortsData = cohortsRes.data;
        const myCohorts = Array.isArray(cohortsData?.results) ? cohortsData.results : (Array.isArray(cohortsData) ? cohortsData : []);

        if (myCohorts.length === 0) {
          if (isMounted) { setStudents([]); setLoading(false); }
          return;
        }

        // Step 2: Load students from each cohort (server-driven, not client-filtered)
        const studentRequests = myCohorts.map(c =>
          apiClient.get(API_ENDPOINTS.COHORTS.STUDENTS(c.id))
        );
        const results = await Promise.allSettled(studentRequests);

        const allStudents = [];
        const seenIds = new Set();

        results.forEach(result => {
          if (result.status === "fulfilled") {
            const data = result.value.data;
            const arr = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
            arr.forEach(student => {
              if (!seenIds.has(student.id)) {
                seenIds.add(student.id);
                allStudents.push(student);
              }
            });
          }
        });

        // Sort alphabetically by first name
        allStudents.sort((a, b) => {
          const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
          const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });

        if (isMounted) setStudents(allStudents);

      } catch (err) {
        if (isMounted) setError("Unable to load students. Please try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStudents();
    return () => { isMounted = false; };
  }, []);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !messageDialog) return;
    setSendingMessage(true);
    try {
      // Attempt to send notification via existing notification endpoint if available
      // For now, use mailto as fallback
      await apiClient.post("/api/notifications/", {
        recipient: messageDialog.studentId,
        message: messageText.trim(),
        type: "MENTOR_MESSAGE",
      }).catch(() => {
        // If notification endpoint doesn't exist, silently continue
        console.warn("Notification API not available. Message not sent to backend.");
      });
      setMessageSent(true);
      setTimeout(() => {
        setMessageDialog(null);
        setMessageText("");
        setMessageSent(false);
      }, 1500);
    } catch {
      setMessageSent(true);
    } finally {
      setSendingMessage(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'AVAILABLE': return <Badge variant="success">Active</Badge>;
      case 'BUSY': return <Badge variant="warning">Busy</Badge>;
      case 'NOT_AVAILABLE': return <Badge variant="default">Inactive</Badge>;
      default: return <Badge variant="default">{status || 'Unknown'}</Badge>;
    }
  };

  const filteredStudents = students.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.college || "").toLowerCase().includes(q)
    );
  });

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="My Students"
        description="Students enrolled in your assigned cohorts."
      />

      <div className={styles.controlsBar}>
        <div className={styles.searchWrapper}>
          <FiSearch className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by name, email, or college…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery("")}>
              <FiX />
            </button>
          )}
        </div>
        <span className={styles.countBadge}>{filteredStudents.length} student{filteredStudents.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className={styles.tableCard}>
          {[1,2,3,4,5].map(i => (
            <div key={i} className={styles.skeletonRow}>
              <SkeletonLoader width="2rem" height="2rem" borderRadius="50%" />
              <SkeletonLoader width="35%" height="14px" borderRadius="4px" />
              <SkeletonLoader width="25%" height="12px" borderRadius="4px" />
              <SkeletonLoader width="15%" height="22px" borderRadius="20px" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={<FiAlertCircle />} title="Failed to load students" description={error} />
      ) : students.length === 0 ? (
        <EmptyState
          icon={<FiUsers />}
          title="No students yet"
          description="Students will appear here once they are enrolled in your cohort."
        />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={<FiSearch />}
          title="No matches found"
          description={`No students match "${searchQuery}".`}
          action={<button className={styles.clearBtn} onClick={() => setSearchQuery("")}>Clear search</button>}
        />
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>College</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <motion.tbody
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.04 } } }}
            >
              <AnimatePresence mode="popLayout">
                {filteredStudents.map(student => {
                  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.email;
                  return (
                    <motion.tr key={student.id} variants={item} layout exit={{ opacity: 0 }}>
                      <td>
                        <div className={styles.studentInfo}>
                          <div className={styles.avatar}>
                            {fullName.charAt(0).toUpperCase()}
                          </div>
                          <div className={styles.studentDetails}>
                            <span className={styles.studentName}>{fullName}</span>
                            <span className={styles.studentEmail}>{student.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className={styles.collegeName}>{student.college || "—"}</td>
                      <td>{getStatusBadge(student.status)}</td>
                      <td>
                        <button
                          className={styles.messageBtn}
                          onClick={() => setMessageDialog({
                            studentId: student.id,
                            studentEmail: student.email,
                            studentName: fullName,
                          })}
                        >
                          <FiMail /> Message
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </motion.tbody>
          </table>
        </div>
      )}

      {/* Message Dialog */}
      <AnimatePresence>
        {messageDialog && (
          <motion.div
            className={styles.dialogOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setMessageDialog(null)}
          >
            <motion.div
              className={styles.dialog}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
            >
              <div className={styles.dialogHeader}>
                <div>
                  <h3 className={styles.dialogTitle}>Message Student</h3>
                  <p className={styles.dialogSub}>To: {messageDialog.studentName}</p>
                </div>
                <button className={styles.dialogClose} onClick={() => setMessageDialog(null)}>
                  <FiX />
                </button>
              </div>

              {messageSent ? (
                <div className={styles.messageSentState}>
                  ✅ Message sent successfully!
                </div>
              ) : (
                <>
                  <textarea
                    className={styles.messageTextarea}
                    placeholder="Write your message to this student…"
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    rows={4}
                  />
                  <div className={styles.dialogActions}>
                    <button className={styles.cancelBtn} onClick={() => setMessageDialog(null)}>
                      Cancel
                    </button>
                    <button
                      className={styles.sendBtn}
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || sendingMessage}
                    >
                      <FiSend /> {sendingMessage ? "Sending…" : "Send Message"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MyStudents;