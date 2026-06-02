"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationPagesFlagsService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const automation_pages_flags_store_1 = require("./automation-pages-flags.store");
let AutomationPagesFlagsService = class AutomationPagesFlagsService {
    constructor() {
        this.cache = null;
    }
    async getFlags() {
        if (!this.cache) {
            this.cache = await (0, automation_pages_flags_store_1.readAutomationPagesFlagsFromDisk)();
        }
        return this.cache;
    }
    async updateFlags(patch) {
        const current = await this.getFlags();
        const next = (0, automation_pages_flags_store_1.sanitizeAutomationPagesFlags)({ ...current, ...patch });
        await (0, automation_pages_flags_store_1.writeAutomationPagesFlagsToDisk)(next);
        this.cache = next;
        return next;
    }
    invalidateCache() {
        this.cache = null;
    }
};
exports.AutomationPagesFlagsService = AutomationPagesFlagsService;
exports.AutomationPagesFlagsService = AutomationPagesFlagsService = tslib_1.__decorate([
    (0, common_1.Injectable)()
], AutomationPagesFlagsService);
//# sourceMappingURL=automation-pages-flags.service.js.map