import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import SkeletonLoader from "../../../components/common/SkeletonLoader";
import styles from "./ContributionTab.module.css";
import { FaClock, FaChalkboardTeacher, FaUserGraduate, FaChartLine } from "react-icons/fa";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function ContributionTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadContributions = async () => {
      try {
        const res = await apiClient.get('/api/volunteers/me/contributions/');
        if (isMounted) setData(res.data);
      } catch (err) {
        if (isMounted) setError(err.response?.data?.detail || "Failed to load contributions.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadContributions();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "32px", padding: "16px 0" }}>
        <div style={{ display: "flex", gap: "20px", marginBottom: "40px" }}>
           <SkeletonLoader variant="card" />
           <SkeletonLoader variant="card" />
           <SkeletonLoader variant="card" />
           <SkeletonLoader variant="card" />
        </div>
        <SkeletonLoader variant="table" rows={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "16px 0" }}>
         <div className="premium-alert-error">❌ {error}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", padding: "16px 0" }}>

      <div className={styles.impactGrid}>
        <div className="premium-glass-card">
           <div className={styles.iconWrapper} style={{background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6'}}><FaClock size={24} /></div>
           <div className={styles.statValue}>{data.summary.total_hours} hrs</div>
           <div className={styles.statLabel}>Total Hours</div>
        </div>
        <div className="premium-glass-card">
           <div className={styles.iconWrapper} style={{background: 'rgba(16, 185, 129, 0.1)', color: '#10b981'}}><FaChalkboardTeacher size={24} /></div>
           <div className={styles.statValue}>{data.summary.classes_conducted}</div>
           <div className={styles.statLabel}>Classes Conducted</div>
        </div>
        <div className="premium-glass-card">
           <div className={styles.iconWrapper} style={{background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b'}}><FaUserGraduate size={24} /></div>
           <div className={styles.statValue}>{data.summary.students_impacted}</div>
           <div className={styles.statLabel}>Students Impacted</div>
        </div>
        <div className="premium-glass-card">
           <div className={styles.iconWrapper} style={{background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6'}}><FaChartLine size={24} /></div>
           <div className={styles.statValue}>{data.summary.average_attendance}%</div>
           <div className={styles.statLabel}>Avg. Attendance</div>
        </div>
        <div className="premium-glass-card">
           <div className={styles.iconWrapper} style={{background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444'}}><FaUserGraduate size={24} /></div>
           <div className={styles.statValue}>{data.summary.permissions_granted || 0}</div>
           <div className={styles.statLabel}>Permissions Granted</div>
        </div>
      </div>

      <div className={styles.mainLayout}>
        <div className={styles.leftCol}>
          <div className={`premium-glass-card ${styles.cardFull}`}>
            <h2 className="premium-section-title">Contribution Overview</h2>
            <div className={styles.chartContainer}>
               {data.monthly_hours.length > 0 ? (
                 <div style={{ width: '100%', height: '220px' }}>
                   <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={data.monthly_hours} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                       <XAxis dataKey="month" tickFormatter={(val) => new Date(val + '-01').toLocaleDateString('en-US', {month: 'short'})} stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                       <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                       <Tooltip
                         cursor={{fill: 'rgba(255,255,255,0.05)'}}
                         contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#f3f4f6' }}
                         formatter={(value) => [`${value} hrs`, 'Hours']}
                         labelFormatter={(label) => new Date(label + '-01').toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}
                       />
                       <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                     </BarChart>
                   </ResponsiveContainer>
                 </div>
               ) : (
                 <p className="premium-text-muted">No monthly data available.</p>
               )}
            </div>
          </div>

          <div className={`premium-glass-card ${styles.cardFull}`}>
            <h2 className="premium-section-title">My Cohorts</h2>
            {data.cohorts.length > 0 ? (
              <div className={styles.cohortList}>
                {data.cohorts.slice().sort((a,b) => (a.name || a.code || a.title || "").localeCompare(b.name || b.code || b.title || "")).map(c => (
                  <Link to={`/trustee/volunteer/cohorts/${c.id}`} key={c.id} className={styles.cohortItem}>
                    <div className={styles.cohortMain}>
                       <span className={styles.cohortCode}>{c.code}</span>
                       <span className={styles.cohortName}>{c.name}</span>
                       <span className={`premium-badge`} style={{marginLeft: '10px'}}>{c.status}</span>
                    </div>
                    <div className={styles.cohortStats}>
                       <div><strong>{c.students_count}</strong> Students</div>
                       <div><strong>{c.classes_conducted}</strong> Classes</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="premium-text-muted">You are not assigned to any cohorts.</p>
            )}
          </div>
        </div>

        <div className={styles.rightCol}>
           <div className={`premium-glass-card ${styles.cardFull}`}>
             <h2 className="premium-section-title">Recent Activity</h2>
             {data.recent_activity.length > 0 ? (
                <div className={styles.activityTimeline}>
                  {data.recent_activity.map(act => (
                    <div key={act.id} className={styles.activityItem}>
                      <div className={styles.activityDot}></div>
                      <div className={styles.activityContent}>
                         <div className={styles.activityTitle}>{act.title}</div>
                         <div className={styles.activitySubtitle}>{act.subtitle}</div>
                         <div className={styles.activityMeta}>
                            {act.meta_text && <span>{act.meta_text} • </span>}<span>{new Date(act.date).toLocaleDateString()}</span>
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
             ) : (
               <p className="premium-text-muted">No recent activity found.</p>
             )}
           </div>
        </div>
    </div>
    </div>
  );
}
