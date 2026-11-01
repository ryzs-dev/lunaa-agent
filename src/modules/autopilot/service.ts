import { UUID } from 'crypto';
import AutopilotDatabase from './database';
import { ParcelDailyService } from '../parcel-daily/service';
import { buildShipmentFromOrder } from '../orders/shipment-from-order';
import { bookShipment, getShippingRules, isCodOrder } from '../shipping/rules';
import { enqueueTrackingFromAdmin } from '../queue/tracking_queue/queue';
import {
  AutopilotRun,
  AutopilotSettings,
  AutopilotSettingsInput,
  AutopilotStep,
  AutopilotTrigger,
  RunItem,
} from './types';
import { malaysiaNow } from './time';

const PARCEL_DAILY_API_URL =
  process.env.PARCEL_DAILY_API_URL || 'http://localhost:4002/api/parceldaily';

type ShippingDefaults = { courier?: string; isDropoff?: boolean };

const one = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

function summarise(items: RunItem[]) {
  const summary: Record<string, number> = { total: items.length };
  for (const item of items) summary[item.state] = (summary[item.state] ?? 0) + 1;
  return summary;
}

export class AutopilotBusyError extends Error {}

class AutopilotService {
  private db = new AutopilotDatabase();
  private parcelDaily = new ParcelDailyService(PARCEL_DAILY_API_URL);

  getSettings() {
    return this.db.getSettings();
  }

  updateSettings(input: AutopilotSettingsInput) {
    return this.db.updateSettings(input);
  }

  listRuns(limit = 30) {
    return this.db.listRuns(limit);
  }

  getRun(id: string) {
    return this.db.getRun(id);
  }

  setHold(orderId: string, hold: boolean) {
    return this.db.setHold(orderId, hold);
  }

  private async shippingDefaults(): Promise<ShippingDefaults> {
    try {
      const response = await this.parcelDaily.getSettings();
      return response?.data?.defaults ?? {};
    } catch {
      return {};
    }
  }

  // What a step would act on right now, without saving anything.
  async preview(step: AutopilotStep, settings?: AutopilotSettings) {
    const s = settings ?? (await this.db.getSettings());
    return step === 'ship' ? this.shipItems(s) : this.trackingItems(s);
  }

  private capItems(items: RunItem[], max: number) {
    let ready = 0;
    return items.map((item) => {
      if (item.state !== 'ready') return item;
      ready += 1;
      return ready > max
        ? { ...item, state: 'over_limit' as const, reason: `Over the limit of ${max} orders per run` }
        : item;
    });
  }

  private async shipItems(settings: AutopilotSettings): Promise<RunItem[]> {
    const [orders, defaults, rules] = await Promise.all([
      this.db.shipCandidates(settings.lookback_days),
      this.shippingDefaults(),
      getShippingRules(),
    ]);

    const items = orders
      .filter((order) => settings.include_distributors || !order.is_distributor)
      .map((order): RunItem => {
        const customer = one(order.customers as never) as
          | { name?: string | null; phone_number?: string | null }
          | null;
        const base = {
          order_id: order.id,
          order_number: order.order_number,
          customer_name: customer?.name ?? null,
          phone: customer?.phone_number ?? null,
          amount: Number(order.total_amount) || 0,
        };

        if (order.autopilot_hold) {
          return { ...base, state: 'on_hold', reason: 'Held by staff' };
        }
        const built = buildShipmentFromOrder(
          { ...order, customers: customer, addresses: one(order.addresses as never) } as never,
          { serviceProvider: defaults.courier, isDropoff: defaults.isDropoff === true }
        );
        if (built.error) return { ...base, state: 'needs_attention', reason: built.error };
        const cod = rules.detect_cod && isCodOrder({ ...order, customers: customer } as never);
        return cod
          ? { ...base, state: 'ready', reason: `COD · collect RM ${base.amount.toFixed(2)}` }
          : { ...base, state: 'ready' };
      });

    return this.capItems(items, settings.max_orders_per_run);
  }

  private async trackingItems(settings: AutopilotSettings): Promise<RunItem[]> {
    const rows = await this.db.trackingCandidates(settings.lookback_days);

    const items = rows
      .map((row) => {
        const order = one(row.orders as never) as {
          id: string;
          order_number: string | null;
          is_distributor: boolean;
          autopilot_hold: boolean;
          deleted_at: string | null;
          customers: unknown;
        } | null;
        return { row, order };
      })
      .filter(({ order }) => order && !order.deleted_at)
      .filter(({ order }) => settings.include_distributors || !order!.is_distributor)
      .map(({ row, order }): RunItem => {
        const customer = one(order!.customers as never) as
          | { name?: string | null; phone_number?: string | null }
          | null;
        const base = {
          order_id: order!.id,
          order_number: order!.order_number,
          customer_name: customer?.name ?? null,
          phone: customer?.phone_number ?? null,
          order_tracking_id: row.id,
          tracking_number: row.tracking_number,
          courier: row.courier,
        };
        if (order!.autopilot_hold) {
          return { ...base, state: 'on_hold', reason: 'Held by staff' };
        }
        if (!base.phone) {
          return { ...base, state: 'needs_attention', reason: 'Missing customer phone number' };
        }
        return { ...base, state: 'ready' };
      });

    return this.capItems(items, settings.max_orders_per_run);
  }

  // Builds a batch and saves it as a run. In review mode it waits for
  // approval; in automatic mode it executes straight away.
  async prepare(step: AutopilotStep, trigger: AutopilotTrigger): Promise<AutopilotRun | null> {
    // One batch per step at a time. A manual run returns the batch already
    // waiting; a scheduled run replaces a batch nobody approved.
    const active = await this.db.activeRuns(step);
    if (active.some((run) => run.status === 'running')) {
      throw new AutopilotBusyError(`A ${step === 'ship' ? 'shipping' : 'tracking'} run is in progress`);
    }
    const waiting = active.find((run) => run.status === 'awaiting_approval');
    if (waiting && trigger === 'manual') return waiting;
    for (const run of active) {
      await this.db.claimRun(run.id, 'awaiting_approval', {
        status: 'dismissed',
        error: 'Replaced by a newer batch',
        finished_at: new Date().toISOString(),
      });
    }

    const settings = await this.db.getSettings();
    const items = await this.preview(step, settings);
    const mode = step === 'ship' ? settings.ship_mode : settings.tracking_mode;
    const hasWork = items.some((item) => item.state === 'ready');

    const run = await this.db.createRun({
      step,
      trigger,
      // Nothing to do still leaves a record, so the log shows the step ran.
      status: !hasWork ? 'completed' : mode === 'auto' ? 'running' : 'awaiting_approval',
      run_date: malaysiaNow().date,
      items,
      summary: summarise(items),
    });
    if (!run) return null;

    if (!hasWork) {
      return this.db.updateRun(run.id, { finished_at: new Date().toISOString() });
    }
    if (mode === 'auto') {
      void this.execute(run).catch((error) =>
        console.error(`[autopilot] ${step} run ${run.id} failed:`, error)
      );
    }
    return run;
  }

  async approve(id: string, approvedBy?: string) {
    const run = await this.db.claimRun(id, 'awaiting_approval', {
      status: 'running',
      approved_by: approvedBy ?? null,
      approved_at: new Date().toISOString(),
    });
    if (!run) return null;
    void this.execute(run).catch((error) =>
      console.error(`[autopilot] ${run.step} run ${run.id} failed:`, error)
    );
    return run;
  }

  dismiss(id: string) {
    return this.db.claimRun(id, 'awaiting_approval', {
      status: 'dismissed',
      finished_at: new Date().toISOString(),
    });
  }

  // Holding an order inside a waiting batch takes it out of that batch too.
  async holdInRun(runId: string, orderId: string, hold: boolean) {
    await this.db.setHold(orderId, hold);
    const run = await this.db.getRun(runId);
    if (!run || run.status !== 'awaiting_approval') return run;

    const items = run.items.map((item) => {
      if (item.order_id !== orderId) return item;
      if (hold && item.state === 'ready') {
        return { ...item, state: 'on_hold' as const, reason: 'Held by staff' };
      }
      if (!hold && item.state === 'on_hold') {
        return { ...item, state: 'ready' as const, reason: undefined };
      }
      return item;
    });
    return this.db.updateRun(runId, { items, summary: summarise(items) });
  }

  private async execute(run: AutopilotRun) {
    try {
      const items =
        run.step === 'ship' ? await this.executeShip(run) : await this.executeTracking(run);
      await this.db.updateRun(run.id, {
        status: 'completed',
        items,
        summary: summarise(items),
        finished_at: new Date().toISOString(),
      });
    } catch (error) {
      await this.db.updateRun(run.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        finished_at: new Date().toISOString(),
      });
    }
  }

  private async executeShip(run: AutopilotRun): Promise<RunItem[]> {
    const settings = await this.db.getSettings();
    const account = await this.parcelDaily.getAccountInfo();
    const credit = Number(account?.data?.credit);
    if (!Number.isFinite(credit)) {
      throw new Error('Couldn’t read the Parcel Daily credit balance');
    }
    if (credit < settings.min_credit) {
      throw new Error(
        `Parcel Daily credit is RM ${credit.toFixed(2)}, below the RM ${settings.min_credit.toFixed(2)} minimum. Top up, then run again.`
      );
    }

    const items: RunItem[] = [];

    for (const item of run.items) {
      if (item.state !== 'ready') {
        items.push(item);
        continue;
      }

      // Re-check: staff may have held, shipped or deleted it since the batch was made.
      const order = await this.db.getOrderForShipping(item.order_id);
      if (!order || order.deleted_at) {
        items.push({ ...item, state: 'skipped', reason: 'Order was deleted' });
        continue;
      }
      if (order.autopilot_hold) {
        items.push({ ...item, state: 'skipped', reason: 'Held by staff' });
        continue;
      }

      const booking = await bookShipment({
        ...order,
        customers: one(order.customers as never),
        addresses: one(order.addresses as never),
      } as never);
      if (!booking.success) {
        items.push({ ...item, state: 'failed', courier: booking.courier, reason: booking.error });
        continue;
      }
      const notes = [booking.cod > 0 && `COD RM ${booking.cod.toFixed(2)}`, booking.note].filter(Boolean);
      items.push({
        ...item,
        state: 'shipped',
        courier: booking.courier,
        reason: notes.length ? notes.join(' · ') : undefined,
      });
    }

    return items;
  }

  private async executeTracking(run: AutopilotRun): Promise<RunItem[]> {
    const items: RunItem[] = [];
    const toSend: RunItem[] = [];

    for (const item of run.items) {
      if (item.state !== 'ready' || !item.order_tracking_id) {
        items.push(item);
        continue;
      }
      const row = await this.db.getTrackingForSending(item.order_tracking_id);
      const order = one(row?.orders as never) as { autopilot_hold?: boolean; deleted_at?: string | null } | null;
      if (!row || order?.deleted_at) {
        items.push({ ...item, state: 'skipped', reason: 'Order was deleted' });
      } else if (row.last_message_sent_at || row.message_status === 'sent') {
        items.push({ ...item, state: 'skipped', reason: 'Already sent' });
      } else if (order?.autopilot_hold) {
        items.push({ ...item, state: 'skipped', reason: 'Held by staff' });
      } else {
        toSend.push(item);
      }
    }

    if (toSend.length) {
      await this.db.markTrackingQueued(toSend.map((item) => item.order_tracking_id!));
      await enqueueTrackingFromAdmin(
        toSend.map((item) => ({
          orderTrackingId: item.order_tracking_id!,
          name: item.customer_name ?? undefined,
          phone: item.phone!,
          tracking: item.tracking_number!,
          courier: item.courier ?? undefined,
        }))
      );
      items.push(...toSend.map((item) => ({ ...item, state: 'queued' as const })));
    }

    return items;
  }
}

export default AutopilotService;
