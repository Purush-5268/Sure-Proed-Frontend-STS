import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import AnimatedNumber from "../common/AnimatedNumber";
import styles from "./CSRPartnershipSection.module.css";
import { 
  FaArrowRight, FaFilePdf, FaUsers, FaBriefcase, 
  FaGraduationCap, FaChalkboardTeacher, FaBullseye, 
  FaShieldAlt, FaHandsHelping, FaCoins, FaBookOpen, 
  FaFileAlt, FaUserCheck 
} from "react-icons/fa";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
};

function CSRPartnershipSection({ stats, loading }) {

  const studentsBenefited = stats?.students?.benefited || 0;
  const studentsPlaced = stats?.students?.placed || 0;
  const currentlyTraining = stats?.students?.enrolled || 251; // Fallback for the design
  const mentors = stats?.people?.mentors || 0;
  
  if (loading || !stats) {
    return (
      <section className={styles.csrSection}>
        <div className={styles.container}>
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading CSR Impact Data...</div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.csrSection}>
      {/* Background blobs */}
      <div className={styles.bgBlobTopLeft}></div>
      <div className={styles.bgBlobBottomRight}></div>
      <div className={styles.dotPattern}></div>

      <div className={styles.container}>
        <motion.div 
          className={styles.contentGrid}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.1 } }
          }}
        >
          {/* LEFT: Content */}
          <motion.div variants={fadeUp} className={styles.textContent}>
            <div className={styles.eyebrow}>CSR PARTNERSHIPS</div>
            <h2 className={styles.title}>
              Partner with SURE ProEd &ndash;<br/>
              <span className={styles.highlight}>Create Impact</span> Through CSR
            </h2>
            <h3 className={styles.subtitle}>Empowering Rural Youth. Building Industry-Ready Talent. Transforming Lives.</h3>
            <p className={styles.description}>
              Support free, project-based, AI-augmented skill development and employability programs for deserving youth while creating measurable social and career impact.
            </p>
            
            {/* Stats Grid */}
            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <div className={`${styles.statIconWrapper} ${styles.iconPurple}`}><FaUsers /></div>
                <div className={styles.statInfo}>
                  <div className={styles.statValue}>
                    <AnimatedNumber value={studentsBenefited} duration={2500} />
                  </div>
                  <div className={styles.statLabel}>STUDENTS<br/>BENEFITED</div>
                </div>
              </div>
              
              <div className={styles.statCard}>
                <div className={`${styles.statIconWrapper} ${styles.iconGreen}`}><FaBriefcase /></div>
                <div className={styles.statInfo}>
                  <div className={styles.statValue}>
                    <AnimatedNumber value={studentsPlaced} duration={2500} />
                  </div>
                  <div className={styles.statLabel}>STUDENTS<br/>PLACED</div>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={`${styles.statIconWrapper} ${styles.iconPurple}`}><FaGraduationCap /></div>
                <div className={styles.statInfo}>
                  <div className={styles.statValue}>
                    <AnimatedNumber value={currentlyTraining} duration={2500} />
                  </div>
                  <div className={styles.statLabel}>CURRENTLY<br/>TRAINING</div>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={`${styles.statIconWrapper} ${styles.iconGreen}`}><FaChalkboardTeacher /></div>
                <div className={styles.statInfo}>
                  <div className={styles.statValue}>
                    <AnimatedNumber value={mentors} duration={2500} />
                  </div>
                  <div className={styles.statLabel}>INDUSTRY<br/>MENTORS</div>
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className={styles.actionGroup}>
              <a href="/csr-brochure.html" target="_blank" rel="noreferrer" className={styles.primaryBtn}>
                <FaFilePdf /> View CSR Brochure
              </a>
              <Link to="/csr-partnerships" className={styles.secondaryBtn}>
                Explore CSR Partnership <FaArrowRight />
              </Link>
            </div>

            {/* Features */}
            <div className={styles.featuresRow}>
              <div className={styles.featureItem}>
                <div className={`${styles.featureIcon} ${styles.iconPurpleLight}`}><FaBullseye /></div>
                <div className={styles.featureText}>Measurable<br/>Social Impact</div>
              </div>
              <div className={styles.featureItem}>
                <div className={`${styles.featureIcon} ${styles.iconGreenLight}`}><FaShieldAlt /></div>
                <div className={styles.featureText}>Transparent<br/>Implementation</div>
              </div>
              <div className={styles.featureItem}>
                <div className={`${styles.featureIcon} ${styles.iconPurpleLight}`}><FaHandsHelping /></div>
                <div className={styles.featureText}>Employee<br/>Volunteering Opportunities</div>
              </div>
            </div>
          </motion.div>

          {/* RIGHT: Visual Layout */}
          <motion.div variants={fadeUp} className={styles.visualContent}>
            
            <div className={styles.flowCard}>
              <div className={styles.flowHeader}>The Impact Pathway</div>
              <div className={styles.flowSubheader}>From CSR support to stronger communities</div>
              
              <div className={styles.flowSteps}>
                <div className={styles.flowStepWrapper}>
                  <div className={`${styles.flowIcon} ${styles.stepPurple}`}><FaCoins /></div>
                  <div className={styles.flowText}>
                    <h4>CSR SUPPORT</h4>
                    <p>Partner to enable opportunities</p>
                  </div>
                </div>
                <div className={styles.flowArrow}>&darr;</div>

                <div className={styles.flowStepWrapper}>
                  <div className={`${styles.flowIcon} ${styles.stepBlue}`}><FaBookOpen /></div>
                  <div className={styles.flowText}>
                    <h4>SKILLS</h4>
                    <p>Industry-aligned, future-ready learning</p>
                  </div>
                </div>
                <div className={styles.flowArrow}>&darr;</div>

                <div className={styles.flowStepWrapper}>
                  <div className={`${styles.flowIcon} ${styles.stepGreen}`}><FaFileAlt /></div>
                  <div className={styles.flowText}>
                    <h4>PROJECTS</h4>
                    <p>Hands-on, real-world experience</p>
                  </div>
                </div>
                <div className={styles.flowArrow}>&darr;</div>

                <div className={styles.flowStepWrapper}>
                  <div className={`${styles.flowIcon} ${styles.stepYellow}`}><FaUserCheck /></div>
                  <div className={styles.flowText}>
                    <h4>PROFESSIONAL READINESS</h4>
                    <p>Workplace &amp; AI readiness (PAWR)</p>
                  </div>
                </div>
                <div className={styles.flowArrow}>&darr;</div>

                <div className={styles.flowStepWrapper}>
                  <div className={`${styles.flowIcon} ${styles.stepRed}`}><FaBriefcase /></div>
                  <div className={styles.flowText}>
                    <h4>EMPLOYMENT</h4>
                    <p>Industry opportunities and placements</p>
                  </div>
                </div>
                <div className={styles.flowArrow}>&darr;</div>

                <div className={styles.flowStepWrapper}>
                  <div className={`${styles.flowIcon} ${styles.stepPurpleDark}`}><FaUsers /></div>
                  <div className={styles.flowText}>
                    <h4>COMMUNITY IMPACT</h4>
                    <p>Stronger families and brighter communities</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Collage Images */}
            <div className={styles.imageCollage}>
              <div className={styles.collageImage1}>
                <img src="https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&w=400&q=80" alt="Student" />
              </div>
              <div className={styles.collageDecoration}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C12 22 20 16 20 9C20 4.58172 16.4183 1 12 1C7.58172 1 4 4.58172 4 9C4 16 12 22 12 22Z" fill="#10b981"/>
                  <path d="M12 11C13.1046 11 14 10.1046 14 9C14 7.89543 13.1046 7 12 7C10.8954 7 10 7.89543 10 9C10 10.1046 10.8954 11 12 11Z" fill="white"/>
                </svg>
              </div>
              <div className={styles.collageImage2}>
                <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=400&q=80" alt="Learning" />
              </div>
              <div className={styles.collageImage3}>
                <img src="https://images.unsplash.com/photo-1506869640319-fe1a24fd76dc?auto=format&fit=crop&w=400&q=80" alt="Impact" />
              </div>
            </div>

          </motion.div>

        </motion.div>
      </div>
    </section>
  );
}

export default CSRPartnershipSection;
