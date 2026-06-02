"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rules = Rules;
require("reflect-metadata");
function Rules(description) {
    return function (target) {
        // Define metadata on the class prototype (so it can be retrieved from the class)
        Reflect.defineMetadata('custom:rules:description', description, target);
    };
}
//# sourceMappingURL=rules.description.decorator.js.map