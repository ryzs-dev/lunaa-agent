import { AUTHORIZED_AGENTS } from "../config/agent.config";
import { Agent } from "../types";
import { PhoneUtil } from "./phone/PhoneUtil";

export const PHONE_TO_AGENT = new Map<string, Agent>(
  AUTHORIZED_AGENTS.map(agent => [PhoneUtil.normalize(agent.phoneNumber), agent])
);

export const AUTHORIZED_PHONE_NUMBERS = AUTHORIZED_AGENTS.map(a =>
  PhoneUtil.normalize(a.phoneNumber)
);

export function getAgentByPhone(phone: string): Agent | null {
  return PHONE_TO_AGENT.get(PhoneUtil.normalize(phone)) || null;
}

export function isAuthorized(phone: string): boolean {
  const normalized = PhoneUtil.normalize(phone);
  return AUTHORIZED_PHONE_NUMBERS.includes(normalized);
}

export function getAgentName(phone: string): string {
  const agent = getAgentByPhone(phone);
  return agent ? agent.name : `Agent ${phone}`;
}
