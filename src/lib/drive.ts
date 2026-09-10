const FILE_NAME = 'drive_sync_notes_data.json';

export async function findSyncFile(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error('Failed to find file');
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

export async function readSyncFile(fileId: string, accessToken: string): Promise<any> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error('Failed to read file');
  return await response.json();
}

export async function createSyncFile(content: any, accessToken: string): Promise<void> {
  const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' })
  });
  if (!metaRes.ok) throw new Error('Failed to create file metadata');
  const fileMeta = await metaRes.json();
  
  await updateSyncFile(fileMeta.id, content, accessToken);
}

export async function updateSyncFile(fileId: string, content: any, accessToken: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(content)
  });
  if (!response.ok) throw new Error('Failed to update file content');
}

export async function syncToDrive(content: any, accessToken: string): Promise<void> {
  const fileId = await findSyncFile(accessToken);
  if (fileId) {
    await updateSyncFile(fileId, content, accessToken);
  } else {
    await createSyncFile(content, accessToken);
  }
}

export async function loadFromDrive(accessToken: string): Promise<any | null> {
  const fileId = await findSyncFile(accessToken);
  if (fileId) {
    return await readSyncFile(fileId, accessToken);
  }
  return null;
}
