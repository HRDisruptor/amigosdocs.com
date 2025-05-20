import React, { useState } from 'react';

export default function ReviewForm({ helperId, requestId, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  function submit() {
    fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        helper: helperId,
        request: requestId,
        rating,
        comment
      })
    }).then(() => onSubmitted());
  }
  return (
    <div>
      <h3>Leave a Review</h3>
      <label>
        Rating:
        <select value={rating} onChange={e => setRating(Number(e.target.value))}>
          {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>
        Comment: <textarea value={comment} onChange={e => setComment(e.target.value)} />
      </label>
      <button onClick={submit}>Submit</button>
    </div>
  );
}