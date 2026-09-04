import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import styles from './Statistics.module.css';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        padding: '12px 16px',
        borderRadius: '12px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        color: 'var(--text-primary, #111827)'
      }}>
        <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '14px' }}>{label}</p>
        <p style={{ margin: 0, fontWeight: '800', fontSize: '20px', color: payload[0].payload.fill || 'var(--primary-color, #2563eb)' }}>
          {payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export const StudentJourneyChart = ({ data }) => {
  const [activeLegend, setActiveLegend] = React.useState(null);

  if (!data) return null;

  const total = data.total || data.benefited || 0;
  
  // The backend payload returns the mutually exclusive slices inside data.journey
  const journey = data.journey || {};
  
  // Safe extraction matching backend properties or defaulting to the old root properties for backward compatibility
  const activeBeforeCohort = journey.active_before_cohort ?? (data.active_before_cohort || 0);
  const training = journey.training ?? (data.training || 0);
  const internship = journey.internship ?? (data.internship || 0);
  const softSkills = journey.soft_skills_completed ?? (data.soft_skills || data.completed || 0);
  const placed = journey.placed ?? (data.placed || 0);

  const calculatedSum = activeBeforeCohort + training + internship + softSkills + placed;
  const remaining = total > calculatedSum ? total - calculatedSum : 0;

  // The slices representing mutually-exclusive student journey stages
  const chartData = [
    { name: 'Active / Before Cohort', value: activeBeforeCohort, fill: '#3b82f6' }, // Blue
    { name: 'Training', value: training, fill: '#10b981' }, // Green
    { name: 'Internship', value: internship, fill: '#eab308' }, // Yellow
    { name: 'Soft Skills', value: softSkills, fill: '#a855f7' }, // Purple
    { name: 'Placed', value: placed, fill: '#06b6d4' }, // Teal
  ];

  if (remaining > 0) {
    chartData.push({ name: 'Remaining', value: remaining, fill: '#f1f5f9' });
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      if (item.name === 'Remaining') return null; // Hide tooltip for the empty track
      const percentage = total > 0 ? ((item.value / total) * 100).toFixed(2) : 0;
      return (
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          padding: '12px 16px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          color: 'var(--text-primary, #111827)'
        }}>
          <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '13px' }}>{item.name}</p>
          <p style={{ margin: 0, fontWeight: '800', fontSize: '16px', color: item.fill }}>
            {item.value} students
          </p>
          <p style={{ margin: '2px 0 0 0', fontWeight: '500', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {percentage}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.chartLegendWrapper}>
      <div className={styles.donutWrapper}>
        <div className={styles.donutCenter}>
          <span className={styles.donutCenterLabel}>TOTAL STUDENTS</span>
          <span className={styles.donutCenterValue}>{total}</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              innerRadius={80}
              outerRadius={120}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              isAnimationActive={true}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1000 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className={styles.legendContainer}>
        {chartData.map((item, i) => {
          if (item.name === 'Remaining') return null;
          const percentage = total > 0 ? ((item.value / total) * 100).toFixed(2) : 0;
          const isActive = activeLegend === i;
          return (
            <div 
              key={i} 
              className={styles.legendRow} 
              onClick={() => setActiveLegend(isActive ? null : i)}
              style={{ cursor: 'pointer' }}
            >
              <div className={styles.legendLeft}>
                <span className={styles.legendDot} style={{ backgroundColor: item.fill }}></span>
                <span className={styles.legendName}>{item.name}</span>
              </div>
              <div className={styles.legendRight}>
                <span className={styles.legendCount}>{item.value} {item.value === 1 ? 'student' : 'students'}</span>
                {isActive && (
                  <span className={styles.legendPercentage}>{percentage}%</span>
                )}
                <span className={styles.legendChevron} style={{ transform: isActive ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>&gt;</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const EcosystemChart = ({ data }) => {
  if (!data) return null;

  const mentors = data.mentors || 0;
  const volunteers = data.volunteers || 0;
  const total = mentors + volunteers;

  const chartData = [
    { name: 'Mentors', value: mentors, fill: '#3b82f6' }, // Blue
    { name: 'Volunteers', value: volunteers, fill: '#10b981' }, // Green
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const percentage = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
      return (
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          padding: '12px 16px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          color: 'var(--text-primary, #111827)'
        }}>
          <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '13px' }}>{item.name}</p>
          <p style={{ margin: 0, fontWeight: '800', fontSize: '16px', color: item.fill }}>
            {item.value}
          </p>
          <p style={{ margin: '2px 0 0 0', fontWeight: '500', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {percentage}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.peopleChartWrapper}>
      <div className={styles.peopleDonutWrapper}>
        <div className={styles.donutCenter}>
          <span className={styles.donutCenterLabel}>TOTAL PEOPLE</span>
          <span className={styles.donutCenterValue}>{total}</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              isAnimationActive={true}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1000 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className={styles.peopleLegendContainer}>
        {chartData.map((item, i) => {
          const percentage = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
          return (
            <div key={i} className={styles.peopleLegendRow}>
              <div className={styles.legendLeft}>
                <span className={styles.legendDot} style={{ backgroundColor: item.fill }}></span>
                <span className={styles.legendName}>{item.name}</span>
              </div>
              <div className={styles.legendRight}>
                <span className={styles.legendCount}>{item.value} ({percentage}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
