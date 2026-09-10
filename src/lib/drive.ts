export async function findOrCreateRootFolder(accessToken: string): Promise<string> {
  const FOLDER_NAME = 'Baudokumentationen (App)';
  
  // 1. Find if exists
  const query = encodeURIComponent(`name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) throw new Error('Failed to find root folder');
  const data = await response.json();
  
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  
  // 2. Create if not found
  const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });
  
  if (!metaRes.ok) throw new Error('Failed to create root folder');
  const fileMeta = await metaRes.json();
  return fileMeta.id;
}

export async function createSubFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      name, 
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  });
  
  if (!metaRes.ok) throw new Error('Failed to create sub folder');
  const fileMeta = await metaRes.json();
  return fileMeta.id;
}

export async function uploadFileToFolder(file: Blob, name: string, mimeType: string, parentId: string, accessToken: string): Promise<string> {
  const metadata = {
    name,
    parents: [parentId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file ${name}`);
  }
  
  const data = await response.json();
  return data.id;
}

