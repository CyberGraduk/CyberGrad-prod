// api/stripe-webhook.js
// Stripe calls this after a payment. It sends the student a welcome email and
// notifies the admin. Needs these Vercel env vars:
//   STRIPE_WEBHOOK_SECRET  (whsec_..., from the Stripe webhook endpoint)
//   RESEND_API_KEY
//   COHORT_START_DATE      (optional, e.g. "Monday 12 January 2027")
// In Stripe, point the endpoint at https://www.cyber-grad.co.uk/api/stripe-webhook
// and subscribe to the event: checkout.session.completed
const crypto = require('crypto');

const ADMIN_EMAIL = 'cybergraduk@gmail.com';
const FROM = 'Rakesh at CyberGrad <hello@cyber-grad.co.uk>';
const WHATSAPP = 'https://chat.whatsapp.com/CiWUjOvMm8AKN5WgWDxGNO?mode=gi_t';
const SITE = 'https://www.cyber-grad.co.uk';

const PLAN_INFO = {
  'industry-ready': {
    label: 'Industry-Ready',
    week1: [
      'Your cohort group is set up and you meet the other students.',
      'Live group session 1 (60 mins): the UK cybersecurity job market and how hiring really works.',
      'You send your CV and LinkedIn link so your reviews can be scheduled.'
    ],
    steps: [
      'Join the WhatsApp group using the button above.',
      'Log in to your dashboard at cyber-grad.co.uk and download your UK CV template.',
      'Reply to this email with your latest CV and LinkedIn link.',
      'Book your first 1-to-1 session through the link on your dashboard.',
      'Watch the group for the Week 1 session link.'
    ]
  },
  launchpad: {
    label: 'Launchpad',
    week1: [
      'Your CV and LinkedIn reviews are queued in the order payments came in.',
      'You get written feedback on both, then your 1-1 session to go through it.'
    ],
    steps: [
      'Join the WhatsApp group using the button above.',
      'Log in to your dashboard at cyber-grad.co.uk and download your UK CV template.',
      'Reply to this email with your latest CV and LinkedIn link.',
      'Book your 1-1 session through the link on your dashboard.'
    ]
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Check the Stripe-Signature header so nobody else can call this endpoint.
function verifySignature(raw, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const t = parts.t;
  const sigs = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gbp = pence => '£' + (pence / 100).toFixed(2);

async function sendEmail(apiKey, payload, idempotencyKey) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Stops duplicate emails if Stripe retries the webhook
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('Resend error: ' + JSON.stringify(await r.json().catch(() => ({}))));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  if (!secret || !resendKey) return res.status(500).json({ error: 'Not configured' });

  const raw = await readRawBody(req);
  if (!verifySignature(raw, req.headers['stripe-signature'], secret)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(raw.toString('utf8'));
  if (event.type !== 'checkout.session.completed') return res.status(200).json({ received: true });

  const session = event.data.object;
  if (session.payment_status !== 'paid') return res.status(200).json({ received: true, note: 'not paid yet' });

  const meta = session.metadata || {};
  const email = (session.customer_details && session.customer_details.email) || session.customer_email || meta.email;
  const name = meta.name || (session.customer_details && session.customer_details.name) || 'there';
  const university = meta.university || 'Not provided';
  const planKey = PLAN_INFO[meta.plan] ? meta.plan : 'industry-ready';
  const plan = PLAN_INFO[planKey];
  const amount = gbp(session.amount_total || 0);
  const paidAt = new Date((session.created || Date.now() / 1000) * 1000)
    .toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'short' });
  const cohortStart = process.env.COHORT_START_DATE || 'To be confirmed. I will email you the date as soon as it is locked.';

  try {
    // Step 3: welcome email to the student
    if (email) {
      await sendEmail(resendKey, {
        from: FROM,
        to: [email],
        reply_to: ADMIN_EMAIL,
        subject: `Welcome to CyberGrad ${plan.label}, ${name.split(' ')[0]}`,
        html: welcomeHtml({ firstName: name.split(' ')[0], plan, cohortStart })
      }, `welcome-${session.id}`);
    }

    // Step 4: admin notification
    await sendEmail(resendKey, {
      from: FROM,
      to: [ADMIN_EMAIL],
      subject: `New payment: ${name} (${plan.label}, ${amount})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0F172A;line-height:1.8">
        <h2 style="margin:0 0 12px">Payment received</h2>
        <table cellpadding="6" style="border-collapse:collapse">
          <tr><td><b>Student</b></td><td>${esc(name)}</td></tr>
          <tr><td><b>Email</b></td><td>${esc(email)}</td></tr>
          <tr><td><b>University</b></td><td>${esc(university)}</td></tr>
          <tr><td><b>Plan</b></td><td>${esc(plan.label)}</td></tr>
          <tr><td><b>Amount paid</b></td><td>${esc(amount)}</td></tr>
          <tr><td><b>Time</b></td><td>${esc(paidAt)} (UK)</td></tr>
          <tr><td><b>Stripe session</b></td><td>${esc(session.id)}</td></tr>
        </table></div>`
    }, `admin-${session.id}`);
  } catch (err) {
    console.error('stripe-webhook email error:', err);
    // 500 makes Stripe retry. The idempotency keys prevent double sends.
    return res.status(500).json({ error: 'Email failed' });
  }

  return res.status(200).json({ received: true });
};

// Stripe needs the raw body to check the signature, so turn off Vercel's body parser.
module.exports.config = { api: { bodyParser: false } };

function welcomeHtml({ firstName, plan, cohortStart }) {
  const li = a => a.map(x => `<li style="margin-bottom:8px">${esc(x)}</li>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">
  <div style="background:#1E40AF;border-radius:12px 12px 0 0;padding:22px 32px">
    <span style="font-size:18px;font-weight:800;color:#ffffff">CyberGrad</span>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #E2E8F0;border-top:none">
    <h1 style="font-size:24px;margin:0 0 14px;color:#0F172A">Welcome to CyberGrad ${esc(plan.label)}, ${esc(firstName)}.</h1>
    <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 20px">Your payment is confirmed and your place is secured. Here is everything you need to get started.</p>

    <a href="${WHATSAPP}" style="display:inline-block;background:#25D366;color:#ffffff;padding:13px 24px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px">Join the WhatsApp group</a>

    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1E40AF;margin-bottom:4px">Cohort start date</div>
      <div style="font-size:15px;color:#0F172A">${esc(cohortStart)}</div>
    </div>

    <h2 style="font-size:17px;margin:0 0 10px;color:#0F172A">What to expect in Week 1</h2>
    <ul style="font-size:14px;color:#475569;line-height:1.6;padding-left:20px;margin:0 0 24px">${li(plan.week1)}</ul>

    <h2 style="font-size:17px;margin:0 0 10px;color:#0F172A">Your next steps</h2>
    <ol style="font-size:14px;color:#475569;line-height:1.6;padding-left:20px;margin:0 0 24px">${li(plan.steps)}</ol>

    <a href="${SITE}/login.html" style="display:inline-block;background:#1E40AF;color:#ffffff;padding:13px 24px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:20px">Go to my dashboard</a>

    <p style="font-size:13px;color:#64748B;line-height:1.6;margin:0">Questions? Reply to this email. I read every one.<br>Rakesh, Founder, CyberGrad</p>
  </div>
  <div style="background:#F1F5F9;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center">
    <p style="font-size:12px;color:#64748B;margin:0">Guidance, not guarantees. · cyber-grad.co.uk</p>
  </div>
</div></body></html>`;
}
