import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export const c = {
  success: (s: string) => chalk.green(`✓ ${s}`),
  error: (s: string) => chalk.red(`✗ ${s}`),
  warn: (s: string) => chalk.yellow(`⚠ ${s}`),
  info: (s: string) => chalk.cyan(`ℹ ${s}`),
  dim: (s: string) => chalk.dim(s),
  bold: (s: string) => chalk.bold(s),
  path: (s: string) => chalk.underline.cyan(s),
};

export function spinner(text: string): Ora {
  return ora({ text, color: 'cyan' }).start();
}

export function printTable(rows: Array<Record<string, string | number>>): void {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]!);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)),
  );

  const header = keys.map((k, i) => chalk.bold(k.padEnd(widths[i]!))).join('  ');
  const divider = widths.map((w) => '-'.repeat(w)).join('  ');
  console.log(header);
  console.log(chalk.dim(divider));
  for (const row of rows) {
    console.log(keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i]!)).join('  '));
  }
}

export function printSection(title: string): void {
  console.log();
  console.log(chalk.bold.underline(title));
}
