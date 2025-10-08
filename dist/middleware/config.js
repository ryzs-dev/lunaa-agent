"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const multer_1 = __importDefault(require("multer"));
// configure storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // save into uploads folder
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // keep the original file name
    },
});
// pass to multer
const multerConfig = (0, multer_1.default)({ storage });
exports.default = multerConfig;
