from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "mapped_email",
            "password",
            "first_name",
            "last_name",
            "gender",
            "phone_number",
            "date_of_birth",
            "role",
            "profile_photo",
            "banner_image",
            "admin_category",
            "organization",
            "designation",
            "is_active",
            "is_email_verified",
            "is_social_auth_linked",
            "social_provider",
            "linkedin_id",
            "has_all_cohorts_access",
            "is_cohort_suspended",
            "suspension_message",
            "has_dual_access",
            "linked_account_role",
            "courses",
            "assigned_cohorts",
            "date_joined",
            "last_login",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "courses", "assigned_cohorts", "has_dual_access", "linked_account_role", "date_joined", "last_login", "created_at", "updated_at"]

    profile_photo = serializers.SerializerMethodField()
    banner_image = serializers.SerializerMethodField()
    is_cohort_suspended = serializers.SerializerMethodField()
    suspension_message = serializers.SerializerMethodField()
    admin_category = serializers.SerializerMethodField()
    organization = serializers.SerializerMethodField()
    designation = serializers.SerializerMethodField()
    has_dual_access = serializers.SerializerMethodField()
    linked_account_role = serializers.SerializerMethodField()
    courses = serializers.SerializerMethodField()
    assigned_cohorts = serializers.SerializerMethodField()

    def _get_user_profile(self, obj):
        role = getattr(obj, "role", "")
        if role == User.Role.STUDENT:
            try:
                from students.models import StudentProfile
                p = getattr(obj, "student_profile", None)
                if p is None or not getattr(p, "banner_image", None) or not getattr(p, "profile_photo", None):
                    refreshed = StudentProfile.objects.filter(user=obj).first()
                    if refreshed:
                        obj.student_profile = refreshed
                        return refreshed
                return p
            except Exception:
                pass
        elif role == User.Role.MENTOR:
            try:
                from volunteers.models import MentorProfile
                p = getattr(obj, "mentor_profile", None)
                if p is None or not getattr(p, "banner_image", None) or not getattr(p, "profile_photo", None):
                    refreshed = MentorProfile.objects.filter(user=obj).first()
                    if refreshed:
                        obj.mentor_profile = refreshed
                        return refreshed
                return p
            except Exception:
                pass
        elif role in (User.Role.VOLUNTEER, User.Role.TRUSTEE):
            try:
                from volunteers.models import VolunteerProfile
                p = getattr(obj, "volunteer_profile", None)
                if p is None or not getattr(p, "banner_image", None) or not getattr(p, "profile_photo", None):
                    refreshed = VolunteerProfile.objects.filter(user=obj).first()
                    if refreshed:
                        obj.volunteer_profile = refreshed
                        return refreshed
                return p
            except Exception:
                pass
        return (
            getattr(obj, "student_profile", None)
            or getattr(obj, "mentor_profile", None)
            or getattr(obj, "volunteer_profile", None)
        )

    def get_profile_photo(self, obj):
        profile = self._get_user_profile(obj)
        if not profile or not getattr(profile, "profile_photo", None):
            return None
        try:
            url = profile.profile_photo.url
            if not url:
                return None
            if "://" in url:
                from urllib.parse import urlparse
                url = urlparse(url).path
            updated_at = getattr(profile, "updated_at", None)
            ts = int(updated_at.timestamp()) if updated_at else 0
            if ts:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}v={ts}"
            request = self.context.get("request")
            if request and url.startswith("/"):
                url = request.build_absolute_uri(url)
            return url
        except Exception:
            return None

    def get_banner_image(self, obj):
        profile = self._get_user_profile(obj)
        if not profile or not getattr(profile, "banner_image", None):
            return None
        try:
            url = profile.banner_image.url
            if not url:
                return None
            if "://" in url:
                from urllib.parse import urlparse
                url = urlparse(url).path
            updated_at = getattr(profile, "updated_at", None)
            ts = int(updated_at.timestamp()) if updated_at else 0
            if ts:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}v={ts}"
            request = self.context.get("request")
            if request and url.startswith("/"):
                url = request.build_absolute_uri(url)
            return url
        except Exception:
            return None

    def get_admin_category(self, obj):
        try:
            return obj.admin_profile.category
        except Exception:
            return None

    def get_organization(self, obj):
        try:
            if obj.role in [User.Role.VOLUNTEER, User.Role.TRUSTEE] and hasattr(obj, 'volunteer_profile'):
                return obj.volunteer_profile.organization_name
            elif obj.role == User.Role.MENTOR and hasattr(obj, 'mentor_profile'):
                return obj.mentor_profile.company_name
            elif hasattr(obj, 'admin_profile'):
                return getattr(obj.admin_profile, 'organization_affiliation', getattr(obj.admin_profile, 'organization_name', None))
        except Exception:
            pass
        return None

    def get_designation(self, obj):
        try:
            if obj.role in [User.Role.VOLUNTEER, User.Role.TRUSTEE] and hasattr(obj, 'volunteer_profile'):
                return obj.volunteer_profile.occupation
            elif obj.role == User.Role.MENTOR and hasattr(obj, 'mentor_profile'):
                return obj.mentor_profile.designation
            elif hasattr(obj, 'admin_profile'):
                return obj.admin_profile.designation
        except Exception:
            pass
        return None

    def get_is_cohort_suspended(self, obj):
        if obj.role != User.Role.STUDENT:
            return False
        try:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return False
            return profile.applications.filter(status="SUSPENDED").exists()
        except Exception:
            return False

    def get_suspension_message(self, obj):
        if self.get_is_cohort_suspended(obj):
            return "Your cohort access has been suspended. You may request a transfer to the next cohort of your course or apply for a different course."
        return None

    def get_linked_account_role(self, obj):
        role = getattr(obj, "role", "")
        if role == User.Role.STUDENT and obj.email:
            linked = User.objects.filter(
                mapped_email__iexact=obj.email, 
                role__in=[User.Role.VOLUNTEER, User.Role.TRUSTEE], 
                is_active=True
            ).only('role').first()
            if linked:
                return linked.role
        elif role in [User.Role.VOLUNTEER, User.Role.TRUSTEE] and obj.mapped_email:
            linked = User.objects.filter(
                email__iexact=obj.mapped_email, 
                role=User.Role.STUDENT, 
                is_active=True
            ).only('role').first()
            if linked:
                return linked.role
        return None

    def get_has_dual_access(self, obj):
        return self.get_linked_account_role(obj) is not None

    def get_courses(self, obj):
        if getattr(obj, "role", "") == User.Role.MENTOR:
            mp = getattr(obj, "mentor_profile", None)
            if mp:
                return [{"id": str(c.id), "name": c.name, "code": getattr(c, "code", "")} for c in mp.courses.all()]
        return []

    def get_assigned_cohorts(self, obj):
        if getattr(obj, "role", "") == User.Role.MENTOR:
            return [{"id": str(ch.id), "name": ch.name, "code": ch.code, "course_id": str(ch.course_id)} for ch in obj.mentored_cohorts.all()]
        return []

    def validate_password(self, value):
        if value:
            from common.validators import validate_strong_password
            validate_strong_password(value, user_data=self.initial_data)
        return value

    def validate_first_name(self, value):
        from common.validators import validate_name
        return validate_name(value, field_name="First name")

    def validate_last_name(self, value):
        from common.validators import validate_name
        return validate_name(value, field_name="Last name")

    def validate(self, attrs):
        from common.access import is_admin
        request = self.context.get("request")
        if not is_admin(getattr(request, "user", None)):
            protected = {"email", "role", "has_all_cohorts_access", "is_active", "is_email_verified",
                         "mapped_email", "is_social_auth_linked", "social_provider", "linkedin_id"}
            if self.instance is not None:
                forbidden = {key for key in protected & attrs.keys() if attrs[key] != getattr(self.instance, key)}
            else:
                forbidden = (protected - {"email"}) & attrs.keys()
                if attrs.get("role", User.Role.STUDENT) == User.Role.STUDENT:
                    forbidden.discard("role")
            if forbidden:
                raise serializers.ValidationError({key: "Only administrators may change this field." for key in forbidden})
        role = attrs.get("role", getattr(self.instance, "role", User.Role.STUDENT))
        email = attrs.get("email", getattr(self.instance, "email", "")).lower().strip()
        mapped_email = attrs.get("mapped_email", getattr(self.instance, "mapped_email", None))

        if User.is_staff_email(email) and role == User.Role.STUDENT:
            raise serializers.ValidationError(
                {"email": "Staff email domains (@suretrust.org, @suretrust.dev, @suretrust.local, etc.) are reserved for staff accounts."}
            )
        if role == User.Role.STUDENT and mapped_email:
            raise serializers.ValidationError(
                {"mapped_email": "Mapped email is not allowed for Students. Students use their primary email directly."}
            )
        if self.instance is not None:
            from common.validators import extract_profile_photo_from_request, extract_banner_image_from_request
            for field, extractor in (("profile_photo", extract_profile_photo_from_request), ("banner_image", extract_banner_image_from_request)):
                try:
                    extractor(request if request is not None else self.initial_data)
                except Exception as exc:
                    raise serializers.ValidationError({field: getattr(exc, "messages", [str(exc)])})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def _update_user_profile_photo(self, user, photo_file):
        from common.validators import NO_FILE_UPDATE
        if photo_file is NO_FILE_UPDATE:
            return
        role = getattr(user, "role", "")
        profile = None
        if role == User.Role.STUDENT:
            from students.models import StudentProfile
            profile, _ = StudentProfile.objects.get_or_create(
                user=user,
                defaults={"student_code": f"STU-{user.id.hex[:6].upper()}"},
            )
        elif role == User.Role.MENTOR:
            from volunteers.models import MentorProfile
            profile, _ = MentorProfile.objects.get_or_create(user=user)
        elif role in (User.Role.VOLUNTEER, User.Role.TRUSTEE):
            from volunteers.models import VolunteerProfile
            profile, _ = VolunteerProfile.objects.get_or_create(user=user)

        if profile is not None:
            if photo_file is None:
                profile.profile_photo = None
                profile.save(update_fields=["profile_photo", "updated_at"])
            else:
                profile.profile_photo = photo_file
                profile.save()
            profile.refresh_from_db()
            if role == User.Role.STUDENT:
                user.student_profile = profile
            elif role == User.Role.MENTOR:
                user.mentor_profile = profile
            elif role in (User.Role.VOLUNTEER, User.Role.TRUSTEE):
                user.volunteer_profile = profile

    def _update_user_banner_image(self, user, banner_file):
        from common.validators import NO_FILE_UPDATE
        if banner_file is NO_FILE_UPDATE:
            return
        role = getattr(user, "role", "")
        profile = None
        if role == User.Role.STUDENT:
            from students.models import StudentProfile
            profile, _ = StudentProfile.objects.get_or_create(
                user=user,
                defaults={"student_code": f"STU-{user.id.hex[:6].upper()}"},
            )
        elif role == User.Role.MENTOR:
            from volunteers.models import MentorProfile
            profile, _ = MentorProfile.objects.get_or_create(user=user)
        elif role in (User.Role.VOLUNTEER, User.Role.TRUSTEE):
            from volunteers.models import VolunteerProfile
            profile, _ = VolunteerProfile.objects.get_or_create(user=user)

        if profile is not None:
            if banner_file is None:
                profile.banner_image = None
                profile.save(update_fields=["banner_image", "updated_at"])
            else:
                profile.banner_image = banner_file
                profile.save()
            profile.refresh_from_db()
            if role == User.Role.STUDENT:
                user.student_profile = profile
            elif role == User.Role.MENTOR:
                user.mentor_profile = profile
            elif role in (User.Role.VOLUNTEER, User.Role.TRUSTEE):
                user.volunteer_profile = profile

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()

        # Handle profile photo updates across request FILES / data
        req = self.context.get("request")
        source = req if req is not None else getattr(self, "initial_data", None)
        if source:
            from common.validators import extract_profile_photo_from_request, NO_FILE_UPDATE
            try:
                photo_file = extract_profile_photo_from_request(source)
                if photo_file is not NO_FILE_UPDATE:
                    self._update_user_profile_photo(instance, photo_file)
            except Exception as e:
                raise serializers.ValidationError({"profile_photo": str(e)})

        # Handle banner image updates across request FILES / data
        if source:
            from common.validators import extract_banner_image_from_request, NO_FILE_UPDATE
            try:
                banner_file = extract_banner_image_from_request(source)
                if banner_file is not NO_FILE_UPDATE:
                    self._update_user_banner_image(instance, banner_file)
            except Exception as e:
                raise serializers.ValidationError({"banner_image": str(e)})

        return instance


class ForgotPasswordRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=User.Role.choices, required=False)


class ForgotPasswordConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=User.Role.choices, required=False)
    otp = serializers.CharField(max_length=6, min_length=6)
    new_password = serializers.CharField(min_length=8)

    def validate_new_password(self, value):
        if value:
            from common.validators import validate_strong_password
            validate_strong_password(value, user_data=self.initial_data)
        return value


class SendEmailVerificationOTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    mapped_email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    password = serializers.CharField(min_length=8, required=False, write_only=True)
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.STUDENT)
    gender = serializers.ChoiceField(choices=User.Gender.choices, required=False, allow_null=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)

    def validate_password(self, value):
        if value:
            from common.validators import validate_strong_password
            validate_strong_password(value, user_data=self.initial_data)
        return value

    def validate_first_name(self, value):
        from common.validators import validate_name
        return validate_name(value, field_name="First name")

    def validate_last_name(self, value):
        from common.validators import validate_name
        return validate_name(value, field_name="Last name")

    def validate(self, attrs):
        role = attrs.get("role", User.Role.STUDENT)
        email = attrs.get("email", "").lower().strip()
        mapped_email = attrs.get("mapped_email")

        is_staff_acc = User.is_staff_email(email) or role in [User.Role.MENTOR, User.Role.VOLUNTEER, User.Role.TRUSTEE, User.Role.ADMIN]

        if is_staff_acc and role == User.Role.STUDENT:
            raise serializers.ValidationError(
                {"email": "Staff email domains (@suretrust.org, @suretrust.dev, @suretrust.local, etc.) are reserved for staff accounts."}
            )
        if is_staff_acc and role != User.Role.ADMIN and (not mapped_email or not str(mapped_email).strip()):
            raise serializers.ValidationError(
                {"mapped_email": "Mapped personal/professional email is required for staff accounts."}
            )
        if role == User.Role.STUDENT and mapped_email:
            raise serializers.ValidationError(
                {"mapped_email": "Mapped email is not allowed for Students. Students use their primary email directly."}
            )
        return attrs


class VerifyEmailOTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6, min_length=6)

from .models import AdministratorProfile

class AdministratorProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdministratorProfile
        fields = "__all__"


class ChangePasswordRequestSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, required=False)
    current_password = serializers.CharField(write_only=True, required=False)
    new_password = serializers.CharField(min_length=8, write_only=True, required=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True, required=False)

    def validate(self, attrs):
        old_pwd = attrs.get("old_password") or attrs.get("current_password")
        if not old_pwd:
            raise serializers.ValidationError({"old_password": "Current password is required."})
        new_pwd = attrs.get("new_password")
        confirm_pwd = attrs.get("confirm_password")
        if confirm_pwd and new_pwd != confirm_pwd:
            raise serializers.ValidationError({"confirm_password": "New passwords do not match."})
        from common.validators import validate_strong_password
        validate_strong_password(new_pwd, user=self.context.get("user"))
        return attrs
