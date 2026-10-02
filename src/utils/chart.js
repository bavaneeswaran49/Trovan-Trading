import { number } from './format.js'

// Keep each bucket's extremes so long price series stay light without hiding spikes.
export function samplePrices(values, budget = 800) {
  if (values.length <= budget) return values
  const buckets = Math.max(1, Math.floor((budget - 2) / 2))
  const width = (values.length - 2) / buckets
  const result = [values[0]]
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = 1 + Math.floor(bucket * width), end = Math.min(values.length - 1, 1 + Math.floor((bucket + 1) * width))
    let min = start, max = start
    for (let i = start + 1; i < end; i++) {
      if (number(values[i][1]) < number(values[min][1])) min = i
      if (number(values[i][1]) > number(values[max][1])) max = i
    }
    for (const index of [...new Set([min, max])].sort((a, b) => a - b)) result.push(values[index])
  }
  result.push(values.at(-1))
  return result
}

export function priceSeries(data) {
  const datasets = data?.datasets || [], prices = datasets.find(dataset => dataset.metric === 'Price')
  const values = (prices?.values || []).filter(value => number(value[1]) !== null && !Number.isNaN(Date.parse(String(value[0])))).toSorted((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
  if (!values.length) return null
  let min = Infinity, max = -Infinity
  for (const value of values) { const price = number(value[1]); min = Math.min(min, price); max = Math.max(max, price) }
  const spread = max - min || Math.abs(max) * .02 || 1, low = min - spread * .12, high = max + spread * .12
  const firstTime = Date.parse(values[0][0]), duration = Date.parse(values.at(-1)[0]) - firstTime || 1
  const x = value => 18 + (Date.parse(value[0]) - firstTime) / duration * 690
  const y = value => 252 - (number(value) - low) / (high - low) * 226
  const points = samplePrices(values)
  const line = points.map((value, index) => `${index ? 'L' : 'M'}${x(value).toFixed(2)},${y(value[1]).toFixed(2)}`).join(' ')
  const volume = datasets.find(dataset => dataset.metric === 'Volume')
  const volumes = new Map((volume?.values || []).map(value => [String(value[0]), value[1]]))
  return { values, prices, low, high, x, y, line, volumes, hasVolume: Boolean(volume), firstTime, duration,
    positive: number(values.at(-1)[1]) >= number(values[0][1]) }
}

export function closestPrice(values, timestamp) {
  let left = 0, right = values.length - 1
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (Date.parse(values[middle][0]) < timestamp) left = middle + 1
    else right = middle
  }
  return left > 0 && timestamp - Date.parse(values[left - 1][0]) < Date.parse(values[left][0]) - timestamp ? left - 1 : left
}
