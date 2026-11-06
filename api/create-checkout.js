// api/create-checkout.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  try {
    const { email, name, university, plan } = req.body;

    // Plan config
    const plans = {
      'industry-ready': {
        name: 'CyberGrad Industry-Ready',
        description: '4-week cohort programme: 6 live group sessions, 1-to-1 reviews, mock interview and UK job search strategy.',
        methods: ['card', 'klarna', 'afterpay_clearpay'],
        amount: 100, // £1.00 TEST PRICE. Change back to 12500 (£125) before real launch
        currency: 'gbp'
      },
      launchpad: {
        name: 'CyberGrad Launchpad',
        description: '1-to-1 CV review, 1-to-1 LinkedIn review, a personal 1-1 session and a UK CV template.',
        amount: 4000, // £40.00
        methods: ['card'], // one-time card payment only, no Klarna or Clearpay split payments
        currency: 'gbp'
      }
    };
    plans.foundation = plans['industry-ready']; // old links still work

    const planKey = plans[plan] ? (plan === 'foundation' ? 'industry-ready' : plan) : 'industry-ready';
    const selectedPlan = plans[planKey];

    // Create Stripe checkout session
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'customer_email': email || '',
        'line_items[0][price_data][currency]': selectedPlan.currency,
        'line_items[0][price_data][product_data][name]': selectedPlan.name,
        'line_items[0][price_data][product_data][description]': selectedPlan.description,
        'line_items[0][price_data][unit_amount]': selectedPlan.amount,
        'line_items[0][quantity]': '1',
        'success_url': 'https://www.cyber-grad.co.uk/success.html?session_id={CHECKOUT_SESSION_ID}',
        'cancel_url': 'https://www.cyber-grad.co.uk/pricing.html',
        'metadata[name]': name || '',
        'metadata[university]': university || '',
        'metadata[plan]': planKey,
        'metadata[email]': email || '',
        'billing_address_collection': 'auto',
        'allow_promotion_codes': 'true'
      }).toString() + selectedPlan.methods.map((m, i) => `&payment_method_types[${i}]=${m}`).join('')
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Stripe error:', session);
      return res.status(500).json({ error: session.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ url: session.url, id: session.id });

  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
