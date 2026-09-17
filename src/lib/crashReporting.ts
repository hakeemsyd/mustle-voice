import * as Sentry from '@sentry/react-native';

const DSN = 'https://2ea592483f84f8da943f3d26a561f442@o4512098196062208.ingest.us.sentry.io/4512102386499584';

const CONTENT_BEARING_BREADCRUMBS = new Set(['console', 'http', 'xhr', 'fetch']);

const SECRET_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /([?&](?:token|access_token|apikey|api_key|key|signature|sig)=)[^&\s"']+/gi,
  /(Bearer\s+)[A-Za-z0-9._-]{20,}/gi,
  /((?:user_id|user|uid)=(?:eq\.)?)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
];

const redact = (value: string): string =>
  SECRET_PATTERNS.reduce(
    (out, pattern) => out.replace(pattern, (_m, prefix) => `${prefix ?? ''}[redacted]`),
    value,
  );

const redactDeep = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return value;
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v, depth + 1)]),
    );
  }
  return value;
};

export const initCrashReporting = () => {
  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,

    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category && CONTENT_BEARING_BREADCRUMBS.has(breadcrumb.category)) return null;
      if (breadcrumb.data) breadcrumb.data = redactDeep(breadcrumb.data) as Record<string, unknown>;
      if (breadcrumb.message) breadcrumb.message = redact(breadcrumb.message);
      return breadcrumb;
    },

    beforeSend: (event) => {
      delete event.user;
      delete event.request;
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs
          .filter((crumb) => !(crumb.category && CONTENT_BEARING_BREADCRUMBS.has(crumb.category)))
          .map((crumb) => ({
            ...crumb,
            message: crumb.message ? redact(crumb.message) : crumb.message,
            data: crumb.data ? (redactDeep(crumb.data) as Record<string, unknown>) : crumb.data,
          }));
      }
      if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
      if (event.contexts) event.contexts = redactDeep(event.contexts) as typeof event.contexts;
      if (event.message) event.message = redact(event.message);
      for (const value of event.exception?.values ?? []) {
        if (value.value) value.value = redact(value.value);
      }
      return event;
    },
  });
};
