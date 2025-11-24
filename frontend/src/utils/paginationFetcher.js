import { AWS_TAMS_ENDPOINT } from "@/constants";

const paginationFetcher = async (path, maxResults, api) => {
  const { get } = api;
  let response = await get(path);
  let records = response.data;
  
  while (response.nextLink && (!maxResults || records.length < maxResults)) {
    const nextPath = response.nextLink.slice(AWS_TAMS_ENDPOINT.length);
    response = await get(nextPath);
    records = records.concat(response.data);
  }
  
  if (maxResults) {
    records = records.slice(0, maxResults);
  }
  
  // Remove segments_updated field from record if present. This is required to avoid excessive re-renders for the flows view.
  return records.map(({ segments_updated, ...remainder }) => remainder);
};

export default paginationFetcher;
