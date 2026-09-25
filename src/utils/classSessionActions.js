export const promptForClassEndTime = () => {
  const now = new Date();
  const defaultTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const enteredTime = window.prompt(
    "Enter the actual class end time in 24-hour HH:MM format.\n\nThe current time is prefilled. This time will be the attendance cutoff.",
    defaultTime
  );

  if (enteredTime === null) return null;

  const normalizedTime = enteredTime.trim() || defaultTime;
  const match = normalizedTime.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) {
    window.alert("Please enter a valid 24-hour time in HH:MM format, for example 18:30.");
    return null;
  }

  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
};
