import React, { useState } from 'react';
import { encryptFile } from '../utils/e2ee';

export default function SecureFileShare({ publicKey, onUploaded }) {
  const [file, setFile] = useState(null);

  async function handleFile(e) {
    const f = e.target.files[0];
    const buffer = await f.arrayBuffer();
    const encrypted = await encryptFile(buffer, publicKey);
    // Send encrypted to backend
    fetch('/api/files', {
      method: 'POST',
      body: encrypted, // You may need to convert to Blob
      headers: { 'Content-Type': 'application/octet-stream' }
    }).then(res => res.json()).then(onUploaded);
  }

  return (
    <div>
      <input type="file" onChange={handleFile} />
    </div>
  );
}