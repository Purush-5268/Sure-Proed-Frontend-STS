from django.conf import settings
from django.db import models

from common.models import TimeStampedUUIDModel
from common.storage import OverwriteStorage

def company_logo_path(instance, filename):
    import os
    ext = filename.split('.')[-1]
    return f"companies/logos/{instance.id}.{ext}"


class Company(TimeStampedUUIDModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="company", blank=True, null=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    logo = models.ImageField(upload_to=company_logo_path, storage=OverwriteStorage(), blank=True, null=True)
    industry = models.CharField(max_length=150, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    shortlisted_students = models.ManyToManyField(
        "students.StudentProfile",
        related_name="shortlisted_by_companies",
        blank=True,
    )

    def __str__(self):
        return str(self.name)


class JobPosting(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="job_postings")
    title = models.CharField(max_length=255)
    description = models.TextField()
    requirements = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    salary_range = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    applicants = models.ManyToManyField("students.StudentProfile", related_name="applied_jobs", blank=True)

    def __str__(self):
        return f"{self.title} at {self.company.name}"


class JobReference(TimeStampedUUIDModel):
    """A mentor-referred opening distributed to one assigned cohort."""

    class EmploymentType(models.TextChoices):
        FULL_TIME = "FULL_TIME", "Full time"
        PART_TIME = "PART_TIME", "Part time"
        CONTRACT = "CONTRACT", "Contract"
        INTERNSHIP = "INTERNSHIP", "Internship"
        OTHER = "OTHER", "Other"

    cohort = models.ForeignKey("cohorts.Cohort", on_delete=models.CASCADE, related_name="job_references")
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="job_references")
    title = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True, null=True)
    employment_type = models.CharField(max_length=20, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME)
    description = models.TextField(blank=True, null=True)
    apply_url = models.URLField(max_length=500)
    deadline = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_job_references",
        blank=True,
        null=True,
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["cohort", "is_active"]),
            models.Index(fields=["deadline"]),
        ]

    def __str__(self):
        return f"{self.title} for {self.cohort.code}"
