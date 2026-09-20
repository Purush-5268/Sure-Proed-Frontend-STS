import React from "react";
import { Link } from "react-router-dom";
import styles from "./Footer.module.css";
import { FaLinkedin, FaEnvelope, FaPhoneAlt } from "react-icons/fa";

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
          <p className={styles.tagline}>
            Next-Gen Learning Platform. Learn, Build, and Get Career-Ready.
          </p>
        </div>

        <div className={styles.socialSection}>
          <h3>Connect with us</h3>
          <div className={styles.socialLinks}>
            {/* UPDATE EMAIL LINK BELOW */}
            <a href="mailto:support@sureproed.com" aria-label="Email Us" className={styles.socialLink}>
              <FaEnvelope />
            </a>
            
            {/* UPDATE PHONE LINK BELOW */}
            <a href="tel:+919876543210" aria-label="Call Us" className={styles.socialLink}>
              <FaPhoneAlt />
            </a>

            {/* UPDATE LINKEDIN URL BELOW */}
            <a href="https://linkedin.com/company/sure-proed" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
              <FaLinkedin />
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