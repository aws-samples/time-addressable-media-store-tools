import { AWS_TAMS_ENDPOINT } from "@/constants";
import { useApi } from "@/hooks/useApi";

const paginationFetcher = async (path) => {
  const { get } = useApi();
  let response = await get(path);
  let records = await response.data;
  while (response.nextLink) {
    const nextPath = response.nextLink.slice(AWS_TAMS_ENDPOINT.length);
    response = await get(nextPath);
    records = records.concat(response.data);
  }
  return records;
};

export default paginationFetcher;
