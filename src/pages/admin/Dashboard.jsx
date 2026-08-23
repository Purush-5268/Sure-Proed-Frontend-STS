import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { studentService } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import { cohortService } from "../../services/cohortService";
import { applicationService } from "../../services/applicationService";
import apiClient, { normalizeListResponse, fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Dashboard.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import PushNotificationBanner from "../../components/common/PushNotificationBanner";

function Dashboard() {
  const navigate = useNavigate();

  // Independent data states
  const [allStudents, setAllStudents] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [allCohorts, setAllCohorts] = useState([]);
  const [allApps, setAllApps] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);

  // Progressive stats
  const [stats, setStats] = useState({
    studentsCount: null,
    coursesCount: null,
    cohortsCount: null,
    applicationsCount: null,
  });

  // Independent loading states
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingCohorts, setLoadingCohorts] = useState(true);
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingRadar, setLoadingRadar] = useState(true);

  // Hierarchy View State
  const [currentView, setCurrentView] = useState("courses"); // "courses" | "cohorts" | "students"
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCohort, setSelectedCohort] = useState(null);

  const handleToggleAccess = async (appId, currentStatus) => {
    // If they are suspended, restore them to COHORT_ASSIGNED. Otherwise, suspend them.
    const isSuspended = currentStatus === "SUSPENDED";
    const newStatus = isSuspended ? "COHORT_ASSIGNED" : "SUSPENDED";
    
    if (!isSuspended && !window.confirm("Are you sure you want to suspend this student's access?")) return;
    
    try {
      await applicationService.patchApplication(appId, { status: newStatus });
      setAllApps((prev) => prev.map((app) => (app.id === appId ? { ...app, status: newStatus } : app)));
    } catch (err) {
      alert(`❌ Failed to ${isSuspended ? "restore" : "suspend"} student.`);
    }
  };

  const handleAssignLST = async (studentId, lstBatch) => {
    try {
      await studentService.patchStudentProfile(studentId, { lst_batch: lstBatch });
      alert(`✅ Student assigned to LST Batch ${lstBatch}`);
    } catch (err) {
      alert("❌ Failed to assign LST batch.");
    }
  };

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();
    const signal = abortController.signal;

    // Independent parallel execution of all APIs

    // 1. Students
    (async () => {
      try {
        const res = await fetchAllPages(API_ENDPOINTS.STUDENTS.BASE, { signal });
        if (!isMounted) return;
        const list = res;
        const count = list.length;
        setAllStudents(list);
        setStats(prev => ({ ...prev, studentsCount: count }));
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') console.error("Students error:", err);
      } finally {
        if (isMounted) setLoadingStudents(false);
      }
    })();

    // 2. Courses
    (async () => {
      try {
        const res = await fetchAllPages(API_ENDPOINTS.COURSES.BASE, { signal });
        if (!isMounted) return;
        const list = res;
        const count = list.length;
        setAllCourses(list);
        setStats(prev => ({ ...prev, coursesCount: count }));
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') console.error("Courses error:", err);
      } finally {
        if (isMounted) setLoadingCourses(false);
      }
    })();

    // 3. Cohorts
    (async () => {
      try {
        const res = await fetchAllPages(API_ENDPOINTS.COHORTS.BASE, { signal });
        if (!isMounted) return;
        const list = res;
        const count = list.length;
        setAllCohorts(list);
        setStats(prev => ({ ...prev, cohortsCount: count }));
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') console.error("Cohorts error:", err);
      } finally {
        if (isMounted) setLoadingCohorts(false);
      }
    })();

    // 4. Applications
    (async () => {
      try {
        const res = await fetchAllPages(API_ENDPOINTS.APPLICATIONS.BASE, { signal });
        if (!isMounted) return;
        const list = res;
        const count = list.length;
        setAllApps(list);
        setStats(prev => ({ ...prev, applicationsCount: count }));
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') console.error("Apps error:", err);
      } finally {
        if (isMounted) setLoadingApps(false);
      }
    })();

    // 5. Active Sessions
    (async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, { params: { status: "ACTIVE" }, signal });
        if (!isMounted) return;
        setActiveSessions(normalizeListResponse(res.data));
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') console.error("Sessions error:", err);
      } finally {
        if (isMounted) setLoadingRadar(false);
      }
    })();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  return (
    <div className={styles.dashboard}>
      <PushNotificationBanner />
      <h1>Admin Dashboard</h1>

      <p className={styles.subtitle}>
        Welcome Admin! Here's your internship management overview.
      </p>

      <div className={styles.cards}>
        <div className="premium-card">
          <h3>Total Students</h3>
          {loadingStudents ? <SkeletonLoader width="60px" height="24px" /> : <p>{stats.studentsCount ?? "0"}</p>}
        </div>

        <div className="premium-card">
          <h3>Total Courses</h3>
          {loadingCourses ? <SkeletonLoader width="60px" height="24px" /> : <p>{stats.coursesCount ?? "0"}</p>}
        </div>

        <div className="premium-card">
          <h3>Active Cohorts</h3>
          {loadingCohorts ? <SkeletonLoader width="60px" height="24px" /> : <p>{stats.cohortsCount ?? "0"}</p>}
        </div>

        <div className="premium-card">
          <h3>Total Applications</h3>
          {loadingApps ? <SkeletonLoader width="60px" height="24px" /> : <p>{stats.applicationsCount ?? "0"}</p>}
        </div>
      </div>

      {/* Global Active Sessions Banner (Dynamic) */}
      {currentView === "courses" && loadingRadar ? (
        <SkeletonLoader variant="cards" count={1} />
      ) : currentView === "courses" && activeSessions.filter(s => s.session_type === 'LST' || s.session_type === 'Celebration').map(session => (
        <div key={session.id} style={{ background: 'linear-gradient(to right, #ef4444, #f97316)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', border: '1px solid #f87171' }}>
          <div>
            <span style={{ backgroundColor: "var(--bg-surface)", color: '#dc2626', fontSize: '12px', fontWeight: '900', padding: '4px 12px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global Event Live</span>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '900', marginTop: '8px' }}>{session.title || session.session_type}</h3>
            <p style={{ color: '#fee2e2', fontWeight: '500', fontSize: '14px', marginTop: '4px' }}>Started at: {new Date(session.start_time).toLocaleTimeString()}</p>
            <p style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '4px 12px', borderRadius: '4px', marginTop: '8px', fontFamily: 'monospace', fontSize: '12px' }}>Link: {session.meet_link || 'Generating...'}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => window.open(session.meet_link.startsWith('http') ? session.meet_link : `https://${session.meet_link}`, '_blank')} style={{ padding: '10px 24px', backgroundColor: "var(--bg-surface)", color: '#dc2626', fontWeight: '900', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Spectate</button>
            </div>
          </div>
        </div>
      ))}

      {/* Hierarchy View: Courses -> Cohorts -> Students */}
      <div className={styles.tableSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>
            {currentView === "courses" && "Course Management"}
            {currentView === "cohorts" && `${selectedCourse?.name || selectedCourse?.title} - Batches`}
            {currentView === "students" && `Batch ${selectedCohort?.name} - Students`}
          </h2>
          <div>
            {currentView === "cohorts" && <button onClick={() => { setSelectedCourse(null); setCurrentView("courses"); }} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: "var(--bg-nested)", border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>← Back to Courses</button>}
            {currentView === "students" && <button onClick={() => { setSelectedCohort(null); setCurrentView("cohorts"); }} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: "var(--bg-nested)", border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>← Back to Batches</button>}
          </div>
        </div>

        {currentView === "courses" && (
          <div className={styles.cards}>
            {loadingCourses ? (
              <SkeletonLoader variant="cards" count={3} />
            ) : allCourses.length > 0 ? allCourses.map(course => (
              <div key={course.id} className="premium-card premium-card-hoverable" onClick={() => { setSelectedCourse(course); setCurrentView("cohorts"); }} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '8px' }}>{course.name || course.title || course.code}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Click to view batches ➔</p>
              </div>
            )) : (
              <div className="premium-empty-state">
                <div className="premium-empty-state-icon">📚</div>
                <h3>No courses found</h3>
                <p>Try adding a new course to get started.</p>
                <Link to="/admin/add-course" className="premium-btn premium-btn-primary">Add Course</Link>
              </div>
            )}
          </div>
        )}

        {currentView === "cohorts" && (
          <div className={styles.cards}>
            {/* Render actual cohorts for this course */}
            {loadingCohorts || loadingStudents ? (
              <SkeletonLoader variant="cards" count={2} />
            ) : allCohorts
              .filter(c => c.course === selectedCourse?.id || c.course?.id === selectedCourse?.id)
              .map((cohort, idx) => {
                // Approximate student count based on loaded student data
                const studentCount = allStudents.filter(s => s.cohort_code === cohort.code || s.cohort === cohort.id).length;
                const mentorName = cohort.active_mentor ? `${cohort.active_mentor.first_name || ""} ${cohort.active_mentor.last_name || ""}`.trim() || "Assigned" : "Pending Assignment";

                return (
                  <div key={cohort.id || idx} className="premium-card premium-card-hoverable" onClick={() => navigate(`/admin/cohort-details/${cohort.id}`)} style={{ cursor: 'pointer', background: 'linear-gradient(135deg, var(--primary-color), var(--primary-dark))', border: '1px solid var(--border-color)', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ color: '#ffffff', fontSize: '1.25rem', marginBottom: '8px' }}>{cohort.name || cohort.code}</h3>
                      <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: '500', margin: 0 }}>Click to manage group ➔</p>
                    </div>

                    {/* Right-Side Stats & Mentor Assignment Box */}
                    <div style={{ textAlign: 'right', background: 'rgba(0,0,0,0.25)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '6px' }}>
                        👥 {studentCount} Students
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span>👨‍🏫 Mentor: <strong style={{ color: '#fbbf24' }}>{mentorName}</strong></span>
                        <span>📈 Stage: <strong style={{ color: '#38bdf8' }}>{cohort.status || "DRAFT"}</strong></span>
                      </div>
                    </div>
                  </div>
                )
              })}
            {allCohorts.filter(c => c.course === selectedCourse?.id || c.course?.id === selectedCourse?.id).length === 0 && (
              <div className="premium-empty-state" style={{ gridColumn: "1 / -1" }}>
                <div className="premium-empty-state-icon">👥</div>
                <h3>No active batches</h3>
                <p>No active batches found for this course.</p>
              </div>
            )}
          </div>
        )}

        {currentView === "students" && (
          <div className="premium-table-container">
            {loadingApps ? (
              <div style={{ padding: "2rem" }}>
                <SkeletonLoader width="100%" height="40px" count={3} />
              </div>
            ) : allApps.filter(a => a.assigned_cohort === selectedCohort?.id || a.assigned_cohort?.id === selectedCohort?.id).length === 0 ? (
              <div className="premium-empty-state" style={{ padding: "3rem" }}>
                <div className="premium-empty-state-icon">🎓</div>
                <h3>No students</h3>
                <p>No students assigned to this batch yet.</p>
              </div>
            ) : (
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Student Info</th>
                    <th>Offer Letter</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allApps.filter(a => a.assigned_cohort === selectedCohort?.id || a.assigned_cohort?.id === selectedCohort?.id).map(app => (
                    <tr key={app.id}>
                      <td>
                        <strong style={{ color: "var(--text-primary)" }}>{app.student?.user?.first_name || app.student?.first_name} {app.student?.user?.last_name || app.student?.last_name}</strong><br />
                        <span style={{ fontSize: '12px', color: "var(--text-muted)" }}>{app.student?.user?.email || app.student?.email}</span>
                      </td>
                      <td>
                        {app.offer_letter_issued ? (
                          <a href={app.offer_letter_file} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 'bold' }}>View Document</a>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Not Generated</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Link 
                            to={`/admin/application-details/${app.id}`} 
                            className="premium-btn premium-btn-primary" 
                            style={{ height: '32px', padding: '0 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center' }}
                          >
                            Manage
                          </Link>
                          {app.status === "SUSPENDED" ? (
                            <button 
                              onClick={() => handleToggleAccess(app.id, app.status)} 
                              className="premium-btn premium-btn-secondary" 
                              style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                            >
                              Restore
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleToggleAccess(app.id, app.status)} 
                              className="premium-btn premium-btn-danger" 
                              style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className={styles.announcementSection}>
        <h2>Quick Actions</h2>
        <div className={styles.cards}>
          <Link to="/admin/add-student" className="premium-card premium-card-hoverable">
            <h3>➕ Add Student</h3>
          </Link>
          <Link to="/admin/add-mentor" className="premium-card premium-card-hoverable">
            <h3>👨‍🏫 Add Mentor</h3>
          </Link>
          <Link to="/admin/add-course" className="premium-card premium-card-hoverable">
            <h3>📚 Add Course</h3>
          </Link>
          <Link to="/admin/add-exam" className="premium-card premium-card-hoverable">
            <h3>📝 Create Exam</h3>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;