import React, { useState } from 'react';
import styles from './Legal.module.css';
import { useActiveSection } from '../../hooks/useActiveSection';
import { 
  FaFileSignature, FaUserCheck, FaGavel, FaBan, FaShieldAlt, 
  FaRegCalendarAlt, FaAngleDown, FaAngleUp, FaFileContract, FaInfoCircle, FaEnvelope
} from 'react-icons/fa';

const TermsOfService = () => {
  const sectionIds = [
    'acceptance', 'eligibility', 'accounts', 'user-responsibilities',
    'courses', 'cohort', 'attendance', 'assignments', 'certificates', 'platform',
    'prohibited', 'intellectual', 'user-content', 'third-party', 'termination', 'disclaimers', 'liability', 'changes', 'contact'
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
            <span>{num}.</span> {title.replace('User ', 'User ')}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`${styles.pageContainer} ${styles.termsTheme}`}>
      
      {/* 1. HERO SECTION */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerContent}>
            <div className={styles.badge}>
              <FaFileSignature /> Fair Use. Better Learning.
            </div>
            <h1>Terms of Service</h1>
            <p>Please review these terms carefully before using SURE ProEd. By using the platform, you agree to these terms.</p>
            <div className={styles.lastUpdated}>
              <FaRegCalendarAlt /> Last updated: [Date to be confirmed by SURE TRUST]
            </div>
          </div>
          <div className={styles.headerVisual}>
            <div className={styles.handwrittenQuote}>
              Learn{'\n'}Build{'\n'}Grow Together
            </div>
            <img src="/assets/terms-3d.jpg" alt="Terms Illustration" className={styles.hero3dImage} />
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

          <div id="acceptance" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileSignature /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>1.</span> Acceptance of Terms
              </h2>
            </div>
            <p>By accessing or using SURE ProEd, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our platform.</p>
            <div className={`${styles.calloutBox} ${styles.calloutYellow}`}>
              <FaGavel className={styles.calloutIcon} />
              <p><strong>Platform Governance:</strong> These Terms govern your use of the SURE ProEd platform and all related services, including courses, live sessions, assignments, and certifications.</p>
            </div>
          </div>

          <div id="eligibility" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaUserCheck /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>2.</span> Eligibility
              </h2>
            </div>
            <p>You must be at least 13 years old (or the minimum age required in your jurisdiction) to use SURE ProEd. By using the platform, you confirm that you meet the eligibility requirements.</p>
          </div>

          <div id="accounts" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaUserCheck /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>3.</span> Accounts
              </h2>
            </div>
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>
          </div>

          <div id="user-responsibilities" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaShieldAlt /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>4.</span> User Responsibilities
              </h2>
            </div>
            <p>You agree to use SURE ProEd for lawful purposes only and in a manner consistent with these Terms. You are responsible for your own learning progress, participation, and compliance with course requirements.</p>
          </div>

          <div id="courses" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileContract /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>5.</span> Courses and Learning Content
              </h2>
            </div>
            <p>All course content, live sessions, assignments, projects, and materials are provided for educational purposes only. We reserve the right to update, modify, or discontinue courses at any time.</p>
          </div>

          <div id="cohort" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileContract /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>6.</span> Cohort Applications
              </h2>
            </div>
            <p>Applying to a cohort does not guarantee admission. SURE ProEd reserves the right to accept or reject applications based on capacity and program requirements.</p>
          </div>

          <div id="attendance" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileContract /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>7.</span> Attendance and Participation
              </h2>
            </div>
            <p>Certain programs may have strict attendance requirements. Failure to meet these requirements may result in removal from the cohort or denial of a certificate.</p>
          </div>

          <div id="assignments" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileContract /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>8.</span> Assignments and Assessments
              </h2>
            </div>
            <p>All submitted work must be your own. Plagiarism or academic dishonesty will not be tolerated and may lead to immediate suspension.</p>
          </div>

          <div id="certificates" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileContract /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>9.</span> Certificates
              </h2>
            </div>
            <p>Certificates are issued at the sole discretion of SURE ProEd upon successful completion of all course requirements.</p>
          </div>

          <div id="platform" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileContract /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>10.</span> Platform Usage
              </h2>
            </div>
            <p>You may not use the platform in any way that could damage, disable, overburden, or impair our servers or networks.</p>
          </div>

          <div id="prohibited" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaBan /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>11.</span> Prohibited Activities
              </h2>
            </div>
            <p>Prohibited activities include, but are not limited to: scraping data, distributing malware, harassing other users, or attempting to gain unauthorized access to our systems.</p>
          </div>
          
          <div id="intellectual" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaShieldAlt /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>12.</span> Intellectual Property
              </h2>
            </div>
            <p>All content on SURE ProEd, including text, graphics, logos, and software, is the property of SURE ProEd or its licensors and is protected by intellectual property laws.</p>
          </div>

          <div id="user-content" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileContract /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>13.</span> User Content
              </h2>
            </div>
            <p>By submitting assignments or posting in discussions, you grant SURE ProEd a non-exclusive license to use, reproduce, and display that content in connection with providing our services.</p>
          </div>

          <div id="third-party" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaFileContract /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>14.</span> Third-Party Services
              </h2>
            </div>
            <p>SURE ProEd may integrate with third-party services (e.g., video conferencing). Your use of those services is subject to their respective terms and privacy policies.</p>
          </div>

          <div id="termination" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaBan /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>15.</span> Suspension and Termination
              </h2>
            </div>
            <p>We reserve the right to suspend or terminate your account at any time, without notice, for any violation of these Terms.</p>
          </div>

          <div id="disclaimers" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaGavel /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>16.</span> Disclaimers
              </h2>
            </div>
            <p>The platform is provided "as is" and "as available". We disclaim all warranties, express or implied, including fitness for a particular purpose or non-infringement.</p>
          </div>

          <div id="liability" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaGavel /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>17.</span> Limitation of Liability
              </h2>
            </div>
            <p>To the maximum extent permitted by law, SURE ProEd shall not be liable for any indirect, incidental, special, or consequential damages arising out of or related to your use of the platform.</p>
          </div>

          <div id="changes" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaInfoCircle /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>18.</span> Changes to Terms
              </h2>
            </div>
            <p>We may modify these Terms at any time. We will notify you of material changes. Your continued use of the platform constitutes acceptance of the new Terms.</p>
          </div>

          <div id="contact" className={styles.docSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}><FaEnvelope /></div>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>19.</span> Contact Us
              </h2>
            </div>
            <p>If you have any questions about these Terms, please contact us at:</p>
            <p><strong>[Contact information to be confirmed]</strong></p>
          </div>

        </div>
      </div>

      {/* 4. BOTTOM CTA */}
      <div className={styles.helpCta}>
        <div className={styles.helpCtaInner}>
          <div className={styles.helpContent}>
            <div className={styles.helpBadge} style={{color: '#d946ef'}}><FaInfoCircle /> STILL HAVE QUESTIONS?</div>
            <h2>We're happy to help.</h2>
            <p>If you need clarification about these Terms, feel free to reach out to us.</p>
            <button className={styles.contactBtn}>
              <FaEnvelope /> Contact Us
            </button>
          </div>
          <div className={styles.helpVisual} style={{color: '#f472b6', opacity: 0.5}}>
            <FaEnvelope />
          </div>
        </div>
      </div>

    </div>
  );
};

export default TermsOfService;
