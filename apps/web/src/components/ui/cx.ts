/** Joins truthy class names. */
export function cx(
  ...classes: readonly (string | false | null | undefined)[]
): string {
  return classes.filter(Boolean).join(' ')
}
