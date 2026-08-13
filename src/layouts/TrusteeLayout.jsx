import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { 
  FaTachometerAlt, FaExclamationTriangle, FaCalendarAlt, 
  FaUserClock, FaUserShield, FaBullhorn, 
  FaTrophy, FaBriefcase 
} from "react-icons/fa";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Sidebar from "../components/layout/Sidebar";

import styles from "./TrusteeLayout.module.css";

function TrusteeLayout() {
  const { user } = useAuth();
  
  // Wait for the auth context to determine the real trusteeType
  const trusteeType = user?.trusteeType;

  const volunteerLinks = [
    { label: "Command Center", path: "/trustee/volunteer/dashboard", icon: <FaTachometerAlt /> },
    { label: "System Alerts", path: "/trustee/volunteer/alerts", icon: <FaExclamationTriangle /> },
    { label: "Schedule Classes", path: "/trustee/volunteer/schedule", icon: <FaCalendarAlt /> },
    { label: "Attendance & CSV", path: "/trustee/volunteer/attendance", icon: <FaUserClock /> },
    { label: "User Moderation", path: "/trustee/volunteer/users", icon: <FaUserShield /> },
  ];

  const higherLevelTrusteeLinks = [
    { label: "Dashboard Overview", path: "/trustee/commercial/dashboard", icon: <FaTachometerAlt /> },
    { label: "Announcements", path: "/trustee/commercial/announcements", icon: <FaBullhorn /> },
    { label: "Achievements", path: "/trustee/commercial/achievements", icon: <FaTrophy /> },
    { label: "Updates", path: "/trustee/commercial/updates", icon: <FaBriefcase /> },
  ];

  const isHigherLevel = trusteeType === "COMMERCIAL";
  const activeLinks = isHigherLevel ? higherLevelTrusteeLinks : volunteerLinks;
  
  let layoutTitle = "Volunteer Ops";
  if (trusteeType === "COMMERCIAL") layoutTitle = "Commercial Ops";

  if (user?.role !== "TRUSTEE") {
    return <Navigate to="/login" replace />;
  }

  // Prevent routing errors if trusteeType is not yet loaded
  if (!trusteeType) {
    return <div>Loading Trustee Profile...</div>;
  }

  const location = useLocation();
  const currentPath = location.pathname.toLowerCase();

  // Handle generic /trustee or /trustee/dashboard entry points
  if (currentPath === "/trustee" || currentPath === "/trustee/" || currentPath === "/trustee/dashboard" || currentPath === "/trustee/dashboard/") {
    return <Navigate to={isHigherLevel ? "/trustee/commercial/dashboard" : "/trustee/volunteer/dashboard"} replace />;
  }

  // Route Protection: Prevent cross-trustee manual URL navigation
  if (trusteeType === "VOLUNTEER" && currentPath.includes("/commercial/")) {
    return <Navigate to="/trustee/volunteer/dashboard" replace />;
  }
  
  if (isHigherLevel && currentPath.includes("/volunteer/")) {
    return <Navigate to="/trustee/commercial/dashboard" replace />;
  }

  return (
    <>
      <Navbar />
      <div className={styles.layout}>
        <Sidebar title={layoutTitle} links={activeLinks} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
      <Footer />
    </>
  );
}

export default TrusteeLayout;
