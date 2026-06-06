import { getUncachableStripeClient } from './stripeClient.js';

async function createSubscriptionProduct() {
  try {
    const stripe = await getUncachableStripeClient();

    console.log('Verificando se o produto já existe...');
    const existing = await stripe.products.search({
      query: "name:'Plano Pro BarberApp' AND active:'true'"
    });

    if (existing.data.length > 0) {
      console.log('Produto já existe:', existing.data[0].id);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      for (const p of prices.data) {
        console.log(`Preço: ${p.id} — ${p.unit_amount} ${p.currency}/${p.recurring?.interval}`);
      }
      return;
    }

    console.log('Criando produto...');
    const product = await stripe.products.create({
      name: 'Plano Pro BarberApp',
      description: 'Acesso completo ao painel da barbearia: agendamentos, fila, financeiro, personalização.',
    });
    console.log('Produto criado:', product.id);

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 4990,
      currency: 'brl',
      recurring: { interval: 'month' },
    });
    console.log('Preço mensal criado:', monthlyPrice.id, '— R$ 49,90/mês');

    console.log('\nPronto! IDs criados:');
    console.log('  Produto:', product.id);
    console.log('  Preço mensal:', monthlyPrice.id);
  } catch (err) {
    console.error('Erro:', err);
    process.exit(1);
  }
}

createSubscriptionProduct();
