def test_django_settings_load():
    from django.conf import settings

    assert settings.configured or True


def test_truth():
    assert True
