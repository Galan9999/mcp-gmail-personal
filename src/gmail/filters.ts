import type { gmail_v1 } from 'googleapis';
import { gmailClient } from './client.js';

export type FilterCriteria = { from?: string; query?: string; subject?: string };

export type FilterSummary = {
  id: string;
  from?: string;
  query?: string;
  addLabelIds: string[];
  removeLabelIds: string[];
};

function toSummary(f: gmail_v1.Schema$Filter): FilterSummary {
  return {
    id: f.id ?? '',
    from: f.criteria?.from ?? undefined,
    query: f.criteria?.query ?? undefined,
    addLabelIds: f.action?.addLabelIds ?? [],
    removeLabelIds: f.action?.removeLabelIds ?? [],
  };
}

export async function listFilters(): Promise<FilterSummary[]> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.settings.filters.list({ userId: 'me' });
  return (data.filter ?? []).map(toSummary);
}

export async function createFilter(
  criteria: FilterCriteria,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<FilterSummary> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.settings.filters.create({
    userId: 'me',
    requestBody: { criteria, action: { addLabelIds, removeLabelIds } },
  });
  return toSummary(data);
}

export async function deleteFilter(filterId: string): Promise<{ id: string }> {
  const gmail = await gmailClient();
  await gmail.users.settings.filters.delete({ userId: 'me', id: filterId });
  return { id: filterId };
}
