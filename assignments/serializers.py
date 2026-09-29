from rest_framework import serializers
from django.utils import timezone

from .models import Assignment, Submission


def _display_name(user):
    if not user:
        return ""
    return user.get_full_name().strip() or user.email


class DashboardDateTimeField(serializers.DateTimeField):
    """Accept Android's yyyy-MM-dd values as well as full ISO datetimes."""

    def to_internal_value(self, value):
        if isinstance(value, str) and len(value.strip()) == 10:
            suffix = "T23:59:59" if self.field_name == "deadline" else "T00:00:00"
            value = f"{value.strip()}{suffix}"
        return super().to_internal_value(value)


class AssignmentSerializer(serializers.ModelSerializer):
    begin_date = DashboardDateTimeField(required=False, default=timezone.now)
    deadline = DashboardDateTimeField()
    module_name = serializers.CharField(source="module.title", read_only=True)
    module_number = serializers.IntegerField(source="module.module_number", read_only=True)
    cohort_code = serializers.CharField(source="cohort.code", read_only=True)
    cohort_name = serializers.CharField(source="cohort.name", read_only=True)
    course_name = serializers.CharField(source="cohort.course.name", read_only=True)
    # Elective fields — populated only for CAPSTONE assignments that have an elective set
    elective_id = serializers.UUIDField(source="elective.id", read_only=True, allow_null=True, default=None)
    elective_code = serializers.CharField(source="elective.code", read_only=True, allow_null=True, default=None)
    elective_name = serializers.CharField(source="elective.name", read_only=True, allow_null=True, default=None)
    submission_count = serializers.IntegerField(read_only=True)
    evaluated_count = serializers.IntegerField(read_only=True)
    my_submission = serializers.SerializerMethodField()
    assignment_title = serializers.CharField(source="title", read_only=True)

    class Meta:
        model = Assignment
        fields = [
            "id",
            "cohort",
            "cohort_code",
            "cohort_name",
            "course_name",
            "module",
            "module_name",
            "module_number",
            "elective_id",
            "elective_code",
            "elective_name",
            "title",
            "assignment_title",
            "description",
            "assignment_type",
            "created_by",
            "begin_date",
            "deadline",
            "max_marks",
            "pass_percentage",
            "files",
            "allow_late_submissions",
            "autograding_enabled",
            "autograding_rubric",
            "status",
            "submission_count",
            "evaluated_count",
            "my_submission",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        cohort = attrs.get("cohort", getattr(self.instance, "cohort", None))
        module = attrs.get("module", getattr(self.instance, "module", None))
        if cohort and module and module.course_id != cohort.course_id:
            raise serializers.ValidationError({"module": "The module must belong to the cohort's course."})
        begin_date = attrs.get("begin_date", getattr(self.instance, "begin_date", None))
        deadline = attrs.get("deadline", getattr(self.instance, "deadline", None))
        if begin_date and deadline and deadline <= begin_date:
            raise serializers.ValidationError({"deadline": "Deadline must be after the begin date."})
        if attrs.get("autograding_enabled", getattr(self.instance, "autograding_enabled", False)):
            rubric = attrs.get("autograding_rubric", getattr(self.instance, "autograding_rubric", ""))
            if not str(rubric or "").strip():
                raise serializers.ValidationError(
                    {"autograding_rubric": "Add a grading rubric before enabling automated review."}
                )
        return attrs

    def get_my_submission(self, assignment):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or getattr(user, "role", "") != "STUDENT":
            return None
        submission = next(iter(getattr(assignment, "prefetched_student_submissions", [])), None)
        return SubmissionSummarySerializer(submission).data if submission else None


class SubmissionSummarySerializer(serializers.ModelSerializer):
    # These are computed URLs — not model fields, so they must be declared explicitly.
    github_repo_url = serializers.SerializerMethodField()
    github_commit_url = serializers.SerializerMethodField()
    github_tree_url = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            "id", "submitted_at", "is_late", "resubmission_count",
            "resubmission_requested", "resubmission_remarks",
            "evaluated", "marks_obtained",
            "passed", "feedback", "submission_url", "commit_sha",
            "github_repo_url", "github_commit_url", "github_tree_url",
            "autograding_status", "auto_marks", "auto_feedback",
        ]

    def get_github_repo_url(self, submission):
        student = getattr(submission, "student", None)
        return getattr(student, "github_repo_url", None) if student else None

    def get_github_commit_url(self, submission):
        repo_url = self.get_github_repo_url(submission)
        sub_url = getattr(submission, "submission_url", "") or ""
        commit_sha = getattr(submission, "commit_sha", "") or ""
        base_repo = repo_url or (sub_url if "github.com" in sub_url else None)
        if base_repo and commit_sha:
            return f"{base_repo.rstrip('/')}/commit/{commit_sha}"
        if sub_url and "github.com" in sub_url:
            return sub_url
        return base_repo

    def get_github_tree_url(self, submission):
        repo_url = self.get_github_repo_url(submission)
        sub_url = getattr(submission, "submission_url", "") or ""
        commit_sha = getattr(submission, "commit_sha", "") or ""
        base_repo = repo_url or (sub_url if "github.com" in sub_url else None)
        if base_repo and commit_sha:
            return f"{base_repo.rstrip('/')}/tree/{commit_sha}"
        return base_repo


class SubmissionSerializer(serializers.ModelSerializer):
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)
    assignment_max_marks = serializers.DecimalField(
        source="assignment.max_marks", max_digits=8, decimal_places=2, read_only=True
    )
    student_code = serializers.CharField(source="student.student_code", read_only=True)
    student_name = serializers.SerializerMethodField()
    class Meta:
        model = Submission
        fields = [
            "id",
            "assignment",
            "assignment_title",
            "assignment_max_marks",
            "student",
            "student_code",
            "student_name",
            "submission_text",
            "submission_url",
            "commit_sha",
            "github_repo_url",
            "github_commit_url",
            "github_tree_url",
            "files",
            "submitted_at",
            "is_late",
            "resubmission_count",
            "resubmission_requested",
            "resubmission_remarks",
            "evaluated",
            "evaluated_by",
            "evaluated_at",
            "marks_obtained",
            "passed",
            "feedback",
            "autograding_status",
            "auto_marks",
            "auto_feedback",
            "auto_report",
            "auto_graded_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "student", "submitted_at", "is_late", "resubmission_count", "evaluated_by",
            "evaluated_at", "passed", "autograding_status", "auto_marks",
            "auto_feedback", "auto_report", "auto_graded_at", "created_at", "updated_at"
        ]

    github_repo_url = serializers.SerializerMethodField()
    github_commit_url = serializers.SerializerMethodField()
    github_tree_url = serializers.SerializerMethodField()

    def get_github_repo_url(self, submission):
        student = getattr(submission, "student", None)
        return getattr(student, "github_repo_url", None) if student else None

    def get_student_name(self, submission):
        student = getattr(submission, "student", None)
        if student and getattr(student, "user", None):
            return student.user.get_full_name() or student.user.first_name or student.user.email
        return None

    def get_github_commit_url(self, submission):
        repo_url = self.get_github_repo_url(submission)
        sub_url = getattr(submission, "submission_url", "") or ""
        commit_sha = getattr(submission, "commit_sha", "") or ""
        
        base_repo = repo_url or (sub_url if "github.com" in sub_url else None)
        if base_repo and commit_sha:
            return f"{base_repo.rstrip('/')}/commit/{commit_sha}"
        if sub_url and "github.com" in sub_url:
            return sub_url
        return base_repo

    def get_github_tree_url(self, submission):
        repo_url = self.get_github_repo_url(submission)
        sub_url = getattr(submission, "submission_url", "") or ""
        commit_sha = getattr(submission, "commit_sha", "") or ""

        base_repo = repo_url or (sub_url if "github.com" in sub_url else None)
        if base_repo and commit_sha:
            return f"{base_repo.rstrip('/')}/tree/{commit_sha}"
        return base_repo

    def get_student_name(self, submission):
        return _display_name(submission.student.user) if submission.student_id else ""

    def validate(self, attrs):
        request = self.context.get("request")
        role = getattr(getattr(request, "user", None), "role", "")
        if role == "STUDENT" and any(
            field in attrs for field in ["evaluated", "marks_obtained", "feedback"]
        ):
            raise serializers.ValidationError("Students cannot evaluate submissions.")
        assignment = attrs.get("assignment", getattr(self.instance, "assignment", None))
        submission_url = attrs.get("submission_url", getattr(self.instance, "submission_url", ""))
        commit_sha = str(attrs.get("commit_sha", getattr(self.instance, "commit_sha", "")) or "").strip().lower()
        if assignment and assignment.autograding_enabled:
            from urllib.parse import urlparse
            parsed = urlparse(str(submission_url or ""))
            if parsed.scheme != "https" or parsed.hostname not in {"github.com", "www.github.com"}:
                raise serializers.ValidationError(
                    {"submission_url": "Automated review requires an HTTPS GitHub repository URL."}
                )
            if len([part for part in parsed.path.split("/") if part]) < 2:
                raise serializers.ValidationError({"submission_url": "Enter a complete owner/repository URL."})
            if len(commit_sha) != 40 or any(char not in "0123456789abcdef" for char in commit_sha):
                raise serializers.ValidationError(
                    {"commit_sha": "Enter the immutable 40-character Git commit SHA to review."}
                )
            attrs["commit_sha"] = commit_sha
        return attrs
