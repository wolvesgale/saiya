export function auditLog(action: string, detail: Record<string, unknown>) {
  // In production this can be replaced with structured logging.
  console.info(`[audit] ${action}`, detail);
}
