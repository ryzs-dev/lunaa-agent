"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sheetFieldMap = void 0;
exports.sheetFieldMap = {
    'order date': ({ order }) => order.order_date || '',
    fbname: () => '',
    name: ({ customer }) => customer.name || '',
    'payment method': ({ order }) => order.payment_method || '',
    'total paid (rm)': ({ order }) => order.total_amount || '',
    'shipment description': ({ order }) => order.shipment_description || '',
    address: ({ address }) => address.full_address || '',
    city: ({ address }) => address.city || '',
    postcode: ({ address }) => address.postcode || '',
    state: ({ address }) => address.state || '',
    'phone number': ({ customer }) => customer.phone_number || '',
    email: ({ customer }) => customer.email || '',
    'new/repeat': () => '',
    'agent by / under': () => 'WhatsApp Bot',
    currency: ({ customer }) => { var _a; return ((_a = customer.phone_number) === null || _a === void 0 ? void 0 : _a.startsWith('65')) ? 'SGD' : 'MYR'; },
    status: () => 'Pending',
};
