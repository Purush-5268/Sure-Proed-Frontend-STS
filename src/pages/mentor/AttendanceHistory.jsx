import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { attendanceService } from "../../services/attendanceService";
import styles from "./AttendanceHistory.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AttendanceHistory() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const handleDownloadExcel = async (sessionId, sessionTitle, sessionDate) => {
    try {
      const response = await attendanceService.downloadExcel(sessionId);

      // Check if status is 202 (Report Generating)
      if (response.status === 202) {
        // Backend returns JSON with a detail message for 202
        let detailMessage = "Report is being generated in the background. Please retry in a few seconds.";
        if (response.data instanceof Blob && response.data.type === 'application/json') {
          const text = await response.data.text();
          const json = JSON.parse(text);
          if (json.detail) detailMessage = json.detail;
        } else if (response.data && response.data.detail) {
          detailMessage = response.data.detail;
        }
        alert(`⏳ ${detailMessage}`);
        return; // Stop the download!
      }

      // Check if the backend sent JSON instead of an Excel file (Error condition)
      if (response.data instanceof Blob && response.data.type === 'application/json') {
        const text = await response.data.text();
        const json = JSON.parse(text);
        alert(json.detail || "Report is not ready or missing.");
        return; 
      }

      // 🚨 FILENAME FIX: Extract the exact collision-proof filename from Django's headers
      let filename = 'Attendance_Report.xlsx';
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      } else {
        // Fallback just in case
        const safeTitle = (sessionTitle || "Attendance").replace(/[^a-zA-Z0-9]/g, "_");
        filename = `${safeTitle}_${sessionDate || 'Report'}.xlsx`;
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error("Excel download error:", err);
      // Safely read the error blob if it's JSON
      if (err.response && err.response.data && err.response.data.type === 'application/json') {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        alert(json.detail || "Report is missing or still generating. Please try again.");
      } else {
        alert("Failed to download the report. Make sure the session has ended.");
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadAttendance = async () => {
      try {
        const response = await attendanceService.getAttendanceRecords();
        if (isMounted) setRecords(Array.isArray(response.results) ? response.results : (Array.isArray(response) ? response : []));
      } catch (err) {
        console.error("Failed to load attendance history:", err);
        if (isMounted) setRecords([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAttendance();
    return () => {
      isMounted = false;
    };
  }, []);

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Attendance History</h1>
        <Link to="/mentor/attendance">Back</Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : records.length === 0 ? (
        <p>No attendance history is available yet.</p>
      ) : (
        <table className="premium-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Session</th>
              <th>Cohort</th>
              <th>Attendees</th>
              <th>Status</th>
              <th>Action</th> {/* 🚨 Added Action Column */}
            </tr>
          </thead>

          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td style={{ verticalAlign: "middle" }}>{formatDate(record.class_date)}</td>
                <td style={{ verticalAlign: "middle" }}>{record.title || "Attendance Session"}</td>
                <td style={{ verticalAlign: "middle" }}>{record.cohort?.name || record.cohort || "N/A"}</td>
                <td style={{ verticalAlign: "middle" }}>{Array.isArray(record.attendees) ? record.attendees.length : (record.actual_student_count || 0)}</td>
                <td style={{ verticalAlign: "middle", color: record.conducted ? "inherit" : "var(--text-muted)" }}>
                  {record.conducted ? "Conducted" : "Cancelled"}
                </td>
                <td className="actions" style={{ verticalAlign: "middle", padding: "8px 16px" }}>
                  {/* 🚨 Added Excel Download Button */}
                  {(!record.conducted || record.conducted === 'false' || record.conducted === false) ? (
                    <button
                      onClick={() => handleDownloadExcel(record.id, record.title, record.class_date)}
                      style={{
                        background: "#10b981", color: "white", border: "none",
                        padding: "8px 14px", borderRadius: "6px", cursor: "pointer",
                        fontWeight: "bold", fontSize: "12px", display: "inline-flex",
                        alignItems: "center", justifyContent: "center", transition: "all 0.2s ease"
                      }}
                    >
                      ⬇️ Excel
                    </button>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "bold" }}>
                      ⏳ Ongoing
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AttendanceHistory;