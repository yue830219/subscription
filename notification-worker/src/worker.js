import { DurableObject } from 'cloudflare:workers';
import webpush from 'web-push';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
});

function cors(response, origin = '*') {
  const result = new Response(response.body, response);
  result.headers.set('Access-Control-Allow-Origin', origin || '*');
  result.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  result.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  result.headers.set('Vary', 'Origin');
  return result;
}

export class NotificationDevice extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const action = new URL(request.url).pathname.slice(1);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    if (action === 'register') {
      if (!body.subscription?.endpoint || !body.subscription?.keys?.p256dh || !body.subscription?.keys?.auth) return json({ error: 'invalid subscription' }, 400);
      await this.ctx.storage.put('subscription', body.subscription);
      return json({ ok: true });
    }
    if (action === 'sync') {
      const reminders = Array.isArray(body.reminders) ? body.reminders
        .filter(item => item && Number.isFinite(item.scheduledAt) && item.scheduledAt > Date.now() - 60000)
        .slice(0, 500) : [];
      await this.ctx.storage.put('reminders', reminders);
      await this.scheduleNextAlarm(reminders);
      return json({ ok: true, count: reminders.length });
    }
    if (action === 'test') {
      const subscription = await this.ctx.storage.get('subscription');
      if (!subscription) return json({ error: 'not subscribed' }, 404);
      await this.send(subscription, {
        title: '訂閱付款提醒', body: '測試通知已成功送達。', tag: 'subscription-test', url: body.url || './'
      });
      return json({ ok: true });
    }
    if (action === 'unsubscribe') {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }

  async scheduleNextAlarm(reminders = null) {
    const list = reminders || await this.ctx.storage.get('reminders') || [];
    const next = list.filter(item => item.scheduledAt > Date.now()).sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    if (next) await this.ctx.storage.setAlarm(next.scheduledAt);
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    const subscription = await this.ctx.storage.get('subscription');
    const reminders = await this.ctx.storage.get('reminders') || [];
    const now = Date.now();
    const due = reminders.filter(item => item.scheduledAt <= now + 60000);
    const pending = reminders.filter(item => item.scheduledAt > now + 60000);
    if (subscription) {
      for (const reminder of due) {
        try {
          await this.send(subscription, reminder);
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await this.ctx.storage.delete('subscription');
            break;
          }
          throw error;
        }
      }
    }
    await this.ctx.storage.put('reminders', pending);
    await this.scheduleNextAlarm(pending);
  }

  async send(subscription, payload) {
    webpush.setVapidDetails(this.env.VAPID_SUBJECT, this.env.VAPID_PUBLIC_KEY, this.env.VAPID_PRIVATE_KEY);
    const sentAt = Date.now();
    const response = await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 86400,
      urgency: 'high'
    });
    console.log(JSON.stringify({
      event: 'notification-sent',
      scheduledAt: Number.isFinite(payload?.scheduledAt) ? payload.scheduledAt : null,
      sentAt,
      delayMs: Number.isFinite(payload?.scheduledAt) ? sentAt - payload.scheduledAt : null,
      statusCode: response?.statusCode || null
    }));
    return response;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
    const url = new URL(request.url);
    if (url.pathname === '/vapid-public-key') return cors(json({ publicKey: env.VAPID_PUBLIC_KEY || '' }), origin);
    const match = url.pathname.match(/^\/device\/([a-f0-9-]{36})\/(register|sync|test|unsubscribe)$/i);
    if (!match) return cors(json({ error: 'not found' }, 404), origin);
    const id = env.NOTIFICATION_DEVICES.idFromName(match[1].toLowerCase());
    const stub = env.NOTIFICATION_DEVICES.get(id);
    const forwarded = new Request(`https://notification-device/${match[2]}`, request);
    return cors(await stub.fetch(forwarded), origin);
  }
};
