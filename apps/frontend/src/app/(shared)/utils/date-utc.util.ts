export interface DateTimeFormatOptions {
  locale?: string;
  timeZone?: string;
  includeTimeZoneName?: boolean;
}

const utcSuffixPattern = /(Z|[+-]00:00)$/i;

export function parseUtcTimestamp(value: string): Date {
  if (!utcSuffixPattern.test(value)) {
    throw new RangeError('El timestamp debe declarar la zona UTC');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('El timestamp UTC no es válido');
  }

  return date;
}

export function formatUtcDateTime(
  value: string,
  options: DateTimeFormatOptions = {},
): string {
  const { locale = 'es-MX', timeZone, includeTimeZoneName = false } = options;

  const formatOptions: Intl.DateTimeFormatOptions = includeTimeZoneName
    ? {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone,
      }
    : {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
      };

  return new Intl.DateTimeFormat(locale, formatOptions).format(
    parseUtcTimestamp(value),
  );
}

export function toUtcIsoString(value: string | Date): string {
  const date = value instanceof Date ? value : parseUtcTimestamp(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('La fecha no es válida');
  }
  return date.toISOString();
}
