import os
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible


@deconstructible
class OverwriteStorage(FileSystemStorage):
    """Storage that deletes the existing file with the same name before saving."""
    def get_available_name(self, name, max_length=None):
        if self.exists(name):
            os.remove(os.path.join(settings.MEDIA_ROOT, name))
        return name


@deconstructible
class PrivateMediaStorage(FileSystemStorage):
    """Filesystem storage that safely returns media URL for forms and admin widgets."""

    def __init__(self, location=None, base_url="/media/"):
        self._custom_location = location
        super().__init__(
            location=location or getattr(settings, "PRIVATE_MEDIA_ROOT", settings.BASE_DIR / "private_media"),
            base_url=base_url,
        )

    @property
    def location(self):
        if self._custom_location:
            return str(self._custom_location)
        return str(getattr(settings, "PRIVATE_MEDIA_ROOT", settings.BASE_DIR / "private_media"))

    @location.setter
    def location(self, value):
        self._custom_location = value

    def url(self, name):
        if not name:
            return ""
        return f"/media/{name}"

    def exists(self, name):
        if super().exists(name):
            return True
        from django.core.files.storage import default_storage
        return default_storage.exists(name)

    def open(self, name, mode="rb"):
        if super().exists(name):
            return super().open(name, mode)
        from django.core.files.storage import default_storage
        return default_storage.open(name, mode)


private_storage = PrivateMediaStorage()
