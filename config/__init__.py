import copy
import sys
from .celery import app as celery_app

# Python 3.14 + Django 5.1 compatibility patch for Context.__copy__
if sys.version_info >= (3, 14):
    try:
        import django.template.context as _ctx

        def _base_context_copy(self):
            duplicate = object.__new__(self.__class__)
            duplicate.dicts = self.dicts[:]
            for attr in ("autoescape", "use_l10n", "use_tz", "template_name", "template", "request"):
                if hasattr(self, attr):
                    setattr(duplicate, attr, getattr(self, attr))
            return duplicate

        def _context_copy(self):
            duplicate = _base_context_copy(self)
            duplicate.render_context = copy.copy(self.render_context)
            return duplicate

        _ctx.BaseContext.__copy__ = _base_context_copy
        _ctx.Context.__copy__ = _context_copy
        _ctx.RequestContext.__copy__ = _context_copy
    except Exception:
        pass

__all__ = ("celery_app",)
