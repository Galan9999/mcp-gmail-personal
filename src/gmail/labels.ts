import { gmailClient, withRetry } from './client.js';

export type LabelSummary = { id: string; name: string };
export type LabelColor = { backgroundColor: string; textColor: string };

export async function listLabels(): Promise<LabelSummary[]> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  return (data.labels ?? []).map((l) => ({ id: l.id ?? '', name: l.name ?? '' }));
}

export async function createLabel(name: string, color?: LabelColor): Promise<LabelSummary> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
      ...(color ? { color } : {}),
    },
  });
  return { id: data.id ?? '', name: data.name ?? name };
}

export async function renameLabel(labelId: string, name: string): Promise<LabelSummary> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.labels.patch({ userId: 'me', id: labelId, requestBody: { name } });
  return { id: data.id ?? labelId, name: data.name ?? name };
}

export async function setLabelColor(labelId: string, color: LabelColor): Promise<LabelSummary & LabelColor> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.labels.patch({ userId: 'me', id: labelId, requestBody: { color } });
  return {
    id: data.id ?? labelId,
    name: data.name ?? '',
    backgroundColor: data.color?.backgroundColor ?? '',
    textColor: data.color?.textColor ?? '',
  };
}

export async function modifyLabels(
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<{ id: string; labels: string[] }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
  return { id: messageId, labels: data.labelIds ?? [] };
}

/** batchModify admite 1000 ids por llamada; devuelve cuantos se han tocado. */
export async function bulkModify(
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const gmail = await gmailClient();
  for (let i = 0; i < ids.length; i += 1000) {
    const lote = ids.slice(i, i + 1000);
    await withRetry(() =>
      gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: lote, addLabelIds, removeLabelIds },
      }),
    );
  }
  return ids.length;
}
