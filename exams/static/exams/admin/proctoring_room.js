(function () {
  "use strict";

  function filterAssessmentOptions() {
    const typeSelect = document.getElementById("id_assessment_type");
    const courseSelect = document.getElementById("id_course");
    const bankSelect = document.getElementById("id_question_bank");
    const examSelect = document.getElementById("id_exam");
    if (!typeSelect || !courseSelect || !bankSelect || !examSelect) return;

    const assessmentType = typeSelect.value;
    const courseId = courseSelect.value;
    Array.from(bankSelect.options).forEach((option) => {
      if (!option.value) return;
      const visible =
        (!courseId || option.dataset.course === courseId) &&
        (!assessmentType || option.dataset.assessmentType === assessmentType);
      option.hidden = !visible;
      option.disabled = !visible;
    });
    if (bankSelect.selectedOptions[0]?.disabled) bankSelect.value = "";

    const isPrescreening = assessmentType === "PRESCREENING";
    Array.from(examSelect.options).forEach((option) => {
      if (!option.value) return;
      const visible = isPrescreening && (!courseId || option.dataset.course === courseId);
      option.hidden = !visible;
      option.disabled = !visible;
    });
    examSelect.disabled = !isPrescreening;
    if (!isPrescreening) examSelect.value = "";
    else if (examSelect.selectedOptions[0]?.disabled) examSelect.value = "";
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["id_assessment_type", "id_course"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", filterAssessmentOptions);
    });
    filterAssessmentOptions();
  });
})();
