import { promises as fs } from 'fs';
import path from 'path';

export type AutomationPagesFlags = {
  profileAutomationsPublic: boolean;
  followAutomationsPublic: boolean;
};

function envBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

export function defaultAutomationPagesFlags(): AutomationPagesFlags {
  return {
    profileAutomationsPublic: envBool(
      process.env.AUTOMATION_PAGES_PROFILE_PUBLIC ??
        process.env.AUTOMATION_PAGES_TWEET_PUBLIC,
      false
    ),
    followAutomationsPublic: envBool(
      process.env.AUTOMATION_PAGES_FOLLOW_PUBLIC,
      false
    ),
  };
}

function resolveFilePath(): string {
  const raw = process.env.AUTOMATION_PAGES_FLAGS_FILE?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  }
  return path.join(process.cwd(), '.data', 'automation-pages-flags.json');
}

export async function readAutomationPagesFlagsFromDisk(): Promise<AutomationPagesFlags> {
  const file = resolveFilePath();
  try {
    const text = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(text) as Partial<AutomationPagesFlags>;
    return sanitizeAutomationPagesFlags(parsed);
  } catch {
    return defaultAutomationPagesFlags();
  }
}

export async function writeAutomationPagesFlagsToDisk(
  data: AutomationPagesFlags
): Promise<void> {
  const file = resolveFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify(sanitizeAutomationPagesFlags(data), null, 2),
    'utf8'
  );
}

export function sanitizeAutomationPagesFlags(
  raw: Partial<AutomationPagesFlags> & { tweetAutomationsPublic?: boolean }
): AutomationPagesFlags {
  return {
    profileAutomationsPublic: !!(
      raw.profileAutomationsPublic ?? raw.tweetAutomationsPublic
    ),
    followAutomationsPublic: !!raw.followAutomationsPublic,
  };
}
