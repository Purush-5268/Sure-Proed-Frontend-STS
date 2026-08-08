import { Outlet, Navigate } from "react-router-dom";
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
  
  // In a real scenario, this would come from the backend profile
  // Defaulting to VOLUNTEER for demo/fallback purposes
  const trusteeType = user?.trusteeType || "VOLUNTEER";

  const volunteerLinks = [
    { label: "Command Center", path: "/trustee/volunteer/dashboard", icon: <FaTachometerAlt /> },
    { label: "System Alerts", path: "/trustee/volunteer/alerts", icon: <FaExclamationTriangle /> },
    { label: "Schedule Classes", path: "/trustee/volunteer/schedule", icon: <FaCalendarAlt /> },
    { label: "Attendance & CSV", path: "/trustee/volunteer/attendance", icon: <FaUserClock /> },
    { label: "User Moderation", path: "/trustee/volunteer/users", icon: <FaUserShield /> },
  ];

  const commercialLinks = [
    { label: "Dashboard Overview", path: "/trustee/commercial/dashboard", icon: <FaTachometerAlt /> },
    { label: "Announcements", path: "/trustee/commercial/announcements", icon: <FaBullhorn /> },
    { label: "Achievements", path: "/trustee/commercial/achievements", icon: <FaTrophy /> },
    { label: "Commercial Updates", path: "/trustee/commercial/updates", icon: <FaBriefcase /> },
  ];

  const activeLinks = trusteeType === "COMMERCIAL" ? commercialLinks : volunteerLinks;
  const layoutTitle = trusteeType === "COMMERCIAL" ? "Commercial Partner" : "Volunteer Ops";

  if (user?.role !== "TRUSTEE") {
    return <Navigate to="/login" replace />;
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
