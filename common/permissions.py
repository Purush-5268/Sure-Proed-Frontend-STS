from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_superuser
                or str(getattr(request.user, 'role', '')).upper() == 'ADMIN'
            )
        )

class IsAccountOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.pk == request.user.pk

class IsAdminOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and (request.user.is_staff or getattr(request.user, 'role', '') == 'ADMIN'))

class IsMentorOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (
            request.user.is_staff or getattr(request.user, 'role', '') in ['ADMIN', 'MENTOR']
        ))

class IsMentorOrAdminOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and (
            request.user.is_superuser or getattr(request.user, 'role', '') in ['ADMIN', 'MENTOR', 'VOLUNTEER', 'TRUSTEE']
        ))

class IsVolunteerOrMentorOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (
            request.user.is_superuser or getattr(request.user, 'role', '') in ['ADMIN', 'MENTOR', 'VOLUNTEER', 'TRUSTEE']
        ))

class IsAdminVolunteerOrMentorStrict(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (
            request.user.is_superuser or getattr(request.user, 'role', '') in ['ADMIN', 'VOLUNTEER', 'MENTOR']
        ))


class IsOwnerOrAdmin(BasePermission):
    """
    Custom permission to only allow owners of an object to access/edit it.
    Admins (is_staff or role=ADMIN) have access to everything.
    """
    def has_object_permission(self, request, view, obj):
        if request.user.is_staff or getattr(request.user, 'role', '') == 'ADMIN':
            return True

        if hasattr(obj, 'email') and hasattr(obj, 'is_active'):
            return obj == request.user
            
        if hasattr(obj, 'user'):
            return obj.user == request.user

        student = getattr(obj, "student", None)
        if student is not None and getattr(student, "user_id", None) == request.user.id:
            return True

        application = getattr(obj, "application", None)
        if application is not None and getattr(application.student, "user_id", None) == request.user.id:
            return True
            
        return False

class IsVolunteerOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (
            request.user.is_staff or getattr(request.user, 'role', '') in ['ADMIN', 'VOLUNTEER']
        ))

class IsAnnouncementManager(BasePermission):
    """
    Allows ADMIN, MENTOR, and TRUSTEE roles to manage announcements.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_staff or getattr(request.user, 'role', '') in ['ADMIN', 'MENTOR', 'TRUSTEE']:
            return True
        return False
