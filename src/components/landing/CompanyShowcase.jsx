import React from 'react';
import styles from './Statistics.module.css';

const CompanyShowcase = ({ companies }) => {
  if (!companies || companies.length === 0) {
    return (
      <div className={styles.emptyCompanies}>
        <p style={{ color: 'var(--text-secondary, #6b7280)', fontStyle: 'italic', margin: 0, padding: '40px 0', textAlign: 'center' }}>
          Industry partnerships coming soon
        </p>
      </div>
    );
  }

  return (
    <div className={styles.companyGrid}>
      {companies.map(company => (
        <div key={company.id} className={styles.companyCard}>
          {company.logo ? (
            <img src={company.logo} alt={`${company.name} logo`} className={styles.companyLogo} />
          ) : (
            <img 
              src={`/company-logos/${company.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`} 
              alt={`${company.name} logo`} 
              className={styles.companyLogo}
              onError={(e) => {
                // If local logo doesn't exist, fallback to full name
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          )}
          {/* Fallback name if local logo is not found */}
          <div className={styles.companyNameFallback} style={{ display: company.logo ? 'none' : 'none' }}>
            {company.name}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CompanyShowcase;
