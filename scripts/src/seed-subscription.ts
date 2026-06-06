import { getUncachableStripeClient } from './stripeClient.js';

const PLANS = [
  { name: 'BarberApp — 1 Profissional', amount: 2490, maxBarbers: 1, description: 'Para barbearias com 1 profissional.' },
  { name: 'BarberApp — 2 Profissionais', amount: 4990, maxBarbers: 2, description: 'Para barbearias com até 2 profissionais.' },
  { name: 'BarberApp — 3 Profissionais', amount: 7490, maxBarbers: 3, description: 'Para barbearias com até 3 profissionais.' },
  { name: 'BarberApp — Ilimitado', amount: 9990, maxBarbers: 0, description: 'Para barbearias com 4 ou mais profissionais. Sem limites.' },
];

async function seedSubscriptions() {
  try {
    const stripe = await getUncachableStripeClient();

    console.log('Criando planos de assinatura BarberApp...\n');

    for (const plan of PLANS) {
      const label = plan.maxBarbers === 0 ? 'ilimitado' : `${plan.maxBarbers} profissional(is)`;
      const price = (plan.amount / 100).toFixed(2).replace('.', ',');

      console.log(`Verificando: ${plan.name}...`);
      const existing = await stripe.products.search({
        query: `name:'${plan.name}' AND active:'true'`,
      });

      if (existing.data.length > 0) {
        const prod = existing.data[0];
        const prices = await stripe.prices.list({ product: prod.id, active: true });
        const p = prices.data[0];
        console.log(`  ✓ Já existe | product: ${prod.id} | price: ${p?.id} | R$ ${price}/mês (${label})\n`);
        continue;
      }

      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: {
          maxBarbers: String(plan.maxBarbers),
        },
      });

      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.amount,
        currency: 'brl',
        recurring: { interval: 'month' },
      });

      console.log(`  ✓ Criado | product: ${product.id} | price: ${stripePrice.id} | R$ ${price}/mês (${label})\n`);
    }

    console.log('Pronto! Todos os planos foram configurados.');
  } catch (err) {
    console.error('Erro:', err);
    process.exit(1);
  }
}

seedSubscriptions();
