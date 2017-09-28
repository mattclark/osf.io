from .defaults import *  # noqa
from website import settings as osf_settings


DEBUG = osf_settings.DEBUG_MODE
VARNISH_SERVERS = ['http://127.0.0.1:8080']
ENABLE_VARNISH = False
ENABLE_ESI = False
CORS_ORIGIN_ALLOW_ALL = True

# Uncomment to get real tracebacks while testing
# DEBUG_PROPAGATE_EXCEPTIONS = True

if DEBUG:
    INSTALLED_APPS += ('debug_toolbar', )
    MIDDLEWARE_CLASSES += ('debug_toolbar.middleware.DebugToolbarMiddleware', )
    DEBUG_TOOLBAR_CONFIG = {
        'SHOW_TOOLBAR_CALLBACK': lambda(_): True
    }
    ALLOWED_HOSTS.append('localhost')

REST_FRAMEWORK['ALLOWED_VERSIONS'] = (
    '2.0',
    '2.0.1',
    '2.1',
    '2.2',
    '2.3',
    '2.4',
    '2.5',
    '3.0',
    '3.0.1',
)
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {
    'user': '1000000/second',
    'non-cookie-auth': '1000000/second',
    'add-contributor': '1000000/second',
    'create-guid': '1000000/second',
    'root-anon-throttle': '1000000/second',
    'test-user': '2/hour',
    'test-anon': '1/hour',
}
