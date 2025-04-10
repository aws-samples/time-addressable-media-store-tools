const parseLinkHeader = (header) => {
  if (!header) {
    return {};
  }
  const links = {};
  header.split(",").forEach((link) => {
    const section = link.split(";");
    if (section.length !== 2) {
      throw new Error("link could not be split on ';'");
    }
    const url = section[0].replace(/<(.*)>/, "$1").trim();
    const name = section[1].replace(/rel="(.*)"/, "$1").trim();
    links[name] = url;
  });
  return links;
};

export default parseLinkHeader;
