/**
 * Severity levels for detected antipatterns
 */
export enum Severity {
  /**
   * Minor issues - code or styles impact test clarity and efficiency
   */
  MINOR = "minor",

  /**
   * Major issues - don't block implementations, but fixing them improves test reliability and maintainability
   */
  MAJOR = "major",

  /**
   * Critical issues - cause test failure, deployment blockers, and test quality gaps that impact production run time
   */
  CRITICAL = "critical",
}
