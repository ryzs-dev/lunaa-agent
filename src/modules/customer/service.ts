import { UUID } from 'crypto';
import CustomerDatabase from './database';
import { CustomerInput } from './types';
import { OrderInput } from '../orders/types';
import { cleanCustomerName } from '../../utils/customerName';
import { CountryCode, detectCustomerCountry } from '../../utils/country';
import { countryOrFilter, customerCountry, getCountryIndex } from './country-index';

const SORTABLE_CUSTOMER_FIELDS = [
  'created_at',
  'name',
  'total_amount_spent',
  'total_purchase_count',
  'last_order_date',
];

class CustomerService {
  private customerDatabase: CustomerDatabase;

  constructor() {
    this.customerDatabase = new CustomerDatabase();
  }

  protected normalizePhoneNumber(phoneNumber: string): string | null {
    const digits = phoneNumber.replace(/\D/g, '');

    if (!digits) return null;

    // Malaysia
    if (digits.startsWith('60')) {
      return digits;
    }
    if (digits.startsWith('0')) {
      return `60${digits.substring(1)}`;
    }

    // Singapore
    if (digits.startsWith('65')) {
      return digits;
    }
    if (/^[89]\d{7}$/.test(digits)) {
      return `65${digits}`;
    }

    return null;
  }

  async getAllCustomers(options: {
    limit?: number;
    offset?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    filter?: 'all' | 'today' | 'week' | 'month';
    type?: 'all' | 'returning' | 'new';
    country?: CountryCode;
  }) {
    const limit = !options.limit || options.limit > 100 ? 20 : options.limit;
    const offset = options.offset ?? 0;
    const sortBy =
      options.sortBy && SORTABLE_CUSTOMER_FIELDS.includes(options.sortBy)
        ? options.sortBy
        : 'created_at';
    const sortOrder = options.sortOrder ?? 'desc';

    let filterDate: Date | undefined;

    if (options.filter && options.filter !== 'all') {
      const now = new Date();
      filterDate = new Date();

      switch (options.filter) {
        case 'today':
          // Start of today (00:00:00)
          filterDate.setHours(0, 0, 0, 0);
          break;

        case 'week':
          // Start of this week (Monday as first day)
          const dayOfWeek = now.getDay(); // Sunday=0, Monday=1
          const diffToMonday = (dayOfWeek + 6) % 7; // adjust so Monday is start
          filterDate.setDate(now.getDate() - diffToMonday);
          filterDate.setHours(0, 0, 0, 0);
          break;

        case 'month':
          // Start of this month
          filterDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
    }

    const countryIndex = await getCountryIndex();

    const { customers, count } = await this.customerDatabase.getAllCustomers({
      limit,
      offset,
      search: options.search,
      sortBy,
      sortOrder,
      filterDate,
      repeatCustomer:
        options.type && options.type !== 'all' ? options.type : undefined,
      countryFilter: options.country
        ? countryOrFilter(countryIndex, options.country)
        : undefined,
    });

    return {
      customers: (customers ?? []).map((customer) => ({
        ...customer,
        country: customerCountry(countryIndex, customer),
      })),
      pagination: {
        limit,
        offset,
        total: count ?? 0,
      },
    };
  }

  async getCustomerSummary() {
    const [summary, countryIndex] = await Promise.all([
      this.customerDatabase.getCustomerSummary(),
      getCountryIndex(),
    ]);
    return { ...summary, countries: countryIndex.counts };
  }

  async getCustomerByPhoneNumber(phoneNumber: string) {
    const normalizedPhoneNumber = this.normalizePhoneNumber(phoneNumber);
    if (!normalizedPhoneNumber) return null;
    return await this.customerDatabase.getCustomerByPhoneNumber(
      normalizedPhoneNumber
    );
  }

  async getCustomerById(id: UUID) {
    const result = await this.customerDatabase.getCustomerById(id);
    const orders = (result?.orders ?? []).filter(
      (o: { deleted_at?: string | null }) => !o.deleted_at
    );
    const total_purchases = orders.length;
    const amount_spent = orders.reduce(
      (sum: number, o: OrderInput) => sum + (o.total_amount || 0),
      0
    );
    return {
      ...result,
      orders,
      country:
        detectCustomerCountry(result?.phone_number, result?.addresses ?? []) ?? 'MY',
      total_purchases,
      amount_spent,
    };
  }

  async createCustomer(data: CustomerInput) {
    const phoneNumber = this.normalizePhoneNumber(data.phone_number);
    if (!phoneNumber) throw new Error('Invalid phone number');

    const name = data.name ? cleanCustomerName(data.name) : data.name;
    const customerData = {
      ...data,
      ...(data.name !== undefined && { name: name || data.name }),
      phone_number: phoneNumber,
    };
    return await this.customerDatabase.upsertCustomer(customerData);
  }

  async updateCustomer(id: UUID, updates: Partial<CustomerInput>) {
    if (updates.phone_number) {
      const phoneNumber = this.normalizePhoneNumber(updates.phone_number);
      if (!phoneNumber) throw new Error('Invalid phone number');
      updates.phone_number = phoneNumber;
    }
    return await this.customerDatabase.updateCustomer(id, updates);
  }

  async deleteCustomer(id: UUID) {
    return await this.customerDatabase.deleteCustomer(id);
  }

  async getAllCustomerIds(options: {
    search?: string;
    filter?: 'all' | 'today' | 'week' | 'month';
    country?: CountryCode;
  }) {
    let filterDate: Date | undefined;

    if (options.filter && options.filter !== 'all') {
      const now = new Date();
      filterDate = new Date();

      switch (options.filter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          const dayOfWeek = now.getDay();
          const diffToMonday = (dayOfWeek + 6) % 7;
          filterDate.setDate(now.getDate() - diffToMonday);
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'month':
          filterDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
    }

    return this.customerDatabase.getAllCustomerIds({
      search: options.search,
      filterDate,
      countryFilter: options.country
        ? countryOrFilter(await getCountryIndex(), options.country)
        : undefined,
    });
  }
}

export default CustomerService;
