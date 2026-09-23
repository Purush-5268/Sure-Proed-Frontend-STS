import { Outlet } from "react-router-dom";
import { 
  FaTachometerAlt, 
  FaUsers, 
  FaUserGraduate, 
  FaBullhorn, 
  FaBriefcase, 
  FaUser 
} from "react-icons/fa";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Sidebar from "../components/layout/Sidebar";
import styles from "./AdvisorLayout.module.css";

const advisorLinks = [
  { label: "Overview", path: "/trustee/advisor/dashboard", icon: <FaTachometerAlt /> },
  { label: "Assigned Batches", path: "/trustee/advisor/batches", icon: <FaUsers /> },
  { label: "Assigned Students", path: "/trustee/advisor/students", icon: <FaUserGraduate /> },
  { label: "Announcements", path: "/trustee/advisor/announcements", icon: <FaBullhorn /> },
  { label: "Organization Updates", path: "/trustee/advisor/updates", icon: <FaBriefcase /> },
  { label: "Advisor Profile", path: "/trustee/advisor/profile", icon: <FaUser /> },
];

function AdvisorLayout() {
  return (
    <div>
      <Navbar />
      <div className={styles.layout}>
        <Sidebar title="Advisor Portal" links={advisorLinks} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}

export default AdvisorLayout;
