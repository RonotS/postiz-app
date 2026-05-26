import { Injectable } from '@nestjs/common';
import {
  AutomationPagesFlags,
  readAutomationPagesFlagsFromDisk,
  sanitizeAutomationPagesFlags,
  writeAutomationPagesFlagsToDisk,
} from '@gitroom/nestjs-libraries/platform/automation-pages-flags.store';

@Injectable()
export class AutomationPagesFlagsService {
  private cache: AutomationPagesFlags | null = null;

  async getFlags(): Promise<AutomationPagesFlags> {
    if (!this.cache) {
      this.cache = await readAutomationPagesFlagsFromDisk();
    }
    return this.cache;
  }

  async updateFlags(
    patch: Partial<AutomationPagesFlags>
  ): Promise<AutomationPagesFlags> {
    const current = await this.getFlags();
    const next = sanitizeAutomationPagesFlags({ ...current, ...patch });
    await writeAutomationPagesFlagsToDisk(next);
    this.cache = next;
    return next;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
