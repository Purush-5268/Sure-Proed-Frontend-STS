import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import styles from "./Sidebar.module.css";
import { FaChevronDown, FaChevronUp, FaAngleDoubleLeft, FaAngleDoubleRight } from "react-icons/fa";

function Sidebar({ title, links }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // A desktop collapse must never hide the navigation after the viewport
  // changes to the compact/mobile layout.
  useEffect(() => {
    const compactLayout = window.matchMedia("(max-width: 1100px)");
    const syncLayout = () => {
      if (compactLayout.matches) {
        setIsCollapsed(false);
      } else {
        setIsMobileOpen(false);
      }
    };

    syncLayout();
    compactLayout.addEventListener("change", syncLayout);
    return () => compactLayout.removeEventListener("change", syncLayout);
  }, []);

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`}>
      <div className={styles.header}>
        <div className={styles.titleWrapper} onClick={() => setIsMobileOpen(!isMobileOpen)}>
          {!isCollapsed && <h2 className={styles.title}>{title}</h2>}
          {isCollapsed && <h2 className={styles.titleCollapsed}>{title.charAt(0)}</h2>}
          <button
            type="button"
            className={styles.mobileToggleBtn}
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label="Toggle sidebar menu"
            aria-expanded={isMobileOpen}
          >
            {isMobileOpen ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>
        
        <button 
          type="button"
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
