/**
 * Deterministic startup delay for forever X poller workflows (Temporal workflow code).
 */
export function staggerMsFromIntegrationId(
  integrationId: string,
  maxMs: number
): number {
  if (maxMs <= 0) {
    return 0;
  }
  let h = 0;
  for (let i = 0; i < integrationId.length; i++) {
    h = (Math.imul(31, h) + integrationId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % maxMs;
}
