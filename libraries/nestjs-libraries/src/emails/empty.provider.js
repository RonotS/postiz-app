"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmptyProvider = void 0;
class EmptyProvider {
    constructor() {
        this.name = 'no provider';
        this.validateEnvKeys = [];
    }
    async sendEmail(to, subject, html) {
        return `No email provider found, email was supposed to be sent to ${to} with subject: ${subject} and ${html}, html`;
    }
}
exports.EmptyProvider = EmptyProvider;
//# sourceMappingURL=empty.provider.js.map