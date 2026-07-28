export function friendlyError(err: any, fallback: string): string {
  const msg = err?.response?.data?.error;
  const isSafe = typeof msg === 'string'
    && msg.trim().length > 0
    && msg.length < 150
    && !/[{}<>]|\bat\s+\w+\s*\(|Error:/.test(msg);
  return isSafe ? msg : fallback;
}
