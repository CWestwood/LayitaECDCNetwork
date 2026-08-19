import { useId, useMemo, useState } from 'react';
import type { NamedOption } from './model';
import { similaritySuggestions } from './model';

interface SearchableSelectorProps {
  label: string;
  options: NamedOption[];
  selectedIds: string[];
  multiple?: boolean;
  required?: boolean;
  error?: string;
  onChange: (ids: string[]) => void;
  onNotFound: (name: string) => void;
}

export default function SearchableSelector({
  label,
  options,
  selectedIds,
  multiple = false,
  required = false,
  error,
  onChange,
  onNotFound,
}: SearchableSelectorProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const selected = options.filter((option) => selectedIds.includes(option.id));
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options.filter((option) => !selectedIds.includes(option.id)).slice(0, 8);
    return options
      .filter((option) => !selectedIds.includes(option.id))
      .filter((option) => `${option.name} ${option.detail ?? ''}`.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [options, query, selectedIds]);
  const suggestions = useMemo(
    () => similaritySuggestions(query, options.filter((option) => !selectedIds.includes(option.id))),
    [options, query, selectedIds],
  );

  const choose = (option: NamedOption) => {
    onChange(multiple ? [...selectedIds, option.id] : [option.id]);
    setQuery('');
  };

  return (
    <div className={`capture-selector ${error ? 'capture-field--error' : ''}`}>
      <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      {selected.length > 0 && (
        <ul className="capture-selector__selected" aria-label={`Selected ${label.toLowerCase()}`}>
          {selected.map((option) => (
            <li key={option.id}>
              <span><strong>{option.name}</strong>{option.detail ? <small>{option.detail}</small> : null}</span>
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== option.id))}
                aria-label={`Remove ${option.name}`}
              >×</button>
            </li>
          ))}
        </ul>
      )}
      {(!selected.length || multiple) && (
        <>
          <input
            id={id}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()} by name`}
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          {query.trim() && (
            <div className="capture-selector__menu">
              {filtered.length > 0 ? (
                <ul aria-label={`${label} search results`}>
                  {filtered.map((option) => (
                    <li key={option.id}>
                      <button type="button" onClick={() => choose(option)}>
                        <strong>{option.name}</strong>
                        {option.detail ? <small>{option.detail}</small> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p>No matching records.</p>}
              <button type="button" className="capture-selector__not-found" onClick={() => onNotFound(query.trim())}>
                I cannot find “{query.trim()}” — request review
              </button>
            </div>
          )}
        </>
      )}
      {query.trim() && suggestions.length > 0 && (
        <div className="capture-similarity" role="status">
          <strong>Check for a possible existing match:</strong>
          {suggestions.map((option) => (
            <button type="button" key={option.id} onClick={() => choose(option)}>
              {option.name}{option.detail ? ` — ${option.detail}` : ''}
            </button>
          ))}
        </div>
      )}
      {error ? <p className="capture-error" id={`${id}-error`}>{error}</p> : null}
    </div>
  );
}
