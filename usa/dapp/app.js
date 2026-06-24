'use strict';

const CFG = window.USA_DAPP_CONFIG || {};
const USA = CFG.USA || 'TKynrUF8Az2RUUjCLWKHqxcMswaNnUnUSa';
const USDT = CFG.USDT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const POOL = CFG.POOL || 'TDWfZVJUcjMFAtuTmF2qtNqgHoMpLRNDBk';
const USA_SALE = (CFG.USA_SALE || '').trim();
const USA_PER_USDT = Number(CFG.USA_PER_USDT || 1000);

const GECKO_TOKEN = `https://api.geckoterminal.com/api/v2/networks/tron/tokens/${USA}`;
const GECKO_POOL = `https://api.geckoterminal.com/api/v2/networks/tron/pools/${POOL}`;

const SALE_ABI = [
  {
    name: 'buy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'usdtAmount', type: 'uint256' }, { name: 'recipient', type: 'address' }],
    outputs: [],
  },
  {
    name: 'quoteUsa',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'usdtAmount', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'usaStock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
];

const $ = (id) => document.getElementById(id);

let geckoLogoUrl = '';

function logoUrl() {
  return geckoLogoUrl || new URL('logo-100.png', window.location.href).href;
}

function applyLogo(url) {
  if (!url) return;
  geckoLogoUrl = url;
  $('heroLogo').src = url;
  $('usaRowLogo').src = url;
}

function setStatus(el, text, ok) {
  el.textContent = text;
  el.className = 'status ' + (ok ? 'ok' : text ? 'err' : '');
}

async function waitTronWeb(ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (window.tronWeb?.ready && window.tronWeb.defaultAddress?.base58) {
      return window.tronWeb;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function fetchGeckoMeta() {
  try {
    const r = await fetch(GECKO_TOKEN, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    const a = j?.data?.attributes;
    if (!a) throw new Error('Gecko token vazio');

    if (a.image_url) applyLogo(a.image_url);

    const usd = a.price_usd ? Number(a.price_usd).toFixed(4) + ' USD' : '—';
    $('usaPriceUsd').textContent = usd;

    const pr = await fetch(GECKO_POOL, { headers: { Accept: 'application/json' } });
    const pj = await pr.json();
    const poolPx = pj?.data?.attributes?.base_token_price_quote_token;
    $('usaPrice').textContent = poolPx ? Number(poolPx).toFixed(4) + ' USDT (pool)' : usd;

    $('geckoStatus').textContent = 'GeckoTerminal OK';
    $('geckoStatus').className = 'status ok';
  } catch (e) {
    $('geckoStatus').textContent = 'Gecko offline — logo local';
    $('geckoStatus').className = 'status err';
  }
}

async function connect() {
  setStatus($('connectStatus'), 'Conectando…', true);
  try {
    if (window.tronLink?.request) {
      await window.tronLink.request({ method: 'tron_requestAccounts' });
    }
    const tw = await waitTronWeb();
    if (!tw) throw new Error('TronLink não injetou tronWeb — abra no DApp Explorer');
    const addr = tw.defaultAddress.base58;
    $('walletAddr').textContent = addr;
    $('recipient').placeholder = addr;
    $('connectCard').classList.add('hidden');
    $('walletCard').classList.remove('hidden');
    setStatus($('connectStatus'), 'Conectado', true);
    await refresh(tw);
    await updateSaleQuote();
  } catch (e) {
    setStatus($('connectStatus'), e.message || String(e), false);
  }
}

async function refresh(tw) {
  tw = tw || window.tronWeb;
  const addr = tw.defaultAddress.base58;
  tw.setAddress(addr);
  const trx = await tw.trx.getBalance(addr);
  $('balTrx').textContent = (trx / 1e6).toFixed(4);

  const usdt = await tw.contract().at(USDT);
  const u = await usdt.balanceOf(addr).call();
  $('balUsdt').textContent = (Number(u.toString()) / 1e6).toFixed(4);

  const usa = await tw.contract().at(USA);
  const a = await usa.balanceOf(addr).call();
  $('balUsa').textContent = (Number(a.toString()) / 1e18).toFixed(4);
}

async function updateSaleQuote() {
  const usdtIn = Number($('usdtIn').value || 1);
  const usaOut = usdtIn * USA_PER_USDT;
  $('saleQuote').textContent = `${usdtIn} USDT → ${usaOut} USA`;

  if (!USA_SALE || !window.tronWeb?.ready) return;
  try {
    const sale = window.tronWeb.contract(SALE_ABI, USA_SALE);
    const raw = BigInt(Math.round(usdtIn * 1e6));
    const q = await sale.quoteUsa(raw.toString()).call();
    const stock = await sale.usaStock().call();
    $('saleQuote').textContent = `${usdtIn} USDT → ${(Number(q.toString()) / 1e18).toFixed(2)} USA`;
    $('saleStock').textContent = `Estoque sale: ${(Number(stock.toString()) / 1e18).toFixed(0)} USA`;
  } catch {
  }
}

async function watchAsset() {
  setStatus($('watchStatus'), 'Aguardando TronLink…', true);
  try {
    const tw = await waitTronWeb(3000);
    if (!tw?.request) throw new Error('wallet_watchAsset indisponível');
    await tw.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'TRC20',
        options: {
          address: USA,
          symbol: 'USA',
          decimals: 18,
          image: logoUrl(),
        },
      },
    });
    setStatus($('watchStatus'), 'Pedido enviado — confirme no TronLink', true);
  } catch (e) {
    setStatus($('watchStatus'), e.message || String(e), false);
  }
}

async function buySale() {
  setStatus($('saleStatus'), '…', true);
  try {
    if (!USA_SALE) throw new Error('USASale ainda não deployado — aguarde config');
    const tw = await waitTronWeb(3000);
    if (!tw) throw new Error('Conecte TronLink');

    const buyer = tw.defaultAddress.base58;
    const recipient = ($('recipient').value || '').trim() || buyer;
    const usdtIn = Number($('usdtIn').value || 1);
    if (usdtIn <= 0) throw new Error('USDT inválido');

    const usdtRaw = BigInt(Math.round(usdtIn * 1e6)).toString();
    const usdt = await tw.contract().at(USDT);
    const allowance = await usdt.allowance(buyer, USA_SALE).call();
    if (BigInt(allowance.toString()) < BigInt(usdtRaw)) {
      setStatus($('saleStatus'), 'Aprove USDT…', true);
      await usdt.approve(USA_SALE, usdtRaw).send({ feeLimit: 100_000_000 });
    }

    const sale = tw.contract(SALE_ABI, USA_SALE);
    setStatus($('saleStatus'), 'Assine buy no TronLink…', true);
    await sale.buy(usdtRaw, recipient).send({ feeLimit: 200_000_000 });
    setStatus($('saleStatus'), `OK — ${recipient} recebe USA`, true);
    await refresh(tw);
  } catch (e) {
    setStatus($('saleStatus'), e.message || String(e), false);
  }
}

function setupSaleCard() {
  if (!USA_SALE) {
    $('saleCard').classList.add('muted');
    setStatus($('saleStatus'), 'Sale em breve (deploy USASale)', false);
    return;
  }
  $('saleAddr').textContent = USA_SALE;
}

$('btnConnect').addEventListener('click', connect);
$('btnRefresh').addEventListener('click', () => refresh());
$('btnWatch').addEventListener('click', watchAsset);
$('btnBuy').addEventListener('click', buySale);
$('usdtIn').addEventListener('input', () => updateSaleQuote());

setupSaleCard();
fetchGeckoMeta();

if (window.tronWeb?.ready) {
  connect();
}
