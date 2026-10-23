"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../supabase', () => ({ supabase: {} }));
const converra_contact_sync_1 = require("../converra-contact-sync");
const customer = {
    id: 'c1',
    name: 'Aisyah',
    phone_number: '60123456789',
    email: 'aisyah@example.com',
    repeat_customer: 'returning',
};
describe('toConverraContact', () => {
    it('sends segments as tags and the email by default', () => {
        expect((0, converra_contact_sync_1.toConverraContact)(customer, ['VIP'])).toEqual({
            id: 'c1',
            phone_number: '60123456789',
            name: 'Aisyah',
            email: 'aisyah@example.com',
            tags: ['VIP', 'returning-customer'],
        });
    });
    it('leaves segment tags out when syncSegments is off', () => {
        expect((0, converra_contact_sync_1.toConverraContact)(customer, ['VIP'], { syncSegments: false }).tags).toEqual(['returning-customer']);
    });
    it('omits the email entirely when syncEmail is off', () => {
        const contact = (0, converra_contact_sync_1.toConverraContact)(customer, [], { syncEmail: false });
        expect(contact).not.toHaveProperty('email');
    });
    it('includes marketing consent only when present', () => {
        expect((0, converra_contact_sync_1.toConverraContact)(customer)).not.toHaveProperty('marketing_opt_in');
        expect((0, converra_contact_sync_1.toConverraContact)(Object.assign(Object.assign({}, customer), { marketing_opt_in_status: 'opted_in', marketing_opt_in_at: null }))).toMatchObject({ marketing_opt_in: 'opted_in', marketing_opt_in_source: 'lunaa_crm' });
    });
});
