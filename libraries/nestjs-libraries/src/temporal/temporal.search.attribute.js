"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postId = exports.organizationId = void 0;
const common_1 = require("@temporalio/common");
exports.organizationId = (0, common_1.defineSearchAttributeKey)('organizationId', common_1.SearchAttributeType.TEXT);
exports.postId = (0, common_1.defineSearchAttributeKey)('postId', common_1.SearchAttributeType.TEXT);
//# sourceMappingURL=temporal.search.attribute.js.map