"use strict";
var ShortLinkService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortLinkService = void 0;
const tslib_1 = require("tslib");
const dub_1 = require("./providers/dub");
const empty_1 = require("./providers/empty");
const common_1 = require("@nestjs/common");
const short_io_1 = require("./providers/short.io");
const kutt_1 = require("./providers/kutt");
const linkdrip_1 = require("./providers/linkdrip");
const lodash_1 = require("lodash");
const striptags_1 = tslib_1.__importDefault(require("striptags"));
const getProvider = () => {
    if (process.env.DUB_TOKEN) {
        return new dub_1.Dub();
    }
    if (process.env.SHORT_IO_SECRET_KEY) {
        return new short_io_1.ShortIo();
    }
    if (process.env.KUTT_API_KEY) {
        return new kutt_1.Kutt();
    }
    if (process.env.LINK_DRIP_API_KEY) {
        return new linkdrip_1.LinkDrip();
    }
    return new empty_1.Empty();
};
let ShortLinkService = ShortLinkService_1 = class ShortLinkService {
    askShortLinkedin(messages) {
        if (ShortLinkService_1.provider.shortLinkDomain === 'empty') {
            return false;
        }
        const mergeMessages = messages.join(' ');
        const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gm;
        const urls = mergeMessages.match(urlRegex);
        if (!urls) {
            // No URLs found, return the original text
            return false;
        }
        return urls.some((url) => url.indexOf(ShortLinkService_1.provider.shortLinkDomain) === -1);
    }
    async convertTextToShortLinks(id, messagesList) {
        if (ShortLinkService_1.provider.shortLinkDomain === 'empty') {
            return messagesList;
        }
        const messages = messagesList.map((text) => {
            return text
                .replace(/&amp;/g, '&')
                .replace(/&quest;/g, '?')
                .replace(/&num;/g, '#');
        });
        const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gm;
        return Promise.all(messages.map(async (text) => {
            const urls = (0, lodash_1.uniq)(text.match(urlRegex));
            if (!urls) {
                // No URLs found, return the original text
                return text;
            }
            const replacementMap = {};
            // Process each URL asynchronously
            await Promise.all(urls.map(async (url) => {
                if (url.indexOf(ShortLinkService_1.provider.shortLinkDomain) === -1) {
                    replacementMap[url] =
                        await ShortLinkService_1.provider.convertLinkToShortLink(id, url);
                }
                else {
                    replacementMap[url] = url; // Keep the original URL if it matches the prefix
                }
            }));
            // Replace the URLs in the text with their replacements
            return text.replace(urlRegex, (url) => replacementMap[url]);
        }));
    }
    async convertShortLinksToLinks(messages) {
        if (ShortLinkService_1.provider.shortLinkDomain === 'empty') {
            return messages;
        }
        const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/g;
        return Promise.all(messages.map(async (text) => {
            const urls = text.match(urlRegex);
            if (!urls) {
                // No URLs found, return the original text
                return text;
            }
            const replacementMap = {};
            // Process each URL asynchronously
            await Promise.all(urls.map(async (url) => {
                if (url.indexOf(ShortLinkService_1.provider.shortLinkDomain) > -1) {
                    replacementMap[url] =
                        await ShortLinkService_1.provider.convertShortLinkToLink(url);
                }
                else {
                    replacementMap[url] = url; // Keep the original URL if it matches the prefix
                }
            }));
            // Replace the URLs in the text with their replacements
            return text.replace(urlRegex, (url) => replacementMap[url]);
        }));
    }
    async getStatistics(messages) {
        if (ShortLinkService_1.provider.shortLinkDomain === 'empty') {
            return [];
        }
        const mergeMessages = messages.join(' ');
        const regex = new RegExp(`https?://${ShortLinkService_1.provider.shortLinkDomain.replace('.', '\\.')}/[^\\s]*`, 'g');
        const urls = (0, striptags_1.default)(mergeMessages).match(regex);
        if (!urls) {
            // No URLs found, return the original text
            return [];
        }
        return ShortLinkService_1.provider.linksStatistics(urls);
    }
    async getAllLinks(id) {
        if (ShortLinkService_1.provider.shortLinkDomain === 'empty') {
            return [];
        }
        return ShortLinkService_1.provider.getAllLinksStatistics(id, 1);
    }
};
exports.ShortLinkService = ShortLinkService;
ShortLinkService.provider = getProvider();
exports.ShortLinkService = ShortLinkService = ShortLinkService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], ShortLinkService);
//# sourceMappingURL=short.link.service.js.map