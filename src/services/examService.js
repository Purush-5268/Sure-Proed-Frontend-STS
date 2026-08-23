import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

const parseList = (response) => {
  const data = response?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

const apiError = (error, fallback) =>
  error?.response?.data?.error ||
  error?.response?.data?.detail ||
  Object.values(error?.response?.data || {}).flat().find(Boolean) ||
  error?.message ||
  fallback;

const ENROLLED_APPLICATION_STATUSES = new Set([
  "COHORT_ASSIGNED",
  "IN_PROGRESS",
  "TRAINING",
  "INTERNSHIP_ASSIGNED",
  "SUSPENDED",
  "TRANSFER_COHORT",
]);

const OPEN_SCREENING_STATUSES = new Set([
  "APPLIED",
  "EXAM_PENDING",
  "EXAM_COMPLETED",
  "PRESCREENING_PENDING",
  "PRESCREENING_COMPLETED",
  "QUALIFIED",
  "WAITLISTED",
]);

const idOf = (value) => String(value?.id || value || "");
const applicationIdOf = (record) => idOf(record?.application);
const timestampOf = (application) =>
  new Date(application?.updated_at || application?.applied_at || application?.created_at || 0).getTime();

/**
 * Select one coherent student journey. An application that already owns an active
 * cohort always wins over an older screening application, even when that older
 * application still has a stale RESCHEDULED pre-screening row.
 */
export const selectCurrentApplication = (applications = [], schedules = [], exams = []) => {
  const ordered = [...applications].sort((left, right) => timestampOf(right) - timestampOf(left));

  const enrolledApplication = ordered.find((application) => {
    const status = String(application?.status || "").toUpperCase();
    const assignedCohort =
      application?.assigned_cohort?.id || application?.assigned_cohort || application?.assigned_cohort_id;
    return Boolean(assignedCohort) && ENROLLED_APPLICATION_STATUSES.has(status);
  });
  if (enrolledApplication) return enrolledApplication;

  const liveScreeningApplication = ordered.find((application) => {
    const applicationId = idOf(application);
    const status = String(application?.status || "").toUpperCase();
    if (!OPEN_SCREENING_STATUSES.has(status)) return false;

    const hasOpenSchedule = schedules.some(
      (schedule) =>
        applicationIdOf(schedule) === applicationId &&
        ["SCHEDULED", "RESCHEDULED"].includes(String(schedule?.status || "").toUpperCase())
    );
    const hasOpenExam = exams.some(
      (exam) =>
        applicationIdOf(exam) === applicationId &&
        !["SUBMITTED", "EVALUATED", "CANCELLED"].includes(String(exam?.status || "").toUpperCase()) &&
        !exam?.submitted_at
    );
    return hasOpenSchedule || hasOpenExam;
  });

  return (
    liveScreeningApplication ||
    ordered.find((application) =>
      !["REJECTED", "DROPPED", "CANCELLED", "COMPLETED"].includes(
        String(application?.status || "").toUpperCase()
      )
    ) ||
    ordered[0] ||
    null
  );
};

/** Load candidate-visible metadata. Question-bank answer keys are never queried here. */
export const fetchAuthoritativeExamContext = async () => {
  try {
    const [applicationsResponse, currentJourneyResponse, schedulesResponse, examsResponse, coursesResponse] = await Promise.all([
      apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE),
      apiClient.get(API_ENDPOINTS.APPLICATIONS.CURRENT_JOURNEY).catch(() => ({ data: null })),
      apiClient.get(API_ENDPOINTS.PRE_SCREENINGS.BASE).catch(() => ({ data: [] })),
      apiClient.get(API_ENDPOINTS.EXAMS.BASE).catch(() => ({ data: [] })),
      apiClient.get(API_ENDPOINTS.COURSES.BASE).catch(() => ({ data: [] })),
    ]);

    const applications = parseList(applicationsResponse);
    const schedules = parseList(schedulesResponse);
    const exams = parseList(examsResponse);
    const courses = parseList(coursesResponse);
    const coursesById = Object.fromEntries(
      courses.filter((course) => course?.id).map((course) => [course.id, course])
    );

    if (!applications.length) {
      return {
        hasApplication: false,
        activeApp: null,
        courseId: null,
        courseName: "Screening Track",
        courseObj: null,
        latestSchedule: null,
        latestExam: null,
        isCompleted: false,
        isQualified: false,
        isFailed: false,
        isExamAvailable: false,
        isNewScheduleActive: false,
        examConfig: null,
      };
    }

    const activeApp =
      currentJourneyResponse?.data?.application ||
      selectCurrentApplication(applications, schedules, exams);

    const courseId = activeApp.course?.id || activeApp.course || activeApp.course_id;
    const courseObj = coursesById[courseId] || (typeof activeApp.course === "object" ? activeApp.course : null);
    const courseName = courseObj?.name || activeApp.course_name || "Screening Track";
    const courseCode = courseObj?.code || activeApp.course_code || "";
    const appSchedules = schedules
      .filter((schedule) => applicationIdOf(schedule) === idOf(activeApp))
      .sort(
        (left, right) =>
          new Date(right.scheduled_at || right.updated_at || right.created_at || 0) -
          new Date(left.scheduled_at || left.updated_at || left.created_at || 0)
      );
    const appExams = exams
      .filter((exam) => applicationIdOf(exam) === idOf(activeApp))
      .sort(
        (left, right) =>
          new Date(right.submitted_at || right.created_at || 0) -
          new Date(left.submitted_at || left.created_at || 0)
      );
    const latestSchedule = appSchedules[0] || null;
    const latestExam = appExams[0] || null;
    const activeAppStatus = String(activeApp.status || "").toUpperCase();
    const isEnrolled = Boolean(
      (activeApp.assigned_cohort?.id || activeApp.assigned_cohort || activeApp.assigned_cohort_id) &&
        ENROLLED_APPLICATION_STATUSES.has(activeAppStatus)
    );
    const examConfig = {
      total_questions: Number(latestExam?.total_questions || courseObj?.exam_total_questions || 10),
      duration_minutes: Number(latestExam?.duration_minutes || courseObj?.exam_duration_minutes || 45),
      pass_percentage: Number(latestExam?.pass_percentage || courseObj?.exam_pass_percentage || 60),
      difficulty: String(latestExam?.level || courseObj?.exam_difficulty || "MIXED").toUpperCase(),
      requires_interview: courseObj?.requires_interview ?? true,
      proctoring_enabled: latestExam?.proctoring_enabled ?? true,
      proctoring_required: latestExam?.proctoring_required ?? true,
      max_violations: 5,
    };

    const evaluated = Boolean(
      latestExam &&
        (latestExam.status === "EVALUATED" ||
          latestExam.submitted_at ||
          latestExam.marks_obtained != null ||
          latestExam.percentage != null)
    );
    let isNewScheduleActive = false;
    if (
      latestSchedule &&
      ["SCHEDULED", "RESCHEDULED"].includes(String(latestSchedule.status || "").toUpperCase())
    ) {
      if (!evaluated) {
        isNewScheduleActive = true;
      } else {
        const submittedAt = new Date(latestExam.submitted_at || latestExam.created_at || 0).getTime();
        const scheduledAt = new Date(
          latestSchedule.scheduled_at || latestSchedule.updated_at || latestSchedule.created_at || 0
        ).getTime();
        isNewScheduleActive = scheduledAt >= submittedAt - 60000 || latestSchedule.status === "RESCHEDULED";
      }
    }

    const appStatus = String(activeApp.status || "").toUpperCase();
    const isQualified =
      !isNewScheduleActive &&
      (activeApp.qualified === true ||
        latestExam?.qualified === true ||
        ["QUALIFIED", "COHORT_ASSIGNED"].includes(appStatus));
    const isFailed =
      !isNewScheduleActive &&
      !isQualified &&
      (latestExam?.qualified === false || appStatus === "REJECTED" || latestSchedule?.status === "FAILED");
    const isCompleted = !isNewScheduleActive && (evaluated || isQualified || isFailed);

    return {
      hasApplication: true,
      activeApp,
      courseId,
      courseName,
      courseCode,
      courseObj,
      schedules: appSchedules,
      latestSchedule,
      examAttempts: appExams,
      latestExam,
      isEnrolled,
      isNewScheduleActive,
      isCompleted,
      isExamAvailable: Boolean(latestExam && !isCompleted && !isQualified && !isFailed),
      isQualified,
      isFailed,
      examConfig,
    };
  } catch (error) {
    console.error("[Exam Context] Failed to load authoritative context:", error);
    return null;
  }
};

export const fetchExamConfig = async () => {
  const context = await fetchAuthoritativeExamContext();
  return context?.examConfig
    ? { success: true, config: context.examConfig, context }
    : { success: false, error: "No active exam configuration is available." };
};

/** Preserve the exact server order while adapting option strings to the rendering model. */
export const normalizeInternalExamQuestions = (rawQuestions = []) =>
  Array.isArray(rawQuestions)
    ? rawQuestions.map((question, questionIndex) => {
        const rawOptions = Array.isArray(question.options)
          ? question.options
          : question.options && typeof question.options === "object"
          ? Object.values(question.options)
          : [];
        const options = rawOptions.map((option, optionIndex) => ({
          key: String.fromCharCode(65 + optionIndex),
          text:
            option && typeof option === "object"
              ? String(option.text || option.value || option.label || "")
              : String(option),
        }));
        const text =
          question.question || question.question_text || question.text || `Question ${questionIndex + 1}`;
        return {
          id: String(question.id ?? questionIndex + 1),
          questionNumber: questionIndex + 1,
          questionText: text,
          question: text,
          options,
          marks: Number(question.marks) || 1,
          negativeMarks: Number(question.negative_marks) || 0,
          topic: question.topic || question.subject || "General",
          difficulty: question.difficulty || "MIXED",
        };
      })
    : [];

const normalizeAttempt = (data, fallbackId, assessmentType) => {
  const questions = normalizeInternalExamQuestions(data?.questions || []);
  if (!questions.length) throw new Error("The server did not assign any examination questions.");
  return {
    success: true,
    assessment_type: data.assessment_type || assessmentType,
    attempt_id: data.attempt_id,
    exam_id: data.exam_id || (assessmentType === "PRESCREENING" ? fallbackId : undefined),
    module_test_id: data.module_test_id || (assessmentType === "MODULE_TEST" ? fallbackId : undefined),
    title: data.title,
    course_id: data.course_id,
    course_name: data.course_name,
    module_title: data.module_title,
    start_time: data.start_time,
    expires_at: data.expires_at,
    duration_minutes: Number(data.duration_minutes) || 45,
    pass_percentage: Number(data.pass_percentage) || 60,
    questions,
    saved_answers: data.saved_answers || {},
    paper_code: data.paper_code,
    paper_label: data.paper_label || `Paper ${data.paper_code || ""}`.trim(),
    proctoring: data.proctoring || { enabled: false, required: false, provider: "NONE" },
    raw: data,
  };
};

export const startInternalExam = async (examId, payload = {}) => {
  try {
    if (!examId) throw new Error("No Django exam record is assigned to this candidate.");
    const response = await apiClient.post(API_ENDPOINTS.EXAMS.START_INTERNAL(examId), payload);
    return normalizeAttempt(response.data, examId, "PRESCREENING");
  } catch (error) {
    return {
      success: false,
      error: apiError(error, "Failed to start the examination."),
      status: error?.response?.status,
    };
  }
};

export const autosaveExam = async (examId, payload = {}) => {
  try {
    const response = await apiClient.post(API_ENDPOINTS.EXAMS.AUTOSAVE(examId), {
      attempt_id: payload.attempt_id,
      answers: payload.answers || {},
      security_events: payload.security_events || [],
      client_timestamp: new Date().toISOString(),
    });
    return { success: true, ...response.data };
  } catch (error) {
    return { success: false, error: apiError(error, "Autosave failed."), status: error?.response?.status };
  }
};

export const submitInternalExam = async (examId, payload = {}) => {
  try {
    const response = await apiClient.post(API_ENDPOINTS.EXAMS.SUBMIT(examId), {
      attempt_id: payload.attempt_id,
      answers: payload.answers || {},
      duration_taken_seconds: payload.duration_taken_seconds || 0,
      security_events: payload.security_events || [],
      submitted_at: new Date().toISOString(),
    });
    return { success: true, exam: response.data?.exam || response.data, result: response.data };
  } catch (error) {
    throw new Error(apiError(error, "Exam submission failed."), { cause: error });
  }
};

export const startModuleTest = async (moduleTestId) => {
  try {
    const response = await apiClient.post(API_ENDPOINTS.MODULE_TESTS.START(moduleTestId));
    return normalizeAttempt(response.data, moduleTestId, "MODULE_TEST");
  } catch (error) {
    return {
      success: false,
      error: apiError(error, "Failed to start the module test."),
      status: error?.response?.status,
    };
  }
};

export const autosaveModuleTest = async (moduleTestId, payload = {}) => {
  try {
    const response = await apiClient.post(API_ENDPOINTS.MODULE_TESTS.AUTOSAVE(moduleTestId), {
      attempt_id: payload.attempt_id,
      answers: payload.answers || {},
    });
    return { success: true, ...response.data };
  } catch (error) {
    return {
      success: false,
      error: apiError(error, "Module-test autosave failed."),
      status: error?.response?.status,
    };
  }
};

export const submitModuleTest = async (moduleTestId, payload = {}) => {
  try {
    const response = await apiClient.post(API_ENDPOINTS.MODULE_TESTS.SUBMIT(moduleTestId), {
      attempt_id: payload.attempt_id,
      answers: payload.answers || {},
      submitted_at: new Date().toISOString(),
    });
    return { success: true, exam: response.data, result: response.data };
  } catch (error) {
    throw new Error(apiError(error, "Module-test submission failed."), { cause: error });
  }
};

export const listQuestionBanks = async (params = {}) =>
  parseList(await apiClient.get(API_ENDPOINTS.QUESTION_BANKS.BASE, { params }));
export const generateQuestionBank = async (payload) =>
  (await apiClient.post(API_ENDPOINTS.QUESTION_BANKS.GENERATE, payload)).data;
export const getQuestionBank = async (bankId) =>
  (await apiClient.get(API_ENDPOINTS.QUESTION_BANKS.BY_ID(bankId))).data;
export const getQuestionPaper = async (bankId, setCode) =>
  (await apiClient.get(API_ENDPOINTS.QUESTION_BANKS.PAPER(bankId, setCode))).data;
export const publishQuestionBank = async (bankId) =>
  (await apiClient.post(API_ENDPOINTS.QUESTION_BANKS.PUBLISH(bankId))).data;
export const regenerateQuestionBank = async (bankId, payload = {}) =>
  (await apiClient.post(API_ENDPOINTS.QUESTION_BANKS.REGENERATE(bankId), payload)).data;
export const closeQuestionBank = async (bankId) =>
  (await apiClient.post(API_ENDPOINTS.QUESTION_BANKS.CLOSE(bankId))).data;
export const deleteQuestionBank = async (bankId) =>
  apiClient.delete(API_ENDPOINTS.QUESTION_BANKS.BY_ID(bankId));
export const getProctoringRooms = async (examId) =>
  (await apiClient.get(API_ENDPOINTS.EXAMS.PROCTORING_ROOMS(examId))).data;
export const configureProctoring = async (examId, payload) =>
  (await apiClient.post(API_ENDPOINTS.EXAMS.CONFIGURE_PROCTORING(examId), payload)).data;
export const assignProctor = async (examId, payload) =>
  (await apiClient.post(API_ENDPOINTS.EXAMS.ASSIGN_PROCTOR(examId), payload)).data;
export const getModuleTestProctoringRooms = async (moduleTestId) =>
  (await apiClient.get(API_ENDPOINTS.MODULE_TESTS.PROCTORING_ROOMS(moduleTestId))).data;
export const configureModuleTestProctoring = async (moduleTestId, payload) =>
  (await apiClient.post(API_ENDPOINTS.MODULE_TESTS.CONFIGURE_PROCTORING(moduleTestId), payload)).data;
export const assignModuleTestProctor = async (moduleTestId, payload) =>
  (await apiClient.post(API_ENDPOINTS.MODULE_TESTS.ASSIGN_PROCTOR(moduleTestId), payload)).data;

export const examService = {
  fetchAuthoritativeExamContext,
  fetchExamConfig,
  normalizeInternalExamQuestions,
  startInternalExam,
  autosaveExam,
  submitInternalExam,
  startModuleTest,
  autosaveModuleTest,
  submitModuleTest,
  listQuestionBanks,
  generateQuestionBank,
  getQuestionBank,
  getQuestionPaper,
  publishQuestionBank,
  regenerateQuestionBank,
  closeQuestionBank,
  deleteQuestionBank,
  getProctoringRooms,
  configureProctoring,
  assignProctor,
  getModuleTestProctoringRooms,
  configureModuleTestProctoring,
  assignModuleTestProctor,
};

export default examService;
