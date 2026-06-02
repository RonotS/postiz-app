"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackService = void 0;
const tslib_1 = require("tslib");
const track_enum_1 = require("../user/track.enum");
const common_1 = require("@nestjs/common");
const facebook_nodejs_business_sdk_1 = require("facebook-nodejs-business-sdk");
const crypto_1 = require("crypto");
const access_token = process.env.FACEBOOK_PIXEL_ACCESS_TOKEN;
const pixel_id = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL;
if (access_token && pixel_id) {
    facebook_nodejs_business_sdk_1.FacebookAdsApi.init(access_token || '');
}
let TrackService = class TrackService {
    hashValue(value) {
        return (0, crypto_1.createHash)('sha256').update(value).digest('hex');
    }
    track(uniqueId, ip, agent, tt, additional, fbclid, user) {
        if (!access_token || !pixel_id) {
            return;
        }
        // @ts-ignore
        const current_timestamp = Math.floor(new Date() / 1000);
        const userData = new facebook_nodejs_business_sdk_1.UserData();
        if (ip || user?.ip) {
            userData.setClientIpAddress(ip || user?.ip || '');
        }
        if (agent || user?.agent) {
            userData.setClientUserAgent(agent || user?.agent || '');
        }
        if (fbclid) {
            userData.setFbc(fbclid);
        }
        if (user && user.email) {
            userData.setEmail(this.hashValue(user.email));
        }
        let customData = null;
        if (additional?.value) {
            customData = new facebook_nodejs_business_sdk_1.CustomData();
            customData.setValue(additional.value).setCurrency('USD');
        }
        const serverEvent = new facebook_nodejs_business_sdk_1.ServerEvent()
            .setEventName(track_enum_1.TrackEnum[tt])
            .setEventTime(current_timestamp)
            .setActionSource('website');
        if (user && user.id) {
            serverEvent.setEventId(uniqueId || user.id);
        }
        if (userData) {
            serverEvent.setUserData(userData);
        }
        if (customData) {
            serverEvent.setCustomData(customData);
        }
        const eventsData = [serverEvent];
        const eventRequest = new facebook_nodejs_business_sdk_1.EventRequest(access_token, pixel_id).setEvents(eventsData);
        return eventRequest.execute();
    }
};
exports.TrackService = TrackService;
exports.TrackService = TrackService = tslib_1.__decorate([
    (0, common_1.Injectable)()
], TrackService);
//# sourceMappingURL=track.service.js.map