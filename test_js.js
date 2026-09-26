let form = { application_end_date: "" };
let appEndDate = form.application_end_date;
if (appEndDate) {
  const dateObj = new Date(appEndDate);
  appEndDate = dateObj.toISOString();
} else {
  appEndDate = null;
}
console.log("Empty string:", appEndDate);

form.application_end_date = "2026-09-28T13:20";
appEndDate = form.application_end_date;
if (appEndDate) {
  const dateObj = new Date(appEndDate);
  appEndDate = dateObj.toISOString();
} else {
  appEndDate = null;
}
console.log("Valid date string:", appEndDate);
