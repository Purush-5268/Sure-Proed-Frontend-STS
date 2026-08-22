import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import {
  FaChartPie, FaUsers, FaChalkboardTeacher, FaBuilding,
  FaBook, FaFileAlt, FaClipboardList, FaLayerGroup,
  FaCalendarAlt, FaUserCheck, FaTasks, FaCertificate,
  FaBell, FaChartBar, FaCog, FaShieldAlt, FaHeadset, FaComments
} from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Sidebar from "../components/layout/Sidebar";

import styles from "./AdminLayout.module.css";

const adminLinks = [
  { label: "Dashboard", path: "/admin/dashboard", icon: <FaChartPie /> },
  { label: "Students", path: "/admin/students", icon: <FaUsers /> },
  { label: "Applications", path: "/admin/applications", icon: <FaFileAlt /> },
  { label: "Cohorts", path: "/admin/cohorts", icon: <FaLayerGroup /> },
  { label: "Schedule Class", path: "/admin/schedule", icon: <FaCalendarAlt /> },
  { label: "Attendance", path: "/admin/attendance", icon: <FaUserCheck /> },
  { label: "Assignments", path: "/admin/assignments", icon: <FaTasks /> },
  { label: "Exams", path: "/admin/exams", icon: <FaClipboardList /> },
  { label: "Certificates", path: "/admin/certificates", icon: <FaCertificate /> },
  { label: "Requests & Support", path: "/admin/requests-support", icon: <FaHeadset /> },
  { label: "Notifications", path: "/admin/notifications", icon: <FaBell /> },
  { label: "Reports & Analytics", path: "/admin/reports", icon: <FaChartBar /> },
  { label: "Mentors", path: "/admin/mentors", icon: <FaChalkboardTeacher /> },
  { label: "Trustees", path: "/admin/trustees", icon: <FaShieldAlt /> },
  { label: "Companies", path: "/admin/companies", icon: <FaBuilding /> },
  { label: "Courses", path: "/admin/courses", icon: <FaBook /> },
  { label: "Settings", path: "/admin/settings", icon: <FaCog /> },
];

const pageVariants = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, y: -15, transition: { duration: 0.2, ease: "easeIn" } }
};

function AdminLayout() {
  const location = useLocation();

  useEffect(() => {
    document.body.setAttribute("data-role", "admin");
    return () => document.body.removeAttribute("data-role");
  }, []);

  return (
    <>
      <Navbar />

      <div className={styles.layout}>
        <Sidebar
          title="Admin"
          links={adminLinks}
        />

        <main className={styles.content}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
              style={{ width: "100%", height: "100%" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Footer />
    </>
  );
}

export default AdminLayout;