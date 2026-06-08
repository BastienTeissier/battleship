import os

from .base import *  # noqa: F401, F403

DEBUG = False

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")

DJANGO_VITE = {
    "default": {
        "dev_mode": False,
        "static_url_prefix": "dist",
        "manifest_path": STATIC_ROOT / "dist" / "manifest.json",  # noqa: F405
    }
}
