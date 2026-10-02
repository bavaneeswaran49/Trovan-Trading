import { marketPath } from './client.js'
export const stocks = {
  search: query => marketPath('search', { query }),
  details: name => marketPath('stock', { name }),
  industry: query => marketPath('industry_search', { query }),
  history: (stock_name, period) => marketPath('historical_data', { stock_name, period, filter: 'price' }),
  stats: (stock_name, stats) => marketPath('historical_stats', { stock_name, stats }),
  statement: (stock_name, stats) => marketPath('statement', { stock_name, stats }),
  forecasts: params => marketPath('stock_forecasts', params),
  target: stock_id => marketPath('stock_target_price', { stock_id }),
  actions: stock_name => marketPath('corporate_actions', { stock_name }),
  announcements: stock_name => marketPath('recent_announcements', { stock_name }),
}
export const market = {
  trending: marketPath('trending'), highsLows: marketPath('fetch_52_week_high_low_data'),
  nse: marketPath('NSE_most_active'), bse: marketPath('BSE_most_active'), shockers: marketPath('price_shockers'),
  commodities: marketPath('commodities'), ipo: marketPath('ipo'), news: marketPath('news'),
}
export const funds = { list: marketPath('mutual_funds'), search: query => marketPath('mutual_fund_search', { query }),
  details: stock_name => marketPath('mutual_funds_details', { stock_name }) }
