from rest_framework import serializers

from .models import StudentProfile, GoogleStudentIdentity


class GoogleIdentitySerializer(serializers.ModelSerializer):
    """
    Serializes Google Student Identity data.
    Exposes: email, profile name, verification status, and connection timestamp.
    """
    is_connected = serializers.SerializerMethodField()
    identity_match = serializers.SerializerMethodField()
    naming_compliant = serializers.SerializerMethodField()

    def get_naming_compliant(self, obj):
        match = self.get_identity_match(obj)
        if match is None:
            return None
        return {"is_compliant": match["is_matched"]}

    def get_is_connected(self, obj):
        """Returns True if Google identity is verified and connected."""
        return bool(obj and obj.is_verified)

    def get_identity_match(self, obj):
        if not obj or not obj.google_profile_name:
            return None
        student = getattr(obj, "student", None)
        if not student:
            return None
        
        # Prefer the cached application from the parent StudentProfileSerializer
        app = getattr(student, "_relevant_app_cached", None)
        if app is None:
            app = student.applications.order_by("-applied_at").first()
        if not app:
            return None
            
        try:
            from students.services.naming_compliance import check_naming_compliance
            student_full_name = f"{app.student.user.first_name} {app.student.user.last_name}".strip()
            cohort_code = app.assigned_cohort.code if app.assigned_cohort else None
            course_code = ""
            if app.course:
                if hasattr(app.course, 'domain') and app.course.domain:
                    course_code = app.course.domain
                else:
                    course_code = app.course.code

            is_compliant = check_naming_compliance(
                obj.google_profile_name,
                student_full_name,
                cohort_code,
                course_code,
                application=app
            )
            if is_compliant is None:
                return None

            if is_compliant:
                message = "Your Google identity matches your SURE ProEd attendance identity. Attendance tracking is active."
            else:
                recommended_name = app.get_dynamic_required_meet_name(prefer_google_profile=False)
                message = f"Your Google Account name does not follow the recommended SURE ProEd naming format (e.g. {recommended_name}). This is for identification consistency only and does not affect your attendance."

            return {
                "is_matched": is_compliant,
                "message": message
            }
        except Exception:
            return None

    class Meta:
        model = GoogleStudentIdentity
        fields = [
            "google_email",
            "google_profile_name",
            "is_verified",
            "is_connected",
            "connected_at",
            "identity_match",
            "naming_compliant",
        ]
        read_only_fields = fields


class StudentProfileSerializer(serializers.ModelSerializer):
    active_cohort = serializers.SerializerMethodField()
    cohort = serializers.SerializerMethodField()
    cohort_code = serializers.SerializerMethodField()
    completed_cohorts = serializers.SerializerMethodField()
    certificates = serializers.SerializerMethodField()
    first_name = serializers.CharField(source="user.first_name", required=False, allow_null=True, allow_blank=True)
    last_name = serializers.CharField(source="user.last_name", required=False, allow_null=True, allow_blank=True)
    phone_number = serializers.CharField(source="user.phone_number", required=False, allow_null=True, allow_blank=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True, default=None)
    is_email_verified = serializers.BooleanField(source="user.is_email_verified", read_only=True, default=False)
    application_id = serializers.SerializerMethodField()
    application_status = serializers.SerializerMethodField()
    qualified = serializers.SerializerMethodField()
    current_application = serializers.SerializerMethodField()
    linkedin_profile_photo_url = serializers.SerializerMethodField()
    google_identity = GoogleIdentitySerializer(read_only=True, required=False, allow_null=True)

    class Meta:
        model = StudentProfile
        fields = [
            "id",
            "user",
            "first_name",
            "last_name",
            "phone_number",
            "email",
            "last_login",
            "is_email_verified",
            "student_code",
            "student_identity_issued_at",
            "is_official_student",
            "application_id",
            "application_status",
            "qualified",
            "current_application",
            "is_public",
            "profile_photo",
            "banner_image",
            "date_of_birth",
            "tagline",
            "bio",
            "status",
            "city",
            "state",
            "country",
            "college",
            "degree",
            "specialization",
            "education_level",
            "graduation_year",
            "skills",
            "hobbies",
            "languages",
            "linkedin_url",
            "linkedin_id",
            "is_linkedin_connected",
            "linkedin_profile_data",
            "linkedin_profile_photo_url",
            "github_url",
            "github_username",
            "is_github_connected",
            "github_org_invite_status",
            "github_repo_url",
            "portfolio_url",
            "resume",
            "google_identity",
            "cohort",
            "cohort_code",
            "active_cohort",
            "is_cohort_suspended",
            "suspension_message",
            "completed_cohorts",
            "certificates",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "email",
            "last_login",
            "is_email_verified",
            "student_code",
            "student_identity_issued_at",
            "is_official_student",
            "application_id",
            "application_status",
            "qualified",
            "current_application",
            "linkedin_id",
            "is_linkedin_connected",
            "linkedin_profile_data",
            "linkedin_profile_photo_url",
            "github_username",
            "is_github_connected",
            "github_org_invite_status",
            "google_identity",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "graduation_year": {"required": False, "allow_null": True},
            "date_of_birth": {"required": False, "allow_null": True},
            "profile_photo": {"required": False, "allow_null": True},
            "banner_image": {"required": False, "allow_null": True},
            "resume": {"required": False, "allow_null": True},
            "linkedin_url": {"required": False, "allow_null": True, "allow_blank": True},
            "github_url": {"required": False, "allow_null": True, "allow_blank": True},
            "portfolio_url": {"required": False, "allow_null": True, "allow_blank": True},
            "github_repo_url": {"required": False, "allow_null": True, "allow_blank": True},
            "tagline": {"required": False, "allow_null": True, "allow_blank": True},
            "bio": {"required": False, "allow_null": True, "allow_blank": True},
            "city": {"required": False, "allow_null": True, "allow_blank": True},
            "state": {"required": False, "allow_null": True, "allow_blank": True},
            "college": {"required": False, "allow_null": True, "allow_blank": True},
            "degree": {"required": False, "allow_null": True, "allow_blank": True},
            "specialization": {"required": False, "allow_null": True, "allow_blank": True},
            "status": {"required": False, "allow_null": True},
            "education_level": {"required": False, "allow_null": True},
        }

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        
        request = self.context.get("request")
        user = request.user if request else None
        
        # Restrict admin-only fields to superusers and ADMIN role
        if not user or not (user.is_superuser or getattr(user, "role", "") == "ADMIN"):
            ret.pop("last_login", None)
            ret.pop("is_email_verified", None)

        try:
            if instance.profile_photo:
                if not instance.profile_photo.storage.exists(instance.profile_photo.name):
                    ret["profile_photo"] = None
        except Exception:
            pass

        if ret.get("profile_photo"):
            photo = ret["profile_photo"]
            if "/media/" in photo:
                # Canonicalize local media through the API origin. The frontend is
                # hosted on a different origin and would otherwise ask its SPA
                # server for /media/* and receive index.html instead of an image.
                rel_path = "/media/" + photo.split("/media/", 1)[1]
                if instance.updated_at:
                    separator = "&" if "?" in rel_path else "?"
                    rel_path = f"{rel_path}{separator}v={int(instance.updated_at.timestamp())}"
                ret["profile_photo"] = request.build_absolute_uri(rel_path) if request else rel_path
            elif instance.updated_at:
                separator = "&" if "?" in photo else "?"
                ret["profile_photo"] = f"{photo}{separator}v={int(instance.updated_at.timestamp())}"

        try:
            if instance.banner_image:
                if not instance.banner_image.storage.exists(instance.banner_image.name):
                    ret["banner_image"] = None
        except Exception:
            pass

        if ret.get("banner_image"):
            banner = ret["banner_image"]
            if "/media/" in banner:
                rel_path = "/media/" + banner.split("/media/", 1)[1]
                if instance.updated_at:
                    separator = "&" if "?" in rel_path else "?"
                    rel_path = f"{rel_path}{separator}v={int(instance.updated_at.timestamp())}"
                ret["banner_image"] = request.build_absolute_uri(rel_path) if request else rel_path
            elif instance.updated_at:
                separator = "&" if "?" in banner else "?"
                ret["banner_image"] = f"{banner}{separator}v={int(instance.updated_at.timestamp())}"

        # LinkedIn's OIDC response stores the profile picture URL inside
        # linkedin_profile_data. If copying that remote image into local media
        # storage failed (or no custom photo was uploaded), keep the profile UI
        # populated by returning the saved LinkedIn URL as a fallback.
        if not ret.get("profile_photo"):
            ret["profile_photo"] = ret.get("linkedin_profile_photo_url")

        try:
            if instance.resume:
                storage = getattr(instance.resume, "storage", None)
                from common.storage import private_storage
                from django.core.files.storage import default_storage
                exists = bool(
                    (storage and storage.exists(instance.resume.name))
                    or private_storage.exists(instance.resume.name)
                    or default_storage.exists(instance.resume.name)
                )
                if not exists:
                    clean_base = instance.resume.name.split("/")[-1]
                    alt_name = f"students/resumes/{clean_base}"
                    exists = private_storage.exists(alt_name) or default_storage.exists(alt_name)
                if not exists:
                    ret["resume"] = None
        except Exception:
            pass
        # Return one authenticated absolute URL for both fields so older clients do not
        # follow the now-private /media/students/resumes/ path and receive a 404,
        # and frontend SPAs (e.g. Vercel) do not route download URLs to the frontend origin.
        if ret.get("resume"):
            from urllib.parse import quote
            path = f"/api/students/{instance.pk}/download-resume/?v={quote(instance.resume.name, safe='')}"
            request = self.context.get("request") if hasattr(self, "context") and self.context else None
            abs_url = None
            if request:
                try:
                    abs_url = request.build_absolute_uri(path)
                except Exception:
                    pass
            if not abs_url:
                abs_url = f"https://api.sureproed.com{path}"

            if not abs_url.startswith("http"):
                abs_url = f"https://api.sureproed.com{path}"

            ret["resume_url"] = abs_url
            ret["resume_name"] = instance.resume.name.rsplit("/", 1)[-1]
            ret["resume"] = ret["resume_url"]
        else:
            ret["resume_url"] = None
            ret["resume_name"] = None
        return ret

    @staticmethod
    def _find_linkedin_photo_url(value):
        if isinstance(value, str):
            candidate = value.strip()
            return candidate if candidate.startswith(("https://", "http://")) else None
        if isinstance(value, list):
            for item in value:
                found = StudentProfileSerializer._find_linkedin_photo_url(item)
                if found:
                    return found
            return None
        if not isinstance(value, dict):
            return None

        # Current OpenID Connect keys plus legacy LinkedIn image structures.
        preferred_keys = (
            "picture", "picture_url", "avatar_url", "profile_photo",
            "profile_picture", "profilePicture", "identifier", "url", "displayImage~",
        )
        for key in preferred_keys:
            if key in value:
                found = StudentProfileSerializer._find_linkedin_photo_url(value[key])
                if found:
                    return found
        for key in ("elements", "identifiers", "data"):
            if key in value:
                found = StudentProfileSerializer._find_linkedin_photo_url(value[key])
                if found:
                    return found
        return None

    def get_linkedin_profile_photo_url(self, obj):
        return self._find_linkedin_photo_url(obj.linkedin_profile_data or {})

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)

        # 1. Clean empty strings for nullable fields
        for nullable_field in [
            "graduation_year", "date_of_birth", "profile_photo", "banner_image", "resume",
            "linkedin_url", "github_url", "portfolio_url", "github_repo_url",
            "tagline", "bio", "city", "state", "college", "degree", "specialization"
        ]:
            if nullable_field in data:
                val = data[nullable_field]
                if val == "" or val == "null" or val == "undefined":
                    data[nullable_field] = None

        # 2. Date of birth sanitization (e.g. ISO timestamps with T or time component)
        if "date_of_birth" in data and data["date_of_birth"]:
            dob = str(data["date_of_birth"]).strip()
            if "T" in dob:
                dob = dob.split("T")[0]
            elif " " in dob:
                dob = dob.split(" ")[0]
            try:
                import datetime
                if "-" in dob and len(dob.split("-")[0]) == 2:
                    parts = dob.split("-")
                    dob = f"{parts[2]}-{parts[1]}-{parts[0]}"
                datetime.date.fromisoformat(dob)
                data["date_of_birth"] = dob
            except Exception:
                data.pop("date_of_birth", None)

        # 3. Handle photo/banner/resume field aliases and base64 strings
        photo_val = None
        for k in ("profile_photo", "profile_picture", "profilePicture", "photo", "picture", "avatar"):
            if k in data:
                photo_val = data.get(k)
                if k != "profile_photo":
                    data.pop(k, None)
                break

        if photo_val is not None:
            if hasattr(photo_val, "read"):
                data["profile_photo"] = photo_val
            elif isinstance(photo_val, str):
                s = photo_val.strip()
                if s.startswith("data:image/") and ";base64," in s:
                    import base64
                    from django.core.files.uploadedfile import SimpleUploadedFile
                    header, b64_str = s.split(";base64,", 1)
                    mime_type = header.replace("data:", "").strip()
                    sub = mime_type.split("/")[-1].lower()
                    ext = "jpg" if sub in ("jpeg", "pjpeg") else sub
                    try:
                        decoded = base64.b64decode(b64_str)
                        data["profile_photo"] = SimpleUploadedFile(f"uploaded_photo.{ext}", decoded, content_type=mime_type)
                    except Exception:
                        data.pop("profile_photo", None)
                else:
                    data.pop("profile_photo", None)

        banner_val = None
        for k in (
            "banner_image", "banner_picture", "banner_photo", "bannerImage",
            "bannerPicture", "bannerPhoto", "banner", "cover_image", "cover_photo",
            "coverPicture", "cover"
        ):
            if k in data:
                banner_val = data.get(k)
                if k != "banner_image":
                    data.pop(k, None)
                break

        if banner_val is not None:
            if hasattr(banner_val, "read"):
                data["banner_image"] = banner_val
            elif isinstance(banner_val, str):
                s = banner_val.strip()
                if s.startswith("data:image/") and ";base64," in s:
                    import base64
                    from django.core.files.uploadedfile import SimpleUploadedFile
                    header, b64_str = s.split(";base64,", 1)
                    mime_type = header.replace("data:", "").strip()
                    sub = mime_type.split("/")[-1].lower()
                    ext = "jpg" if sub in ("jpeg", "pjpeg") else sub
                    try:
                        decoded = base64.b64decode(b64_str)
                        data["banner_image"] = SimpleUploadedFile(f"uploaded_banner.{ext}", decoded, content_type=mime_type)
                    except Exception:
                        data.pop("banner_image", None)
                else:
                    data.pop("banner_image", None)

        if "resume" in data:
            resume_val = data["resume"]
            if isinstance(resume_val, str):
                s = resume_val.strip()
                if s.startswith("data:application/pdf;base64,") or (s.startswith("data:") and ";base64," in s):
                    import base64
                    from django.core.files.uploadedfile import SimpleUploadedFile
                    header, b64_str = s.split(";base64,", 1)
                    try:
                        decoded = base64.b64decode(b64_str)
                        data["resume"] = SimpleUploadedFile("resume.pdf", decoded, content_type="application/pdf")
                    except Exception:
                        data.pop("resume", None)
                else:
                    data.pop("resume", None)

        # 4. Clean graduation_year if passed as string digits
        if "graduation_year" in data and data["graduation_year"] is not None:
            try:
                data["graduation_year"] = int(str(data["graduation_year"]).strip())
            except (ValueError, TypeError):
                data.pop("graduation_year", None)

        # 5. Normalize education_level choices
        if "education_level" in data and data["education_level"]:
            ed = str(data["education_level"]).strip().upper()
            valid_eds = [c[0] for c in StudentProfile.EducationLevel.choices]
            if ed in valid_eds:
                data["education_level"] = ed
            elif "UNDER" in ed or "B.TECH" in ed or "BACHELOR" in ed or "UG" in ed:
                data["education_level"] = StudentProfile.EducationLevel.UNDERGRADUATE
            elif "POST" in ed or "M.TECH" in ed or "MASTER" in ed or "PG" in ed:
                data["education_level"] = StudentProfile.EducationLevel.POSTGRADUATE
            elif "DIP" in ed:
                data["education_level"] = StudentProfile.EducationLevel.DIPLOMA
            else:
                data["education_level"] = StudentProfile.EducationLevel.OTHER

        # 6. Normalize status choices
        if "status" in data and data["status"]:
            st = str(data["status"]).strip().upper()
            valid_statuses = [c[0] for c in StudentProfile.Status.choices]
            if st in valid_statuses:
                data["status"] = st
            elif st in ["ACTIVE", "ENROLLED", "AVAILABLE", "OPEN"]:
                data["status"] = StudentProfile.Status.AVAILABLE
            elif st in ["BUSY", "WORKING"]:
                data["status"] = StudentProfile.Status.BUSY
            else:
                data.pop("status", None)

        # 7. Clean URL fields (auto-prefix https:// if missing)
        for url_field in ["github_url", "linkedin_url", "portfolio_url", "github_repo_url"]:
            if url_field in data and data[url_field]:
                u = str(data[url_field]).strip()
                if u and not u.startswith("http://") and not u.startswith("https://"):
                    data[url_field] = f"https://{u}"

        # 8. Handle skills / hobbies / languages if passed as comma-separated string
        for list_field in ["skills", "hobbies", "languages"]:
            if list_field in data and isinstance(data[list_field], str):
                items = [item.strip() for item in data[list_field].split(",") if item.strip()]
                data[list_field] = items

        return super().to_internal_value(data)

    def validate_resume(self, value):
        if value:
            from common.validators import validate_resume_file
            try:
                validate_resume_file(value, student_profile=self.instance)
            except Exception as e:
                raise serializers.ValidationError(str(e))
        return value

    def validate_profile_photo(self, value):
        if value:
            from common.validators import validate_profile_photo_file
            try:
                validate_profile_photo_file(value)
            except Exception as e:
                raise serializers.ValidationError(str(e))
        return value

    def validate_banner_image(self, value):
        if value:
            from common.validators import validate_banner_image_file
            try:
                validate_banner_image_file(value)
            except Exception as e:
                raise serializers.ValidationError(str(e))
        return value

    def update(self, instance, validated_data):
        initial = getattr(self, "initial_data", {})
        user = instance.user
        user_updated = False
        update_user_fields = []
        if "first_name" in initial and initial["first_name"] is not None:
            user.first_name = str(initial["first_name"]).strip()
            user_updated = True
            update_user_fields.append("first_name")
        if "last_name" in initial and initial["last_name"] is not None:
            user.last_name = str(initial["last_name"]).strip()
            user_updated = True
            update_user_fields.append("last_name")
        if "phone_number" in initial and initial["phone_number"] is not None:
            user.phone_number = str(initial["phone_number"]).strip()
            user_updated = True
            update_user_fields.append("phone_number")
        elif "phone" in initial and initial["phone"] is not None:
            user.phone_number = str(initial["phone"]).strip()
            user_updated = True
            update_user_fields.append("phone_number")
        if "email" in initial and initial["email"] is not None:
            email_val = str(initial["email"]).strip()
            if email_val and email_val != user.email:
                user.email = email_val
                user_updated = True
                update_user_fields.append("email")
        if user_updated:
            update_user_fields.append("updated_at")
            user.save(update_fields=list(set(update_user_fields)))

        return super().update(instance, validated_data)

    def _get_relevant_application(self, obj):
        cached = getattr(obj, "_relevant_app_cached", None)
        if cached is not None:
            return cached
            
        request = self.context.get("request")
        req_cohort = request.query_params.get("cohort") if request and hasattr(request, "query_params") else None
        req_status = request.query_params.get("application_status") if request and hasattr(request, "query_params") else None
        req_course = request.query_params.get("course") if request and hasattr(request, "query_params") else None

        try:
            from applications.models import Application
            prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("applications")
            if prefetched is not None:
                # 1. Try to find a perfect match for explicit query parameters safely
                if req_cohort or req_status or req_course:
                    for a in prefetched:
                        match = True
                        if req_cohort:
                            req_cohort_str = str(req_cohort).strip()
                            import uuid
                            try:
                                uuid.UUID(req_cohort_str)
                                if str(a.assigned_cohort_id) != req_cohort_str:
                                    match = False
                            except ValueError:
                                if not a.assigned_cohort:
                                    match = False
                                else:
                                    c_code = (a.assigned_cohort.code or "").lower()
                                    c_name = (a.assigned_cohort.name or "").lower()
                                    if req_cohort_str.lower() != c_code and req_cohort_str.lower() not in c_name:
                                        match = False
                        if req_status:
                            if a.status != req_status:
                                match = False
                        if req_course:
                            req_course_str = str(req_course).strip()
                            import uuid
                            try:
                                uuid.UUID(req_course_str)
                                if str(a.course_id) != req_course_str:
                                    match = False
                            except ValueError:
                                if not a.course:
                                    match = False
                                else:
                                    c_code = (a.course.code or "").lower()
                                    c_name = (a.course.name or "").lower()
                                    if req_course_str.lower() != c_code and req_course_str.lower() not in c_name:
                                        match = False
                        if match:
                            obj._relevant_app_cached = a
                            return a

                # 2. Existing fallback logic
                app = next(
                    (
                        a for a in prefetched
                        if a.assigned_cohort_id is not None
                        and a.status not in [Application.Status.DROPPED, Application.Status.CANCELLED, Application.Status.SUSPENDED]
                    ),
                    None,
                )
                if not app and prefetched:
                    app = prefetched[0]
            else:
                app = obj.applications.select_related("course", "assigned_cohort").order_by("-applied_at").first()
            
            obj._relevant_app_cached = app
            return app
        except Exception:
            return None

    def get_application_id(self, obj):
        app = self._get_relevant_application(obj)
        return str(app.id) if app else None

    def get_application_status(self, obj):
        app = self._get_relevant_application(obj)
        return app.status if app else None

    def get_qualified(self, obj):
        app = self._get_relevant_application(obj)
        return app.qualified if app else None

    def get_current_application(self, obj):
        app = self._get_relevant_application(obj)
        if not app:
            return None

        cumulative_attendance = None
        request = self.context.get("request")
        view = self.context.get("view")
        request_role = getattr(getattr(request, "user", None), "role", "")
        is_staff_list = (
            getattr(view, "action", None) == "list"
            and request_role in {"ADMIN", "MENTOR", "VOLUNTEER", "TRUSTEE"}
        )
        # Attendance scoring is intentionally omitted from staff list responses.
        # Calculating it separately for every student performs several database
        # queries per row and previously pushed the mentor list past the mobile
        # client's 20-second request deadline. Student/detail responses retain
        # the authoritative attendance calculation.
        if not is_staff_list:
            try:
                from attendance.services.student_scope import attendance_metrics
                metrics = attendance_metrics(obj, app)
                cumulative_attendance = metrics.get("arithmetic_percentage")
            except Exception:
                pass

        return {
            "id": str(app.id),
            "application_number": app.application_number,
            "status": app.status,
            "qualified": app.qualified,
            "meet_identity": app.get_dynamic_required_meet_name(),
            "recommended_meet_identity": app.get_dynamic_required_meet_name(prefer_google_profile=False),
            "required_meet_display_name": app.required_meet_display_name,
            "cumulative_attendance_percentage": cumulative_attendance,
            "course": {
                "id": str(app.course.id),
                "code": app.course.code,
                "name": app.course.name,
            } if app.course else None,
            "assigned_cohort": {
                "id": str(app.assigned_cohort.id),
                "code": app.assigned_cohort.code,
                "name": app.assigned_cohort.name,
            } if app.assigned_cohort else None,
        }

    def get_active_cohort(self, obj):
        cached = getattr(obj, "_dashboard_active_cohort", None)
        if cached is not None:
            return cached or None
        try:
            from applications.models import Application
            prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("applications")
            if prefetched is not None:
                active_app = next(
                    (
                        app for app in prefetched
                        if app.assigned_cohort_id is not None
                        and app.status not in [Application.Status.DROPPED, Application.Status.CANCELLED, Application.Status.SUSPENDED]
                    ),
                    None,
                )
            else:
                active_app = obj.applications.filter(
                    assigned_cohort__isnull=False,
                ).exclude(
                    status__in=[Application.Status.DROPPED, Application.Status.CANCELLED, Application.Status.SUSPENDED]
                ).select_related("course", "assigned_cohort").order_by("-applied_at").first()

            if active_app and active_app.assigned_cohort:
                cohort = active_app.assigned_cohort
                active_mentors = [item for item in cohort.mentors.all() if item.is_active]
                mentor_names = [(m.get_full_name().strip() or m.email) for m in active_mentors]
                mentor_name = ", ".join(mentor_names) if mentor_names else None

                meeting_link = cohort.meeting_link
                # Exclude screening exam meeting links so they never appear as regular cohort meetings
                try:
                    from applications.models import PreScreening
                    ps_links = set(PreScreening.objects.filter(application__assigned_cohort=cohort).exclude(meeting_link__isnull=True).values_list("meeting_link", flat=True))
                    if meeting_link in ps_links:
                        meeting_link = None
                except Exception:
                    pass

                payload = {
                    "application_id": str(active_app.id),
                    "application_number": active_app.application_number,
                    "course_code": active_app.course.code,
                    "course_name": active_app.course.name,
                    "cohort_id": str(cohort.id),
                    "cohort_code": cohort.code,
                    "cohort_name": cohort.name,
                    "start_date": cohort.start_date,
                    "end_date": cohort.end_date,
                    "meeting_link": meeting_link,
                    "mentor_name": mentor_name,
                    "active_mentors": [
                        {
                            "id": str(m.id),
                            "first_name": m.first_name or "",
                            "last_name": m.last_name or "",
                            "email": m.email,
                            "name": (m.get_full_name().strip() or m.email)
                        } for m in active_mentors
                    ],
                }
                obj._dashboard_active_cohort = payload
                return payload
        except Exception:
            pass
        obj._dashboard_active_cohort = {}
        return None

    def get_cohort(self, obj):
        active = self.get_active_cohort(obj)
        return active.get("cohort_id") if active else None

    def get_cohort_code(self, obj):
        active = self.get_active_cohort(obj)
        return active.get("cohort_code") if active else None

    def get_completed_cohorts(self, obj):
        try:
            from applications.models import Application
            prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("applications")
            if prefetched is not None:
                completed_apps = sorted(
                    (app for app in prefetched if app.status == Application.Status.COMPLETED),
                    key=lambda app: app.completed_at or app.updated_at,
                    reverse=True,
                )
            else:
                completed_apps = obj.applications.filter(
                    status=Application.Status.COMPLETED
                ).select_related("course", "assigned_cohort").order_by("-completed_at")

            history = []
            for app in completed_apps:
                history.append({
                    "application_id": str(app.id),
                    "application_number": app.application_number,
                    "course_code": app.course.code,
                    "course_name": app.course.name,
                    "cohort_code": app.assigned_cohort.code if app.assigned_cohort else None,
                    "cohort_name": app.assigned_cohort.name if app.assigned_cohort else None,
                    "completed_at": app.completed_at,
                    "final_score": app.final_score,
                })
            return history
        except Exception:
            return []

    def get_certificates(self, obj):
        try:
            from certificates.models import Certificate
            request = self.context.get("request")
            certs = getattr(obj, "_prefetched_objects_cache", {}).get("certificates")
            if certs is None:
                certs = Certificate.objects.filter(student=obj).select_related(
                    "application__course"
                ).order_by("-issued_at")
            return [
                {
                    "id": str(c.id),
                    "certificate_number": c.certificate_number,
                    "verification_code": c.verification_code,
                    "course_name": (
                        c.application.course.name
                        if c.application_id and c.application and c.application.course_id
                        else c.title
                    ),
                    "issued_at": c.issued_at,
                    "certificate_file": (
                        request.build_absolute_uri(c.certificate_file.url)
                        if request and c.certificate_file
                        else (c.certificate_file.url if c.certificate_file else None)
                    ),
                    "status": c.status,
                }
                for c in certs
            ]
        except Exception:
            return []

    is_cohort_suspended = serializers.SerializerMethodField()
    suspension_message = serializers.SerializerMethodField()

    def get_is_cohort_suspended(self, obj):
        cached = getattr(obj, "_cohort_suspended_cached", None)
        if cached is not None:
            return cached

        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("applications")
        if prefetched is not None:
            suspended = any(app.status == "SUSPENDED" for app in prefetched)
        else:
            suspended = obj.applications.filter(status="SUSPENDED").exists()
        obj._cohort_suspended_cached = suspended
        return suspended


    def get_suspension_message(self, obj):
        if self.get_is_cohort_suspended(obj):
            return "Your cohort access has been suspended. You may request a transfer to the next cohort of your course or apply for a different course."
        return None

class StudentPlacementSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    student_email = serializers.CharField(source='student.user.email', read_only=True)
    class Meta:
        from .models import StudentPlacement
        model = StudentPlacement
        fields = [
            "id", "student_name", "student_email", "company_name", "designation", "employment_type", 
            "joining_date", "official_email", "linkedin_url", 
            "offer_letter", "status", "verified_at", "verification_remarks"
        ]
        read_only_fields = ["id", "status", "verified_at", "verification_remarks"]
    def create(self, validated_data):
        # Force status to PENDING_VERIFICATION
        validated_data['status'] = 'PENDING_VERIFICATION'
        placement = super().create(validated_data)
        
        # Dispatch Push Notification to all Admins
        try:
            from django.contrib.auth import get_user_model
            from common.models import Notification
            User = get_user_model()
            admins = User.objects.filter(is_superuser=True)
            
            student_name = placement.student.user.get_full_name() or "A student"
            for admin in admins:
                Notification.objects.create(
                    user=admin,
                    title="New Placement Verification",
                    message=f"{student_name} has reported a new placement at {placement.company_name}!",
                    notification_type="SYSTEM"
                )
        except Exception as e:
            print("Failed to send placement notification:", e)
            
        return placement
    def update(self, instance, validated_data):
        validated_data['status'] = 'PENDING_VERIFICATION'
        return super().update(instance, validated_data)

