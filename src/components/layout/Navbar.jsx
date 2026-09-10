import { useState, useEffect } from "react";
import styles from "./Navbar.module.css";
import { Link, useNavigate } from "react-router-dom";
import { useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { FaBars, FaTimes, FaUserCircle } from "react-icons/fa";
import { studentService } from "../../services/studentService";
import NotificationBell from "../common/NotificationBell";
import NavbarThemeSwitcher from "../common/NavbarThemeSwitcher";

function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated && user?.email) {
      if (user.role === "STUDENT") {
        studentService.getProfile(user.email).then((prof) => {
          if (isMounted && prof) {
            setProfile(prof);
            if (prof.profile_photo) {
              setProfilePhoto(prof.profile_photo);
            }
          }
        }).catch(err => console.error("Could not load profile photo for navbar"));
      }
    }
    return () => { isMounted = false; };
  }, [isAuthenticated, user?.email, user?.role]);

  const getProfileName = () => {
    return user?.name || user?.first_name || profile?.user?.first_name || profile?.user?.name || "Student";
  };

  const getRoleDisplay = () => {
    if (!user) return "";
    if (user.role === "STUDENT") {
      let cohort = profile?.cohort || profile?.current_application?.cohort_name || profile?.current_application?.cohort?.name;
      if (typeof cohort === 'string' && cohort.length > 20) {
        cohort = null; // Filter out UUIDs
      }
      return cohort ? `${cohort} · Student` : "Student";
    }
    return user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase();
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setMobileOpen(false);
      navigate("/");
    }
  };

  const getDashboardPath = () => {
    if (user?.role === "ADMIN") return "/admin/dashboard";
    if (user?.role === "MENTOR") return "/mentor/dashboard";
    if (user?.role === "TRUSTEE" || user?.role === "VOLUNTEER" || user?.role === "ADVISOR") return "/trustee/dashboard";
    return "/student/dashboard";
  };

  const closeMenu = () => setMobileOpen(false);



  return (
    <nav className={styles.navbar}>
      <div className={styles.logo}>
        <Link to="/" onClick={closeMenu} style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/sure-logo.jpg" alt="SURE Trust Logo" width="32" height="32" fetchPriority="high" style={{ height: "32px", width: "32px", borderRadius: "4px", objectFit: "cover" }} />
          <span style={{ fontWeight: "700" }}>
            SURE ProEd
          </span>
        </Link>
      </div>

      <button
        className={styles.hamburger}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <FaTimes /> : <FaBars />}
      </button>

      <div className={`${styles.navContent} ${mobileOpen ? styles.mobileOpen : ""}`}>
        <ul className={styles.menu}>
          <li>
            <Link to="/" onClick={(e) => {
              if (window.location.pathname === "/") {
                e.preventDefault();
                window.history.pushState(null, "", "/");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
              closeMenu();
            }}>Home</Link>
          </li>
          <li>
            <Link to="/#features" onClick={(e) => {
              if (window.location.pathname === "/") {
                e.preventDefault();
                window.history.pushState(null, "", "/#features");
                const element = document.getElementById("features");
                if (element) element.scrollIntoView({ behavior: "smooth" });
              }
              closeMenu();
            }}>Features</Link>
          </li>
          <li>
            <Link to="/#statistics" onClick={(e) => {
              if (window.location.pathname === "/") {
                e.preventDefault();
                window.history.pushState(null, "", "/#statistics");
                const element = document.getElementById("statistics");
                if (element) {
                  element.scrollIntoView({ behavior: "smooth" });
                } else {
                  setTimeout(() => {
                    document.getElementById("statistics")?.scrollIntoView({ behavior: "smooth" });
                  }, 300);
                }
              }
              closeMenu();
            }}>Statistics</Link>
          </li>
          {isAuthenticated && user?.role !== "STUDENT" && (
            <li><Link to={getDashboardPath()} onClick={closeMenu}>Dashboard</Link></li>
          )}
        </ul>

        <div className={styles.buttons}>
          {isAuthenticated ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <NavbarThemeSwitcher />
              <NotificationBell />
              <div className={styles.profileDropdownContainer} ref={dropdownRef}>
                <button 
                  className={styles.avatarButtonExt} 
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  aria-haspopup="true"
                  aria-expanded={profileDropdownOpen}
                >
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile" className={styles.avatarImage} />
                  ) : (
                    <FaUserCircle size={32} color="var(--text-secondary)" />
                  )}
                  <div className={styles.profileTextInfo}>
                    <span className={styles.profileName}>{getProfileName()}</span>
                    <span className={styles.profileRole}>{getRoleDisplay()}</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                
                {profileDropdownOpen && (
                  <div className={styles.profileDropdownMenu}>
                    <div className={styles.dropdownHeader}>
                      <span className={styles.dropdownName}>{user?.name || "Student"}</span>
                      <span className={styles.dropdownEmail}>{user?.email}</span>
                    </div>
                    <div className={styles.dropdownDivider}></div>
                    <Link to={getDashboardPath()} onClick={() => { closeMenu(); setProfileDropdownOpen(false); }} className={styles.dropdownItem}>
                      Dashboard
                    </Link>
                    <Link to="/student/profile" onClick={() => { closeMenu(); setProfileDropdownOpen(false); }} className={styles.dropdownItem}>
                      Profile
                    </Link>
                    <Link to="/student/settings" onClick={() => { closeMenu(); setProfileDropdownOpen(false); }} className={styles.dropdownItem}>
                      Settings
                    </Link>
                    <div className={styles.dropdownDivider}></div>
                    <button onClick={handleLogout} className={styles.dropdownItem} style={{ color: "var(--danger-color)", width: "100%", textAlign: "left" }}>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <Link to="/login" onClick={closeMenu} className={styles.loginBtn}>
                Login
              </Link>
              <Link to="/signup" onClick={closeMenu} className={styles.signupBtn}>
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;