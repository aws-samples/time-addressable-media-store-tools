import { AWS_TAMS_ENDPOINT } from "@/constants";
import type { ApiClient } from "@/types/utils";

const paginationFetcher = async <T extends Record<string, unknown>>(
  path: string,
  api: ApiClient,
  maxResults?: number,
): Promise<T[]> => {
  const { get } = api;
  let response = await get<T[]>(path);
  let records = response.data;

  while (response.nextLink && (!maxResults || records.length < maxResults)) {
    const nextPath = response.nextLink.slice(AWS_TAMS_ENDPOINT.length);
    response = await get<T[]>(nextPath);
    records = records.concat(response.data);
  }

  if (maxResults) {
    records = records.slice(0, maxResults);
  }

  // Remove segments_updated field to avoid excessive re-renders
  return records.map((record) => {
    const copy = { ...record };
    delete copy.segments_updated;
    return copy;
  }) as T[];
};

export default paginationFetcher;
