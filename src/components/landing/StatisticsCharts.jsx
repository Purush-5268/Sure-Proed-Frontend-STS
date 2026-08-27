import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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
  // Format data for Recharts
  const chartData = [
    { name: 'Total Students', value: data.total || 0, fill: '#3b82f6' },
    { name: 'Training', value: data.training || 0, fill: '#10b981' },
    { name: 'Internship', value: data.internship || 0, fill: '#8b5cf6' },
    { name: 'Completed', value: data.completed || 0, fill: '#f59e0b' },
  ];

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 20, left: -20, bottom: 20 }}
          barSize={40}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color, #e2e8f0)" opacity={0.5} />
          <XAxis 
            dataKey="name" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-secondary, #6b7280)', fontSize: 13, fontWeight: 500 }}
            dy={10}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-secondary, #6b7280)', fontSize: 13 }}
            dx={-10}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-nested, #f1f5f9)', opacity: 0.4 }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const EcosystemChart = ({ data }) => {
  const chartData = [
    { name: 'Mentors', value: data.mentors || 0, fill: '#2563eb' },
    { name: 'Volunteers', value: data.volunteers || 0, fill: '#0ea5e9' },
    { name: 'Trustees', value: data.trustees || 0, fill: '#8b5cf6' },
    { name: 'Advisors', value: data.advisors || 0, fill: '#d946ef' },
  ];

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
          barSize={24}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color, #e2e8f0)" opacity={0.5} />
          <XAxis 
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-secondary, #6b7280)', fontSize: 13 }}
          />
          <YAxis 
            dataKey="name" 
            type="category"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-secondary, #6b7280)', fontSize: 13, fontWeight: 500 }}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-nested, #f1f5f9)', opacity: 0.4 }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
