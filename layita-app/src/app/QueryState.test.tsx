import { fireEvent, render, screen } from '@testing-library/react';
import { QueryState } from './QueryState';

describe('QueryState', () => {
  it('keeps an API failure distinct from an empty result and allows retry', () => {
    const retry = vi.fn();
    render(<QueryState loading={false} error={new Error('Permission denied')} empty onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.queryByText('No records found.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
