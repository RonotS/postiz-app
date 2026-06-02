"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Empty = void 0;
class Empty {
    constructor() {
        this.shortLinkDomain = 'empty';
    }
    async linksStatistics(links) {
        return [];
    }
    async convertLinkToShortLink(link) {
        return '';
    }
    async convertShortLinkToLink(shortLink) {
        return '';
    }
    getAllLinksStatistics(id, page) {
        return Promise.resolve([]);
    }
}
exports.Empty = Empty;
//# sourceMappingURL=empty.js.map