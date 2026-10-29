import { UUID } from 'crypto';
import DistributorDatabase from './database';
import { DistributorInput } from './types';
import { normalizePhoneNumber } from '../shared/phone';
import { supabase } from '../supabase';

class DistributorService {
  private distributorDatabase: DistributorDatabase;

  constructor() {
    this.distributorDatabase = new DistributorDatabase();
  }

  async getAllDistributors() {
    const [distributors, counts] = await Promise.all([
      this.distributorDatabase.getAllDistributors(),
      this.distributorDatabase.getOrderCounts(),
    ]);

    return distributors.map((distributor) => ({
      ...distributor,
      order_count: counts[distributor.phone_number] ?? 0,
    }));
  }

  async isDistributorPhone(phoneNumber?: string | null) {
    if (!phoneNumber) return false;
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) return false;
    const distributor =
      await this.distributorDatabase.getDistributorByPhoneNumber(normalized);
    return Boolean(distributor);
  }

  async isDistributorCustomer(customerId?: UUID | string | null) {
    if (!customerId) return false;
    const { data: customer, error } = await supabase
      .from('customers')
      .select('phone_number')
      .eq('id', customerId)
      .maybeSingle();
    if (error) throw error;
    return this.isDistributorPhone(customer?.phone_number);
  }

  async createDistributor(data: DistributorInput) {
    const phoneNumber = normalizePhoneNumber(data.phone_number);
    if (!phoneNumber) throw new Error('Invalid phone number');

    const distributor = await this.distributorDatabase.upsertDistributor({
      name: data.name?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      phone_number: phoneNumber,
    });

    const movedOrders = await this.distributorDatabase.setOrdersDistributorFlag(
      phoneNumber,
      true
    );

    return { distributor, movedOrders };
  }

  async deleteDistributor(id: UUID) {
    const distributor = await this.distributorDatabase.getDistributorById(id);
    if (!distributor) return null;

    await this.distributorDatabase.deleteDistributor(id);
    const movedOrders = await this.distributorDatabase.setOrdersDistributorFlag(
      distributor.phone_number,
      false
    );

    return { distributor, movedOrders };
  }
}

export default DistributorService;
