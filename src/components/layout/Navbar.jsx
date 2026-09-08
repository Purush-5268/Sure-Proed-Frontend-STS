import { useState, useEffect } from "react";
import styles from "./Navbar.module.css";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FaBars, FaTimes, FaUserCircle } from "react-icons/fa";
import { studentService } from "../../services/studentService";
import NotificationBell from "../common/NotificationBell";
import NavbarThemeSwitcher from "../common/NavbarThemeSwitcher";

function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated && user?.role === "STUDENT" && user?.email) {
      studentService.getProfile(user.email).then((profile) => {
        if (isMounted && profile?.profile_photo) {
          setProfilePhoto(profile.profile_photo);
        }
      }).catch(err => console.error("Could not load profile photo for navbar"));
    }
    return () => { isMounted = false; };
  }, [isAuthenticated, user?.email, user?.role]);

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
          {isAuthenticated && (
            <li><Link to={getDashboardPath()} onClick={closeMenu}>Dashboard</Link></li>
          )}
        </ul>

        <div className={styles.buttons}>
          {isAuthenticated ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <NavbarThemeSwitcher />
              <NotificationBell />
              <Link to={getDashboardPath()} onClick={closeMenu} className={styles.signupBtn} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {profilePhoto ? (
                  <img src={profilePhoto} alt="Profile" style={{ width: "24px", height: "24px", borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <FaUserCircle size={20} />
                )}
                My Account
              </Link>
              <button onClick={handleLogout} className={styles.loginBtn} style={{ cursor: "pointer", border: "none" }}>
                Sign Out
              </button>
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