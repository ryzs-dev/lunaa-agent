"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTHORIZED_PHONE_NUMBERS = exports.PHONE_TO_AGENT = void 0;
exports.getAgentByPhone = getAgentByPhone;
exports.isAuthorized = isAuthorized;
exports.getAgentName = getAgentName;
const agent_config_1 = require("../config/agent.config");
const PhoneUtil_1 = require("./phone/PhoneUtil");
exports.PHONE_TO_AGENT = new Map(agent_config_1.AUTHORIZED_AGENTS.map(agent => [PhoneUtil_1.PhoneUtil.normalize(agent.phoneNumber), agent]));
exports.AUTHORIZED_PHONE_NUMBERS = agent_config_1.AUTHORIZED_AGENTS.map(a => PhoneUtil_1.PhoneUtil.normalize(a.phoneNumber));
function getAgentByPhone(phone) {
    return exports.PHONE_TO_AGENT.get(PhoneUtil_1.PhoneUtil.normalize(phone)) || null;
}
function isAuthorized(phone) {
    const normalized = PhoneUtil_1.PhoneUtil.normalize(phone);
    return exports.AUTHORIZED_PHONE_NUMBERS.includes(normalized);
}
function getAgentName(phone) {
    const agent = getAgentByPhone(phone);
    return agent ? agent.name : `Agent ${phone}`;
}
