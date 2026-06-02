"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkDrip = void 0;
const LINK_DRIP_API_ENDPOINT = process.env.LINK_DRIP_API_ENDPOINT || 'https://api.linkdrip.com/v1/';
const LINK_DRIP_SHORT_LINK_DOMAIN = process.env.LINK_DRIP_SHORT_LINK_DOMAIN || 'dripl.ink';
const getOptions = () => ({
    headers: {
        Authorization: `Bearer ${process.env.LINK_DRIP_API_KEY}`,
        'Content-Type': 'application/json',
    },
});
class LinkDrip {
    constructor() {
        this.shortLinkDomain = LINK_DRIP_SHORT_LINK_DOMAIN;
    }
    async linksStatistics(links) {
        return Promise.resolve([]);
    }
    async convertLinkToShortLink(id, link) {
        try {
            const response = await fetch(`${LINK_DRIP_API_ENDPOINT}/create`, {
                ...getOptions(),
                method: 'POST',
                body: JSON.stringify({
                    target_url: link,
                    custom_domain: this.shortLinkDomain,
                }),
            });
            if (!response.ok) {
                throw new Error(`Failed to create LinkDrip API short link with status: ${response.status}`);
            }
            const data = await response.json();
            return data.link;
        }
        catch (error) {
            throw new Error(`Failed to create LinkDrip short link: ${error}`);
        }
    }
    async convertShortLinkToLink(shortLink) {
        return '';
    }
    getAllLinksStatistics(id, page) {
        return Promise.resolve([]);
    }
}
exports.LinkDrip = LinkDrip;
//# sourceMappingURL=linkdrip.js.map