"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaTransaction = exports.PrismaRepository = exports.PrismaService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let PrismaService = class PrismaService extends client_1.PrismaClient {
    constructor() {
        super({
            log: [
                {
                    emit: 'event',
                    level: 'query',
                },
            ],
        });
    }
    async onModuleInit() {
        await this.$connect();
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], PrismaService);
let PrismaRepository = class PrismaRepository {
    constructor(_prismaService) {
        this._prismaService = _prismaService;
        this.model = this._prismaService;
    }
};
exports.PrismaRepository = PrismaRepository;
exports.PrismaRepository = PrismaRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [PrismaService])
], PrismaRepository);
let PrismaTransaction = class PrismaTransaction {
    constructor(_prismaService) {
        this._prismaService = _prismaService;
        this.model = this._prismaService;
    }
};
exports.PrismaTransaction = PrismaTransaction;
exports.PrismaTransaction = PrismaTransaction = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [PrismaService])
], PrismaTransaction);
//# sourceMappingURL=prisma.service.js.map