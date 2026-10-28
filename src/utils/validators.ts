const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
