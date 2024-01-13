export function cx(
  ...cns: (boolean | string | undefined)[]
): string {
  return cns.filter(Boolean).join(" ");
}
