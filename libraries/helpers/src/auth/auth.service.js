"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
exports.decrypt_legacy_using_IV = decrypt_legacy_using_IV;
exports.encrypt_legacy_using_IV = encrypt_legacy_using_IV;
const tslib_1 = require("tslib");
const jsonwebtoken_1 = require("jsonwebtoken");
const bcrypt_1 = require("bcrypt");
const crypto_1 = tslib_1.__importDefault(require("crypto"));
// @ts-ignore
const evp_bytestokey_1 = tslib_1.__importDefault(require("evp_bytestokey"));
const algorithm = 'aes-256-cbc';
const { keyLength, ivLength } = crypto_1.default.getCipherInfo(algorithm);
function deriveLegacyKeyIv(secret) {
    const { keyLength, ivLength } = crypto_1.default.getCipherInfo(algorithm); // 32, 16
    const pass = Buffer.isBuffer(secret) ? secret : Buffer.from(secret ?? '', 'utf8');
    // evp_bytestokey: key length in **bits**, IV length in **bytes**
    const { key, iv } = (0, evp_bytestokey_1.default)(pass, null, keyLength * 8, ivLength, 'md5');
    if (key.length !== keyLength || iv.length !== ivLength) {
        throw new Error(`Derived wrong sizes (key=${key.length}, iv=${iv.length})`);
    }
    return { key, iv };
}
function decrypt_legacy_using_IV(hexCiphertext) {
    const { key, iv } = deriveLegacyKeyIv(process.env.JWT_SECRET);
    const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv);
    const out = Buffer.concat([decipher.update(hexCiphertext, 'hex'), decipher.final()]);
    return out.toString('utf8');
}
function encrypt_legacy_using_IV(utf8Plaintext) {
    const { key, iv } = deriveLegacyKeyIv(process.env.JWT_SECRET);
    const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
    const out = Buffer.concat([cipher.update(utf8Plaintext, 'utf8'), cipher.final()]);
    return out.toString('hex');
}
class AuthService {
    static hashPassword(password) {
        return (0, bcrypt_1.hashSync)(password, 10);
    }
    static comparePassword(password, hash) {
        return (0, bcrypt_1.compareSync)(password, hash);
    }
    static signJWT(value) {
        return (0, jsonwebtoken_1.sign)(value, process.env.JWT_SECRET);
    }
    static verifyJWT(token) {
        return (0, jsonwebtoken_1.verify)(token, process.env.JWT_SECRET);
    }
    static fixedEncryption(value) {
        return encrypt_legacy_using_IV(value);
    }
    static fixedDecryption(hash) {
        return decrypt_legacy_using_IV(hash);
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map