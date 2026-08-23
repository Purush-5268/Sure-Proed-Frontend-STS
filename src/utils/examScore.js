const finiteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Make legacy result rows internally consistent without changing the backend result. */
export const normalizeExamScore = ({
  marksObtained,
  totalMarks,
  percentage,
  totalQuestions,
}) => {
  const marks = Math.max(0, finiteNumber(marksObtained) ?? 0);
  const questions = Math.max(0, finiteNumber(totalQuestions) ?? 0);
  let percent = Math.min(100, Math.max(0, finiteNumber(percentage) ?? 0));
  let total = Math.max(0, finiteNumber(totalMarks) ?? 0);

  if (!total && percent > 0) total = (marks * 100) / percent;
  if (!total) total = questions || marks;

  const calculatedPercent = total > 0 ? (marks / total) * 100 : 0;
  const inconsistent = Math.abs(calculatedPercent - percent) > 0.5;

  if (inconsistent && percent > 0 && marks > 0) {
    const percentageDerivedTotal = (marks * 100) / percent;
    if (percentageDerivedTotal >= marks) total = percentageDerivedTotal;
  } else if (percentage === null || percentage === undefined || percentage === "") {
    percent = calculatedPercent;
  }

  return {
    marksObtained: Number(marks.toFixed(2)),
    totalMarks: Number(total.toFixed(2)),
    percentage: Number(percent.toFixed(2)),
    inconsistentSource: inconsistent,
  };
};
