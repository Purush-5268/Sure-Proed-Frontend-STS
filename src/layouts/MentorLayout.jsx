import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FaChalkboardTeacher, FaUsers, FaCalendarAlt,
  FaVideo, FaUserGraduate, FaUserCheck,
  FaTasks, FaUserCircle, FaCog, FaFileSignature, FaListAlt
} from "react-icons/fa";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Sidebar from "../components/layout/Sidebar";
import apiClient from "../services/apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

import styles from "./MentorLayout.module.css";

const mentorLinks = [
  { label: "Dashboard", path: "/mentor/dashboard", icon: <FaChalkboardTeacher /> },
  { label: "My Cohorts", path: "/mentor/cohorts", icon: <FaUsers /> },
  { label: "Class Schedule", path: "/mentor/class-schedule", icon: <FaCalendarAlt /> },
  // Meeting Links removed as requested
  { label: "Applications", path: "/mentor/applications", icon: <FaFileSignature /> },
  { label: "My Students", path: "/mentor/students", icon: <FaUserGraduate /> },
  { label: "Attendance", path: "/mentor/attendance", icon: <FaUserCheck /> },
  { label: "Exams & Modules", path: "/mentor/assessments", icon: <FaListAlt /> },
  { label: "Assignments", path: "/mentor/assignments", icon: <FaTasks /> },
  { label: "My Tasks", path: "/mentor/tasks", icon: <FaListAlt /> },
  { label: "Profile", path: "/mentor/profile", icon: <FaUserCircle /> },
  { label: "Settings", path: "/mentor/settings", icon: <FaCog /> },
];

function MentorLayout() {
  const [cohorts, setCohorts] = useState([]);
  const [selectedGlobalCohort, setSelectedGlobalCohort] = useState("");

  useEffect(() => {
    document.body.setAttribute("data-role", "mentor");

    // Fetch cohorts for the global filter
    apiClient.get(API_ENDPOINTS.COHORTS.MY_COHORTS)
      .then(res => {
        const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
        setCohorts(data);
        if (data.length > 0) {
          setSelectedGlobalCohort(String(data[0].id));
        }
      })
      .catch(err => console.error("Failed to load global cohorts for mentor", err));

    return () => document.body.removeAttribute("data-role");
  }, []);

  return (
    <>
      <Navbar />
      <div className={styles.layout}>
        <Sidebar
          title="Teacher Portal"
          links={mentorLinks}
        />

        <main className={styles.content}>
          <div className={styles.globalFilterBar} style={{ padding: "16px 32px", borderBottom: "1px solid #e5e7eb", background: "white", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-secondary)" }}>GLOBAL FILTER:</span>
            <select
              className="premium-input"
              style={{ width: "auto", minWidth: "250px", padding: "8px 12px", height: "40px", fontSize: "14px" }}
              value={selectedGlobalCohort}
              onChange={(e) => setSelectedGlobalCohort(e.target.value)}
            >
              {cohorts.length === 0 ? (
                <option value="">No assigned cohorts</option>
              ) : (
                cohorts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.course_name} — {c.code}
                  </option>
                ))
              )}
            </select>
          </div>

          <Outlet context={{ globalCohort: selectedGlobalCohort }} />
        </main>
      </div>

      <Footer />
    </>
  );
}

export default MentorLayout;