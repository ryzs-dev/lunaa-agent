"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const agent_1 = require("../modules/whatsapp/utils/agent");
// Mock data for testing
const mockAgents = [
    { phoneNumber: '123-456-7890', name: 'Alice' },
    { phoneNumber: '987-654-3210', name: 'Bob' },
];
// Mock the AUTHORIZED_AGENTS import
jest.mock('../modules/whatsapp/utils/agent', () => {
    const originalModule = jest.requireActual('../modules/whatsapp/utils/agent');
    return Object.assign(Object.assign({}, originalModule), { AUTHORIZED_AGENTS: [
            { phoneNumber: '0164433210', name: 'Laura' },
            { phoneNumber: '01126470411', name: 'Ryan' },
            { phoneNumber: '601126470411', name: 'Ryan' },
            { phoneNumber: '60 1126470411', name: 'Ryan' },
            { phoneNumber: '60 11 2647 0411', name: 'Ryan' },
            { phoneNumber: '6 011 2647 0411', name: 'Ryan' },
            { phoneNumber: '011-2647 0411', name: 'Ryan' },
            { phoneNumber: '011-26470411', name: 'Ryan' },
        ] });
});
describe('Agent Utilities', () => {
    beforeEach(() => {
        // Clear the map before each test to ensure a clean state
        agent_1.PHONE_TO_AGENT.clear();
        mockAgents.forEach(agent => agent_1.PHONE_TO_AGENT.set(agent.phoneNumber, agent));
    });
    describe('PHONE_TO_AGENT Map', () => {
        test('should map phone numbers to agents correctly', () => {
            expect(agent_1.PHONE_TO_AGENT.size).toBe(mockAgents.length);
            expect(agent_1.PHONE_TO_AGENT.get('123-456-7890')).toEqual(mockAgents[0]);
            expect(agent_1.PHONE_TO_AGENT.get('987-654-3210')).toEqual(mockAgents[1]);
            expect(agent_1.PHONE_TO_AGENT.get('999-999-9999')).toBeUndefined();
        });
    });
    describe('AUTHORIZED_PHONE_NUMBERS Array', () => {
        test('should contain all agent phone numbers', () => {
            expect(agent_1.AUTHORIZED_PHONE_NUMBERS).toEqual(['123-456-7890', '987-654-3210']);
            expect(agent_1.AUTHORIZED_PHONE_NUMBERS.length).toBe(mockAgents.length);
        });
    });
    describe('getAgentByPhone Function', () => {
        test('should return the correct agent for a valid phone number', () => {
            const agent = (0, agent_1.getAgentByPhone)('123-456-7890');
            expect(agent).toEqual(mockAgents[0]);
            expect(agent === null || agent === void 0 ? void 0 : agent.name).toBe('Alice');
        });
        test('should return undefined for an invalid phone number', () => {
            const agent = (0, agent_1.getAgentByPhone)('999-999-9999');
            expect(agent).toBeUndefined();
        });
        test('should handle empty string input', () => {
            const agent = (0, agent_1.getAgentByPhone)('');
            expect(agent).toBeUndefined();
        });
    });
});
