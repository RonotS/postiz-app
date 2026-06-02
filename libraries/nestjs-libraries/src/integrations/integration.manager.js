"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationManager = exports.socialIntegrationList = void 0;
const tslib_1 = require("tslib");
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const x_provider_1 = require("./social/x.provider");
exports.socialIntegrationList = [
    new x_provider_1.XProvider(),
];
let IntegrationManager = class IntegrationManager {
    async getAllIntegrations() {
        return {
            social: await Promise.all(exports.socialIntegrationList.map(async (p) => ({
                name: p.name,
                identifier: p.identifier,
                toolTip: p.toolTip,
                editor: p.editor,
                isExternal: !!p.externalUrl,
                isWeb3: !!p.isWeb3,
                isChromeExtension: !!p.isChromeExtension,
                ...(p.extensionCookies ? { extensionCookies: p.extensionCookies } : {}),
                ...(p.customFields ? { customFields: await p.customFields() } : {}),
            }))),
            article: [],
        };
    }
    getAllTools() {
        return exports.socialIntegrationList.reduce((all, current) => ({
            ...all,
            [current.identifier]: Reflect.getMetadata('custom:tool', current.constructor.prototype) ||
                [],
        }), {});
    }
    getAllRulesDescription() {
        return exports.socialIntegrationList.reduce((all, current) => ({
            ...all,
            [current.identifier]: Reflect.getMetadata('custom:rules:description', current.constructor) || '',
        }), {});
    }
    getAllPlugs() {
        return exports.socialIntegrationList
            .map((p) => {
            return {
                name: p.name,
                identifier: p.identifier,
                plugs: (Reflect.getMetadata('custom:plug', p.constructor.prototype) || [])
                    .filter((f) => !f.disabled)
                    .map((p) => ({
                    ...p,
                    fields: p.fields.map((c) => ({
                        ...c,
                        validation: c?.validation?.toString(),
                    })),
                })),
            };
        })
            .filter((f) => f.plugs.length);
    }
    getInternalPlugs(providerName) {
        const p = exports.socialIntegrationList.find((p) => p.identifier === providerName);
        return {
            internalPlugs: (Reflect.getMetadata('custom:internal_plug', p.constructor.prototype) || []).filter((f) => !f.disabled) || [],
        };
    }
    getAllowedSocialsIntegrations() {
        return exports.socialIntegrationList.map((p) => p.identifier);
    }
    getSocialIntegration(integration) {
        return exports.socialIntegrationList.find((i) => i.identifier === integration);
    }
};
exports.IntegrationManager = IntegrationManager;
exports.IntegrationManager = IntegrationManager = tslib_1.__decorate([
    (0, common_1.Injectable)()
], IntegrationManager);
//# sourceMappingURL=integration.manager.js.map