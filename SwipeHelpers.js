import React, { useState, useEffect } from 'react';

export default function SwipeHelpers({ request }) {
  const [helpers, setHelpers] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch(`/api/pairings/${request._id}`)
      .then(res => res.json())
      .then(setHelpers);
  }, [request]);

  function handleSwipe(direction) {
    // direction: 'left' = skip, 'right' = request help
    if (direction === 'right') {
      fetch(`/api/requests/${request._id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helperId: helpers[index]._id }),
      });
    }
    setIndex(index + 1);
  }

  if (!helpers.length || index >= helpers.length) return <div>No more helpers found</div>;

  const helper = helpers[index];
  return (
    <div>
      <h3>{helper.name} <span>{helper.badges.map(b => b.type).join(', ')}</span></h3>
      <p>Languages: {helper.languages.join(', ')}</p>
      <p>Expertise: {helper.expertise.join(', ')}</p>
      <p>Rating: {helper.rating.toFixed(2)} ⭐</p>
      <button onClick={() => handleSwipe('left')}>Skip</button>
      <button onClick={() => handleSwipe('right')}>Request Help</button>
    </div>
  );
}