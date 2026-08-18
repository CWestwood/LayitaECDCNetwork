interface QueryStateProps {
  loading: boolean;
  error?: Error | null;
  empty?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  onRetry?: () => void;
}

export function QueryState({
  loading,
  error,
  empty = false,
  loadingLabel = 'Loading…',
  emptyLabel = 'No records found.',
  onRetry,
}: QueryStateProps) {
  if (loading) return <div className="query-state" role="status">{loadingLabel}</div>;
  if (error) {
    return (
      <div className="query-state query-state--error" role="alert">
        <strong>This information could not be loaded.</strong>
        <span>{error.message}</span>
        {onRetry && <button type="button" className="lyt-btn" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (empty) return <div className="query-state">{emptyLabel}</div>;
  return null;
}
