import { createApp } from './app.js'
import { getConfig } from './config.js'
import { createRedisStore } from './redisStore.js'
import { ApiError } from './indianApi/client.js'

export function createVercelHandler(env = process.env, options = {}) {
  let app
  return function handler(req, res) {
    try {
      if (!app) {
        const config = getConfig({ ...env, NODE_ENV: 'production', TRUST_PROXY: env.TRUST_PROXY || '1' })
        const store = options.store || createRedisStore(config, options.storeFetcher)
        app = createApp(config, { ...options, store, serveStatic: false }).app
      }
      // Vercel rewrites /api/* to this function. Remove the routing parameter
      // before passing provider query parameters to the existing strict schemas.
      const url = new URL(req.url, 'https://trovan.local')
      const routes = url.searchParams.getAll('__trovan_path')
      const route = routes[0] ?? req.query?.__trovan_path
      if (route !== undefined) {
        if (routes.length > 1 || typeof route !== 'string' || route.length > 256 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/.test(route)) {
          throw new ApiError(400, 'INVALID_ROUTE', 'This API route is invalid.')
        }
        url.pathname = `/api/${route}`
        url.searchParams.delete('__trovan_path')
        req.url = `${url.pathname}${url.search}`
      }
      // Vercel's lazy query helper captures the pre-rewrite URL. Express must
      // parse the normalized URL so routing metadata cannot reach the provider.
      for (const property of ['query', 'body']) if (Object.hasOwn(req, property)) delete req[property]
      for (const property of ['status', 'send', 'json', 'redirect']) if (Object.hasOwn(res, property)) delete res[property]
      return app(req, res)
    } catch (error) {
      const known = error instanceof ApiError
      res.statusCode = known ? error.status : 503
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ error: {
        code: known ? error.code : 'SERVER_NOT_CONFIGURED',
        message: known ? error.message : 'Server configuration is incomplete. Please contact the application administrator.',
      } }))
    }
  }
}
