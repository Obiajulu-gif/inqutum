import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createCutoverExportRouter } from '../src/routes/cutover.routes';
import memoryStorage from '../src/storage/memory-storage';

const SELLER = 'GB3Q3VRHH3OQDYITTLONDLEHWQGKB27T2BEDSFHIUMOERULVXPDXRKG4';
const TOKEN = 'cutover-test-secret';

describe('MVP cutover export endpoint (issue #15)', () => {
  let server: http.Server;
  let port: number;
  const originalToken = process.env.CUTOVER_EXPORT_TOKEN;

  before(async () => {
    memoryStorage.clear();
    memoryStorage.createInvoice({ sellerPublicKey: SELLER, amount: 10, assetCode: 'XLM' });
    process.env.CUTOVER_EXPORT_TOKEN = TOKEN;
    const app = express();
    app.use('/api', createCutoverExportRouter());
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    port = (server.address() as AddressInfo).port;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    memoryStorage.clear();
    if (originalToken === undefined) delete process.env.CUTOVER_EXPORT_TOKEN;
    else process.env.CUTOVER_EXPORT_TOKEN = originalToken;
  });

  it('requires the export token in a header and exports the current invoice snapshot', async () => {
    delete process.env.CUTOVER_EXPORT_TOKEN;
    const disabled = await fetch(`http://127.0.0.1:${port}/api/admin/cutover-export`);
    assert.equal(disabled.status, 503);
    process.env.CUTOVER_EXPORT_TOKEN = TOKEN;

    const queryToken = await fetch(`http://127.0.0.1:${port}/api/admin/cutover-export?token=${TOKEN}`);
    assert.equal(queryToken.status, 401);

    const response = await fetch(`http://127.0.0.1:${port}/api/admin/cutover-export`, {
      headers: { 'x-cutover-token': TOKEN },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition') || '', /cutover-snapshot-/);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.count, 1);
    assert.equal(body.data.invoices[0].sellerPublicKey, SELLER);
  });
});
