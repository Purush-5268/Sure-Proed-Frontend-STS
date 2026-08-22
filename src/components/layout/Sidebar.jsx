import { useState } from "react";
import { NavLink } from "react-router-dom";
import styles from "./Sidebar.module.css";
import { FaChevronDown, FaChevronUp, FaAngleDoubleLeft, FaAngleDoubleRight } from "react-icons/fa";

function Sidebar({ title, links }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`}>
      <div className={styles.header}>
        <div className={styles.titleWrapper} onClick={() => setIsMobileOpen(!isMobileOpen)}>
          {!isCollapsed && <h2 className={styles.title}>{title}</h2>}
          {isCollapsed && <h2 className={styles.titleCollapsed}>{title.charAt(0)}</h2>}
          <button className={styles.mobileToggleBtn} aria-label="Toggle sidebar menu">
            {isMobileOpen ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>
        
        <button 
          className={styles.desktopCollapseBtn} 
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label="Collapse sidebar"
        >
          {isCollapsed ? <FaAngleDoubleRight /> : <FaAngleDoubleLeft />}
        </button>
      </div>

      <nav className={`${styles.nav} ${isMobileOpen ? styles.navMobileOpen : ""}`}>
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            onClick={() => setIsMobileOpen(false)}
            className={({ isActive }) =>
              isActive
                ? `${styles.link} ${styles.active}`
                : styles.link
            }
            title={isCollapsed ? link.label : ""}
          >
            <span className={styles.linkIcon} aria-hidden="true">{link.icon}</span>
            {!isCollapsed && <span className={styles.linkLabel}>{link.label}</span>}
            <div className={styles.activeIndicator} aria-hidden="true"></div>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;