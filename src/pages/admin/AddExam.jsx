// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import apiClient from "../../services/apiClient";
// import { API_ENDPOINTS } from "../../constants/apiEndpoints";
// import styles from "./AddExam.module.css";

// function AddExam() {
//   const navigate = useNavigate();
//   const [applications, setApplications] = useState([]);
//   const [form, setForm] = useState({
//     application: "",
//     level: "MIXED",
//     duration_minutes: "45",
//     pass_percentage: "60",
//     status: "PENDING",
//     total_marks: "100",
//   });
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");
//   const [success, setSuccess] = useState("");

//   useEffect(() => {
//     let isMounted = true;
//     const loadApplications = async () => {
//       try {
//         const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE);
//         if (isMounted) setApplications(Array.isArray(response.data) ? response.data : []);
//       } catch (err) {
//         console.error("Failed to load applications:", err);
//       }
//     };

//     loadApplications();
//     return () => {
//       isMounted = false;
//     };
//   }, []);

//   const handleChange = (event) => {
//     const { name, value } = event.target;
//     setForm((prev) => ({ ...prev, [name]: value }));
//   };

//   const handleSubmit = async (event) => {
//     event.preventDefault();
//     setError("");
//     setSuccess("");

//     if (!form.application) {
//       setError("Please select an application before creating an exam.");
//       return;
//     }

//     setLoading(true);

//     try {
//       const payload = {
//         application: form.application,
//         level: form.level,
//         duration_minutes: Number(form.duration_minutes) || 45,
//         pass_percentage: Number(form.pass_percentage) || 60,
//         status: form.status,
//         total_marks: Number(form.total_marks) || 100,
//       };

//       await apiClient.post(API_ENDPOINTS.EXAMS.BASE, payload);
//       setSuccess("Exam created successfully.");
//       navigate("/admin/exams");
//     } catch (err) {
//       const message = err?.response?.data?.detail || err?.response?.data?.message || err?.response?.data?.non_field_errors?.[0] || "Unable to create the exam.";
//       setError(message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div style={{ padding: "2rem", width: "100%" }}>
//       <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
//         <div>
//           <h1 style={{ margin: 0, color: "var(--text-primary)", fontSize: "2rem" }}>Add New Exam</h1>
//           <p style={{ color: "var(--text-muted)", margin: "4px 0 0 0" }}>Create an evaluation exam for an application.</p>
//         </div>
//         <Link to="/admin/exams" style={{ padding: "10px 20px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>← Back to Exams</Link>
//       </div>

//       <div style={{ backgroundColor: "var(--bg-surface)", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
//         {error ? <div style={{ color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div> : null}
//         {success ? <div style={{ color: "#166534", backgroundColor: "var(--bg-nested)", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div> : null}

//         <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

//           <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
//             <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Select Application *</label>
//             <select name="application" value={form.application} onChange={handleChange} required style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
//               <option value="">-- Choose Application --</option>
//               {applications.map((application) => (
//                 <option key={application.id} value={application.id}>
//                   {application.application_number || application.id} - {application.course?.name || application.course || "Unknown course"}
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
//             <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Difficulty Level</label>
//             <select name="level" value={form.level} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
//               <option value="EASY">Easy</option>
//               <option value="MEDIUM">Medium</option>
//               <option value="HARD">Hard</option>
//               <option value="MIXED">Mixed</option>
//             </select>
//           </div>

//           <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
//             <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Duration (Minutes) *</label>
//             <input type="number" name="duration_minutes" value={form.duration_minutes} onChange={handleChange} min="1" required style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
//           </div>

//           <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
//             <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Pass Percentage *</label>
//             <input type="number" name="pass_percentage" value={form.pass_percentage} onChange={handleChange} min="0" max="100" required style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
//           </div>

//           <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
//             <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Total Marks *</label>
//             <input type="number" name="total_marks" value={form.total_marks} onChange={handleChange} min="1" required style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
//           </div>

//           <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
//             <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Exam Status</label>
//             <select name="status" value={form.status} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
//               <option value="PENDING">Pending</option>
//               <option value="IN_PROGRESS">In Progress</option>
//               <option value="SUBMITTED">Submitted</option>
//               <option value="EVALUATED">Evaluated</option>
//             </select>
//           </div>

//           <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid #e5e7eb", paddingTop: "1.5rem" }}>
//             <button type="submit" disabled={loading} style={{ padding: "12px 24px", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer" }}>
//               {loading ? "Saving..." : "Add Exam"}
//             </button>
//             <Link to="/admin/exams" style={{ padding: "12px 24px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Cancel</Link>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// }

// export default AddExam;
import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddExam.module.css";
import AsyncSelect from "../../components/common/AsyncSelect";

function AddExam() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialAppId = queryParams.get("appId") || "";

  const getCourseName = (app) => {
    if (!app.course) return "Unknown course";
    if (typeof app.course === "object") return app.course.name || app.course.title || "Unknown course";
    return String(app.course);
  };

  const [initialApp, setInitialApp] = useState(location.state?.application || null);
  const [appError, setAppError] = useState("");

  const [form, setForm] = useState({
    application: initialAppId,
    level: "MIXED",
    duration_minutes: "45",
    pass_percentage: "60",
    status: "PENDING",
    total_marks: "100",
    proctoring_enabled: true,
    proctoring_required: true,
    proctoring_room_count: "4",
    proctoring_capacity_per_room: "50",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let isMounted = true;
    const reconcileApp = async () => {
      if (!initialAppId) return;
      try {
        const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BY_ID(initialAppId));
        if (isMounted) {
          setInitialApp(response.data);
          if (form.application !== response.data.id) {
            setForm(prev => ({ ...prev, application: response.data.id }));
          }
        }
      } catch (err) {
        console.error("Failed to reconcile application:", err);
        if (isMounted) {
          setAppError("The specified application could not be verified. It may have been deleted.");
          setForm(prev => ({ ...prev, application: "" }));
          setInitialApp(null);
        }
      }
    };
    reconcileApp();
    return () => {
      isMounted = false;
    };
  }, [initialAppId]);

  const loadApplicationOptions = async (inputValue) => {
    if (!inputValue) return [];
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.APPLICATIONS.BASE}?search=${encodeURIComponent(inputValue)}&limit=15`);
      return Array.isArray(response.data) ? response.data : response.data?.results || [];
    } catch (err) {
      console.error("Failed to search applications:", err);
      return [];
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.application) {
      setError("Please select an application before creating an exam.");
      return;
    }

    if (appError) {
      setError("Cannot submit: " + appError);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        application: form.application,
        level: form.level,
        duration_minutes: Number(form.duration_minutes) || 45,
        pass_percentage: Number(form.pass_percentage) || 60,
        status: form.status,
        total_marks: Number(form.total_marks) || 100,
        proctoring_enabled: form.proctoring_enabled,
        proctoring_required: form.proctoring_required,
        proctoring_room_count: Number(form.proctoring_room_count) || 4,
        proctoring_capacity_per_room: Number(form.proctoring_capacity_per_room) || 50,
      };

      await apiClient.post(API_ENDPOINTS.EXAMS.BASE, payload);
      setSuccess("Exam created successfully.");
      navigate("/admin/exams");
    } catch (err) {
      const message = err?.response?.data?.detail || err?.response?.data?.message || "Unable to create the exam.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.header}>
          <h1>Add New Exam</h1>
          <Link to="/admin/exams" className="premium-btn">Back</Link>
        </div>

        {error ? <p style={{ color: "#b91c1c", fontWeight: "bold" }}>{error}</p> : null}
        {appError ? <p style={{ color: "#b91c1c", fontWeight: "bold" }}>{appError}</p> : null}
        {success ? <p style={{ color: "#166534", fontWeight: "bold" }}>{success}</p> : null}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Application *</label>
            <AsyncSelect
              name="application"
              value={form.application}
              onChange={handleChange}
              loadOptions={loadApplicationOptions}
              getOptionLabel={(app) => `${app.application_number || app.id} - ${getCourseName(app)}`}
              getOptionValue={(app) => app.id}
              placeholder="Search by application number, email, or name..."
              defaultOption={initialApp}
              required={true}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Level</label>
            <select name="level" value={form.level} onChange={handleChange} className="premium-input">
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
              <option value="MIXED">Mixed</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Duration (Minutes) *</label>
            <input type="number" name="duration_minutes" value={form.duration_minutes} onChange={handleChange} min="1" required className="premium-input" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Pass Percentage *</label>
            <input type="number" name="pass_percentage" value={form.pass_percentage} onChange={handleChange} min="0" max="100" required className="premium-input" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Total Marks *</label>
            <input type="number" name="total_marks" value={form.total_marks} onChange={handleChange} min="1" required className="premium-input" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Status</label>
            <select name="status" value={form.status} onChange={handleChange} className="premium-input">
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="EVALUATED">Evaluated</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Proctoring Rooms</label>
            <input type="number" name="proctoring_room_count" value={form.proctoring_room_count} onChange={handleChange} min="1" max="26" className="premium-input" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Limit per Room</label>
            <input type="number" name="proctoring_capacity_per_room" value={form.proctoring_capacity_per_room} onChange={handleChange} min="1" max="500" className="premium-input" />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: 'span 1' }}>
            <input type="checkbox" name="proctoring_enabled" checked={form.proctoring_enabled} onChange={handleChange} id="proc_enabled" style={{ width: 'auto' }} />
            <label htmlFor="proc_enabled" style={{ margin: 0, fontWeight: '500', color: 'var(--text-primary)' }}>Jitsi Proctoring</label>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: 'span 1' }}>
            <input type="checkbox" name="proctoring_required" checked={form.proctoring_required} onChange={handleChange} id="proc_req" style={{ width: 'auto' }} />
            <label htmlFor="proc_req" style={{ margin: 0, fontWeight: '500', color: 'var(--text-primary)' }}>Live Required</label>
          </div>

          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
            <button type="submit" disabled={loading} className="premium-btn premium-btn-primary" style={{ cursor: loading ? "not-allowed" : "pointer", padding: '12px 32px' }}>
              {loading ? "Saving..." : "Add Exam"}
            </button>
            <Link to="/admin/exams" className="premium-btn premium-btn-secondary" style={{ padding: "12px 32px", textDecoration: "none" }}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddExam;
