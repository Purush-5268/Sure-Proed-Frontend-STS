import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  FaBullseye, FaUsers, FaChartBar, FaHandsHelping, 
  FaQuoteLeft, FaChartLine, FaLaptopCode, FaFemale, 
  FaBuilding, FaLightbulb, FaArrowRight, FaMapMarkerAlt, 
  FaPhoneAlt, FaEnvelope, FaIdCard, FaFileContract, FaAward
} from 'react-icons/fa';
import styles from './CSRPartnerships.module.css';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
};

function CSRPartnerships() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    designation: '',
    organization: '',
    email: '',
    phone: '',
    area_of_interest: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Use direct fetch so we don't depend on axios configuration for a public endpoint
      const response = await fetch(process.env.REACT_APP_API_URL + API_ENDPOINTS.COMMUNICATIONS.CSR_REQUESTS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || 'We couldn\'t submit your enquiry right now. Please try again.');
      }
      
      setSuccessData(data);
      setFormData({
        name: '', designation: '', organization: '', email: '', phone: '', area_of_interest: '', message: ''
      });
    } catch (err) {
      setError(err.message || 'We couldn\'t submit your enquiry right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={styles.pageWrapper}>
      {/* HERO SECTION */}
      <section className={styles.heroSection}>
        <motion.div 
          className={styles.heroContent}
          initial="hidden"
          animate="show"
          variants={fadeUp}
        >
          <div className={styles.eyebrow}>CSR PARTNERSHIPS</div>
          <h1 className={styles.heroTitle}>
            Partner with SURE ProEd &ndash;<br/>
            <span>Create Lasting Impact</span>
          </h1>
          <h2 className={styles.heroSubtitle}>Empowering Rural Youth. Building Industry-Ready Talent. Transforming Lives.</h2>
          <p className={styles.heroDesc}>
            Join hands with SURE Trust to support free, project-based, AI-augmented skill development, professional readiness, and employability programs for deserving rural youth across India.
          </p>

          <div className={styles.heroFeatures}>
            <div className={styles.heroFeatureItem}>
              <div className={`${styles.hfIcon} ${styles.purple}`}><FaBullseye /></div>
              <div className={styles.hfText}>
                <h4>High Social Impact</h4>
                <p>Enable rural youth employment</p>
              </div>
            </div>
            <div className={styles.heroFeatureItem}>
              <div className={`${styles.hfIcon} ${styles.green}`}><FaUsers /></div>
              <div className={styles.hfText}>
                <h4>Industry-Aligned Programs</h4>
                <p>Real-world skills and projects</p>
              </div>
            </div>
            <div className={styles.heroFeatureItem}>
              <div className={`${styles.hfIcon} ${styles.blue}`}><FaChartBar /></div>
              <div className={styles.hfText}>
                <h4>Transparent Implementation</h4>
                <p>Credible reporting and measurable impact</p>
              </div>
            </div>
            <div className={styles.heroFeatureItem}>
              <div className={`${styles.hfIcon} ${styles.orange}`}><FaHandsHelping /></div>
              <div className={styles.hfText}>
                <h4>Employee Volunteering</h4>
                <p>Engage your teams for real change</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className={styles.heroVisual}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div className={styles.heroImageWrapper}>
            <img 
              src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80" 
              alt="Students collaborating" 
              className={styles.mainImage}
            />
            <div className={styles.quoteCard}>
              <div className={styles.quoteIcon}><FaQuoteLeft /></div>
              <div className={styles.quoteText}>
                Together with our CSR partners, we can create brighter futures for rural youth.
              </div>
            </div>
            <div className={styles.statCardFloating}>
              <div className={styles.statIconBig}><FaChartLine /></div>
              <div className={styles.statTextBig}>
                Real Skills<br/>
                Real Opportunities<br/>
                Real Lives Transformed
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* MAIN CONTENT AREA */}
      <section className={styles.mainContainer}>
        {/* LEFT COLUMN */}
        <div className={styles.leftColumn}>
          
          <div className={styles.sectionBlock}>
            <h3 className={styles.sectionTitle}>CSR Partnership Opportunities</h3>
            <p className={styles.sectionSubtitle}>Support one or more focus areas aligned with your CSR goals.</p>
            <div className={styles.opportunitiesGrid}>
              <div className={styles.oppCard}>
                <div className={`${styles.oppIcon} ${styles.purple}`}><FaLaptopCode /></div>
                <div className={styles.oppText}>
                  <h4>Skill Development Cohorts</h4>
                  <p>Support free training in emerging technologies and industry-aligned skills.</p>
                </div>
              </div>
              <div className={styles.oppCard}>
                <div className={`${styles.oppIcon} ${styles.green}`}><FaFemale /></div>
                <div className={styles.oppText}>
                  <h4>Women in Technology</h4>
                  <p>Enable more young women to enter the technology workforce.</p>
                </div>
              </div>
              <div className={styles.oppCard}>
                <div className={`${styles.oppIcon} ${styles.orange}`}><FaBuilding /></div>
                <div className={styles.oppText}>
                  <h4>Infrastructure &amp; Technology Access</h4>
                  <p>Support learning platforms, tools and infrastructure.</p>
                </div>
              </div>
              <div className={styles.oppCard}>
                <div className={`${styles.oppIcon} ${styles.blue}`}><FaLightbulb /></div>
                <div className={styles.oppText}>
                  <h4>Research &amp; Innovation</h4>
                  <p>Support advanced projects and innovation initiatives.</p>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.sectionBlock}>
            <h3 className={styles.sectionTitle}>Our Implementation Model</h3>
            <p className={styles.sectionSubtitle}>End-to-end, high-impact and scalable.</p>
            <div className={styles.flowchartRow}>
              <div className={styles.flowStep}>
                <div className={`${styles.fsIcon} ${styles.purple}`}><FaUsers /></div>
                <div className={styles.fsText}>Identify<br/>&amp; Enroll</div>
              </div>
              <div className={styles.fsArrow}>&rarr;</div>
              <div className={styles.flowStep}>
                <div className={`${styles.fsIcon} ${styles.blue}`}><FaLaptopCode /></div>
                <div className={styles.fsText}>Skills<br/>Training</div>
              </div>
              <div className={styles.fsArrow}>&rarr;</div>
              <div className={styles.flowStep}>
                <div className={`${styles.fsIcon} ${styles.green}`}><FaChartLine /></div>
                <div className={styles.fsText}>Projects<br/>&amp; Mentoring</div>
              </div>
              <div className={styles.fsArrow}>&rarr;</div>
              <div className={styles.flowStep}>
                <div className={`${styles.fsIcon} ${styles.purple}`}><FaBullseye /></div>
                <div className={styles.fsText}>Professional<br/>Readiness</div>
              </div>
              <div className={styles.fsArrow}>&rarr;</div>
              <div className={styles.flowStep}>
                <div className={`${styles.fsIcon} ${styles.orange}`}><FaHandsHelping /></div>
                <div className={styles.fsText}>Employment<br/>Support</div>
              </div>
            </div>
          </div>

          <div className={styles.sectionBlock}>
            <h3 className={styles.sectionTitle}>Compliance &amp; Registrations</h3>
            <p className={styles.sectionSubtitle}>SURE Trust is a registered and compliant entity eligible to undertake CSR activities.</p>
            <div className={styles.complianceRow}>
              <div className={styles.badgeCard}>
                <div className={styles.badgeLogo}><FaIdCard /></div>
                <div className={styles.badgeText}>
                  <h4>NGO-DARPAN</h4>
                  <p>Registered on NGO-DARPAN<br/>Government of India</p>
                </div>
              </div>
              <div className={styles.badgeCard}>
                <div className={styles.badgeLogo}><FaFileContract /></div>
                <div className={styles.badgeText}>
                  <h4>MCA Registration</h4>
                  <p>CSR00039792<br/>Eligible for CSR activities</p>
                </div>
              </div>
              <div className={styles.badgeCard}>
                <div className={styles.badgeLogo}><FaAward /></div>
                <div className={styles.badgeText}>
                  <h4>AICTE Portal</h4>
                  <p>Internship programs<br/>accessible on AICTE Portal</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className={styles.rightColumn}>
          <div className={styles.formCard}>
            <h3>CSR Partnership Enquiry</h3>
            <p>We would be happy to discuss how we can collaborate.</p>
            
              {successData ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '40px', color: '#10b981', marginBottom: '16px' }}>✓</div>
                  <h4 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>Thank you!</h4>
                  <p style={{ fontSize: '14px', color: '#4b5563', marginBottom: '16px' }}>
                    {successData.message}
                  </p>
                  <p style={{ fontSize: '13px', color: '#6b7280' }}>
                    Reference ID: <strong>{successData.request_id}</strong>
                  </p>
                  <button 
                    onClick={() => setSuccessData(null)}
                    style={{ marginTop: '24px', padding: '10px 20px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Submit Another Enquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {error && <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>{error}</div>}
                  
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Name <span>*</span></label>
                      <input type="text" name="name" value={formData.name} onChange={handleChange} className={styles.formInput} placeholder="Your Name" required />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Designation</label>
                      <input type="text" name="designation" value={formData.designation} onChange={handleChange} className={styles.formInput} placeholder="Your Designation" />
                    </div>
                  </div>

                  <div className={styles.formGroup} style={{ marginBottom: '16px' }}>
                    <label>Organization / Company <span>*</span></label>
                    <input type="text" name="organization" value={formData.organization} onChange={handleChange} className={styles.formInput} placeholder="Company / Foundation Name" required />
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Email <span>*</span></label>
                      <input type="email" name="email" value={formData.email} onChange={handleChange} className={styles.formInput} placeholder="you@company.com" required />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Phone</label>
                      <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className={styles.formInput} placeholder="+91 98765 43210" />
                    </div>
                  </div>

                  <div className={styles.formGroup} style={{ marginBottom: '16px' }}>
                    <label>Area of Interest <span>*</span></label>
                    <select name="area_of_interest" value={formData.area_of_interest} onChange={handleChange} className={`${styles.formInput} ${styles.formSelect}`} required>
                      <option value="" disabled>Select an area of interest</option>
                      <option value="Skill Development Cohorts">Skill Development Cohorts</option>
                      <option value="Women in Technology">Women in Technology</option>
                      <option value="Infrastructure & Technology Access">Infrastructure &amp; Tech Access</option>
                      <option value="Research & Innovation">Research &amp; Innovation</option>
                      <option value="Employee Volunteering">Employee Volunteering</option>
                      <option value="Rural Youth Employability">Rural Youth Employability</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className={styles.formGroup} style={{ marginBottom: '16px' }}>
                    <label>Message <span>*</span></label>
                    <textarea name="message" value={formData.message} onChange={handleChange} className={styles.formInput} placeholder="Tell us about your CSR goals and how you would like to collaborate..." required></textarea>
                  </div>

                  <div className={styles.checkboxGroup}>
                    <input type="checkbox" id="consent" required />
                    <label htmlFor="consent">I agree to be contacted by SURE ProEd regarding CSR partnership opportunities.</label>
                  </div>

                  <button type="submit" className={styles.submitBtn} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Submitting...' : <>Submit Enquiry <FaArrowRight style={{ fontSize: '12px' }} /></>}
                  </button>
                </form>
              )}
          </div>
        </div>
      </section>

      {/* FOOTER STRIP */}
      <footer className={styles.footerStrip}>
        <div className={styles.footerLeft}>
          <div className={styles.footerIcon}><FaHandsHelping /></div>
          <div className={styles.footerText}>
            <h4>Let's Create Greater Impact Together</h4>
            <p>Partner with SURE ProEd to empower rural youth and build a more inclusive, skilled India.</p>
          </div>
        </div>
        <div className={styles.footerRight}>
          <div className={styles.contactItem}>
            <div className={styles.contactIcon}><FaEnvelope /></div>
            <div className={styles.contactText}>
              <h5>suretrust2020@gmail.com</h5>
              <p>Email Us</p>
            </div>
          </div>
          <div className={styles.contactItem}>
            <div className={styles.contactIcon}><FaMapMarkerAlt /></div>
            <div className={styles.contactText}>
              <h5>Bengaluru, India</h5>
              <p>Our Location</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default CSRPartnerships;
