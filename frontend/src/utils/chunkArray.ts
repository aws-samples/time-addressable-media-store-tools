const chunkArray = <T>(fullArray: T[], chunkCount: number): T[][] => {
  const chunkSize = Math.ceil(fullArray.length / chunkCount);

  const chunks = fullArray.reduce((chunkedArray, item, index) => {
    const chunkIndex = Math.floor(index / chunkSize);
    if (!chunkedArray[chunkIndex]) {
      chunkedArray[chunkIndex] = [];
    }
    chunkedArray[chunkIndex].push(item);
    return chunkedArray;
  }, [] as T[][]);
  return chunks;
};

export default chunkArray;
