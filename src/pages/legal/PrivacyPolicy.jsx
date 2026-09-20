import React, { useState } from 'react';
import styles from './Legal.module.css';
import { useActiveSection } from '../../hooks/useActiveSection';
import { 
  FaShieldAlt, FaUserShield, FaDatabase, FaEnvelope, FaInfoCircle, FaLock, 
  FaRegCalendarAlt, FaAngleDown, FaAngleUp, FaFileContract, FaCheckCircle, FaLaptopCode
} from 'react-icons/fa';

const PrivacyPolicy = () => {
  const sectionIds = [
    'introduction', 'information-we-collect', 'account-profile', 'learning-activity',
    'attendance', 'cohort', 'communications', 'how-we-use', 'sharing', 'service-providers',
    'security', 'retention', 'cookies', 'rights', 'children', 'changes', 'contact'
  ];

  const activeSection = useActiveSection(sectionIds);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setMobileTocOpen(false);
    }
  };

  const renderTocList = () => (
    <div className={styles.tocList}>
      {sectionIds.map((id, index) => {
        const num = (index + 1).toString();
        const title = id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return (
          <button 
            key={id}
            className={`${styles.tocItem} ${activeSection === id ? styles.active : ''}`}
            onClick={() => scrollTo(id)}
          >
            <span>{num}.</span> {title.replace('We', 'We ').replace('How', 'How ').replace('Profile', '& Profile')}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`${styles.pageContainer} ${styles.privacyTheme}`}>
      
      {/* 1. HERO SECTION */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerContent}>
            <div className={styles.badge}>
              <FaShieldAlt /> Your Privacy Matters
            </div>
            <h1>Privacy Policy</h1>
            <p>Your trust is important to us. Learn how SURE ProEd collects, uses, protects, and manages your information.</p>
            <div className={styles.lastUpdated}>
              <FaRegCalendarAlt /> Last updated: [Date to be confirmed by SURE TRUST]
            </div>
          </div>
          <div className={styles.headerVisual}>
            <div className={styles.handwrittenQuote}>
              Learn{'\n'}Grow{'\n'}Build Safely
            </div>
            <img src="/assets/privacy-3d.jpg" alt="Privacy Illustration" className={styles.hero3dImage} />
          </div>
        </div>
      </div>

      <div className={styles.contentWrapper}>
        
        {/* 2. DESKTOP TOC */}
        <aside className={styles.sidebar}>
          <h3><FaFileContract /> Table of Contents</h3>
          {renderTocList()}
        </aside>

        {/* 3. DOCUMENT AREA */}
        <div className={styles.documentArea}>
          
          {/* Mobile TOC */}
          <div className={styles.mobileToc}>
            <div className={styles.mobileTocHeader} onClick={() => setMobileTocOpen(!mobileTocOpen)}>
              On this page {mobileTocOpen ? <FaAngleUp /> : <FaAngleDown />}
            </div>
            {mobileTocOpen && (
              <div className={styles.mobileTocList}>
                {renderTocList()}
              </div>
            )}
          </div>

          <div id="introduction" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaInfoCircle /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>1.</span> Introduction
              </h2>
            </div>
            <p>Welcome to SURE ProEd. This Privacy Policy explains how <strong>[Organization legal details to be confirmed by SURE TRUST]</strong> ("we", "our", or "us") collects, uses, and discloses information about you when you access or use our website, educational platform, and associated services.</p>
            <div className={`${styles.calloutBox} ${styles.calloutBlue}`}>
              <FaShieldAlt className={styles.calloutIcon} />
              <p><strong>Privacy Commitment:</strong> We are committed to protecting your personal information and being transparent about how it is used to enhance your educational experience.</p>
            </div>
          </div>

          <div id="information-we-collect" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaDatabase /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>2.</span> Information We Collect
              </h2>
            </div>
            <p>We collect information to provide, improve, and personalize your learning experience on the SURE ProEd platform.</p>
            
            <div className={styles.infoCardGrid}>
              <div className={styles.infoCard}>
                <div className={`${styles.infoCardIcon} ${styles.bgYellow}`}><FaUserShield /></div>
                <div className={styles.infoCardContent}>
                  <h4>Account Information</h4>
                  <p>Name, email, profile details, and organization (if applicable).</p>
                </div>
              </div>
              <div className={styles.infoCard}>
                <div className={`${styles.infoCardIcon} ${styles.bgGreen}`}><FaLaptopCode /></div>
                <div className={styles.infoCardContent}>
                  <h4>Learning Activity</h4>
                  <p>Course progress, assignments, assessments, and project work.</p>
                </div>
              </div>
              <div className={styles.infoCard}>
                <div className={`${styles.infoCardIcon} ${styles.bgPink}`}><FaDatabase /></div>
                <div className={styles.infoCardContent}>
                  <h4>Technical Information</h4>
                  <p>Device info, browser type, cookies, and usage data logs.</p>
                </div>
              </div>
              <div className={styles.infoCard}>
                <div className={`${styles.infoCardIcon} ${styles.bgBlue}`}><FaEnvelope /></div>
                <div className={styles.infoCardContent}>
                  <h4>Communications</h4>
                  <p>Messages, support requests, feedback, and notifications.</p>
                </div>
              </div>
            </div>
          </div>

          <div id="account-profile" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaUserShield /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>3.</span> Account and Profile Information
              </h2>
            </div>
            <p>When you create an account, we collect information such as your name, email address, profile details, and any other information you choose to provide. This helps us personalize your dashboard and authenticate your access.</p>
          </div>

          {/* ... other sections truncated for brevity, but all included in layout ... */}
          <div id="learning-activity" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaLaptopCode /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>4.</span> Learning and Course Activity
              </h2>
            </div>
            <p>As you interact with our courses, we collect data on your progress, assignments submitted, quiz scores, and course completion status. This allows us to track your performance and issue relevant certifications.</p>
          </div>

          <div id="attendance" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaCheckCircle /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>5.</span> Attendance and Session Information
              </h2>
            </div>
            <p>If you participate in live sessions or scheduled cohorts, we record your attendance, join/leave times, and active participation. This is used to meet minimum course requirements and calculate your overall grading.</p>
          </div>

          <div id="cohort" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaDatabase /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>6.</span> Cohort and Application Information
              </h2>
            </div>
            <p>When you apply for a specific cohort, we process your application data to determine eligibility. Application history and enrollment status are retained in your profile.</p>
          </div>

          <div id="communications" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaEnvelope /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>7.</span> Communications
              </h2>
            </div>
            <p>We log communications between you and SURE ProEd, including support tickets, emails, and internal platform messages (e.g., with instructors or peers) to provide assistance and maintain community standards.</p>
          </div>

          <div id="how-we-use" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaInfoCircle /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>8.</span> How We Use Your Information
              </h2>
            </div>
            <p>We use your information to operate our educational platform, provide customer support, personalize learning recommendations, communicate important notices, and ensure platform security.</p>
          </div>

          <div id="sharing" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaDatabase /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>9.</span> Sharing and Disclosure
              </h2>
            </div>
            <p>We do not sell your personal data. We may share information with trusted third-party service providers who assist us in operating our platform, subject to strict confidentiality agreements.</p>
          </div>
          
          <div id="service-providers" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaDatabase /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>10.</span> Service Providers
              </h2>
            </div>
            <p>Our platform relies on third parties for hosting, database management, and communication services (e.g., Google Meet integration). These providers process data only on our instructions.</p>
          </div>

          <div id="security" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaLock /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>11.</span> Data Security
              </h2>
            </div>
            <p>We implement industry-standard security measures, including encryption and secure server hosting, to protect your personal information against unauthorized access or alteration.</p>
          </div>

          <div id="retention" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaDatabase /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>12.</span> Data Retention
              </h2>
            </div>
            <p>We retain your data for as long as your account is active or as necessary to provide you with educational services and fulfill our legal obligations.</p>
          </div>

          <div id="cookies" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaDatabase /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>13.</span> Cookies and Local Storage
              </h2>
            </div>
            <p>We use cookies and local storage for authentication and to remember your preferences (e.g., JWT tokens for session management). You can control cookie settings through your browser.</p>
          </div>

          <div id="rights" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaUserShield /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>14.</span> Your Rights
              </h2>
            </div>
            <p>You have the right to request access to, correction of, or deletion of your personal data. Please contact us to exercise these rights.</p>
          </div>

          <div id="children" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaUserShield /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>15.</span> Children's Privacy
              </h2>
            </div>
            <p>Our platform is generally not intended for individuals under the age of 13 without verifiable parental consent. If we become aware that we have collected such data, we will delete it.</p>
          </div>

          <div id="changes" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaInfoCircle /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>16.</span> Changes to This Policy
              </h2>
            </div>
            <p>We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page with an updated revision date.</p>
          </div>

          <div id="contact" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaEnvelope /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>17.</span> Contact Us
              </h2>
            </div>
            <p>If you have any questions about this Privacy Policy, please contact us at:</p>
            <p><strong>[Contact information to be confirmed]</strong></p>
          </div>

        </div>
      </div>

      {/* 4. BOTTOM CTA */}
      <div className={styles.helpCta}>
        <div className={styles.helpCtaInner}>
          <div className={styles.helpContent}>
            <div className={styles.helpBadge}><FaInfoCircle /> HAVE QUESTIONS?</div>
            <h2>We're here to help.</h2>
            <p>If you need any clarification about this Privacy Policy or how your data is managed, please reach out to our team.</p>
            <button className={styles.contactBtn}>
              <FaEnvelope /> Contact Us
            </button>
          </div>
          <div className={styles.helpVisual}>
            <FaEnvelope />
          </div>
        </div>
      </div>

    </div>
  );
};

export default PrivacyPolicy;
