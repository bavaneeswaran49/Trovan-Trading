import { readFileSync } from 'node:fs'
import { z } from 'zod'

// Exact v1 request contracts captured from the provider's official API reference.
const spec = JSON.parse(readFileSync(new URL('../../docs/indian-api-v1.openapi.json', import.meta.url), 'utf8'))
const text = z.string().trim().min(1).max(160).refine(value => ![...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
export const contracts = Object.fromEntries(Object.entries(spec.paths).map(([path, value]) => {
  const fields = Object.fromEntries((value.get.parameters || []).map(parameter => {
    const schema = parameter.schema.$ref ? spec.components.schemas[parameter.schema.$ref.split('/').at(-1)] : parameter.schema
    const validator = schema.enum ? z.enum(schema.enum) : text
    return [parameter.name, parameter.required ? validator : validator.optional()]
  }))
  return [path.slice(1), z.strictObject(fields)]
}))

export const searchContract = z.strictObject({ query: text })
const object = z.record(z.string(), z.unknown())
const scalarNumber = z.union([z.string(), z.number()]).nullable().optional()
const stock = z.object({ companyName: z.string().min(1), tickerId: z.union([z.string(), z.number()]).optional(), industry: z.string().nullable().optional(),
  currentPrice: z.object({ NSE: scalarNumber, BSE: scalarNumber }).passthrough().optional(), percentChange: scalarNumber,
  yearHigh: scalarNumber, yearLow: scalarNumber }).passthrough()
const history = z.object({ datasets: z.array(z.object({ metric: z.string(), label: z.string().optional(),
  values: z.array(z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number(), z.null()])]).rest(z.unknown())) }).passthrough()) }).passthrough()
const stocks = z.array(object)
const marketRows = z.array(z.object({ company: z.string().optional(), company_name: z.string().optional(), ticker: z.string().optional(),
  ticker_id: z.string().optional(), price: scalarNumber, percent_change: scalarNumber, volume: scalarNumber,
  year_high: scalarNumber, year_low: scalarNumber }).passthrough())
export function validateResponse(endpoint, data) {
  // The v1 OpenAPI declares {} responses for many routes. Preserve these fields
  // rather than inventing a schema. Critical documented shapes are checked here.
  const schema = endpoint === 'stock' ? stock : endpoint === 'historical_data' ? history
    : endpoint === 'industry_search' ? z.array(z.object({ id: z.string(), commonName: z.string(), exchangeCodeNsi: z.string().nullable().optional(), mgIndustry: z.string().nullable().optional() }).passthrough())
    : endpoint === 'mutual_fund_search' ? z.array(z.object({ id: z.string(), schemeName: z.string(), schemeType: z.string().nullable().optional(), isin: z.string().nullable().optional() }).passthrough())
    : ['NSE_most_active', 'BSE_most_active', 'price_shockers'].includes(endpoint) ? marketRows
    : endpoint === 'commodities' ? stocks
    : endpoint === 'fetch_52_week_high_low_data' ? z.object({ NSE_52WeekHighLow: z.object({ high52Week: marketRows, low52Week: marketRows }).optional(),
      BSE_52WeekHighLow: z.object({ high52Week: marketRows, low52Week: marketRows }).optional() }).passthrough()
    : endpoint === 'trending' ? z.object({ trending_stocks: z.object({ top_gainers: marketRows, top_losers: marketRows }).passthrough() }).passthrough()
    : z.union([object, stocks])
  return schema.safeParse(data)
}
