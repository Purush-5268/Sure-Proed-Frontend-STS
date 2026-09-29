import React from "react";
import { Link } from "react-router-dom";
import styles from "./Footer.module.css";
import { FaLinkedin, FaEnvelope, FaGithub } from "react-icons/fa";

function Footer() {
  return (
    <footer className={styles.footer} id="contact">
      <div className={styles.container}>
        
        <div className={styles.brandSection}>
          <div className={styles.logo}>
            <img 
              src="/sure-logo.jpg" 
              alt="SURE Trust Logo" 
              width="40" 
              height="40" 
              style={{ borderRadius: "4px", objectFit: "cover" }} 
            />
            SURE ProEd
          </div>
        </div>

        <div className={styles.socialSection}>
          <h3>Connect with us</h3>
          <div className={styles.socialLinks}>
            {/* UPDATE EMAIL LINK BELOW */}
            <a href="mailto:suretrust2020@gmail.com" aria-label="Email Us" className={styles.socialLink}>
              <FaEnvelope />
            </a>
            
            {/* UPDATE LINKEDIN URL BELOW */}
            <a href="https://www.linkedin.com/company/sure-trust-official" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
              <FaLinkedin />
            </a>

            {/* GITHUB LINK BELOW */}
            <a href="https://github.com/sure-trust" aria-label="GitHub" target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
              <FaGithub />
            </a>
          </div>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <p className={styles.copy}>
          © {new Date().getFullYear()} SURE ProEd. All Rights Reserved.
        </p>
        <div className={styles.legalLinks}>
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms-of-service">Terms of Service</Link>
        </div>
      </div>
    </footer>
  );
}

export default Footer;