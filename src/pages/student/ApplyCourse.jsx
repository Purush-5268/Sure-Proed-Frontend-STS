// import { useEffect, useState } from "react";
// import { Link, useLocation } from "react-router-dom";
// import { useAuth } from "../../context/AuthContext";
// import { studentService, resolveStudentEnrollment } from "../../services/studentService";
// import { courseService } from "../../services/courseService";
// import apiClient from "../../services/apiClient";
// import { API_ENDPOINTS } from "../../constants/apiEndpoints";
// import styles from "./ApplyCourse.module.css";
// import SkeletonLoader from "../../components/common/SkeletonLoader";

// function ApplyCourse() {
//   const location = useLocation();
//   const { user } = useAuth();
//   const [profileCompleted, setProfileCompleted] = useState(Boolean(location.state?.profileCompleted));
//   const [courses, setCourses] = useState([]);
//   const [activeApplication, setActiveApplication] = useState(null);
//   const [resolvedEnrollment, setResolvedEnrollment] = useState({ isEnrolled: false });
//   const [isCurrentlyEnrolled, setIsCurrentlyEnrolled] = useState(false);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     async function loadData() {
//       try {
//         const [profileData, coursesData, appRes] = await Promise.all([
//           user?.email ? studentService.getProfile(user.email) : Promise.resolve(null),
//           courseService.getCourses(),
//           user?.email ? apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/") : Promise.resolve({ data: [] })
//         ]);
//         setProfileCompleted(studentService.isProfileComplete(profileData));
//         const apps = appRes.data?.results || appRes.data || [];
//         const coursesArray = Array.isArray(coursesData) ? coursesData : coursesData?.results || coursesData?.data || [];

//         setCourses(coursesArray);

//         const enrollment = resolveStudentEnrollment(profileData, apps, coursesArray);
//         setResolvedEnrollment(enrollment);

//         if (enrollment.isEnrolled) {
//           setIsCurrentlyEnrolled(true);
//           setActiveApplication(enrollment.application);
//         }
//       } catch (err) {
//         console.error("Failed to load apply-course data:", err);
//       } finally {
//         setLoading(false);
//       }
//     }

//     loadData();
//   }, [user, location.state?.profileCompleted]);

//   return (
//     <div className={styles.coursePage}>
//       <div className={styles.container}>

//         <div className={styles.header}>
//           <h1>Available Internship Courses</h1>

//           <p>
//             Browse the available internship courses. Select a course to view
//             complete details before submitting your application.
//           </p>
//         </div>

//         {loading ? (
//           <SkeletonLoader variant="card" rows={4} />
//           ) : isCurrentlyEnrolled ? (
//             <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px solid var(--border-color)', maxWidth: '600px', margin: '40px auto' }}>
//               <h2 style={{ color: 'var(--primary-color)', marginBottom: '16px', fontSize: '24px' }}>🎓 Next Application</h2>
//               <div style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '12px', marginBottom: '24px', textAlign: 'left' }}>
//                 <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Current Course</p>
//                 <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>{resolvedEnrollment.courseName}</h3>
//                 <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Current Group</p>
//                 <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>{resolvedEnrollment.group}</h3>
//                 <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Current Status</p>
//                 <h3 style={{ margin: 0, fontSize: '18px' }}>{resolvedEnrollment.status}</h3>
//               </div>
//             <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '16px' }}>
//               You are currently enrolled in this Group. You can apply for another Course or Group when eligible.
//             </p>
//               <Link to="/student/dashboard" className={styles.detailsBtn} style={{ display: 'inline-block' }}>Go to Dashboard</Link>
//             </div>
//         ) : (
//           <div className={styles.courseGrid}>

//             {courses.map((course) => (
//               <div
//                 key={course.id}
//                 className={styles.courseCard}
//               >

//                 <span className={styles.badge}>
//                   Published
//                 </span>

//                 <h2>{course.name}</h2>

//                 <p>{course.description}</p>

//                 <div className={styles.info}>

//                   <div>
//                     <strong>Course Code</strong>
//                     <span>{course.code}</span>
//                   </div>

//                   <div>
//                     <strong>Duration</strong>
//                     <span>{course.duration_weeks ? `${course.duration_weeks} Weeks` : "N/A"}</span>
//                   </div>

//                   <div>
//                     <strong>Difficulty</strong>
//                     <span>{course.difficulty}</span>
//                   </div>

//                 </div>

//                 <div className={styles.buttons}>

//                   {profileCompleted ? (
//                     <Link
//                       to={`/student/course/${course.id}`}
//                       className={styles.detailsBtn}
//                     >
//                       View Details
//                     </Link>
//                   ) : (
//                     <Link
//                       to="/student/profile"
//                       className={styles.detailsBtn}
//                     >
//                       Complete Profile First
//                     </Link>
//                   )}

//                 </div>

//               </div>
//             ))}

//           </div>
//         )}

//       </div>
//     </div>
//   );
// }

// export default ApplyCourse;
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import apiClient from "../../services/apiClient";
import styles from "./ApplyCourse.module.css";

function ApplyCourse() {
  const location = useLocation();
  const { user } = useAuth();
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [courses, setCourses] = useState([]);
  const [appliedCourseIds, setAppliedCourseIds] = useState(new Set());
  const [activeApplication, setActiveApplication] = useState(null);
  const [hasQualified, setHasQualified] = useState(false);
  const [cooldownCourseMap, setCooldownCourseMap] = useState({}); // { [courseId]: true }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [profileData, coursesData, appsData] = await Promise.all([
          user?.email ? studentService.getProfile(user.email) : Promise.resolve(null),
          courseService.getCourses(),
          apiClient.get("/api/applications/").catch(() => null),
        ]);

        // 1. Check Profile Completion (Default to true so candidates can apply)
        setProfileCompleted(true);

        // 2. Process Courses List
        const rawCourses = Array.isArray(coursesData) ? coursesData : coursesData?.results || coursesData?.data || [];
        setCourses(rawCourses);

        // 3. Process Applications from Backend & Local Storage
        const appliedSet = new Set(JSON.parse(localStorage.getItem("sure_applied_course_ids") || "[]"));
        const cooldownMap = {};
        let activeApp = null;
        let qualified = false;

        const apps = Array.isArray(appsData?.data) ? appsData.data : (appsData?.data?.results || []);
        if (appsData && appsData.data != null) {
          localStorage.setItem("sure_student_applications", JSON.stringify(apps));
          const validCourseIds = apps.map((a) => a.course?.id || a.course_id).filter(Boolean);
          localStorage.setItem("sure_applied_course_ids", JSON.stringify(validCourseIds));

          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith("sure_exam_disqualified_")) {
              const cId = key.replace("sure_exam_disqualified_", "");
              if (!validCourseIds.includes(cId)) {
                localStorage.removeItem(key);
              }
            }
          });
        }

        const allApps = [...apps];

        allApps.forEach((a) => {
          const cId = a.course?.id || (typeof a.course === "string" ? a.course : a.course_id);

          const statusUpper = (a.status || "").toUpperCase();
          const isCheatedOrDisqualified = (a.cheat_count && a.cheat_count >= 3) || statusUpper === "DISQUALIFIED" || localStorage.getItem(`sure_exam_disqualified_${cId}`) === "true";

          if (isCheatedOrDisqualified) {
            if (cId) cooldownMap[cId] = true;
          } else if (["QUALIFIED", "COHORT_ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(statusUpper) && (a.qualified !== false)) {
            qualified = true;
            if (cId) appliedSet.add(cId);
          } else if (["REJECTED", "EXAM_FAILED"].includes(statusUpper)) {
            if (cId) cooldownMap[cId] = true;
          } else if (["APPLIED", "SUBMITTED", "PRESCREENING_PENDING", "PRESCREENING_COMPLETED", "EXAM_PENDING", "WAITLISTED"].includes(statusUpper)) {
            if (!activeApp) activeApp = a;
            if (cId) appliedSet.add(cId);
          }
        });

        // Check localStorage Disqualification Flags for Cooldown
        rawCourses.forEach((c) => {
          if (localStorage.getItem(`sure_exam_disqualified_${c.id}`) === "true") {
            cooldownMap[c.id] = true;
          }
        });

        setAppliedCourseIds(appliedSet);
        setActiveApplication(activeApp);
        setHasQualified(qualified);
        setCooldownCourseMap(cooldownMap);
      } catch (err) {
        console.error("Failed to load apply-course data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, location.state?.profileCompleted]);

  return (
    <div className={styles.coursePage}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Available Internship Courses</h1>
          <p>
            Browse the available internship courses. Complete your profile to apply for your desired track.
          </p>
        </div>

        {/* 🚨 PERMANENT QUALIFICATION BANNER 🚨 */}
        {!loading && hasQualified && (
          <div style={{ backgroundColor: "#f0fdf4", border: "2px solid #22c55e", padding: "1rem 1.5rem", borderRadius: "12px", marginBottom: "2rem" }}>
            <h3 style={{ margin: "0 0 4px 0", color: "#15803d", fontSize: "16px" }}>🏆 Permanent Qualified Lock Active</h3>
            <p style={{ margin: 0, color: "#166534", fontSize: "14px" }}>
              Congratulations! You have already qualified for an internship track. Further course applications are permanently locked.
            </p>
          </div>
        )}

        {/* 🚨 ACTIVE APPLICATION LOCK BANNER 🚨 */}
        {!loading && !hasQualified && activeApplication && (
          <div style={{ backgroundColor: "#eff6ff", border: "1px solid #93c5fd", padding: "1rem 1.5rem", borderRadius: "12px", marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#1e40af", fontWeight: "bold", fontSize: "14px" }}>
              🔒 Active Application Pending: You currently hold an active application ({activeApplication.application_number || "Active Track"}). 1 active application allowed at a time.
            </span>
            <Link to="/student/applications" style={{ padding: "8px 18px", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "14px" }}>
              View Active Application
            </Link>
          </div>
        )}

        {/* 🚨 PROFILE INCOMPLETE WARNING BANNER 🚨 */}
        {!loading && !profileCompleted && !hasQualified && !activeApplication && (
          <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fcd34d", padding: "1rem 1.5rem", borderRadius: "12px", marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#92400e", fontWeight: "bold", fontSize: "14px" }}>
              ⚠️ Your student profile is incomplete. Please complete your profile details first to unlock course applications.
            </span>
            <Link to="/student/profile" style={{ padding: "8px 18px", backgroundColor: "#d97706", color: "white", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "14px" }}>
              Complete Profile Now
            </Link>
          </div>
        )}

        {loading ? (
          <p style={{ color: "#64748b" }}>Loading courses from the database...</p>
        ) : courses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
            <h3 style={{ color: "#475569", marginBottom: "8px" }}>No Courses Available</h3>
            <p style={{ color: "#64748b" }}>There are currently no published internship courses available for application.</p>
          </div>
        ) : (
          <div className={styles.courseGrid}>
            {courses.map((course) => {
              const hasApplied = appliedCourseIds.has(course.id);
              const isUnderCooldown = cooldownCourseMap[course.id];
              const isActiveTrack = activeApplication && (activeApplication.course?.id === course.id || activeApplication.course_id === course.id);

              return (
                <div key={course.id} className={styles.courseCard}>
                  <span
                    className={styles.badge}
                    style={{
                      backgroundColor: hasApplied ? "#059669" : isUnderCooldown ? "#dc2626" : "#2563eb",
                      color: "#ffffff",
                    }}
                  >
                    {isActiveTrack ? "Active Application Track" : hasApplied ? "Applied Track" : isUnderCooldown ? "Cooldown Active" : "Published"}
                  </span>
                  <h2>{course.name}</h2>
                  <p>{course.description}</p>

                  <div className={styles.info}>
                    <div>
                      <strong>Course Code</strong>
                      <span>{course.code}</span>
                    </div>
                    <div>
                      <strong>Domain</strong>
                      <span>{course.domain}</span>
                    </div>
                    <div>
                      <strong>Duration</strong>
                      <span>{course.duration_weeks ? `${course.duration_weeks} Weeks` : "24 Weeks"}</span>
                    </div>
                    <div>
                      <strong>Difficulty</strong>
                      <span>{course.difficulty}</span>
                    </div>
                  </div>

                  <div className={styles.buttons}>
                    {hasQualified ? (
                      <button disabled className={styles.detailsBtn} style={{ backgroundColor: "#94a3b8", color: "#ffffff", border: "none", cursor: "not-allowed" }}>
                        🔒 Permanently Qualified
                      </button>
                    ) : isActiveTrack ? (
                      <Link to="/student/applications" className={styles.detailsBtn} style={{ backgroundColor: "#059669", color: "#ffffff", border: "none", textAlign: "center" }}>
                        ✓ Active Application (View Status)
                      </Link>
                    ) : activeApplication ? (
                      <button disabled className={styles.detailsBtn} style={{ backgroundColor: "#cbd5e1", color: "#64748b", border: "none", cursor: "not-allowed" }}>
                        🔒 Locked (1 Active Application Allowed)
                      </button>
                    ) : isUnderCooldown ? (
                      <button disabled className={styles.detailsBtn} style={{ backgroundColor: "#fee2e2", color: "#991b1b", border: "none", cursor: "not-allowed", fontWeight: "bold" }}>
                        REJECTED (15-Day Cooldown Active)
                      </button>
                    ) : profileCompleted ? (
                      <Link to={`/student/course/${course.id}`} className={styles.detailsBtn}>
                        View Details & Apply
                      </Link>
                    ) : (
                      <Link to="/student/profile" className={styles.detailsBtn} style={{ backgroundColor: "#d97706", color: "#ffffff", border: "none" }}>
                        Complete Profile First
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ApplyCourse;