import React, { useState, useEffect } from 'react';
import styles from './HeroProductShowcase.module.css';
import { useNavigate } from 'react-router-dom';
import { 
  FaHome, FaBook, FaVideo, FaClipboardList, 
  FaUserCheck, FaCertificate, FaEnvelope,
  FaSearch, FaBell, FaChevronDown, FaArrowLeft
} from 'react-icons/fa';

const HeroProductShowcase = ({ cohorts = [], courses = [], loading = false }) => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('full');
  const [activeIndex, setActiveIndex] = useState(0);

  // Combine cohorts and courses if there aren't enough cohorts to make a dynamic showcase
  const displayItems = cohorts.length >= 3 
    ? cohorts 
    : [...cohorts, ...courses].filter((v, i, a) => a.findIndex(t => (t.name === v.name)) === i);
    
  const safeItems = displayItems.length > 0 ? displayItems : [{ name: 'Explore SURE ProEd', course: { name: 'Learning Module' } }];

  useEffect(() => {
    let intervalId;
    if (safeItems.length > 1) {
      intervalId = setInterval(() => {
        setActiveIndex((prev) => (prev + 1) % safeItems.length);
      }, 5000);
    }
    return () => { 
      if (intervalId) clearInterval(intervalId);
    };
  }, [safeItems.length]);

  const activeItem = safeItems[activeIndex];
  const isCohort = !!activeItem?.course;
  
  const displayCohortName = isCohort 
    ? activeItem.name 
    : (loading ? "Loading..." : "Upcoming Batch");
    
  const displayCourseName = isCohort 
    ? activeItem.course.name 
    : (activeItem?.name || "Explore SURE ProEd");

  const handleAction = () => {
    if (!activeItem) return;
    if (isCohort) {
      navigate('/student/dashboard');
    } else {
      navigate(`/student/course/${activeItem.id}`);
    }
  };

  const getCourseImage = (cohort) => {
    if (!cohort) return '/assets/web-dev.jpg';
    
    // 1. Explicit cohort/course images from backend
    if (cohort.image) return cohort.image;
    if (cohort.course?.image) return cohort.course.image;

    const name = cohort.course?.name || cohort.name || '';
    if (!name) return '/assets/web-dev.jpg';
    
    const lowerName = name.toLowerCase().trim();

    // 1. SPECIFIC MULTI-WORD PHRASES FIRST (Prevents text hijacking)
    if (lowerName.includes('generative ai')) return '/assets/generative-ai.jpg';
    if (lowerName.includes('data analytics')) return '/assets/data-analytics.jpg';
    if (lowerName.includes('digital marketing') || lowerName.includes('marketing')) return '/assets/digital-marketing.jpg';
    if (lowerName.includes('civil engineering') || lowerName.includes('civil')) return '/assets/civil-engineering.webp';
    if (lowerName.includes('industrial automation')) return '/assets/industrial-automation.jpg';

    // 2. BROAD TECH KEYWORDS
    if (lowerName.includes('salesforce')) return '/assets/salesforce.png';
    if (lowerName.includes('abap')) return '/assets/sap-abap.jpg';
    if (lowerName.includes('sap') || lowerName.includes('fico') || lowerName.includes('hana')) return '/assets/sap-hana.png';
    if (lowerName.includes('vlsi')) return '/assets/vlsi.jpg';
    if (lowerName.includes('pcb')) return '/assets/pcb.jpg';
    if (lowerName.includes('embedded') || lowerName.includes('iot')) return '/assets/embedded-iot.jpg';

    // Generic AI matching (only runs if 'generative ai' wasn't matched first)
    if (lowerName.includes('machine learning') || lowerName.includes('artificial intelligence') || lowerName.includes('ai')) return '/assets/ai-ml.jpg';

    if (lowerName.includes('full stack') || lowerName.includes('web development') || lowerName.includes('web dev')) return '/assets/web-dev.jpg';
    if (lowerName.includes('data structures') || lowerName.includes('algorithms') || lowerName.includes('dsa')) return '/assets/dsa-java.jpeg';
    if (lowerName.includes('java applications') || lowerName.includes('java')) return '/assets/java-app.jpg';
    if (lowerName.includes('software testing')) return '/assets/software-testing.jpg';
    if (lowerName.includes('cloud') || lowerName.includes('devops')) return '/assets/cloud-devops.svg';
    if (lowerName.includes('cybersecurity') || lowerName.includes('cyber-security') || lowerName.includes('cyber security') || lowerName.includes('hacking')) return '/assets/cybersecurity.webp';
    if (lowerName.includes('ui') || lowerName.includes('ux')) return '/assets/ui-ux.png';
    if (lowerName.includes('autocad') || lowerName.includes('solidworks') || lowerName.includes('creo')) return '/assets/autocad-creo.png';
    if (lowerName.includes('robotics')) return '/assets/robotics.jpg';
    if (lowerName.includes('financial') || lowerName.includes('valuation') || lowerName.includes('finance')) return '/assets/finance.jpg';
    if (lowerName.includes('medical coding') || lowerName.includes('medical')) return '/assets/medical-coding.jpg';
    if (lowerName.includes('actuarial')) return '/assets/actuarial.webp';

    return '/assets/web-dev.jpg';
  };

  const handleMenuClick = (view) => {
    setActiveView(view);
  };

  const resetView = (e) => {
    e.stopPropagation();
    setActiveView('full');
  };

  const renderDashboardContent = () => {
    return (
      <div className={styles.dashboardCanvas}>
        {/* --- 1. DASHBOARD OVERVIEW --- */}
        <div className={`${styles.canvasPanel} ${activeView === 'dashboard' ? styles.activePanel : ''}`} id="panel-dashboard">
          <div className={styles.welcomeBanner}>
            <div className={styles.bannerText}>
              <h2>Welcome Back!</h2>
              <p>Keep learning, keep growing.</p>
            </div>
          </div>
          <div className={styles.cohortCard}>
            <p className={styles.cohortLabel}>Current Cohort</p>
            <h3>{displayCohortName}</h3>
            <div className={styles.cohortStats}>
              <div className={styles.sessionInfo}>
                 <div className={styles.iconCircle}><FaVideo /></div>
                 <div>
                   <p className={styles.sessionTitle}>Live Session Today</p>
                   <p className={styles.sessionTime}>10:00 AM - 12:00 PM</p>
                 </div>
                 <button className={styles.joinBtn}>Join Class</button>
              </div>
              <div className={styles.progressCircle}>
                <svg viewBox="0 0 36 36" className={styles.circularChart}>
                  <path className={styles.circleBg} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className={styles.circle} strokeDasharray="75, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <text x="18" y="20.35" className={styles.percentage}>75%</text>
                </svg>
                <span className={styles.progressLabel}>Course Progress</span>
              </div>
            </div>
          </div>
          <div className={styles.quickStatsRow}>
            <div className={`${styles.quickStat} ${styles.statYellow}`}>
              <div className={styles.statIcon}><FaClipboardList /></div>
              <div><h4>Assignments</h4><p>Pending Review</p></div>
            </div>
            <div className={`${styles.quickStat} ${styles.statGreen}`}>
              <div className={styles.statIcon}><FaUserCheck /></div>
              <div><h4>Attendance</h4><p>Tracked Daily</p></div>
            </div>
            <div className={`${styles.quickStat} ${styles.statBlue}`}>
              <div className={styles.statIcon}><FaCertificate /></div>
              <div><h4>Certificates</h4><p>Earn upon completion</p></div>
            </div>
          </div>
        </div>

        {/* --- 2. COURSES PANEL --- */}
        <div className={`${styles.canvasPanel} ${activeView === 'courses' ? styles.activePanel : ''}`} id="panel-courses">
          <h2>My Courses</h2>
          <div className={styles.myCourseCard}>
            <div className={styles.courseImageWrapper}>
              <img src={getCourseImage(activeItem)} alt="Course" className={styles.courseImage} />
            </div>
            <div className={styles.courseDetails}>
              <span className={styles.tag}>Active Cohort</span>
              <h3>{displayCohortName}</h3>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{width: '75%'}}></div>
              </div>
              <p className={styles.progressText}>In Progress</p>
              <button onClick={handleAction} className={styles.primaryBtn}>Resume Learning</button>
            </div>
          </div>
        </div>

        {/* --- 3. LIVE CLASSES PANEL --- */}
        <div className={`${styles.canvasPanel} ${activeView === 'live' ? styles.activePanel : ''}`} id="panel-live">
          <h2>Live Classes</h2>
          <div className={styles.liveSessionCard}>
            <div className={styles.liveSessionHeader}>
              <div className={styles.liveBadge}><span className={styles.pulseDot}></span> LIVE NOW</div>
              <span className={styles.timeLabel}>In Session</span>
            </div>
            <div className={styles.liveSessionBody}>
              <h3>{displayCourseName}</h3>
              <p>{displayCohortName} • Live Session</p>
              <div className={styles.liveSessionAction}>
                <button aria-label="Join Class" onClick={handleAction} className={styles.primaryBtn}><FaVideo /> Join Class</button>
                <button aria-label="View Material" onClick={handleAction} className={styles.secondaryBtn}>View Material</button>
              </div>
            </div>
          </div>
          <h3 className={styles.subHeading}>Upcoming Sessions</h3>
          <div className={styles.upcomingList}>
            <div className={styles.upcomingItem}>
              <div className={styles.dateBlock}><span>Next</span><strong>Cls</strong></div>
              <div className={styles.upcomingDetails}>
                <h4>{isCohort ? "Full Stack Architecture" : "Module 2 Introduction"}</h4>
                <p>Tomorrow, 10:00 AM</p>
              </div>
            </div>
            <button onClick={handleAction} className={styles.primaryBtn} style={{width: '100%', marginTop: 'auto'}}>View Schedule</button>
          </div>
        </div>

        {/* --- 4. ASSIGNMENTS PANEL --- */}
        <div className={`${styles.canvasPanel} ${activeView === 'assignments' ? styles.activePanel : ''}`} id="panel-assignments">
          <h2>Assignments</h2>
          <div className={styles.statsRow}>
            <div className={styles.statBox}><h3>3</h3><p>Pending</p></div>
            <div className={styles.statBox}><h3>12</h3><p>Submitted</p></div>
            <div className={styles.statBox}><h3>A+</h3><p>Avg Grade</p></div>
          </div>
          <h3 className={styles.subHeading}>Recent Assignments</h3>
          <div className={styles.assignmentCard}>
            <div className={styles.assignmentIcon}><FaClipboardList /></div>
            <div className={styles.assignmentDetails}>
              <h3>Practical Exercise</h3>
              <p>{displayCourseName}</p>
            </div>
            <div className={styles.assignmentStatus}>
              <span className={styles.statusPending}>In Progress</span>
            </div>
          </div>
        </div>

        {/* --- 5. ATTENDANCE PANEL --- */}
        <div className={`${styles.canvasPanel} ${activeView === 'attendance' ? styles.activePanel : ''}`} id="panel-attendance">
          <h2>Attendance</h2>
          <div className={styles.attendanceOverview}>
            <div className={styles.attendanceRing}>
              <svg viewBox="0 0 36 36" className={styles.circularChartLarge}>
                <path className={styles.circleBg} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className={styles.circleActive} strokeDasharray="96, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <text x="18" y="20.35" className={styles.percentageLarge}>96%</text>
              </svg>
              <p>Overall Attendance</p>
            </div>
            <div className={styles.attendanceStats}>
              <div className={styles.attStat}><span>Tracked</span><strong>Sessions</strong></div>
              <div className={styles.attStat}><span>Status</span><strong className={styles.textGreen}>Good</strong></div>
            </div>
          </div>
        </div>

        {/* --- 6. CERTIFICATES PANEL --- */}
        <div className={`${styles.canvasPanel} ${activeView === 'certificates' ? styles.activePanel : ''}`} id="panel-certificates">
          <h2>My Certificates</h2>
          <div className={styles.certificateGrid}>
            <div className={styles.certificateCard}>
              <div className={styles.certIcon}><FaCertificate /></div>
              <h3>{displayCourseName}</h3>
              <p>Upon Completion</p>
              <button aria-label="View Credential" className={styles.textBtn}>View Credential</button>
            </div>
          </div>
        </div>

        {/* --- 7. MESSAGES PANEL --- */}
        <div className={`${styles.canvasPanel} ${activeView === 'messages' ? styles.activePanel : ''}`} id="panel-messages">
          <h2>Messages</h2>
          <div className={styles.messageList}>
            <div className={`${styles.msgItem} ${styles.unread}`}>
              <div className={styles.msgAvatar}>M</div>
              <div className={styles.msgContent}>
                <div className={styles.msgHeader}><h3>Mentor</h3><span>Recently</span></div>
                <p>Don't forget to submit your project proposal by tomorrow.</p>
              </div>
            </div>
            <div className={styles.msgItem}>
              <div className={styles.msgAvatar}>SA</div>
              <div className={styles.msgContent}>
                <div className={styles.msgHeader}><h3>System Admin</h3><span>Yesterday</span></div>
                <p>Welcome to SURE ProEd! Please explore your dashboard.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  };

  return (
    <div className={styles.showcaseWrapper}>
      {activeView !== 'full' && (
        <button className={styles.backButton} onClick={resetView}>
          <FaArrowLeft /> View Full Dashboard
        </button>
      )}
      
      {activeView === 'full' && (
        <div className={styles.exploreHint}>
          Click to explore the platform
        </div>
      )}

      <div className={`${styles.dashboardScene} ${styles[activeView]}`}>
        <div className={styles.sidebar}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>❖</span> SURE ProEd
          </div>
          <nav className={styles.navMenu}>
            <button className={`${styles.navItem} ${activeView === 'dashboard' ? styles.active : ''}`} onClick={(e) => { e.stopPropagation(); handleMenuClick('dashboard'); }}>
              <FaHome /> Dashboard
            </button>
            <button className={`${styles.navItem} ${activeView === 'courses' ? styles.active : ''}`} onClick={(e) => { e.stopPropagation(); handleMenuClick('courses'); }}>
              <FaBook /> My Courses
            </button>
            <button className={`${styles.navItem} ${activeView === 'live' ? styles.active : ''}`} onClick={(e) => { e.stopPropagation(); handleMenuClick('live'); }}>
              <FaVideo /> Live Classes
            </button>
            <button className={`${styles.navItem} ${activeView === 'assignments' ? styles.active : ''}`} onClick={(e) => { e.stopPropagation(); handleMenuClick('assignments'); }}>
              <FaClipboardList /> Assignments
            </button>
            <button className={`${styles.navItem} ${activeView === 'attendance' ? styles.active : ''}`} onClick={(e) => { e.stopPropagation(); handleMenuClick('attendance'); }}>
              <FaUserCheck /> Attendance
            </button>
            <button className={`${styles.navItem} ${activeView === 'certificates' ? styles.active : ''}`} onClick={(e) => { e.stopPropagation(); handleMenuClick('certificates'); }}>
              <FaCertificate /> Certificates
            </button>
            <button className={`${styles.navItem} ${activeView === 'messages' ? styles.active : ''}`} onClick={(e) => { e.stopPropagation(); handleMenuClick('messages'); }}>
              <FaEnvelope /> Messages
            </button>
          </nav>
        </div>
        
        <div className={styles.mainContent}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <button aria-label="Go Back" className={styles.iconBtn}><FaArrowLeft /></button>
            </div>
            <div className={styles.headerRight}>
              <div className={styles.searchBar}>
                <FaSearch className={styles.searchIcon} aria-hidden="true" />
                <input type="text" placeholder="Search..." aria-label="Search" disabled />
              </div>
              <button aria-label="Notifications" className={styles.iconBtn}><FaBell /></button>
              <div className={styles.userProfile}>
                <div className={styles.avatar}>S</div>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>Student</span>
                  <span className={styles.userRole}>Member</span>
                </div>
                <FaChevronDown className={styles.chevron} />
              </div>
            </div>
          </header>
          
          <div className={styles.contentScrollable}>
            {renderDashboardContent()}
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default HeroProductShowcase;