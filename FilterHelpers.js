import React, { useState, useEffect } from 'react';

export default function FilterHelpers({ request }) {
  const [filters, setFilters] = useState({ language: '', expertise: '', minRating: 0 });
  const [helpers, setHelpers] = useState([]);

  function search() {
    fetch(`/api/helpers?language=${filters.language}&expertise=${filters.expertise}&minRating=${filters.minRating}`)
      .then(res => res.json())
      .then(setHelpers);
  }

  useEffect(() => { search(); }, [filters]);

  return (
    <div>
      <label>
        Language
        <input value={filters.language} onChange={e => setFilters(f => ({ ...f, language: e.target.value }))} />
      </label>
      <label>
        Expertise
        <input value={filters.expertise} onChange={e => setFilters(f => ({ ...f, expertise: e.target.value }))} />
      </label>
      <label>
        Min Rating
        <input type="number" value={filters.minRating} min="0" max="5"
          onChange={e => setFilters(f => ({ ...f, minRating: e.target.value }))} />
      </label>
      <ul>
        {helpers.map(h => (
          <li key={h._id}>
            {h.name} (⭐{h.rating.toFixed(2)}): {h.languages.join(', ')} | {h.expertise.join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}