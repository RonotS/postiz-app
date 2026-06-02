"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeMailerProvider = void 0;
const tslib_1 = require("tslib");
const nodemailer_1 = tslib_1.__importDefault(require("nodemailer"));
const transporter = nodemailer_1.default.createTransport({
    host: process.env.EMAIL_HOST,
    port: +process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});
class NodeMailerProvider {
    constructor() {
        this.name = 'nodemailer';
        this.validateEnvKeys = [
            'EMAIL_HOST',
            'EMAIL_PORT',
            'EMAIL_SECURE',
            'EMAIL_USER',
            'EMAIL_PASS',
        ];
    }
    async sendEmail(to, subject, html, emailFromName, emailFromAddress) {
        const sends = await transporter.sendMail({
            from: `${emailFromName} <${emailFromAddress}>`, // sender address
            to: to, // list of receivers
            subject: subject, // Subject line
            text: html, // plain text body
            html: html, // html body
        });
        return sends;
    }
}
exports.NodeMailerProvider = NodeMailerProvider;
//# sourceMappingURL=node.mailer.provider.js.map