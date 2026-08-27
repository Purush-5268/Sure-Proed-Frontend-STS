import React, { useState, useEffect } from 'react';
import { FaTimes, FaLinkedin, FaBuilding, FaUserTie } from 'react-icons/fa';
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import styles from './PeopleModal.module.css';

const PeopleModal = ({ isOpen, onClose, category }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen || !category) return;

    const fetchProfiles = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await apiClient.get(`${API_ENDPOINTS.ANALYTICS.PUBLIC_PEOPLE}?type=${category.toLowerCase()}`);
        setData(response.data[category.toLowerCase()] || []);
      } catch (err) {
        console.error("Failed to load profiles", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [isOpen, category]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{category}</h2>
            <p className={styles.modalSubtitle}>Leadership & Ecosystem</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <FaTimes />
          </button>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Loading {category.toLowerCase()}...</p>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <p>Failed to load profiles. Please try again later.</p>
            </div>
          ) : data.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No public profiles available in this category yet.</p>
            </div>
          ) : (
            <div className={styles.profilesGrid}>
              {data.map((person, i) => (
                <div key={i} className={styles.profileCard}>
                  <div className={styles.profileHeader}>
                    {person.photo ? (
                      <img src={person.photo} alt={person.name} className={styles.avatar} loading="lazy" />
                    ) : (
                      <div className={styles.avatarFallback}>
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className={styles.profileInfo}>
                      <h3>{person.name}</h3>
                      {person.designation && (
                        <p className={styles.designation}>
                          <FaUserTie /> {person.designation}
                        </p>
                      )}
                      {person.organization && (
                        <p className={styles.organization}>
                          <FaBuilding /> {person.organization}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {person.bio && (
                    <div className={styles.bio}>
                      <p>{person.bio}</p>
                    </div>
                  )}
                  
                  {person.linkedin_url && (
                    <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer" className={styles.linkedinBtn}>
                      <FaLinkedin /> Connect on LinkedIn
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PeopleModal;
