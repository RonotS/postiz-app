"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FalService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const p_limit_1 = tslib_1.__importDefault(require("p-limit"));
const limit = (0, p_limit_1.default)(10);
let FalService = class FalService {
    async generateImageFromText(model, text, isVertical = false) {
        const { images, video, ...all } = await (await limit(() => fetch(`https://fal.run/fal-ai/${model}`, {
            method: 'POST',
            headers: {
                Authorization: `Key ${process.env.FAL_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: text,
                aspect_ratio: isVertical ? '9:16' : '16:9',
                resolution: '720p',
                num_images: 1,
                output_format: 'jpeg',
                expand_prompt: true,
            }),
        }))).json();
        console.log(all, video, images);
        if (video) {
            return video.url;
        }
        return images[0].url;
    }
};
exports.FalService = FalService;
exports.FalService = FalService = tslib_1.__decorate([
    (0, common_1.Injectable)()
], FalService);
//# sourceMappingURL=fal.service.js.map