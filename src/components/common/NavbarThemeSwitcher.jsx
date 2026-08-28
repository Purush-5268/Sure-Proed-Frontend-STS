import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../context/ThemeContext";
import styles from "./NavbarThemeSwitcher.module.css";
import { FaSun, FaMoon, FaDesktop } from "react-icons/fa";

function NavbarThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleSelect = (newTheme) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  const renderIcon = () => {
    if (theme === 'light') return <FaSun />;
    if (theme === 'dark') return <FaMoon />;
    return <FaDesktop />;
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button 
        className={styles.triggerBtn} 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle theme"
        title="Change theme"
      >
        {renderIcon()}
      </button>
      
      {isOpen && (
        <div className={styles.dropdown}>
          <button 
            className={`${styles.optionBtn} ${theme === 'light' ? styles.active : ''}`}
            onClick={() => handleSelect('light')}
          >
            <FaSun className={styles.icon} /> Light
          </button>
          <button 
            className={`${styles.optionBtn} ${theme === 'dark' ? styles.active : ''}`}
            onClick={() => handleSelect('dark')}
          >
            <FaMoon className={styles.icon} /> Dark
          </button>
          <button 
            className={`${styles.optionBtn} ${theme === 'system' ? styles.active : ''}`}
            onClick={() => handleSelect('system')}
          >
            <FaDesktop className={styles.icon} /> System
          </button>
        </div>
      )}
    </div>
  );
}

export default NavbarThemeSwitcher;
