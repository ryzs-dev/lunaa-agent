"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const supabase_1 = require("../modules/supabase");
const ContentExtractor_1 = require("../modules/whatsapp/extractors/ContentExtractor");
const CustomerService_1 = require("../modules/whatsapp/services/CustomerService");
const PhoneExtractor_1 = require("../modules/whatsapp/extractors/PhoneExtractor");
const AddressService_1 = require("../modules/whatsapp/services/AddressService");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env.local') });
class WhatsAppService {
    constructor() {
        this.messages = [];
        this.contacts = [];
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
        this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
        this.messages = [];
        this.contacts = [];
        if (!accessToken || !this.phoneNumberId) {
            throw new Error('❌ Missing WhatsApp API credentials in .env');
        }
        this.client = axios_1.default.create({
            baseURL: `https://graph.facebook.com/v23.0`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
    }
    /** Send a plain text message */
    async sendTextMessage(to, body) {
        const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body },
        });
        return response.data;
    }
    async getMedia(mediaId) {
        const response = await this.client.get(`/${mediaId}`, {
            params: { fields: 'url, mime_type' },
        });
        const { url, mime_type } = response.data;
        const fileRes = await this.client.get(url, { responseType: 'arraybuffer' });
        return { fileData: fileRes.data, mimeType: mime_type };
    }
    /** Send a template message */
    async sendTemplateMessage(to, template) {
        try {
            const components = template.components;
            console.log('Template components:', components);
            const payload = {
                messaging_product: 'whatsapp',
                to,
                type: 'template',
                template: {
                    name: template.name,
                    language: { code: template.language.code },
                    components,
                },
            };
            const response = await this.client.post(`/${this.phoneNumberId}/messages`, payload);
            // Save outbound message in DB
            //   this.saveMessage({
            //     from: this.phoneNumberId, // your business phone number
            //     to,
            //     type: "template",
            //     text: template, // optional, you can also stringify template.components
            //     timestamp: Date.now().toString(),
            //     direction: "outbound",
            //   });
            return response.data;
        }
        catch (error) {
            //   console.error(
            //     "❌ Error sending template:",
            //     error.response?.data || error.message
            //   );
            throw error;
        }
    }
    /** Get available message templates */
    async getMessageTemplates() {
        var _a;
        try {
            const response = await this.client.get(`/${this.businessAccountId}/message_templates`);
            console.log('✅ Fetched templates:', response.data);
            return response.data;
        }
        catch (error) {
            console.error('❌ Error fetching templates:', ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
            throw error;
        }
    }
    // saveMessage(msg: Message) {
    //   this.insertMessage(msg)
    // }
    async saveMessage(msg) {
        const ts = msg.timestamp
            ? Number(msg.timestamp) > 1e12
                ? new Date(Number(msg.timestamp)).toISOString() // ms
                : new Date(Number(msg.timestamp) * 1000).toISOString() // s
            : new Date().toISOString();
        const { data, error } = await supabase_1.supabase
            .from('messages')
            .insert({
            message_id: msg.id || null,
            direction: msg.direction === 'outbound' ? 'out' : 'in',
            from_number: msg.from, // ⚠️ change your DB schema to from_number
            to_number: msg.to,
            type: msg.type,
            body: msg.body,
            timestamp: ts,
            metadata: {},
        })
            .select()
            .single();
        if (error) {
            console.error('❌ DB insert failed:', error.message);
            throw error;
        }
        return data;
    }
    async getMessages(conversationId) {
        const { data, error } = await supabase_1.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId) // link messages to convo
            .order('timestamp', { ascending: true })
            .limit(50);
        if (error)
            throw error;
        return data;
    }
    saveContact(contact) {
        // Check if contact already exists by waId
        const exists = this.contacts.find((c) => c.waId === contact.waId);
        if (!exists) {
            this.contacts.push(contact);
            console.log('📇 Saved Contact:', contact);
        }
        else {
            console.log('⚠️ Contact already exists:', contact.waId);
        }
    }
    getContacts() {
        return this.contacts;
    }
    async upsertContact(contact, customerId) {
        const { data: contactData, error } = await supabase_1.supabase.from('contacts').upsert({
            wa_id: contact.waId,
            profile_name: contact.profileName || null,
            phone_number: contact.waId,
            updated_at: new Date().toISOString(),
            customer_id: customerId || null,
        }, { onConflict: 'wa_id' });
        if (error)
            throw error;
        return contactData;
    }
    // async upsertConversation(waId: string, businessNumber: string, lastMessageId: string) {
    // // Step 1: check if convo exists
    // const { data: convo, error } = await supabase
    //   .from("conversations")
    //   .select("id, unread_count") // 👈 only fetch what we need
    //   .eq("contact_wa_id", waId)
    //   .eq("business_number", businessNumber)
    //   .maybeSingle();
    // if (error) throw error;
    // // Step 2: update if exists
    // if (convo) {
    //   const { data: updated, error: updateError } = await supabase
    //     .from("conversations")
    //     .update({
    //       last_message_id: lastMessageId,
    //       unread_count: convo.unread_count + 1,
    //       updated_at: new Date().toISOString(),
    //     })
    //     .eq("id", convo.id)
    //     .select("id")
    //     .maybeSingle(); // 👈 use maybeSingle to avoid runtime errors
    //   if (updateError) throw updateError;
    //   return updated?.id ?? convo.id; // 👈 fallback to original convo.id
    // }
    // // Step 3: insert if not exists
    // const { data: inserted, error: insertError } = await supabase
    //   .from("conversations")
    //   .insert({
    //     contact_wa_id: waId,
    //     business_number: businessNumber,
    //     last_message_id: lastMessageId,
    //     unread_count: 1,
    //     status: "open",
    //   })
    //   .select("id")
    //   .maybeSingle();
    // if (insertError) throw insertError;
    // return inserted?.id ?? null;
    // }
    async upsertConversation(waId, businessNumber, lastMessageId) {
        var _a;
        const { data, error } = await supabase_1.supabase
            .from('conversations')
            .upsert({
            contact_wa_id: waId,
            business_number: businessNumber,
            last_message_id: lastMessageId,
            unread_count: 0, // will be incremented if conflict
            status: 'open',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'contact_wa_id,business_number' })
            .select('id')
            .single();
        if (error)
            throw error;
        return (_a = data === null || data === void 0 ? void 0 : data.id) !== null && _a !== void 0 ? _a : null;
    }
    async getConversations() {
        const { data, error } = await supabase_1.supabase
            .from('conversations')
            .select(`
        id,
        contact:contacts (
          wa_id,
          profile_name
        ),
        messages:messages!messages_conversation_id_fkey (
          id,
          body,
          type,
          direction,
          timestamp,
          message_media ( id, media_id, mime_type, caption )
        ),
        unread_count,
        status,
        updated_at
      `)
            .order('updated_at', { ascending: false })
            .limit(20);
        if (error)
            throw error;
        // transform: keep only the last message
        return data.map((conv) => {
            var _a, _b;
            return ({
                id: conv.id,
                contact: conv.contact,
                last_message: (_b = (_a = conv.messages) === null || _a === void 0 ? void 0 : _a[conv.messages.length - 1]) !== null && _b !== void 0 ? _b : null,
                unread_count: conv.unread_count,
                status: conv.status,
                updated_at: conv.updated_at,
            });
        });
    }
    async getConversationMessages(conversationId) {
        const { data, error } = await supabase_1.supabase
            .from('messages')
            .select(`
        id,
        body,
        type,
        direction,
        timestamp,
        message_media ( 
          id, 
          media_id, 
          mime_type, 
          caption 
        )
      `)
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true }); // chronological
        if (error)
            throw error;
        return data;
    }
    async handleInboundMessage(message, businessNumber, profileName) {
        var _a;
        const waId = message.from;
        // 1. Ensure contact exists
        await this.upsertContact({ waId, profileName });
        // 2. Ensure conversation exists
        const convoId = await this.upsertConversation(waId, businessNumber, null);
        // 3. Insert the message (deduped)
        const { data: savedMessage, error: msgError } = await supabase_1.supabase
            .from('messages')
            .upsert({
            message_id: message.id,
            conversation_id: convoId,
            direction: 'inbound',
            from_number: waId,
            to_number: businessNumber,
            type: message.type,
            body: (_a = message.text) === null || _a === void 0 ? void 0 : _a.body,
            timestamp: message.timestamp
                ? new Date(parseInt(message.timestamp) * 1000).toISOString()
                : new Date().toISOString(),
            metadata: message,
        }, { onConflict: 'message_id' })
            .select('id')
            .single();
        if (msgError)
            throw msgError;
        // ✅ If message has media, insert into message_media
        if (savedMessage && message.type === 'image' && message.image) {
            const { error: mediaError } = await supabase_1.supabase
                .from('message_media')
                .insert({
                message_id: savedMessage.id, // FK to messages.id
                media_id: message.image.id, // WhatsApp media ID
                mime_type: message.image.mime_type,
                caption: message.image.caption || null,
            });
            if (mediaError) {
                console.error('❌ Error saving media:', mediaError);
                throw mediaError;
            }
        }
        // 4. Update conversation → trigger increments unread_count
        const { error: updateError } = await supabase_1.supabase
            .from('conversations')
            .update({
            last_message_id: savedMessage.id,
            updated_at: new Date().toISOString(),
        })
            .eq('id', convoId);
        if (updateError)
            throw updateError;
        return savedMessage;
    }
    async sendOutboundMessage(conversationId, body) {
        var _a, _b;
        // 1. Get the conversation
        console.log('Sending outbound message to convo:', conversationId);
        const { data: convo, error } = await supabase_1.supabase
            .from('conversations')
            .select('id, contact_wa_id, business_number')
            .eq('id', conversationId)
            .maybeSingle();
        if (error || !convo)
            throw new Error('Conversation not found');
        // 2. Send to WhatsApp API
        const response = await this.sendTextMessage(convo.contact_wa_id, body);
        const waMessageId = (_b = (_a = response.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id;
        // 3. Save outbound message
        const { data: savedMessage, error: msgError } = await supabase_1.supabase
            .from('messages')
            .insert({
            message_id: waMessageId,
            conversation_id: convo.id,
            direction: 'outbound',
            from_number: convo.business_number,
            to_number: convo.contact_wa_id,
            type: 'text',
            body,
            timestamp: new Date().toISOString(),
            metadata: response,
        })
            .select('id')
            .single();
        if (msgError)
            throw msgError;
        // 4. Update conversation with last_message_id
        const { error: updateError } = await supabase_1.supabase
            .from('conversations')
            .update({
            last_message_id: savedMessage.id,
            updated_at: new Date().toISOString(),
        })
            .eq('id', convo.id);
        if (updateError)
            throw updateError;
        return savedMessage;
    }
    async markConversationAsRead(conversationId) {
        console.log('Marking conversation as read:', conversationId);
        const { error } = await supabase_1.supabase
            .from('conversations')
            .update({
            unread_count: 0,
            updated_at: new Date().toISOString(),
        })
            .eq('id', conversationId);
        if (error) {
            console.error('❌ Error marking conversation as read:', error);
            throw error;
        }
    }
    async handleMessageExtraction(msg) {
        var _a, _b, _c, _d, _e, _f, _g;
        const customerService = new CustomerService_1.CustomerService();
        await customerService.init(); // wait for JSON to load
        console.log('✅ Customer service initialized');
        const phoneExtractor = new PhoneExtractor_1.PhoneExtractor(customerService);
        const extractor = new ContentExtractor_1.ContentExtractor(phoneExtractor);
        const addressService = new AddressService_1.AddressService();
        if (!((_a = msg.text) === null || _a === void 0 ? void 0 : _a.body)) {
            console.log('⚠️ No text body in message to extract');
            return;
        }
        const body = (_b = msg.text) === null || _b === void 0 ? void 0 : _b.body;
        const result = await extractor.extractAll(body);
        const customerData = {
            name: result.name || '',
            phone_number: result.contact || '',
            email: result.email || '',
            repeat_customer: result.repeatCustomer || 'new',
        };
        const contactData = {
            wa_id: result.contact || '',
            profile_name: result.name || '',
            phone_number: result.contact || '',
        };
        const addressData = {
            full_address: ((_c = result === null || result === void 0 ? void 0 : result.address) === null || _c === void 0 ? void 0 : _c.address) || '',
            postcode: ((_d = result === null || result === void 0 ? void 0 : result.address) === null || _d === void 0 ? void 0 : _d.postcode) || '',
            city: ((_e = result === null || result === void 0 ? void 0 : result.address) === null || _e === void 0 ? void 0 : _e.city) || '',
            state: (_f = result === null || result === void 0 ? void 0 : result.address) === null || _f === void 0 ? void 0 : _f.state,
            country: ((_g = result === null || result === void 0 ? void 0 : result.address) === null || _g === void 0 ? void 0 : _g.country) || '',
        };
        const orderData = {
            order_date: result.date || new Date().toISOString().split('T')[0],
            status: 'pending',
            total_amount: result.total || 0,
            payment_method: result.paymentMethod || '',
        };
        const orderItemsData = (result.products || []).map((p) => ({
            product_name: p.name,
            quantity: p.quantity,
        }));
        const customer = await this.upsertCustomer(customerData);
        const contact = await this.upsertContact({ waId: contactData.wa_id, profileName: contactData.profile_name }, customer.id);
        const address = await this.upsertAddress(customer.id, addressData);
        const order = await this.upsertOrder(customer.id, (address === null || address === void 0 ? void 0 : address.id) || null, orderData);
        await this.upsertOrderItems(order.id, orderItemsData);
    }
    async upsertCustomer(customer) {
        const { data: customerData, error } = await supabase_1.supabase
            .from('customers')
            .upsert(customer, { onConflict: 'phone_number' })
            .select('id')
            .single();
        if (error)
            throw error;
        return customerData;
    }
    async upsertAddress(customer_id, address) {
        const { data: addressData, error } = await supabase_1.supabase
            .from('addresses')
            .upsert(Object.assign({ customer_id }, address))
            .select('id')
            .single();
        if (error)
            throw error;
        return addressData;
    }
    async upsertOrder(customer_id, address_id, order) {
        const { data: orderData, error } = await supabase_1.supabase
            .from('orders')
            .upsert(Object.assign({ customer_id, address_id }, order))
            .select('id')
            .single();
        if (error)
            throw error;
        return orderData;
    }
    async upsertOrderItems(order_id, items) {
        const { data: itemsData, error } = await supabase_1.supabase
            .from('order_items')
            .insert(items.map((i) => (Object.assign({ order_id }, i))))
            .select();
        if (error)
            throw error;
        return itemsData;
    }
}
exports.WhatsAppService = WhatsAppService;
