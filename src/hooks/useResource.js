import { useQuery } from '@tanstack/react-query'
import { resourceOptions } from '../api/queryClient'

// All market screens share Query's cache, cancellation, and background refresh.
export function useResource(path) {
  const query = useQuery(resourceOptions(path))
  return {
    data: query.data?.data,
    meta: query.data,
    error: query.error,
    loading: Boolean(path) && query.isPending,
    refreshing: query.isFetching && !query.isPending,
    retry: () => query.refetch(),
  }
}
