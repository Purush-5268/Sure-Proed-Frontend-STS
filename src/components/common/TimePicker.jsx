import React, { useState, useEffect } from 'react';

const TimePicker = ({ value, onChange, required, className }) => {
  // Parse incoming HH:MM 24-hour string to 12-hour components
  const parseTime = (timeStr) => {
    if (!timeStr) return { hh: '12', mm: '00', period: 'AM' };
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return { hh: '12', mm: '00', period: 'AM' };
    
    const period = h >= 12 ? 'PM' : 'AM';
    let hh = h % 12;
    if (hh === 0) hh = 12;
    return {
      hh: hh.toString().padStart(2, '0'),
      mm: m.toString().padStart(2, '0'),
      period
    };
  };

  const [timeParts, setTimeParts] = useState(parseTime(value));

  // Sync state if external value changes (e.g. form reset)
  useEffect(() => {
    if (value) {
      const parsed = parseTime(value);
      setTimeParts(prev => {
        // Only update if there's a difference to avoid loop
        if (prev.hh !== parsed.hh || prev.mm !== parsed.mm || prev.period !== parsed.period) {
          return parsed;
        }
        return prev;
      });
    }
  }, [value]);

  const handleChange = (part, newVal) => {
    const newParts = { ...timeParts, [part]: newVal };
    setTimeParts(newParts);
    
    // Convert back to 24-hour format
    let h24 = parseInt(newParts.hh, 10);
    if (newParts.period === 'AM' && h24 === 12) h24 = 0;
    if (newParts.period === 'PM' && h24 !== 12) h24 += 12;
    
    const h24Str = h24.toString().padStart(2, '0');
    const mmStr = newParts.mm.toString().padStart(2, '0');
    
    if (onChange) {
      // Mock synthetic event so existing onChange={e => ...} still works
      onChange({ target: { value: `${h24Str}:${mmStr}` } });
    }
  };

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <select 
        value={timeParts.hh} 
        onChange={(e) => handleChange('hh', e.target.value)}
        className={className}
        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}
        required={required}
      >
        {hours.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ display: 'flex', alignItems: 'center' }}>:</span>
      <select 
        value={timeParts.mm} 
        onChange={(e) => handleChange('mm', e.target.value)}
        className={className}
        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}
        required={required}
      >
        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select 
        value={timeParts.period} 
        onChange={(e) => handleChange('period', e.target.value)}
        className={className}
        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}
        required={required}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

export default TimePicker;
