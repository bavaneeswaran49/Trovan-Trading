export const number = value => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const result = Number(typeof value === 'string' ? value.replace(/,/g, '').replace(/%$/, '') : value)
  return Number.isFinite(result) ? result : null
}
const currencyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
export function money(value) { const n = number(value); return n === null ? '—' : currencyFormat.format(n) }
export function numeric(value) { const n = number(value); return n === null ? '—' : numberFormat.format(n) }
export function label(key) { return key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) }
export function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null } catch { return null } }
export function stockRow(value) {
  return { name: value.company_name || value.company || value.companyName || value.commonName,
    symbol: value.ticker_id || value.ticker || value.tickerId || value.exchangeCodeNsi,
    price: value.price ?? value.currentPrice?.NSE ?? value.currentPrice?.BSE,
    change: value.percent_change ?? value.percentChange, volume: value.volume,
    high: value['52_week_high'] ?? value.year_high, low: value['52_week_low'] ?? value.year_low }
}
