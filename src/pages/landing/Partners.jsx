import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FaBuilding, FaArrowLeft, FaGlobe } from 'react-icons/fa';
import { companyService } from '../../services/companyService';
import styles from './Partners.module.css';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 20 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const Partners = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await companyService.getCompanies({ limit: 100 });
        setCompanies(response.results || response || []);
      } catch (err) {
        console.error("Failed to fetch companies:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCompanies();
  }, []);

  return (
    <div className={styles.partnersPage}>
      <div className={styles.headerBackground}></div>
      <div className={styles.container}>
        <div className={styles.navigation}>
          <Link to="/" className={styles.backLink}>
            <FaArrowLeft /> Back to Home
          </Link>
        </div>

        <motion.div 
          className={styles.header}
          initial="hidden"
          animate="show"
          variants={fadeUp}
        >
          <h1>Industry <span className={styles.highlight}>Partners</span></h1>
          <p>
            Meet the innovative companies and organizations that partner with SURE TRUST to provide 
            internships, guidance, and employment opportunities to our students.
          </p>
        </motion.div>

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>Loading partners...</p>
          </div>
        ) : companies.length > 0 ? (
          <motion.div 
            className={styles.grid}
            initial="hidden"
            animate="show"
            variants={staggerContainer}
          >
            {companies.map(company => (
              <motion.div key={company.id} variants={fadeUp} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.logoContainer}>
                    {company.logo ? (
                      <img src={company.logo} alt={`${company.name} logo`} className={styles.logo} />
                    ) : (
                      <img 
                        src={`/company-logos/${company.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`} 
                        alt={`${company.name} logo`} 
                        className={styles.logo}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    )}
                    <div className={styles.logoFallback} style={{ display: company.logo ? 'none' : 'none' }}>
                      <FaBuilding />
                    </div>
                  </div>
                  <div className={styles.companyInfo}>
                    <h3>{company.name}</h3>
                    {company.website && (
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>
                        <FaGlobe /> Website
                      </a>
                    )}
                  </div>
                </div>
                <div className={styles.cardBody}>
                  {/* Fallback description if the backend doesn't provide one yet */}
                  <p className={styles.description}>
                    {company.description || 
                     `A valued partner in the SURE TRUST ecosystem, ${company.name} helps bridge the gap between academic learning and industry readiness.`}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className={styles.emptyState}>
            <FaBuilding className={styles.emptyIcon} />
            <h2>No Partners Found</h2>
            <p>We are currently updating our partner network. Please check back soon.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Partners;
