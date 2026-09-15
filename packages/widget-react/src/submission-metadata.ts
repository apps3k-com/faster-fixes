export function withAppVersion(
  metadata: Record<string, unknown> | undefined,
  appVersion: string | undefined,
) {
  const version = appVersion?.trim();
  return version ? { ...metadata, appVersion: version } : metadata;
}
