import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import {
  FaChartLine, FaUserAlt, FaBookOpen, FaFileSignature,
  FaClipboardCheck, FaUsers, FaCalendarCheck,
  FaTasks, FaAward, FaCog // 🚨 Added FaCog icon
} from "react-icons/fa";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Sidebar from "../components/layout/Sidebar";


import styles from "./StudentLayout.module.css";

const studentLinks = [
  { label: "Dashboard", path: "/student/dashboard", icon: <FaChartLine /> },
  { label: "Profile", path: "/student/profile", icon: <FaUserAlt /> },
  { label: "Apply Course", path: "/student/apply-course", icon: <FaBookOpen /> },
  { label: "Applications", path: "/student/applications", icon: <FaFileSignature /> },
  { label: "Exams", path: "/student/exam-instructions", icon: <FaClipboardCheck /> },
  { label: "Cohort", path: "/student/cohort", icon: <FaUsers /> },
  { label: "Attendance", path: "/student/attendance", icon: <FaCalendarCheck /> },
  { label: "Permissions", path: "/student/permissions", icon: <FaCalendarCheck /> },
  { label: "Assignments", path: "/student/assignments", icon: <FaTasks /> },
  { label: "Certificates", path: "/student/certificates", icon: <FaAward /> },
  { label: "Settings", path: "/student/settings", icon: <FaCog /> },
];

function StudentLayout() {
  useEffect(() => {
    document.body.setAttribute("data-role", "student");
    return () => document.body.removeAttribute("data-role");
  }, []);

  return (
    <>
      <Navbar />

      <div className={styles.layout}>
        <Sidebar
          title="Student"
          links={studentLinks}
        />

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>

      <Footer />
    </>
  );
}

export default StudentLayout;