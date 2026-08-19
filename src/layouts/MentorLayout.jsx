import { Outlet } from "react-router-dom";
import { 
  FaChalkboardTeacher, FaUsers, FaCalendarAlt, 
  FaVideo, FaUserGraduate, FaUserCheck, 
  FaTasks, FaUserCircle, FaCog 
} from "react-icons/fa";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Sidebar from "../components/layout/Sidebar";

import styles from "./MentorLayout.module.css";

const mentorLinks = [
  { label: "Dashboard", path: "/mentor/dashboard", icon: <FaChalkboardTeacher /> },
  { label: "My Cohorts", path: "/mentor/cohorts", icon: <FaUsers /> },
  { label: "Class Schedule", path: "/mentor/class-schedule", icon: <FaCalendarAlt /> },
  { label: "Meeting Links", path: "/mentor/meeting-links", icon: <FaVideo /> },
  { label: "My Students", path: "/mentor/students", icon: <FaUserGraduate /> },
  { label: "Attendance", path: "/mentor/attendance", icon: <FaUserCheck /> },
  { label: "Assignments", path: "/mentor/assignments", icon: <FaTasks /> },
  { label: "Profile", path: "/mentor/profile", icon: <FaUserCircle /> },
  { label: "Settings", path: "/mentor/settings", icon: <FaCog /> },
];

function MentorLayout() {
  return (
    <div className={styles.layoutWrapper} data-role="mentor">
      <Navbar />

      <div className={styles.layout}>
        <Sidebar
          title="Mentor"
          links={mentorLinks}
        />

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
}

export default MentorLayout;