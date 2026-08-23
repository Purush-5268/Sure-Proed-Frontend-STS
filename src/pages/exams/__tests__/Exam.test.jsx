import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Exam from '../Exam';
import * as examService from '../../../services/examService';
import * as AuthContext from '../../../context/AuthContext';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  };
});

let mockLocation = {
  state: null,
};

const mockUser = {
  id: 'usr-1234-uuid',
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane.doe@example.com',
  student_id: 'STU-998877',
};

const mockBackendQuestions = [
  {
    id: 'q-101',
    questionNumber: 1,
    questionText: 'What is the primary function of an Operating System Kernel?',
    options: [
      { key: 'A', text: 'Manage hardware resources and memory' },
      { key: 'B', text: 'Compile C++ source files' },
      { key: 'C', text: 'Render 3D vector graphics' },
      { key: 'D', text: 'Design relational database schemas' },
    ],
    marks: 1.0,
    negativeMarks: 0.0,
  },
  {
    id: 'q-102',
    questionNumber: 2,
    questionText: 'Which data structure follows the Last-In-First-Out (LIFO) principle?',
    options: [
      { key: 'A', text: 'Queue' },
      { key: 'B', text: 'Stack' },
      { key: 'C', text: 'Binary Search Tree' },
      { key: 'D', text: 'Graph' },
    ],
    marks: 1.0,
    negativeMarks: 0.0,
  },
];

const mockValidExamSession = {
  id: 'exam-session-uuid-1',
  attempt_id: 'attempt-uuid-777',
  course_id: 'course-uuid-999',
  course_name: 'VLSI & Embedded Systems',
  student_name: 'Jane Doe',
  student_id: 'STU-998877',
  duration_minutes: 45,
  total_questions: 2,
  start_time: '2026-08-21T15:00:00Z',
  expires_at: new Date(Date.now() + 1800 * 1000).toISOString(), // 30 mins from now
  paper_code: 'B',
  paper_label: 'Paper B',
  questions: mockBackendQuestions,
  saved_answers: {},
};

describe('Internal Admission Exam Frontend - Comprehensive Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockLocation = {
      state: {
        examSession: mockValidExamSession,
      },
    };

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
    });

    vi.spyOn(examService, 'autosaveExam').mockResolvedValue({
      success: true,
      saved_answers: {},
      expires_at: mockValidExamSession.expires_at,
    });

    vi.spyOn(examService, 'submitInternalExam').mockResolvedValue({
      success: true,
      exam: {
        status: 'EVALUATED',
        marks_obtained: 2,
        total_marks: 2,
        percentage: 100,
        qualified: true,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Start exam flow
  it('1. Initializes and renders exam session correctly with backend questions', async () => {
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    expect(screen.getByText(/VLSI & Embedded Systems/i)).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/What is the primary function of an Operating System Kernel\?/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Manage hardware resources and memory')).toBeInTheDocument();
  });

  // 2. Render randomized questions exactly as received
  it('2. Renders questions and options in the exact backend order without client re-ordering', async () => {
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    const questionText = screen.getByTestId('active-question-text');
    expect(questionText.textContent).toBe('What is the primary function of an Operating System Kernel?');

    const optA = screen.getByTestId('option-A');
    const optB = screen.getByTestId('option-B');
    const optC = screen.getByTestId('option-C');
    const optD = screen.getByTestId('option-D');

    expect(optA).toHaveTextContent('Manage hardware resources and memory');
    expect(optB).toHaveTextContent('Compile C++ source files');
    expect(optC).toHaveTextContent('Render 3D vector graphics');
    expect(optD).toHaveTextContent('Design relational database schemas');
  });

  // 3. Restore saved answers
  it('3. Correctly restores saved_answers returned by backend into state and navigation UI', async () => {
    mockLocation = {
      state: {
        examSession: {
          ...mockValidExamSession,
          saved_answers: {
            'q-101': 'A',
          },
        },
      },
    };

    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    // Option A should have active selection class / state
    const optA = screen.getByTestId('option-A');
    expect(optA.className).toContain('optionCardSelected');

    // Navigator question tile 1 should have answered tile class
    const tile1 = screen.getByTestId('question-tile-1');
    expect(tile1.className).toContain('tileAnswered');
  });

  // 4. Autosave debounce
  it('4. Debounces autosave API requests so answers are not spammed on every click', async () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    const optB = screen.getByTestId('option-B');

    // Click option B
    act(() => {
      fireEvent.click(optB);
    });

    // Immediately after click, autosave should NOT have been called yet (debounce pending)
    expect(examService.autosaveExam).not.toHaveBeenCalled();

    // Fast-forward by 1000ms
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    // Now autosaveExam should have been called exactly once with the selected answer
    expect(examService.autosaveExam).toHaveBeenCalledTimes(1);
    expect(examService.autosaveExam).toHaveBeenCalledWith(
      'exam-session-uuid-1',
      expect.objectContaining({
        attempt_id: 'attempt-uuid-777',
        answers: { 'q-101': 'B' },
      })
    );

    vi.useRealTimers();
  });

  // 5. Autosave retry after network failure
  it('5. Handles temporary network failure during autosave with retry', async () => {
    vi.useFakeTimers();

    // Mock first autosave failing with network error, then succeeding
    vi.spyOn(examService, 'autosaveExam')
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({
        success: true,
        saved_answers: { 'q-101': 'A' },
      });

    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    const optA = screen.getByTestId('option-A');
    act(() => {
      fireEvent.click(optA);
    });

    // Advance 1.1s for first debounced autosave
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    // First attempt was made and failed -> status shows Offline
    expect(examService.autosaveExam).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('autosave-status')).toHaveTextContent(/Offline - Retrying.../i);

    // Advance 4.5s for automatic retry
    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    // Retry was attempted and succeeded -> status returns to Answers Saved
    expect(examService.autosaveExam).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('autosave-status')).toHaveTextContent(/Answers Saved/i);

    vi.useRealTimers();
  });

  // 6. Timer based on server expires_at
  it('6. Uses server expires_at as authoritative deadline and auto-submits when expired', async () => {
    vi.useFakeTimers();

    // Set expiry 5 seconds in the future
    const shortExpiry = new Date(Date.now() + 5000).toISOString();
    mockLocation = {
      state: {
        examSession: {
          ...mockValidExamSession,
          expires_at: shortExpiry,
        },
      },
    };

    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    const timerElement = screen.getByTestId('server-timer');
    expect(timerElement).toHaveTextContent('00:05');

    // Advance 6 seconds so timer reaches 0
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    // Auto-submission must have been triggered
    expect(examService.submitInternalExam).toHaveBeenCalledTimes(1);
    expect(examService.submitInternalExam).toHaveBeenCalledWith(
      'exam-session-uuid-1',
      expect.objectContaining({
        attempt_id: 'attempt-uuid-777',
        auto_submitted: true,
      })
    );

    vi.useRealTimers();
  });

  // 7. Fullscreen exit telemetry
  it('7. Displays proctored alert and records telemetry when exiting fullscreen', async () => {
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    // Simulate fullscreen exit (document.fullscreenElement becomes null)
    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(screen.getByTestId('fullscreen-alert')).toBeInTheDocument();
    expect(screen.getByText(/You have exited full-screen mode/i)).toBeInTheDocument();
  });

  // 8. Tab switch telemetry
  it('8. Logs telemetry event on visibilitychange without failing or terminating student exam', async () => {
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    // Simulate tab switch (document.hidden = true)
    act(() => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Verify warning toast is shown but student is NOT kicked out or submitted
    expect(screen.getByText(/Tab switch \/ window focus loss detected/i)).toBeInTheDocument();
    expect(examService.submitInternalExam).not.toHaveBeenCalled();
  });

  it('8b. Auto-submits exam exactly on the 5th tab switch', async () => {
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    // Simulate 4 tab switches (1 to 4 should only warn, not submit)
    for (let i = 1; i <= 4; i++) {
      act(() => {
        Object.defineProperty(document, 'hidden', {
          value: true,
          writable: true,
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(examService.submitInternalExam).not.toHaveBeenCalled();
    }

    // 5th tab switch triggers auto-submit
    act(() => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(examService.submitInternalExam).toHaveBeenCalledTimes(1);
    expect(examService.submitInternalExam).toHaveBeenCalledWith(
      'exam-session-uuid-1',
      expect.objectContaining({
        auto_submitted: true,
        submission_reason: 'MAX_TAB_SWITCHES_EXCEEDED',
      })
    );
  });

  // 9. Watermark rendering
  it('9. Renders dynamic watermark overlay containing candidate identifier and attempt ID', async () => {
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    const watermark = screen.getByTestId('exam-watermark');
    expect(watermark).toBeInTheDocument();
    expect(watermark.textContent).toContain('Jane Doe');
    expect(watermark.textContent).toContain('STU-998877');
    expect(watermark.textContent).toContain('attempt-');
  });

  // 10. Context-menu / copy / paste deterrence
  it('10. Prevents context menu, copy, and paste events', async () => {
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    const contextMenuEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(contextMenuEvent);
    });
    expect(contextMenuEvent.defaultPrevented).toBe(true);

    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(copyEvent);
    });
    expect(copyEvent.defaultPrevented).toBe(true);

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(pasteEvent);
    });
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  // 11. Submit exactly once
  it('11. Prevents duplicate submissions when submit button is clicked', async () => {
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    // Open confirmation modal
    const submitBtn = screen.getByTestId('btn-submit-exam');
    fireEvent.click(submitBtn);

    // Confirm final submit
    const confirmBtn = screen.getByTestId('btn-confirm-final-submit');
    await act(async () => {
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn); // Double click simulation
    });

    await waitFor(() => {
      expect(examService.submitInternalExam).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/student/exam-result', expect.anything());
    });
  });

  // 12. Correct handling of expired / closed / already-submitted attempts
  it('12. Renders graceful error state when exam start fails from backend', async () => {
    mockLocation = { state: null };

    vi.spyOn(examService, 'fetchAuthoritativeExamContext').mockResolvedValue({
      courseId: 'course-uuid-999',
      activeApp: { id: 'app-1' },
      latestSchedule: { id: 'sched-1' },
      latestExam: { id: 'exam-uuid-1' },
    });

    vi.spyOn(examService, 'startInternalExam').mockResolvedValue({
      success: false,
      error: 'This examination attempt has already been submitted and closed.',
    });

    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/This examination attempt has already been submitted and closed/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Return to Instructions')).toBeInTheDocument();
    });
  });

  // 13. Question Navigator Palette styling & zero-padded tile rendering
  it('13. Renders zero-padded question numbers (01, 02) and applies state classes to palette tiles', async () => {
    mockLocation = {
      state: {
        examSession: {
          ...mockValidExamSession,
          saved_answers: {
            'q-101': 'A',
          },
        },
      },
    };

    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    const tile1 = screen.getByTestId('question-tile-1');
    const tile2 = screen.getByTestId('question-tile-2');

    // Verify 2-digit zero-padded numbers matching Picture 1
    expect(tile1).toHaveTextContent('01');
    expect(tile2).toHaveTextContent('02');

    // Tile 1 is answered and currently active (currentIndex = 0)
    expect(tile1.className).toContain('tileAnswered');
    expect(tile1.className).toContain('navTileCurrent');

    // Tile 2 is not visited
    expect(tile2.className).toContain('tileNotVisited');
  });

  it('14. Restores an offline answer snapshot and replays it to Django before expiry', async () => {
    localStorage.setItem(
      'sure_exam_recovery_v1',
      JSON.stringify({
        user_identity: String(mockUser.id),
        attempt_id: mockValidExamSession.attempt_id,
        assessment_type: 'PRESCREENING',
        expires_at: mockValidExamSession.expires_at,
        answers: { 'q-101': 'B' },
        exam_session: mockValidExamSession,
        pending_submission: false,
        saved_at: new Date().toISOString(),
      })
    );

    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('option-B').className).toContain('optionCardSelected');
      expect(examService.autosaveExam).toHaveBeenCalledWith(
        mockValidExamSession.id,
        expect.objectContaining({ answers: { 'q-101': 'B' } })
      );
    });
  });
});
