import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import styles from "./Dashboard.module.css";
import { useNavigate } from 'react-router-dom';

export default function ProgressDonutChart({ stats }) {
  const navigate = useNavigate();

  // Use the backend-provided authoritative values from the statistics endpoint.
  const attendancePct = stats?.attendance_percentage || 0;
  const attendancePresent = stats?.attendance_present || 0;
  const attendanceTotal = stats?.attendance_total || 0;
  const attendanceMissed = Math.max(0, attendanceTotal - attendancePresent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', alignItems: 'center' }}>
      
      {/* Single Large Donut Chart */}
      <div className={styles.progressDonut} style={{ width: '160px', height: '160px', margin: '0 auto' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie 
              data={[
                { name: 'Attended', value: attendancePct }, 
                { name: 'Remaining', value: Math.max(0, 100 - attendancePct) }
              ]} 
              innerRadius={55} 
              outerRadius={75} 
              stroke="none" 
              isAnimationActive={false}
            >
              <Cell fill="var(--primary-color)" />
              <Cell fill="var(--bg-nested)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.progressDonutLabel}>
          <div className={styles.progressDonutPct} style={{ fontSize: '28px' }}>{Math.round(attendancePct)}%</div>
          <div className={styles.progressDonutSub} style={{ fontSize: '12px' }}>Attendance</div>
        </div>
      </div>
      
      {/* Legends matching original image */}
      <div className={styles.progressLegend} style={{ marginTop: '24px', width: '100%', padding: '0 10px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)' }}></span>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Attended</span>
          </div>
          <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{attendancePresent}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Missed</span>
          </div>
          <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{attendanceMissed}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b' }}></span>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Total</span>
          </div>
          <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{attendanceTotal}</span>
        </div>

      </div>

      <button 
        className={styles.enrollmentViewBtn}
        onClick={() => navigate('/student/attendance')}
      >
        View Detailed Progress &rarr;
      </button>
    </div>
  );
}
