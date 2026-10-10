const { createHash } = require('node:crypto');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { API_BASE, MAX_RESPONSE, decodePacket, apiBase, mediaUrl, incoming } = require('../../src/channels/weixin/protocol');
const { createWeixinClient } = require('../../src/channels/weixin/client');
const { createWeixinInbox } = require('../../src/channels/weixin/inbox');
const { createWeixinVault } = require('../../src/channels/weixin/vault');
const { createWeixinReceiver } = require('../../src/channels/weixin/receiver');
const { weixinTables } = require('../../src/channels/weixin/schema');
const digest = async text => createHash('sha256').update(text).digest('hex');
const syntheticMediaKey = Buffer.from('0'.repeat(16)).toString('base64');
const binding = { token: 'SYNTHETIC_CREDENTIAL', botId: 'synthetic-bot', userId: 'synthetic-owner', baseUrl: API_BASE };
const message = (id = '18446744073709551615') => ({ message_id: id, from_user_id: binding.userId, message_type: 1, message_state: 2, item_list: [{ type: 1, text_item: { text: '合成通知' } }] });
let db, inbox, stageMedia;
beforeEach(() => {
  db = sqliteHarness();
  for (const [name, fields] of Object.entries(weixinTables)) db.sql.exec(`CREATE TABLE IF NOT EXISTS ${name}(id TEXT PRIMARY KEY,${Object.entries(fields).map(([n, c]) => `${n} ${c.type}`).join(',')})`);
  stageMedia = jest.fn(async () => {});
  inbox = createWeixinInbox(db, { digest, now: () => 100, stageMedia });
});
afterEach(() => db.close());
const response = obj => new Response(typeof obj === 'string' ? obj : JSON.stringify(obj));

test('unsafe uint64 IDs remain distinct before deduplication, including quoted references', async () => {
  const packet = decodePacket('{"ret":0,"get_updates_buf":"next","msgs":[' + JSON.stringify(message()).replace('"18446744073709551615"', '18446744073709551615') + ',' + JSON.stringify(message('18446744073709551614')).replace('"18446744073709551614"', '18446744073709551614') + ']}');
  expect(packet.msgs.map(m => m.message_id)).toEqual(['18446744073709551615', '18446744073709551614']);
  await inbox.commit(binding, '', packet);
  expect((await inbox.list(binding)).map(m => m.message_key).sort()).toEqual(['18446744073709551614', '18446744073709551615']);
  expect(decodePacket('{"ref_msg":{"svr_id":18446744073709551615}}').ref_msg.svr_id).toBe('18446744073709551615');
});

test.each(['http://ilinkai.weixin.qq.com','https://ilinkai.weixin.qq.com.evil.test','https://evil.test','https://u@ilinkai.weixin.qq.com','https://ilinkai.weixin.qq.com:8443','https://ilinkai.weixin.qq.com/p','https://ilinkai.weixin.qq.com?token=bad'])('rejects unsafe API host %s', url => {
  expect(() => apiBase(url)).toThrow();
});

test('API region and CDN boundaries are exact; plain images and both documented key forms are represented', () => {
  expect(apiBase('https://region.ilinkai.weixin.qq.com/')).toBe('https://region.ilinkai.weixin.qq.com');
  expect(() => mediaUrl('https://novac2c.cdn.weixin.qq.com/elsewhere')).toThrow();
  expect(() => mediaUrl('https://novac2c.cdn.weixin.qq.com.evil.test/c2c/download')).toThrow();
  for (const media of [{ encrypt_query_param: 'p' }, { encrypt_query_param: 'p', aes_key: syntheticMediaKey }]) {
    const msg = message(); msg.item_list = [{ type: 2, image_item: { media } }];
    expect(incoming(msg, binding).parts[0]).toMatchObject({ kind: 'media', descriptor: { mime: 'image/jpeg' } });
  }
});

test('only the bound user is persisted; unknown/partial messages are retained without being treated as complete text', async () => {
  const own = message(); own.item_list.push({ type: 99 });
  const packet = { msgs: [own, { ...message('2'), from_user_id: 'other' }, { ...message('3'), group_id: 'group' }, { ...message('4'), message_type: 2 }, { ...message('5'), message_state: 0 }] };
  expect(await inbox.commit(binding, '', packet)).toMatchObject({ saved: 2, ignored: 3 });
  const rows = await inbox.list(binding);
  expect(rows.map(r => r.state).sort()).toEqual(['complete', 'pending']);
  expect(rows.some(r => JSON.parse(r.parts).some(p => p.kind === 'unsupported'))).toBe(true);
});

test('cursor and messages commit atomically; replay is stable and empty cursor never resets it', async () => {
  const packet = { msgs: [message()], get_updates_buf: 'cursor-1' };
  db.failOn('INSERT OR REPLACE INTO weixin_accounts');
  await expect(inbox.commit(binding, '', packet)).rejects.toThrow('Synthetic');
  expect(await inbox.list(binding)).toHaveLength(0); expect(await inbox.cursor(binding)).toBe('');
  db.failOn(null); await inbox.commit(binding, '', packet);
  expect(await inbox.commit(binding, 'cursor-1', { ...packet, get_updates_buf: '' })).toMatchObject({ duplicates: 1, saved: 0, cursor: 'cursor-1' });
  await expect(inbox.commit(binding, '', packet)).rejects.toMatchObject({ code: 'BUSY' });
  expect(await inbox.list(binding)).toHaveLength(1);
});

test('media staging cannot advance cursor on failure; SQL has no media key, URL or bot token', async () => {
  const msg = message(); msg.item_list = [{ type: 4, file_item: { file_name: '../合成.txt', len: '4', media: { encrypt_query_param: 'PRIVATE_DOWNLOAD_PARAM', aes_key: syntheticMediaKey } } }];
  stageMedia.mockRejectedValueOnce(new Error('Synthetic secure storage failure'));
  await expect(inbox.commit(binding, '', { msgs: [msg], get_updates_buf: 'next' })).rejects.toThrow('Synthetic');
  expect(await inbox.cursor(binding)).toBe(''); expect(await inbox.list(binding)).toHaveLength(0);
  await inbox.commit(binding, '', { msgs: [msg], get_updates_buf: 'next' });
  const serialized = JSON.stringify(await inbox.list(binding));
  expect(serialized).not.toContain('PRIVATE_DOWNLOAD_PARAM'); expect(serialized).not.toContain('aes_key'); expect(serialized).not.toContain(binding.token);
  expect(stageMedia.mock.calls[1][1].name).toBe('.._合成.txt');
});

test('completion is not downgraded by an old partial; server deletion remains a local marker', async () => {
  await inbox.commit(binding, '', { msgs: [{ ...message(), message_state: 0 }] });
  await inbox.commit(binding, '', { msgs: [message()] });
  await inbox.commit(binding, '', { msgs: [{ ...message(), message_state: 0 }] });
  expect((await inbox.list(binding))[0]).toMatchObject({ state: 'complete', revision: 2 });
  await inbox.commit(binding, '', { msgs: [{ ...message(), delete_time_ms: 1 }] });
  await inbox.commit(binding, '', { msgs: [message()] });
  expect((await inbox.list(binding))[0]).toMatchObject({ state: 'deleted', revision: 3 });
});

test('QR/GET/authenticated POST headers and metadata match current protocol; redirect cannot return credentials', async () => {
  const fetch = jest.fn().mockResolvedValueOnce(response({ qrcode: 'synthetic-qr', qrcode_img_content: 'synthetic-display' }))
    .mockResolvedValueOnce(response({ status: 'confirmed', bot_token: binding.token, ilink_bot_id: binding.botId, ilink_user_id: binding.userId, baseurl: API_BASE }))
    .mockResolvedValueOnce(response({ ret: 0, msgs: [] }));
  const client = createWeixinClient(fetch, async () => 'MTIz');
  await client.qr(); const status = await client.status('synthetic-qr'); await client.updates(status.binding, 'cursor');
  const qr = fetch.mock.calls[0][1], get = fetch.mock.calls[1][1], auth = fetch.mock.calls[2][1];
  expect(qr.headers.Authorization).toBeUndefined(); expect(JSON.parse(qr.body)).toEqual({ local_token_list: [] });
  expect(get.headers.AuthorizationType).toBeUndefined(); expect(get.headers['X-WECHAT-UIN']).toBeUndefined();
  expect(auth.headers.Authorization).toBe('Bearer ' + binding.token);
  expect(JSON.parse(auth.body)).toMatchObject({ get_updates_buf: 'cursor', base_info: { channel_version: '2.4.9', bot_agent: 'Lime/1.1.1' } });
  expect(fetch.mock.calls.every(([, options]) => options.redirect === 'error')).toBe(true);
  fetch.mockResolvedValueOnce({ ...response({}), redirected: true });
  await expect(client.qr()).rejects.toMatchObject({ code: 'HOST' });
});

test('untrusted business/HTTP/network failures contain no raw response or credential', async () => {
  const fetch = jest.fn().mockResolvedValueOnce(response({ ret: -14, errmsg: binding.token }))
    .mockResolvedValueOnce(new Response(binding.token, { status: 403 }))
    .mockRejectedValueOnce(new Error('Network details ' + binding.token));
  const client = createWeixinClient(fetch, async () => 'MTIz');
  for (const code of ['SESSION', 'HTTP', 'NETWORK']) {
    let err; try { await client.updates(binding, ''); } catch (e) { err = e; }
    expect(err.code).toBe(code); expect(String(err)).not.toContain(binding.token);
  }
});

test('streaming cap and external cancellation protect the full response read', async () => {
  const client = createWeixinClient(async () => new Response('x'.repeat(MAX_RESPONSE + 1)), async () => 'MTIz');
  await expect(client.qr()).rejects.toMatchObject({ code: 'TOO_LARGE' });
  const controller = new AbortController(); controller.abort();
  const fetch = jest.fn(); await expect(createWeixinClient(fetch, async () => 'MTIz').qr(controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' }); expect(fetch).not.toHaveBeenCalled();
});

test('receive is bounded and serialized; cancellation cannot commit a response delivered after abort', async () => {
  let release; const client = { updates: jest.fn(() => new Promise(resolve => { release = resolve; })) };
  const receiver = createWeixinReceiver(client, inbox), abort = new AbortController();
  const active = receiver.read(binding, abort.signal); await new Promise(resolve => setImmediate(resolve));
  await expect(receiver.read(binding)).rejects.toMatchObject({ code: 'BUSY' });
  abort.abort(); release({ msgs: [message()], get_updates_buf: 'next' });
  await expect(active).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(await inbox.cursor(binding)).toBe(''); expect(await inbox.list(binding)).toHaveLength(0);
  client.updates.mockResolvedValue({ msgs: [message()], get_updates_buf: 'next' });
  expect(await receiver.read(binding)).toMatchObject({ saved: 1, duplicates: 1 });
  expect(client.updates).toHaveBeenCalledTimes(3);
});

test('capabilities and binding live only in a scoped SecureStore adapter and can be removed', async () => {
  const secrets = new Map();
  const storage = { getItemAsync: async k => secrets.get(k) ?? null, setItemAsync: async (k,v) => { secrets.set(k,v); }, deleteItemAsync: async k => { secrets.delete(k); } };
  const vault = createWeixinVault(storage, 'synthetic-test');
  await vault.save(binding); expect(await vault.load()).toEqual(binding);
  const id = 'a'.repeat(64), descriptor = { url: 'synthetic', key: 'synthetic', encoding: 'hex', size: 4, md5: '', name: 'x', mime: 'text/plain' };
  await vault.stageMedia(id, descriptor); expect(await vault.media(id)).toEqual(descriptor);
  await vault.remove(); expect(secrets.size).toBe(0); expect(await vault.load()).toBeNull();
});
