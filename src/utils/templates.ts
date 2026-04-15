export function applyTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(.*?)\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}
