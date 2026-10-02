// Synthetic Redis REST implementation used only by isolated tests.
export function redisFixture() {
  const values = new Map(), calls = []
  let now = Date.now()
  function get(key) {
    const entry = values.get(key)
    if (entry?.expires <= now) { values.delete(key); return null }
    return entry?.value ?? null
  }
  function execute([command, key, value, ...args]) {
    if (command === 'GET') return get(key)
    if (command === 'GETDEL') { const result = get(key); values.delete(key); return result }
    if (command === 'DEL') return values.delete(key) ? 1 : 0
    if (command === 'SET') {
      if (args.includes('NX') && get(key) !== null) return null
      const expiry = args.indexOf('EX')
      values.set(key, { value, expires: expiry === -1 ? Infinity : now + Number(args[expiry + 1]) * 1000 })
      return 'OK'
    }
    throw new Error('Unexpected test command')
  }
  return {
    values, calls,
    advance(milliseconds) { now += milliseconds },
    async fetcher(url, options) {
      const commands = JSON.parse(options.body)
      calls.push({ url, options, commands })
      const result = url.endsWith('/multi-exec') ? commands.map(command => ({ result: execute(command) })) : { result: execute(commands) }
      return Response.json(result)
    },
  }
}
