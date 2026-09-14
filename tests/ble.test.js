import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyNearby, UUID } from '../web/ble.js';
const view = bytes => new DataView(Uint8Array.from(bytes).buffer);
test('BLE sends raw 16 bytes, reads offset proof, and releases connection', async () => {
  let disconnected = 0, written;
  const backing = new Uint8Array(40).fill(0xab);
  const chars = {
    [UUID.location]: { readValue: async () => view(new TextEncoder().encode('SUBE_1')) },
    [UUID.challenge]: { writeValueWithResponse: async bytes => { written = bytes; } },
    [UUID.proof]: { readValue: async () => new DataView(backing.buffer, 4, 32) }
  };
  const gatt = { connected: false, connect: async () => { gatt.connected = true; return { getPrimaryService: async () => ({ getCharacteristic: async id => chars[id] }) }; }, disconnect: () => { gatt.connected = false; disconnected++; } };
  const result = await verifyNearby({ requestDevice: async () => ({ gatt }) }, async (path, data) => {
    if (path.endsWith('challenge')) return { nonce: '12'.repeat(16), challengeId: 'id' };
    assert.equal(gatt.connected, false); assert.equal(data.proof, 'ab'.repeat(32)); return { ok: true };
  }, 'in', () => {});
  assert.equal(result.ok, true); assert.equal(written.length, 16); assert.equal(disconnected, 1);
});
test('BLE read failure disconnects instead of locking the device', async () => {
  let disconnected = false;
  const gatt = { connected: true, connect: async () => ({ getPrimaryService: async () => { throw new Error('read failed'); } }), disconnect: () => { gatt.connected = false; disconnected = true; } };
  await assert.rejects(verifyNearby({ requestDevice: async () => ({ gatt }) }, async () => {}, 'in', () => {}), /read failed/);
  assert.equal(disconnected, true);
});
