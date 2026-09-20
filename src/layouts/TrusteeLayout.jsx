import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { 
  FaTachometerAlt, FaExclamationTriangle, FaCalendarAlt, 
  FaUserClock, FaUserShield, FaBullhorn, 
  FaTrophy, FaBriefcase, FaUser, FaClipboardList, FaDesktop, FaUsers
} from "react-icons/fa";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Sidebar from "../components/layout/Sidebar";
import { usePushNotifications } from "../services/usePushNotifications";
import styles from "./TrusteeLayout.module.css";

function TrusteeLayout() {
  const { user } = useAuth();
  usePushNotifications();
  

  const volunteerLinks = [
    { label: "Command Center", path: "/trustee/volunteer/dashboard", icon: <FaTachometerAlt /> },
    { label: "Cohorts", path: "/trustee/volunteer/cohorts", icon: <FaUsers /> },
    { label: "System Alerts", path: "/trustee/volunteer/alerts", icon: <FaExclamationTriangle /> },
    { label: "Schedule Classes", path: "/trustee/volunteer/schedule", icon: <FaCalendarAlt /> },
    { label: "Attendance & CSV", path: "/trustee/volunteer/attendance", icon: <FaUserClock /> },
    { label: "User Moderation", path: "/trustee/volunteer/users", icon: <FaUserShield /> },
    { label: "Assessments", path: "/trustee/volunteer/assessments", icon: <FaClipboardList /> },
    { label: "Proctor Dashboard", path: "/trustee/volunteer/exam-proctoring", icon: <FaDesktop /> },
    { label: "My Profile", path: "/trustee/volunteer/profile", icon: <FaUser /> },
  ];

  const higherLevelTrusteeLinks = [
    { label: "Dashboard Overview", path: "/trustee/main/dashboard", icon: <FaTachometerAlt /> },
    { label: "Announcements", path: "/trustee/main/announcements", icon: <FaBullhorn /> },
    { label: "Achievements", path: "/trustee/main/achievements", icon: <FaTrophy /> },
    { label: "Updates", path: "/trustee/main/updates", icon: <FaBriefcase /> },
    { label: "My Profile", path: "/trustee/main/profile", icon: <FaUser /> },
  ];

  const isHigherLevel = user?.role === "TRUSTEE";
  const isAdvisor = user?.admin_category === "ADVISORY";
  const activeLinks = isHigherLevel ? higherLevelTrusteeLinks : volunteerLinks;
  
  let layoutTitle = "Volunteer Dashboard";
  if (isHigherLevel) {
    layoutTitle = isAdvisor ? "Advisor Dashboard" : "Trustee Dashboard";
  }

  if (!user || (user.role !== "TRUSTEE" && user.role !== "VOLUNTEER")) {
    return <Navigate to="/login" replace />;
  }

  const location = useLocation();
  const currentPath = location.pathname.toLowerCase();

  // Handle generic /trustee or /trustee/dashboard entry points
  if (currentPath === "/trustee" || currentPath === "/trustee/" || currentPath === "/trustee/dashboard" || currentPath === "/trustee/dashboard/") {
    return <Navigate to={isHigherLevel ? "/trustee/main/dashboard" : "/trustee/volunteer/dashboard"} replace />;
  }

  // Route Protection: Prevent cross-trustee manual URL navigation
  if (user?.role === "VOLUNTEER" && currentPath.includes("/main/")) {
    return <Navigate to="/trustee/volunteer/dashboard" replace />;
  }
  
  if (isHigherLevel && currentPath.includes("/volunteer/")) {
    return <Navigate to="/trustee/main/dashboard" replace />;
  }

  // Inject Volunteer specific theme variables
  const themeStyles = !isHigherLevel ? {
    '--primary-color': '#4f46e5',
    '--primary-hover': '#4338ca',
    '--primary-light': '#e0e7ff',
    '--primary-dark': '#3730a3'
  } : {};

  return (
    <div style={themeStyles}>
      <Navbar />
      <div className={styles.layout}>
        <Sidebar title={layoutTitle} links={activeLinks} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}

export default TrusteeLayout;
