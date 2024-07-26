// Designed to be equivalent to `import('node:http').IncomingHttpHeaders` but without the import
type IncomingHttpHeaders = Record<
  string,
  string | string[] | number | undefined
>;

export function processHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  const headerDigest: Record<string, string> = Object.create(null);
  for (const key in headers) {
    const val = headers[key];
    if (val == null) {
      continue;
    }
    if (typeof val === "string") {
      headerDigest[key] = val;
    } else if (typeof val === "number") {
      headerDigest[key] = val.toString();
    } else {
      headerDigest[key] = val.join("\n");
    }
  }
  return headerDigest;
}
