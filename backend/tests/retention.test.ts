import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRetentionPlan,
  cutoffFor,
  EMPTY_PROTECTION_COUNTS,
  isEligible,
  RETENTION_RULES,
  ruleFor,
  summarisePlan,
} from '../src/retention/retention-policy.ts';
import {
  MemoryRetentionStore,
  RetentionService,
  RETENTION_SWEEP_INTERVAL_MS,
  startRetentionScheduler,
  type RetentionRow,
} from '../src/retention/retention-service.ts';

const NOW = new Date('2026-09-26T00:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe('data retention policy (issue #61)', () => {
  describe('policy table', () => {
    it('classifies every data set and justifies its window', () => {
      assert.ok(RETENTION_RULES.length > 0);
      for (const rule of RETENTION_RULES) {
        assert.ok(rule.dataset.length > 0);
        assert.ok(rule.retainDays > 0, `${rule.dataset} needs a positive window`);
        assert.ok(rule.timestampColumn.length > 0);
        assert.ok(rule.rationale.length > 30, `${rule.dataset} needs a documented justification`);
      }
    });

    it('never purges settlement or financial records at any age', () => {
      const neverPurged = RETENTION_RULES.filter((r) => !r.purgeable).map((r) => r.dataset);
      assert.ok(neverPurged.includes('transactions'), 'settlements must be report-only');
      assert.ok(neverPurged.includes('paid_invoices'), 'paid invoices must be report-only');
      assert.ok(neverPurged.includes('audit_events'), 'audit events must be report-only');
    });

    it('keeps the purgeable datasets strictly short of the protected windows', () => {
      const protectedWindows = RETENTION_RULES.filter((r) => !r.purgeable).map((r) => r.retainDays);
      const shortestProtected = Math.min(...protectedWindows);
      for (const rule of RETENTION_RULES.filter((r) => r.purgeable)) {
        assert.ok(
          rule.retainDays < shortestProtected,
          `${rule.dataset} (${rule.retainDays}d) must expire before the shortest protected window (${shortestProtected}d)`
        );
      }
    });

    it('computes a cutoff from the window', () => {
      const rule = ruleFor('expired_invoices')!;
      assert.equal(cutoffFor(rule, NOW).toISOString(), daysAgo(90).toISOString());
      assert.equal(isEligible(rule, daysAgo(91), NOW), true);
      assert.equal(isEligible(rule, daysAgo(89), NOW), false);
    });
  });

  describe('planning', () => {
    it('is always a dry run and reports zero deletions when clean', () => {
      const plan = buildRetentionPlan({}, NOW);
      assert.equal(plan.dryRun, true);
      assert.equal(plan.clean, true);
      assert.deepEqual(plan.wouldDelete, {
        payment_events: 0,
        cancelled_invoices: 0,
        expired_invoices: 0,
        completed_jobs: 0,
      });
    });

    it('counts purgeable rows and explains the ones it holds back', () => {
      const plan = buildRetentionPlan(
        {
          expired_invoices: {
            eligible: 12,
            protected: { ...EMPTY_PROTECTION_COUNTS, settled: 3, notOldEnough: 40 },
          },
        },
        NOW
      );

      assert.equal(plan.wouldDelete.expired_invoices, 12);
      assert.equal(plan.clean, false);
      const candidate = plan.candidates.find((c) => c.dataset === 'expired_invoices')!;
      assert.equal(candidate.protected.settled, 3);
      assert.equal(candidate.protected.notOldEnough, 40);
    });

    it('never lists a report-only dataset as deletable, however many are past the window', () => {
      const plan = buildRetentionPlan(
        {
          paid_invoices: { eligible: 900, protected: { ...EMPTY_PROTECTION_COUNTS } },
          transactions: { eligible: 400, protected: { ...EMPTY_PROTECTION_COUNTS } },
        },
        NOW
      );

      assert.equal(plan.wouldDelete.paid_invoices, undefined);
      assert.equal(plan.wouldDelete.transactions, undefined);
      assert.ok(plan.retained.some((r) => r.dataset === 'paid_invoices'));
    });

    it('summarises a plan for a job log', () => {
      assert.match(summarisePlan(buildRetentionPlan({}, NOW)), /nothing eligible/);
      const plan = buildRetentionPlan(
        { expired_invoices: { eligible: 3, protected: { ...EMPTY_PROTECTION_COUNTS } } },
        NOW
      );
      assert.match(summarisePlan(plan), /3 expired_invoices/);
    });
  });

  describe('applying', () => {
    function storeWith(rows: Record<string, RetentionRow[]>) {
      return new MemoryRetentionStore(rows);
    }

    it('refuses to delete settled records even when they are old', async () => {
      const store = storeWith({
        expired_invoices: [
          { createdAt: daysAgo(500), status: 'PAID', paidAt: daysAgo(490) },
          { createdAt: daysAgo(500), transactionCount: 1 },
          { createdAt: daysAgo(500), status: 'EXPIRED' },
        ],
      });
      const service = new RetentionService(store);

      const result = await service.apply(NOW);
      assert.equal(result.deleted.expired_invoices, 1, 'only the unsettled record may go');
      assert.equal(store.size('expired_invoices'), 2);
    });

    it('keeps records inside the window', async () => {
      const store = storeWith({
        expired_invoices: [{ createdAt: daysAgo(10), status: 'EXPIRED' }],
      });

      const result = await new RetentionService(store).apply(NOW);
      assert.equal(result.totalDeleted, 0);
      assert.equal(store.size('expired_invoices'), 1);
    });

    it('skips report-only datasets and says why', async () => {
      const result = await new RetentionService(storeWith({})).apply(NOW);

      const skipped = result.skipped.map((s) => s.dataset);
      assert.ok(skipped.includes('transactions'));
      assert.ok(skipped.includes('paid_invoices'));
      assert.ok(result.skipped.every((s) => s.reason.length > 20));
      assert.equal(result.totalDeleted, 0);
    });

    it('honours the per-run batch limit', async () => {
      const store = storeWith({
        expired_invoices: Array.from({ length: 10 }, () => ({
          createdAt: daysAgo(200),
          status: 'EXPIRED',
        })),
      });

      const result = await new RetentionService(store, { batchLimit: 3 }).apply(NOW);
      assert.equal(result.deleted.expired_invoices, 3);
      assert.equal(store.size('expired_invoices'), 7, 'the rest wait for the next sweep');
    });

    it('a plan-then-apply pass touches the same rows the plan reported', async () => {
      const store = storeWith({
        cancelled_invoices: [
          { createdAt: daysAgo(200), status: 'CANCELLED' },
          { createdAt: daysAgo(200), status: 'CANCELLED' },
          { createdAt: daysAgo(200), status: 'CANCELLED', paymentTxHash: 'abc' } as RetentionRow,
        ],
      });
      const service = new RetentionService(store);

      const plan = await service.plan(NOW);
      const result = await service.apply(NOW);
      assert.equal(plan.wouldDelete.cancelled_invoices, result.deleted.cancelled_invoices);
    });
  });

  describe('scheduler', () => {
    /** Minimal fake timers: the scheduler only needs set/clear and an unref. */
    interface FakeHandle {
      unref(): void;
    }

    function fakeTimers() {
      const live = new Map<FakeHandle, () => void>();
      let created = 0;

      return {
        setInterval: ((fn: () => void) => {
          created += 1;
          const handle: FakeHandle = { unref() {} };
          live.set(handle, fn);
          return handle as unknown as NodeJS.Timeout;
        }) as unknown as typeof globalThis.setInterval,
        // Mirror the real timer: clearing removes the handle, so it stops firing.
        clearInterval: ((handle: unknown) => {
          live.delete(handle as FakeHandle);
        }) as unknown as typeof globalThis.clearInterval,
        fire: () => [...live.values()].forEach((fn) => fn()),
        registered: () => created,
        cleared: () => created - live.size,
      };
    }

    function service() {
      return new RetentionService(
        new MemoryRetentionStore({
          expired_invoices: [{ createdAt: daysAgo(500), status: 'EXPIRED' }],
        })
      );
    }

    it('uses a six-hour bucket', () => {
      assert.equal(RETENTION_SWEEP_INTERVAL_MS, 6 * 60 * 60 * 1000);
    });

    it('waits one interval before the first report, so restarts do not re-plan', () => {
      const timers = fakeTimers();
      const reports: unknown[] = [];
      startRetentionScheduler(service(), {
        ...timers,
        onReport: (plan) => reports.push(plan),
      });

      assert.equal(timers.registered(), 1, 'one interval is scheduled');
      assert.equal(reports.length, 0, 'nothing reported on start');
    });

    it('reports without deleting when the interval fires', async () => {
      const timers = fakeTimers();
      const reports: Array<{ wouldDelete: Record<string, number> }> = [];
      const store = new MemoryRetentionStore({
        expired_invoices: [{ createdAt: daysAgo(500), status: 'EXPIRED' }],
      });
      const retention = new RetentionService(store);

      startRetentionScheduler(retention, {
        ...timers,
        onReport: (plan) => reports.push(plan),
      });
      timers.fire();
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(reports.length, 1);
      assert.equal(reports[0].wouldDelete.expired_invoices, 1);
      // Report-only: the scheduled sweep must not have removed anything.
      assert.equal((await retention.plan()).wouldDelete.expired_invoices, 1);
    });

    it('can report immediately on start when asked', async () => {
      const timers = fakeTimers();
      const reports: unknown[] = [];
      startRetentionScheduler(service(), {
        ...timers,
        runOnStart: true,
        onReport: (plan) => reports.push(plan),
      });
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(reports.length, 1);
    });

    it('keeps the schedule alive after a failed sweep', async () => {
      const timers = fakeTimers();
      const errors: unknown[] = [];
      const broken = {
        plan: async () => {
          throw new Error('database is down');
        },
      } as unknown as RetentionService;

      startRetentionScheduler(broken, {
        ...timers,
        onError: (error) => errors.push(error),
      });
      timers.fire();
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(errors.length, 1);
      assert.equal(timers.registered(), 1, 'the interval is still scheduled');

      timers.fire();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(errors.length, 2, 'a second failure is still reported');
    });

    it('stops reporting once the scheduler is stopped', async () => {
      const timers = fakeTimers();
      const reports: unknown[] = [];
      const stop = startRetentionScheduler(service(), {
        ...timers,
        onReport: (plan) => reports.push(plan),
      });

      stop();
      assert.equal(timers.cleared(), 1, 'the interval is cleared');

      timers.fire();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(reports.length, 0);
    });
  });
});
