// import { useEffect, useState } from "react";
// import { Link } from "react-router-dom";
// import apiClient from "../../services/apiClient";
// import { API_ENDPOINTS } from "../../constants/apiEndpoints";
// import styles from "./Exams.module.css";
// import SkeletonLoader from "../../components/common/SkeletonLoader";

// function Exams() {
//   const [exams, setExams] = useState([]);
//   const [applications, setApplications] = useState([]);
//   const [courses, setCourses] = useState([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     let isMounted = true;
//     const loadData = async () => {
//       try {
//         const [examsResponse, applicationsResponse, coursesResponse] = await Promise.all([
//           apiClient.get(API_ENDPOINTS.EXAMS.BASE),
//           apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE),
//           apiClient.get(API_ENDPOINTS.COURSES.BASE),
//         ]);

//         if (isMounted) {
//           setExams(Array.isArray(examsResponse.data) ? examsResponse.data : []);
//           setApplications(Array.isArray(applicationsResponse.data) ? applicationsResponse.data : []);
//           setCourses(Array.isArray(coursesResponse.data) ? coursesResponse.data : []);
//         }
//       } catch (err) {
//         console.error("Failed to load exams:", err);
//         if (isMounted) {
//           setExams([]);
//           setApplications([]);
//           setCourses([]);
//         }
//       } finally {
//         if (isMounted) setLoading(false);
//       }
//     };

//     loadData();
//     return () => {
//       isMounted = false;
//     };
//   }, []);

//   const getCourseName = (applicationId) => {
//     const application = applications.find((item) => item.id === applicationId);
//     const courseId = application?.course;
//     const course = courses.find((item) => item.id === courseId);
//     return course?.name || application?.course?.name || "N/A";
//   };

//   return (
//     <div className={styles.container}>
//       <div className={styles.header}>
//         <div>
//           <h1>Exam Management</h1>
//           <p>Manage all screening exams</p>
//         </div>

//         <Link to="/admin/add-exam" className={styles.addBtn}>
//           + Add Exam
//         </Link>
//       </div>

//       {loading ? (
//         <SkeletonLoader variant="table" rows={5} />
//       ) : exams.length === 0 ? (
//         <p>No exams have been created yet.</p>
//       ) : (
//         <div className="premium-table-container">
//           <table className="premium-table">
//             <thead>
//               <tr>
//                 <th>Exam</th>
//                 <th>Course</th>
//                 <th>Duration</th>
//                 <th>Questions</th>
//                 <th>Status</th>
//                 <th>Action</th>
//               </tr>
//             </thead>

//             <tbody>
//               {exams.map((exam) => (
//                 <tr key={exam.id}>
//                   <td>{exam.level || "Exam"}</td>
//                   <td>{getCourseName(exam.application)}</td>
//                   <td>{exam.duration_minutes ? `${exam.duration_minutes} mins` : "N/A"}</td>
//                   <td>{Array.isArray(exam.questions) ? exam.questions.length : 0}</td>

//                   <td className={exam.status === "PENDING" ? styles.upcoming : exam.status === "SUBMITTED" ? styles.completed : styles.active}>
//                     {exam.status || "PENDING"}
//                   </td>

//                   <td className="actions" style={{ display: "flex", gap: "8px" }}>
//                     <Link to="/admin/exam-details">View</Link>
//                     <Link to="/admin/edit-exam">Edit</Link>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       )}
//     </div>
//   );
// }

// export default Exams;
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Exams.module.css";

function Exams() {
  const [exams, setExams] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Form state to update exam configuration
  const [editingDomain, setEditingDomain] = useState("DEFAULT");
  const [durationMins, setDurationMins] = useState(30);
  const [numQuestions, setNumQuestions] = useState(30);
  const [passPct, setPassPct] = useState(60);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(null);

  // Helper to extract candidate initials for avatar
  const getInitials = (nameStr) => {
    if (!nameStr || nameStr === "N/A" || nameStr === "Candidate") return "ST";
    const parts = nameStr.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  };

  // Helper to clean up raw email addresses
  const cleanEmail = (rawEmail) => {
    if (!rawEmail || rawEmail === "N/A") return "";
    const str = String(rawEmail).trim();
    if (str.includes("@")) return str.toLowerCase();
    if (str.includes("example.com")) {
      const prefix = str.replace("example.com", "").replace(/_[A-Za-z0-9]{3,8}$/, "");
      return `${prefix}@example.com`.toLowerCase();
    }
    return str.toLowerCase();
  };

  // Exact DB mapping for known exam records removed in favor of backend API source of truth

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);

      try {
        const parseList = (resData) => {
          if (!resData) return [];
          if (Array.isArray(resData)) return resData;
          if (resData && Array.isArray(resData.results)) return resData.results;
          return [];
        };

        const [examsRes, repRes, stuRes, crsRes, usersRes, appsRes] = await Promise.all([
          apiClient.get("/api/exams/?page_size=1000").catch(() => null),
          apiClient.get(API_ENDPOINTS.EXAMS.REPORTS).catch(() => null),
          apiClient.get("/api/students/?page_size=1000").catch(() => null),
          apiClient.get("/api/courses/?page_size=1000").catch(() => null),
          apiClient.get("/api/users/?page_size=1000").catch(() => null),
          apiClient.get("/api/applications/?page_size=1000").catch(() => null),
        ]);

        const rawExams = parseList(examsRes?.data);
        const rawReports = parseList(repRes?.data);
        const rawStudents = parseList(stuRes?.data);
        const rawCourses = parseList(crsRes?.data);
        const rawUsers = parseList(usersRes?.data);
        const rawApps = parseList(appsRes?.data);

        const usersMap = {};
        rawUsers.forEach((u) => { if (u?.id) usersMap[u.id] = u; });

        const studentsMap = {};
        rawStudents.forEach((s) => {
          let uObj = s.user;
          if (typeof uObj === "string" && usersMap[uObj]) uObj = usersMap[uObj];
          if (s?.id) studentsMap[s.id] = { ...s, user: uObj };
        });

        const coursesMap = {};
        rawCourses.forEach((c) => { if (c?.id) coursesMap[c.id] = c.name || c.title; });

        const appsMap = {};
        rawApps.forEach((a) => {
          let sName = a.student_name;
          let sEmail = cleanEmail(a.student_email);

          if (a.student) {
            const stu = typeof a.student === "object" ? a.student : studentsMap[a.student];
            if (stu && stu.user) {
              const u = typeof stu.user === "object" ? stu.user : usersMap[stu.user];
              if (u) {
                const fn = (u.first_name || "").trim();
                const ln = (u.last_name || "").trim();
                if (fn || ln) sName = `${fn} ${ln}`.trim();
                if (u.email) sEmail = cleanEmail(u.email);
              }
            }
          }

          let cName = a.course_name;
          if (!cName && a.course) {
            cName = typeof a.course === "object" ? (a.course.name || a.course.title) : coursesMap[a.course];
          }

          if (a?.id) {
            appsMap[a.id] = {
              ...a,
              student_name: sName,
              student_email: sEmail,
              course_name: cName,
            };
          }
        });

        // Master union of exam records
        const masterExamsMap = {};
        rawExams.forEach((e) => {
          if (e?.id) masterExamsMap[e.id] = e;
        });
        rawReports.forEach((e) => {
          if (e?.id) {
            const existing = masterExamsMap[e.id] || {};
            masterExamsMap[e.id] = {
              ...existing,
              ...e,
              student_name: e.student_name || existing.student_name,
              student_email: e.student_email || existing.student_email,
              course_name: e.course_name || existing.course_name,
            };
          }
        });

        const allExamRecords = Object.values(masterExamsMap);

        const hydratedExams = allExamRecords.map((e) => {
          let name = e.student_name;
          let email = cleanEmail(e.student_email);
          let courseName = e.course_name || e.domain;

          // Resolve from application
          if (e.application && appsMap[e.application]) {
            const app = appsMap[e.application];
            if (app.student_name) name = app.student_name;
            if (app.student_email) email = app.student_email;
            if (app.course_name) courseName = app.course_name;
          }

          return {
            ...e,
            candidate_name: name || "Candidate",
            candidate_email: email || "candidate@suretrust.org",
            course_title: courseName || "General Track",
          };
        });

        if (isMounted) setExams(hydratedExams);
      } catch (err) {
        console.error("Failed to load exams list:", err);
        if (isMounted) setExams([]);
      }

      // Fetch Exam Config List
      try {
        const cfgRes = await apiClient.get(API_ENDPOINTS.EXAMS.CONFIG);
        if (isMounted) {
          const cfgData = cfgRes.data;
          const cfgList = Array.isArray(cfgData) ? cfgData : (cfgData?.results || []);
          setConfigs(cfgList);

          const defaultConfig = cfgList.find((c) => c.domain === "DEFAULT") || cfgList[0];
          if (defaultConfig) {
            setEditingDomain(defaultConfig.domain || "DEFAULT");
            setDurationMins(defaultConfig.duration_minutes || 30);
            setNumQuestions(defaultConfig.number_of_questions || 30);
            setPassPct(defaultConfig.pass_percentage || 40.00);
          }
        }
      } catch (err) {
        console.warn("Failed to load exam config list:", err);
      }

      if (isMounted) setLoading(false);
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredExams = useMemo(() => {
    if (!searchTerm.trim()) return exams;
    const term = searchTerm.toLowerCase();
    return exams.filter((e) =>
      (e.candidate_name && e.candidate_name.toLowerCase().includes(term)) ||
      (e.candidate_email && e.candidate_email.toLowerCase().includes(term)) ||
      (e.course_title && e.course_title.toLowerCase().includes(term)) ||
      (e.status && e.status.toLowerCase().includes(term))
    );
  }, [exams, searchTerm]);

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(null);

    try {
      await apiClient.post(API_ENDPOINTS.EXAMS.CONFIG, {
        domain: editingDomain,
        duration_minutes: parseInt(durationMins, 10),
        number_of_questions: parseInt(numQuestions, 10),
        pass_percentage: parseFloat(passPct),
      });

      setConfigSuccess(`Exam configuration for '${editingDomain}' updated successfully!`);

      const res = await apiClient.get(API_ENDPOINTS.EXAMS.CONFIG);
      const resData = res.data;
      setConfigs(Array.isArray(resData) ? resData : (resData?.results || []));
    } catch (err) {
      console.error("Failed to save config:", err);
      alert("Failed to update exam settings.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetExam = async (examId, candidateName) => {
    if (!window.confirm(`Reset exam attempt for ${candidateName}? This will reset marks and cheat count to 0 so the student can give the exam again.`)) {
      return;
    }
    try {
      await apiClient.post(`/api/exams/${examId}/reset/`);
      setExams((prev) => prev.map((e) => (e.id === examId ? { ...e, status: "IN_PROGRESS", cheat_count: 0, percentage: null, marks_obtained: null, qualified: null } : e)));
      alert("✅ Exam session reset successfully. Candidate can now retake the exam!");
    } catch (err) {
      console.error("Failed to reset exam:", err);
      alert("Failed to reset exam session. Please try again.");
    }
  };

  const handleDeleteExam = async (examId, appId, candidateName) => {
    if (!window.confirm(`Delete exam & application record for ${candidateName}? Candidate will be able to apply and give the exam fresh.`)) {
      return;
    }
    try {
      if (appId) {
        await apiClient.delete(`/api/applications/${appId}/`);
      } else {
        await apiClient.delete(`/api/exams/${examId}/`);
      }
      setExams((prev) => prev.filter((e) => e.id !== examId));
      alert("✅ Exam record deleted successfully! Student can now re-apply.");
    } catch (err) {
      console.error("Failed to delete exam record:", err);
      alert("Failed to delete exam record. Please try again.");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <h1 style={{ fontSize: "1.65rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Exam & Screening Control Center
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Monitor student test sessions, evaluate screening results, and configure passing thresholds.
            </p>
          </div>

          <Link to="/admin/reports" className={styles.addButton}>
            📊 View Full Reports & Analytics
          </Link>
        </div>

        {/* Admin Configuration Settings Panel */}
        <div
          style={{
            background: "var(--bg-nested)",
            border: "1px solid var(--border-color)",
            borderRadius: "10px",
            padding: "20px",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--text-primary)", fontWeight: 600 }}>
            ⚙️ Exam Parameter Configuration
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px", marginBottom: "16px" }}>
            Adjust maximum duration (mins), total question pool size, and passing benchmark score for candidates.
          </p>

          {configSuccess && (
            <div style={{ background: "rgba(22, 101, 52, 0.15)", color: "var(--success-color)", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "0.9rem" }}>
              {configSuccess}
            </div>
          )}

          <form onSubmit={handleSaveConfig} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                Target Track Domain
              </label>
              <select
                value={editingDomain}
                onChange={(e) => {
                  const dom = e.target.value;
                  setEditingDomain(dom);
                  const cfg = configs.find((c) => c.domain === dom) ||
                    configs.find((c) => c.domain && (dom.toLowerCase().includes(c.domain.toLowerCase()) || c.domain.toLowerCase().includes(dom.toLowerCase()))) ||
                    configs.find((c) => c.domain === "DEFAULT");
                  if (cfg) {
                    setDurationMins(cfg.duration_minutes || 30);
                    setNumQuestions(cfg.number_of_questions || 30);
                    setPassPct(cfg.pass_percentage || 40.00);
                  }
                }}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "0.85rem" }}
              >
                <option value="DEFAULT">DEFAULT (Global)</option>
                <option value="Full Stack Development">Full Stack Development</option>
                <option value="Java Development">Java Development</option>
                <option value="Artificial Intelligence & Machine Learning">AI & ML</option>
                <option value="Cloud Computing">Cloud Computing</option>
                <option value="Cyber Security">Cyber Security</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                Duration (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="180"
                value={durationMins}
                onChange={(e) => setDurationMins(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "0.85rem" }}
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                Question Count
              </label>
              <input
                type="number"
                min="5"
                max="100"
                value={numQuestions}
                onChange={(e) => setNumQuestions(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "0.85rem" }}
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                Passing Benchmark (%)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={passPct}
                onChange={(e) => setPassPct(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "0.85rem" }}
                required
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={savingConfig}
                style={{ width: "100%", background: "var(--primary-color)", color: "var(--btn-text, #ffffff)", padding: "9px 14px", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}
              >
                {savingConfig ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* Search Bar & Table Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", color: "var(--text-primary)" }}>
            Student Exam Sessions ({filteredExams.length})
          </h2>

          <div style={{ width: "260px" }}>
            <input
              type="text"
              placeholder="Search candidate name, email or course..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Redesigned Student Exam Sessions Table */}
        {loading ? (
          <p style={{ color: "var(--text-secondary)", padding: "20px 0" }}>Loading candidate exam sessions...</p>
        ) : filteredExams.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", background: "var(--bg-nested)", borderRadius: "8px", border: "1px dashed var(--border-color)" }}>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontWeight: 500 }}>No matching student exam sessions found.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ minWidth: "240px" }}>Candidate Profile</th>
                  <th style={{ minWidth: "220px" }}>Applied Track / Course</th>
                  <th>Duration</th>
                  <th>Score Obtained</th>
                  <th>Evaluation Status</th>
                  <th>Security Log</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredExams.map((exam) => (
                  <tr key={exam.id}>
                    {/* Candidate Profile Avatar & Name */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            background: "rgba(37, 99, 235, 0.15)",
                            color: "var(--primary-color)",
                            fontWeight: 700,
                            fontSize: "13px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(exam.candidate_name)}
                        </div>

                        <div>
                          <strong style={{ color: "var(--text-primary)", fontSize: "14px", display: "block", lineHeight: "1.2" }}>
                            {exam.candidate_name}
                          </strong>
                          <span style={{ fontSize: "12px", color: "var(--primary-color)", fontWeight: 500, display: "block", marginTop: "2px" }}>
                            {exam.candidate_email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Course Track Pill */}
                    <td>
                      <span
                        style={{
                          background: "rgba(29, 78, 216, 0.15)",
                          color: "var(--primary-color)",
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          display: "inline-block",
                        }}
                      >
                        {exam.course_title}
                      </span>
                    </td>

                    {/* Duration */}
                    <td style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                      {exam.duration_minutes ? `${exam.duration_minutes} mins` : "30 mins"}
                    </td>

                    {/* Score */}
                    <td>
                      {exam.status === "EVALUATED" ? (
                        <div>
                          <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>
                            {exam.marks_obtained || 0} / {exam.total_marks || 0}
                          </strong>
                          <span style={{ fontSize: "11px", color: "var(--success-color)", fontWeight: 600, marginLeft: "6px" }}>
                            ({exam.percentage || 0}%)
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>Pending</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          display: "inline-block",
                          background:
                            exam.status === "EVALUATED"
                              ? "rgba(21, 128, 61, 0.15)"
                              : exam.status === "PENDING"
                                ? "rgba(180, 83, 9, 0.15)"
                                : "rgba(3, 105, 161, 0.15)",
                          color:
                            exam.status === "EVALUATED"
                              ? "var(--success-color)"
                              : exam.status === "PENDING"
                                ? "var(--warning-color)"
                                : "var(--info-color)",
                        }}
                      >
                        {exam.status || "PENDING"}
                      </span>
                    </td>

                    {/* Security Cheat Log */}
                    <td>
                      {exam.cheat_count > 0 ? (
                        <span style={{ color: "var(--danger-color)", fontWeight: 600, fontSize: "12px" }}>
                          ⚠️ {exam.cheat_count} Violations
                        </span>
                      ) : (
                        <span style={{ color: "var(--success-color)", fontWeight: 500, fontSize: "12px" }}>
                          🛡️ Clean
                        </span>
                      )}
                    </td>

                    {/* Action Links */}
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => handleResetExam(exam.id, exam.candidate_name)}
                          style={{
                            padding: "5px 10px",
                            backgroundColor: "rgba(180, 83, 9, 0.1)",
                            color: "var(--warning-color)",
                            border: "1px solid rgba(180, 83, 9, 0.2)",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          🔄 Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExam(exam.id, exam.application, exam.candidate_name)}
                          style={{
                            padding: "5px 10px",
                            backgroundColor: "rgba(220, 38, 38, 0.1)",
                            color: "var(--danger-color)",
                            border: "1px solid rgba(220, 38, 38, 0.2)",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Exams;