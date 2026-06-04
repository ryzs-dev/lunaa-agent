"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationQueue = void 0;
const bullmq_1 = require("bullmq");
const queue_1 = __importDefault(require("../queue"));
exports.automationQueue = new bullmq_1.Queue('automation', {
    connection: queue_1.default,
});
