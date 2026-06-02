"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoManager = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const video_interface_1 = require("./video.interface");
let VideoManager = class VideoManager {
    constructor(_moduleRef) {
        this._moduleRef = _moduleRef;
    }
    getAllVideos() {
        return (Reflect.getMetadata('video', video_interface_1.VideoAbstract) || [])
            .filter((f) => f.available)
            .map((p) => ({
            target: p.target,
            identifier: p.identifier,
            title: p.title,
            tools: p.tools,
            dto: p.dto,
            description: p.description,
            placement: p.placement,
            trial: p.trial,
        }));
    }
    checkAvailableVideoFunction(method) {
        const videoFunction = Reflect.getMetadata('video-function', method);
        return !videoFunction;
    }
    getVideoByName(identifier) {
        const video = (Reflect.getMetadata('video', video_interface_1.VideoAbstract) || []).find((p) => p.identifier === identifier);
        return {
            ...video,
            instance: this._moduleRef.get(video.target, {
                strict: false,
            }),
        };
    }
};
exports.VideoManager = VideoManager;
exports.VideoManager = VideoManager = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [core_1.ModuleRef])
], VideoManager);
//# sourceMappingURL=video.manager.js.map