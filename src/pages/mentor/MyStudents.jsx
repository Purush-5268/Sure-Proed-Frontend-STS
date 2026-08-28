import React, { useEffect, useState, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./MyStudents.module.css";
import { FiUsers, FiSearch, FiAlertCircle, FiMail, FiX, FiSend } from "react-icons/fi";
import Pagination from "../../components/common/Pagination";

function MyStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [messageDialog, setMessageDialog] = useState(null); // { studentId, studentEmail, studentName }
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  const { globalCohort } = useOutletContext() || {};

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset page on new search
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1); // Reset page on cohort change
  }, [globalCohort]);

  useEffect(() => {
    if (globalCohort === undefined) return;
    let isMounted = true;
    const loadStudents = async () => {
      try {
        setLoading(true);
        const params = { page };
        if (globalCohort) params.cohort = globalCohort;
        if (debouncedSearch) params.search = debouncedSearch;

        const res = await apiClient.get(API_ENDPOINTS.STUDENTS.BASE, { params });
        const data = res.data;
        
        if (isMounted) {
          setStudents(Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []));
          setHasNext(!!data.next);
          setHasPrev(!!data.previous);
          setTotalCount(data.count || 0);
        }

      } catch (err) {
        if (isMounted) setError("Unable to load students. Please try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStudents();
    return () => { isMounted = false; };
  }, [globalCohort, page, debouncedSearch]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !messageDialog) return;
    setSendingMessage(true);
    try {
      await apiClient.post("/api/notifications/", {
        user_id: messageDialog.studentId,
        title: "Message from Mentor",
        message: messageText.trim(),
        notification_type: "INFO",
      });
      setMessageSent(true);
      setTimeout(() => {
        setMessageDialog(null);
        setMessageText("");
        setMessageSent(false);
      }, 1500);
    } catch (err) {
      console.error("Failed to send message:", err);
      alert("Failed to send message. Please try again.");
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
        <span className={styles.countBadge}>{totalCount} student{totalCount !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
        </div>
      ) : error ? (
        <EmptyState icon={<FiAlertCircle />} title="Failed to load students" description={error} />
      ) : students.length === 0 ? (
        <EmptyState
          icon={<FiUsers />}
          title="No students found"
          description={searchQuery ? `No students match "${searchQuery}".` : "Students will appear here once they are enrolled in your cohort."}
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
                {students.map(student => {
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
          
          {!loading && students.length > 0 && (
            <Pagination 
              page={page} 
              setPage={setPage} 
              hasNext={hasNext} 
              hasPrev={hasPrev} 
              loading={loading} 
            />
          )}
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