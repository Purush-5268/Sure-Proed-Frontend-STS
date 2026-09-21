export const formatDisplayDate = (dateString) => {
  if (!dateString) return null;
  const safeDateStr = typeof dateString === 'string' && dateString.includes(' ') && !dateString.includes('T')
    ? dateString.replace(' ', 'T')
    : dateString;
  const date = new Date(safeDateStr);
  if (isNaN(date.getTime())) return null;

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const formatDisplayDateTime = (dateString) => {
  if (!dateString) return null;
  const safeDateStr = typeof dateString === 'string' && dateString.includes(' ') && !dateString.includes('T')
    ? dateString.replace(' ', 'T')
    : dateString;
  const date = new Date(safeDateStr);
  if (isNaN(date.getTime())) return null;

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};
