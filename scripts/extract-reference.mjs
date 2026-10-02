import fs from 'node:fs'
const html = fs.readFileSync('provider-reference.html', 'utf8')
for (const m of html.matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/gs)) {
  const a = JSON.parse(m[1])
  if (typeof a[1] !== 'string') continue
  const s = a[1], marker = '"openapi_spec":', start = s.indexOf(marker)
  if (start < 0) continue
  const i = start + marker.length
  let depth = 0, inString = false, escape = false
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (inString) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      const spec = JSON.parse(s.slice(i, j + 1))
      fs.mkdirSync('docs', { recursive: true })
      fs.writeFileSync('docs/indian-api-v1.openapi.json', JSON.stringify(spec, null, 2) + '\n')
      for (const [path, v] of Object.entries(spec.paths)) console.log(JSON.stringify({ path, parameters: v.get.parameters }))
      console.log(JSON.stringify(spec.components))
      break
    }
  }
}
