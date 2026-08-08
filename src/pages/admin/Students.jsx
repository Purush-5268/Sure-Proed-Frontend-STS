import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { studentService } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import { cohortService } from "../../services/cohortService";
import { normalizeListResponse } from "../../services/apiClient";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Students.module.css"; // Ensure your CSS handles basic flex layouts

function Students() {
  const location = useLocation();
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);

  const [selectedCourse, setSelectedCourse] = useState(location.state?.preSelectedCourse || "");
  const [selectedCohort, setSelectedCohort] = useState(location.state?.preSelectedCohort || "");
  const [selectedStudent, setSelectedStudent] = useState(null); // For the Profile Modal
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [studentsRes, coursesRes, cohortsRes] = await Promise.all([
          studentService.getStudentProfiles(),
          courseService.getCourses(),
          cohortService.getCohorts(),
        ]);
        setStudents(normalizeListResponse(studentsRes));
        setCourses(normalizeListResponse(coursesRes));
        setCohorts(normalizeListResponse(cohortsRes));
      } catch (err) {
        console.error("Failed to load data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleToggleAccess = async (studentId, isApproving) => {
    // AVAILABLE means Approved. NOT_AVAILABLE means Locked/Pending.
    const newStatus = isApproving ? "AVAILABLE" : "NOT_AVAILABLE";
    try {
      await studentService.patchStudentProfile(studentId, { status: newStatus });
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status: newStatus } : s));
    } catch (err) {
      alert("Failed to update student access.");
    }
  };

  const handleUpdateLSTBatch = async (studentId, batchName) => {
    try {
      // Patches the database instantly
      await studentService.patchStudentProfile(studentId, { lst_batch: batchName });
      // Updates the background table state
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, lst_batch: batchName } : s));
      // Updates the currently open modal instantly
      setSelectedStudent(prev => ({ ...prev, lst_batch: batchName }));
    } catch (err) {
      alert("Failed to update LST Batch. Ensure lst_batch exists in backend models!");
    }
  };

  // Filter Logic: Hierarchy + Search
  const filteredStudents = students.filter(student => {
    // 1. Course Filter (Assumes student.domain relates to course)
    if (selectedCourse && student.domain !== selectedCourse) return false;
    // 2. Cohort Filter (Assumes student.course_batch relates to cohort)
    if (selectedCohort && student.course_batch !== selectedCohort) return false;
    // 3. Search Bar Filter
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      const nameMatch = (student.user?.first_name + " " + student.user?.last_name).toLowerCase().includes(search);
      const codeMatch = student.student_code?.toLowerCase().includes(search);
      if (!nameMatch && !codeMatch) return false;
    }
    return true;
  });

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Student Management</h1>
          <p className="premium-subtitle">Manage, filter, and control access for all registered students.</p>
        </div>
        <Link to="/admin/add-student" className="premium-btn premium-btn-primary">+ Add Student</Link>
      </div>

      {/* Filters & Search Hierarchy */}
      <div className="premium-card premium-flex-row" style={{ marginBottom: "2rem" }}>
        <input
          type="text" className="premium-input" placeholder="Search by name or student code..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 2 }}
        />
        <select
          value={selectedCourse}
          onChange={(e) => { setSelectedCourse(e.target.value); setSelectedCohort(""); }}
          className="premium-input"
          style={{ flex: 1 }}
        >
          <option value="">All Courses / Domains</option>
          {courses.map(c => <option key={c.id} value={c.name || c.id}>{c.name}</option>)}
        </select>
        <select
          value={selectedCohort}
          onChange={(e) => setSelectedCohort(e.target.value)}
          disabled={!selectedCourse}
          className="premium-input"
          style={{ flex: 1, backgroundColor: !selectedCourse ? "var(--bg-nested)" : "var(--bg-surface)" }}
        >
          <option value="">All Batches</option>
          {/* Only show cohorts for the selected course */}
          {cohorts.filter(c => c.course?.name === selectedCourse || c.course === selectedCourse).map(coh => (
            <option key={coh.id} value={coh.name || coh.id}>{coh.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="premium-table-container">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Student Name & Code</th>
              <th>Domain & Batch</th>
              <th>College</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ padding: "2rem", textAlign: "center" }}><div className="skeleton-shimmer" style={{ height: "40px", borderRadius: "8px", width: "100%" }}></div></td></tr>
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ padding: 0 }}>
                  <div className="premium-empty-state" style={{ border: "none" }}>
                    <div className="premium-empty-state-icon">📚</div>
                    <h3>No students found</h3>
                    <p>Try changing the filters or add a new student.</p>
                    <Link to="/admin/add-student" className="premium-btn premium-btn-primary">Add Student</Link>
                  </div>
                </td>
              </tr>
            ) : (
              filteredStudents.map(student => {
                const isRemoved = student.status === "NOT_AVAILABLE";
                return (
                  <tr key={student.id} onClick={() => setSelectedStudent(student)} style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: isRemoved ? "var(--status-inactive-bg)" : "transparent", cursor: "pointer", transition: "background-color 0.2s" }} className="premium-table-row">
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <strong style={{ fontSize: "15px", color: "var(--text-primary)" }}>{student.user?.first_name} {student.user?.last_name}</strong>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>{student.student_code}</div>
                    </td>
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <span style={{ display: "inline-block", fontWeight: "600", color: "var(--accent-color)", backgroundColor: "var(--bg-nested)", padding: "4px 8px", borderRadius: "6px", fontSize: "13px", marginBottom: "4px" }}>{student.domain || "N/A"}</span>
                      <span style={{ display: "block", fontSize: "12px", color: "var(--status-active-text)", fontWeight: "600" }}>{student.course_batch || "N/A"}</span>
                      {student.offer_letter && (
                        <div style={{ marginTop: "8px" }}>
                          <a href={student.offer_letter.startsWith('http') ? student.offer_letter : `http://0.0.0.0:8001${student.offer_letter}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: "13px", fontWeight: "bold", textDecoration: "underline" }}>
                            📄 View Offer Letter
                          </a>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "1.25rem 1rem", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "500" }}>{student.college || "N/A"}</td>
                    <td style={{ padding: "1.25rem 1rem" }} onClick={(e) => e.stopPropagation()}>
                      {isRemoved ? (
                        <button onClick={() => handleToggleAccess(student.id, true)} className="premium-btn" style={{ backgroundColor: "#10b981", color: "#fff", padding: "8px 16px", height: "auto", fontSize: "13px" }}>
                          ✅ Approve Access
                        </button>
                      ) : (
                        <button onClick={() => { if (window.confirm("Are you sure you want to revoke this student's access to live classes? Their data will NOT be deleted.")) handleToggleAccess(student.id, false); }} className="premium-btn" style={{ backgroundColor: "#ef4444", color: "#fff", padding: "8px 16px", height: "auto", fontSize: "13px" }}>
                          ❌ Revoke Access
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 🚨 FULL STUDENT PROFILE MODAL 🚨 */}
      {selectedStudent && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "2rem", borderRadius: "12px", width: "90%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <button onClick={() => setSelectedStudent(null)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer" }}>✖</button>
            <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>{selectedStudent.user?.first_name} {selectedStudent.user?.last_name}</h2>
            <p style={{ color: "var(--text-muted)", margin: "0 0 1.5rem 0" }}>{selectedStudent.user?.email} | {selectedStudent.student_code}</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div><strong>Domain:</strong> {selectedStudent.domain || "N/A"}</div>
              <div><strong>Batch:</strong> {selectedStudent.course_batch || "N/A"}</div>
              <div><strong>College:</strong> {selectedStudent.college || "N/A"}</div>
              <div><strong>Phone:</strong> {selectedStudent.user?.phone_number || "N/A"}</div>
              <div><strong>City:</strong> {selectedStudent.city || "N/A"}</div>
              <div><strong>Degree:</strong> {selectedStudent.degree || "N/A"}</div>
            </div>

            {/* 🚨 LST BATCH ASSIGNMENT UI 🚨 */}
            <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "var(--bg-nested)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <strong style={{ display: "block", marginBottom: "8px", color: "var(--text-primary)" }}>Assign LST Batch:</strong>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-secondary)", marginRight: "auto" }}>
                  Current: {selectedStudent.lst_batch || "Not Assigned"}
                </span>
                <button onClick={() => handleUpdateLSTBatch(selectedStudent.id, "Batch 1")} className="premium-btn" style={{ padding: "6px 12px", height: "auto", fontSize: "13px", backgroundColor: selectedStudent.lst_batch === "Batch 1" ? "#15803d" : "var(--bg-surface)", color: selectedStudent.lst_batch === "Batch 1" ? "#fff" : "var(--text-primary)", border: "1px solid var(--border-color)" }}>Batch 1</button>
                <button onClick={() => handleUpdateLSTBatch(selectedStudent.id, "Batch 2")} className="premium-btn" style={{ padding: "6px 12px", height: "auto", fontSize: "13px", backgroundColor: selectedStudent.lst_batch === "Batch 2" ? "#15803d" : "var(--bg-surface)", color: selectedStudent.lst_batch === "Batch 2" ? "#fff" : "var(--text-primary)", border: "1px solid var(--border-color)" }}>Batch 2</button>
                <button onClick={() => handleUpdateLSTBatch(selectedStudent.id, "")} className="premium-btn" style={{ padding: "6px 12px", height: "auto", fontSize: "13px", backgroundColor: "#ef4444", color: "#fff" }}>Clear</button>
              </div>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <strong>Bio:</strong>
              <p style={{ backgroundColor: "var(--bg-nested)", padding: "10px", borderRadius: "8px", margin: "8px 0 0 0" }}>{selectedStudent.bio || "No bio provided."}</p>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <strong>Skills:</strong>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                {(selectedStudent.skills || []).map((skill, idx) => (
                  <span key={idx} style={{ backgroundColor: "var(--bg-nested)", color: "#4338ca", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>{skill}</span>
                ))}
                {(!selectedStudent.skills || selectedStudent.skills.length === 0) && <span style={{ color: "var(--text-muted)" }}>No skills listed.</span>}
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              {selectedStudent.offer_letter && (
                <a href={selectedStudent.offer_letter.startsWith('http') ? selectedStudent.offer_letter : `http://0.0.0.0:8001${selectedStudent.offer_letter}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px", backgroundColor: "#2563eb", color: "white", textDecoration: "none", borderRadius: "8px", fontWeight: "bold" }}>View Offer Letter</a>
              )}
              {selectedStudent.resume && (
                <a href={selectedStudent.resume.startsWith('http') ? selectedStudent.resume : `http://0.0.0.0:8001${selectedStudent.resume}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px", backgroundColor: "#10b981", color: "white", textDecoration: "none", borderRadius: "8px", fontWeight: "bold" }}>View Resume</a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Students;