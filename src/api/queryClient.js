import { QueryClient, queryOptions } from '@tanstack/react-query'
import { api } from './client.js'

export const sessionKey = ['auth', 'session']
export const marketKey = ['market']
export function authConfigOptions() {
  return queryOptions({
    queryKey: ['auth', 'config'],
    // This GET sets the challenge cookie. Let a brief React remount share the
    // same response rather than aborting it and issuing a second cookie write.
    queryFn: () => api('/api/auth/config'),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (attempt, error) => attempt < 1 && !['API_NOT_CONFIGURED', 'API_AUTH_FAILED', 'INVALID_RESPONSE'].includes(error.code) && (error.status === 0 || error.status >= 500),
      retryDelay: 1500,
    },
    mutations: { retry: false },
  },
})

export function resourceOptions(path) {
  return queryOptions({
    queryKey: [...marketKey, path],
    queryFn: ({ signal }) => api(path, { signal }),
    enabled: Boolean(path),
    staleTime: /\/api\/(indianapi|market)\/(news|mutual_funds)/.test(path || '') ? 5 * 60_000 : 60_000,
  })
}

export async function resetSession(user = null) {
  await queryClient.cancelQueries()
  queryClient.removeQueries({ queryKey: marketKey })
  queryClient.removeQueries({ queryKey: ['auth', 'config'] })
  queryClient.setQueryData(sessionKey, { user })
}
