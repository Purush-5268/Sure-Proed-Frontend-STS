import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { studentService } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import { cohortService } from "../../services/cohortService";
import { applicationService } from "../../services/applicationService";
import { attendanceService } from "../../services/attendanceService";
import { normalizeListResponse } from "../../services/apiClient";
import styles from "./Dashboard.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    studentsCount: 0,
    coursesCount: 0,
    cohortsCount: 0,
    applicationsCount: 0,
  });
  const [recentApplications, setRecentApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Hierarchy & Alerts State
  const [currentView, setCurrentView] = useState("courses"); // "courses" | "cohorts" | "students"
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCohort, setSelectedCohort] = useState(null);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [allCohorts, setAllCohorts] = useState([]);
  const [allApps, setAllApps] = useState([]);
  const [allStudents, setAllStudents] = useState([]); // Track students for dynamic hierarchy

  // Live Session & Whitelist State
  const [activeSessions, setActiveSessions] = useState([]); // Now dynamically populated
  const [showLateInput, setShowLateInput] = useState({});
  const [lateGuestEmails, setLateGuestEmails] = useState({});

  // Grouped Pending Approvals logic
  const groupedPendingQueue = pendingQueue.reduce((acc, app) => {
    const courseId = app.course?.id || app.course;
    const cohortId = app.assigned_cohort?.id || app.assigned_cohort;
    const key = `${courseId}-${cohortId}`;
    if (!acc[key]) {
      acc[key] = {
        course: allCourses.find(c => c.id === courseId) || app.course,
        cohort: allCohorts.find(c => c.id === cohortId) || app.assigned_cohort,
        count: 0
      };
    }
    acc[key].count++;
    return acc;
  }, {});

  const toggleLateInput = (sessionId) => {
    setShowLateInput(prev => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };

  const handleAddLateGuest = (sessionId) => {
    const email = lateGuestEmails[sessionId];
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
    // TODO: Wire to backend adminService.whitelistLateGuest(sessionId, email)
    alert(`✅ Added ${email} to whitelist for session ${sessionId}`);
    setLateGuestEmails(prev => ({ ...prev, [sessionId]: '' }));
    setShowLateInput(prev => ({ ...prev, [sessionId]: false }));
  };

  const handleApprove = async (appId) => {
    try {
      // Assuming patchApplication handles the status update
      await applicationService.patchApplication(appId, { status: "ACCEPTED" });
      setPendingQueue((prev) => prev.filter((app) => app.id !== appId));
      setAllApps((prev) => prev.map((app) => (app.id === appId ? { ...app, status: "ACCEPTED" } : app)));
    } catch (err) {
      alert("❌ Failed to approve student.");
    }
  };

  const handleToggleAccess = async (appId, currentStatus) => {
    const newStatus = currentStatus === "ACCEPTED" ? "REMOVED" : "ACCEPTED";
    if (newStatus === "REMOVED" && !window.confirm("Are you sure you want to revoke this student's login access?")) return;

    try {
      await applicationService.patchApplication(appId, { status: newStatus });
      setAllApps((prev) => prev.map((app) => (app.id === appId ? { ...app, status: newStatus } : app)));
    } catch (err) {
      alert(`❌ Failed to ${newStatus === "REMOVED" ? "remove" : "restore"} student.`);
    }
  };

  const handleAssignLST = async (studentId, lstBatch) => {
    try {
      // Assuming studentService handles LST assignment on the student profile
      await studentService.patchStudentProfile(studentId, { lst_batch: lstBatch });
      alert(`✅ Student assigned to LST Batch ${lstBatch}`);
    } catch (err) {
      alert("❌ Failed to assign LST batch.");
    }
  };

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        // Added attendanceService.getAttendanceRecords() to fetch real sessions
        const [studentsRes, coursesRes, cohortsRes, appsRes, sessionsRes] = await Promise.allSettled([
          studentService.getStudentProfiles(),
          courseService.getCourses(),
          cohortService.getCohorts(),
          applicationService.getApplications(),
          attendanceService.getAttendanceRecords({ status: "ACTIVE" }),
        ]);

        const studentsList = studentsRes.status === "fulfilled" ? normalizeListResponse(studentsRes.value) : [];
        const coursesList = coursesRes.status === "fulfilled" ? normalizeListResponse(coursesRes.value) : [];
        const cohortsList = cohortsRes.status === "fulfilled" ? normalizeListResponse(cohortsRes.value) : [];

        const studentsCount = studentsList.length;
        const coursesCount = coursesList.length;
        const cohortsCount = cohortsList.length;

        let appsData = [];
        let applicationsCount = 0;
        if (appsRes.status === "fulfilled") {
          appsData = normalizeListResponse(appsRes.value);
          applicationsCount = appsData.length;
        }

        setStats({
          studentsCount,
          coursesCount,
          cohortsCount,
          applicationsCount,
        });
        setRecentApplications(appsData.slice(0, 5));

        // Setup Hierarchy & Alerts data
        setAllCourses(coursesList);
        setAllCohorts(cohortsList);
        setAllApps(appsData);
        setAllStudents(studentsList); // Save students list to generate hierarchy
        setPendingQueue(appsData.filter(app => String(app.status).toUpperCase() === "PENDING"));
        if (sessionsRes.status === "fulfilled") {
          setActiveSessions(normalizeListResponse(sessionsRes.value));
        }
      } catch (err) {
        console.error("Failed to load admin dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  return (
    <div className={styles.dashboard}>
      <h1>Admin Dashboard</h1>

      <p className={styles.subtitle}>
        Welcome Admin! Here's your internship management overview.
      </p>

      <div className={styles.cards}>
        <div className="premium-card">
          <h3>Total Students</h3>
          <p>{loading ? "..." : stats.studentsCount}</p>
        </div>

        <div className="premium-card">
          <h3>Total Courses</h3>
          <p>{loading ? "..." : stats.coursesCount}</p>
        </div>

        <div className="premium-card">
          <h3>Active Cohorts</h3>
          <p>{loading ? "..." : stats.cohortsCount}</p>
        </div>

        <div className="premium-card">
          <h3>Total Applications</h3>
          <p>{loading ? "..." : stats.applicationsCount}</p>
        </div>
      </div>

      {/* Smart Pending Approvals Widget */}
      {currentView === "courses" && pendingQueue.length > 0 && (
        <div className={styles.announcementSection} style={{ backgroundColor: '#fffbeb', borderColor: '#fef3c7', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <h2 style={{ color: '#92400e', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚡ Action Required: Pending Approvals
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {Object.values(groupedPendingQueue).map((group, index) => (
              <div key={index} style={{ backgroundColor: "var(--bg-surface)", padding: '1.5rem', borderRadius: '8px', border: '1px solid #fcd34d', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: '1rem' }}>
                  In <strong style={{ color: '#4338ca' }}>{group.course?.name || group.course?.title || "Unknown Domain"}</strong> from batch <strong style={{ color: '#047857' }}>{group.cohort?.name || "Unknown"}</strong>, there are <strong style={{ color: '#dc2626', fontSize: '1.2rem' }}>{group.count}</strong> students waiting for approval.
                </p>
                <button
                  onClick={() => {
                    navigate('/admin/students', { state: { preSelectedCourse: group.course?.name || group.course?.id, preSelectedCohort: group.cohort?.name || group.cohort?.id } });
                  }}
                  style={{ marginTop: '1rem', width: '100%', padding: '10px', backgroundColor: '#fbbf24', color: '#92400e', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Check & Accept ➔
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global Active Sessions Banner (Dynamic) */}
      {currentView === "courses" && activeSessions.filter(s => s.session_type === 'LST' || s.session_type === 'Celebration').map(session => (
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
            {allCourses.length > 0 ? allCourses.map(course => (
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
            {/* Scan all students directly to find matching domains and unique batches */}
            {Array.from(new Set(
              allStudents
                .filter(s => s.domain === selectedCourse?.name || s.domain === selectedCourse?.title)
                .map(s => s.course_batch || "Unassigned Batch")
            )).map((batchName, idx) => {
              // Calculate actual student count for this batch
              const studentCount = allStudents.filter(s => s.course_batch === batchName && (s.domain === selectedCourse?.name || s.domain === selectedCourse?.title)).length;

              return (
                <div key={idx} className="premium-card premium-card-hoverable" onClick={() => navigate('/admin/students', { state: { preSelectedCourse: selectedCourse?.name, preSelectedCohort: batchName } })} style={{ cursor: 'pointer', background: 'linear-gradient(135deg, var(--primary-color), var(--primary-dark))', border: '1px solid var(--border-color)', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ color: '#ffffff', fontSize: '1.25rem', marginBottom: '8px' }}>{batchName}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: '500', margin: 0 }}>Click to view students ➔</p>
                  </div>

                  {/* Right-Side Stats & Mentor Assignment Box */}
                  <div style={{ textAlign: 'right', background: 'rgba(0,0,0,0.25)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '6px' }}>
                      👥 {studentCount} Students
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span>👨‍🏫 Mentor: <strong style={{ color: '#fbbf24' }}>Pending Assignment</strong></span>
                      <span>📚 Active Module: <strong style={{ color: '#38bdf8' }}>Module 1</strong></span>
                    </div>
                  </div>
                </div>
              )
            })}
            {allStudents.filter(s => s.domain === selectedCourse?.name || s.domain === selectedCourse?.title).length === 0 && (
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
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Student Info</th>
                  <th>Offer Letter</th>
                  <th>LST Batch</th>
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
                      {(app.student?.offer_letter || app.student?.offerLetter) ? (
                        <a href={app.student?.offer_letter || app.student?.offerLetter} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 'bold' }}>View Document</a>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>N/A</span>
                      )}
                    </td>
                    <td>
                      <select
                        defaultValue={app.student?.lst_batch || ""}
                        onChange={(e) => handleAssignLST(app.student?.id || app.student, e.target.value)}
                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                      >
                        <option value="">Unassigned</option>
                        <option value="1">Batch 1</option>
                        <option value="2">Batch 2</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {app.status === "PENDING" && (
                          <button onClick={() => handleApprove(app.id)} className="premium-btn premium-btn-primary" style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}>
                            Accept
                          </button>
                        )}
                        {app.status === "ACCEPTED" && (
                          <button onClick={() => handleToggleAccess(app.id, app.status)} className="premium-btn premium-btn-danger" style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}>
                            Remove
                          </button>
                        )}
                        {app.status === "REMOVED" && (
                          <button onClick={() => handleToggleAccess(app.id, app.status)} className="premium-btn premium-btn-secondary" style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}>
                            Accept Back
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className={styles.announcementSection}>
        <h2>Quick Actions</h2>
        <div className={styles.cards}>
          <Link to="/admin/add-student" className={`$"premium-card" premium-card-hoverable`}>
            <h3>➕ Add Student</h3>
          </Link>
          <Link to="/admin/add-mentor" className={`$"premium-card" premium-card-hoverable`}>
            <h3>👨‍🏫 Add Mentor</h3>
          </Link>
          <Link to="/admin/add-course" className={`$"premium-card" premium-card-hoverable`}>
            <h3>📚 Add Course</h3>
          </Link>
          <Link to="/admin/add-exam" className={`$"premium-card" premium-card-hoverable`}>
            <h3>📝 Create Exam</h3>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;