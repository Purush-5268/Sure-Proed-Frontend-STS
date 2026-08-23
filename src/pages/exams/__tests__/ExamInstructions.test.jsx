import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExamInstructions from '../ExamInstructions';
import * as examService from '../../../services/examService';
import * as AuthContext from '../../../context/AuthContext';
import { studentService } from '../../../services/studentService';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockUser = {
  id: 'usr-1234-uuid',
  first_name: 'John',
  last_name: 'Candidate',
  email: 'john.candidate@example.com',
  student_id: 'STU-112233',
};

const mockAuthContext = {
  hasApplication: true,
  activeApp: {
    id: 'app-uuid-1',
    status: 'SCHEDULED',
    student: { phone: '1234567890', college: 'Engineering College' },
  },
  courseObj: { id: 'course-uuid-101', name: 'Full Stack Development' },
  courseId: 'course-uuid-101',
  courseName: 'Full Stack Development',
  latestSchedule: {
    id: 'sched-uuid-101',
    scheduled_at: new Date(Date.now() - 3600000).toISOString(),
    status: 'SCHEDULED',
    interviewer: 'SureTrust Board',
  },
  latestExam: { id: 'exam-uuid-101', status: 'SCHEDULED', cheat_count: 0 },
  isNewScheduleActive: true,
  isEnrolled: false,
  isCompleted: false,
  isQualified: false,
  examConfig: {
    total_questions: 10,
    duration_minutes: 45,
    pass_percentage: 60.0,
    difficulty: 'MEDIUM',
    requires_interview: true,
  },
};

describe('ExamInstructions - Mandatory Camera & Microphone Verification', () => {
  let mockGetUserMedia;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
    });

    vi.spyOn(studentService, 'getProfile').mockResolvedValue({
      first_name: 'John',
      last_name: 'Candidate',
      phone: '1234567890',
    });
    vi.spyOn(studentService, 'isProfileComplete').mockReturnValue(true);

    vi.spyOn(examService, 'fetchAuthoritativeExamContext').mockResolvedValue(mockAuthContext);
    vi.spyOn(examService, 'startInternalExam').mockResolvedValue({
      success: true,
      exam_id: 'exam-uuid-101',
      attempt_id: 'attempt-uuid-999',
      duration_minutes: 45,
      start_time: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2700000).toISOString(),
      paper_code: 'A',
      paper_label: 'Paper A',
      questions: [
        { id: 'q-1', questionText: 'Sample question 1', options: [] },
      ],
    });

    // Default mock for navigator.mediaDevices.getUserMedia
    mockGetUserMedia = vi.fn();
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders the mandatory device readiness card with Camera & Microphone check', async () => {
    render(
      <MemoryRouter>
        <ExamInstructions />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('device-check-card')).toBeInTheDocument();
      expect(screen.getByText(/System & Device Compatibility Check/i)).toBeInTheDocument();
      expect(screen.getByTestId('camera-status-pill')).toHaveTextContent(/Disconnected/i);
      expect(screen.getByTestId('mic-status-pill')).toHaveTextContent(/Disconnected/i);
    });
  });

  it('2. Blocks starting the exam if camera/microphone access is denied', async () => {
    // Simulate user rejecting camera/mic permission
    const permissionError = new Error('Permission denied');
    permissionError.name = 'NotAllowedError';
    mockGetUserMedia.mockRejectedValue(permissionError);

    render(
      <MemoryRouter>
        <ExamInstructions />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Start Examination')).toBeInTheDocument();
    });

    const startBtn = screen.getByText('Start Examination');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => {
      // Must NOT call startInternalExam API
      expect(examService.startInternalExam).not.toHaveBeenCalled();
      // Must NOT navigate to exam
      expect(mockNavigate).not.toHaveBeenCalledWith('/student/exam', expect.anything());
      // Must display error banner
      expect(screen.getByTestId('media-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/Permission Denied/i)).toBeInTheDocument();
    });
  });

  it('3. Successfully starts exam when both camera and microphone are granted and active', async () => {
    const mockVideoStreamTrack = {
      readyState: 'live',
      enabled: true,
      stop: vi.fn(),
    };
    const mockAudioStreamTrack = {
      readyState: 'live',
      enabled: true,
      stop: vi.fn(),
    };
    const mockStream = {
      getVideoTracks: () => [mockVideoStreamTrack],
      getAudioTracks: () => [mockAudioStreamTrack],
      getTracks: () => [mockVideoStreamTrack, mockAudioStreamTrack],
    };

    mockGetUserMedia.mockResolvedValue(mockStream);

    render(
      <MemoryRouter>
        <ExamInstructions />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Start Examination')).toBeInTheDocument();
    });

    // Test devices button
    const testBtn = screen.getByTestId('btn-test-devices');
    await act(async () => {
      fireEvent.click(testBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('camera-status-pill')).toHaveTextContent(/Detected & Active/i);
      expect(screen.getByTestId('mic-status-pill')).toHaveTextContent(/Detected & Active/i);
      expect(screen.getByTestId('webcam-preview-video')).toBeInTheDocument();
    });

    // Now start the examination
    const startBtn = screen.getByText('Start Examination');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => {
      expect(examService.startInternalExam).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/student/exam', expect.objectContaining({
        state: expect.objectContaining({
          courseName: 'Full Stack Development',
        }),
      }));
    });
  });

  it('4. Blocks stale screening UI when the student already has an active cohort journey', async () => {
    vi.spyOn(examService, 'fetchAuthoritativeExamContext').mockResolvedValue({
      ...mockAuthContext,
      activeApp: {
        id: 'app-active-cohort',
        status: 'IN_PROGRESS',
        assigned_cohort: 'cohort-java',
      },
      courseObj: { id: 'course-java', name: 'Java Applications' },
      latestSchedule: null,
      latestExam: null,
      isEnrolled: true,
      isNewScheduleActive: false,
      isCompleted: false,
      isQualified: false,
    });

    render(
      <MemoryRouter>
        <ExamInstructions />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Active Cohort Journey Detected')).toBeInTheDocument();
      expect(screen.getAllByText(/Open Active Cohort/i).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /Start Examination/i })).not.toBeInTheDocument();
    });
  });
});
