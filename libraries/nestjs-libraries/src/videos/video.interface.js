"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoAbstract = void 0;
exports.ExposeVideoFunction = ExposeVideoFunction;
exports.Video = Video;
const common_1 = require("@nestjs/common");
class VideoAbstract {
    async processAndValidate(customParams) {
        const validationPipe = new common_1.ValidationPipe({
            skipMissingProperties: false,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        });
        await validationPipe.transform(customParams, {
            type: 'body',
            metatype: this.dto,
        });
    }
}
exports.VideoAbstract = VideoAbstract;
function ExposeVideoFunction(description) {
    return function (target, propertyKey, descriptor) {
        Reflect.defineMetadata('video-function', description || 'true', descriptor.value);
    };
}
function Video(params) {
    return function (target) {
        // Apply @Injectable decorator to the target class
        (0, common_1.Injectable)()(target);
        // Retrieve existing metadata or initialize an empty array
        const existingMetadata = Reflect.getMetadata('video', VideoAbstract) || [];
        // Add the metadata information for this method
        existingMetadata.push({ target, ...params });
        // Define metadata on the class prototype (so it can be retrieved from the class)
        Reflect.defineMetadata('video', existingMetadata, VideoAbstract);
    };
}
//# sourceMappingURL=video.interface.js.map