export function isValidServiceKey(headers: Headers): boolean {
  const serviceKey = process.env.AUDIT_SERVICE_KEY;
  if (!serviceKey) return false;
  return headers.get('x-service-key') === serviceKey;
}
