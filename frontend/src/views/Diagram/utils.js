import { formatPrecedence, nodeSize } from "./constants";

import { useApi } from "@/hooks/useApi";

const getEntities = async (path, graph = {}) => {
  const { get } = useApi();

  // If we've already processed this path, return
  if (graph[path]) return graph;

  // Fetch current path data
  const { data: resp } = await get(path);
  graph[path] = resp;

  // Collect all promises for parallel execution
  const promises = [];

  if (resp.source_id) {
    const sourcePath = `/sources/${resp.source_id}`;
    if (!graph[sourcePath]) {
      promises.push(getEntities(sourcePath, graph));
    }
  } else {
    // Handle source flows in parallel
    const { data: source_flows } = await get(`/flows?source_id=${resp.id}`);
    source_flows.forEach((flow) => {
      const flowPath = `/flows/${flow.id}`;
      graph[flowPath] = flow;
    });
  }

  // Handle collected_by
  if (resp.collected_by) {
    const type = resp.source_id ? "flows" : "sources";
    const collectedPromises = resp.collected_by
      .filter((collection) => !graph[`/${type}/${collection}`])
      .map((collection) => getEntities(`/${type}/${collection}`, graph));
    promises.push(...collectedPromises);
  }

  // Handle flow collections
  if (resp.flow_collection) {
    const flowPromises = resp.flow_collection
      .filter((collection) => !graph[`/flows/${collection.id}`])
      .map((collection) => getEntities(`/flows/${collection.id}`, graph));
    promises.push(...flowPromises);
  }

  // Handle source collections
  if (resp.source_collection) {
    const sourcePromises = resp.source_collection
      .filter((collection) => !graph[`/sources/${collection.id}`])
      .map((collection) => getEntities(`/sources/${collection.id}`, graph));
    promises.push(...sourcePromises);
  }

  // Wait for all recursive calls to complete
  await Promise.all(promises);

  return graph;
};

const getPositions = (entities) => {
  const nodeSpacing = {
    horizontal: 30,
    vertical: 15,
  };
  const rows = [
    entities
      .filter(
        (elem) => !elem.source_id && elem.format === "urn:x-nmos:format:multi"
      )
      .map((elem) => elem.id),
    formatPrecedence
      .map((format) =>
        entities
          .filter((elem) => !elem.source_id && elem.format === format)
          .map((elem) => elem.id)
      )
      .flat(),
    entities
      .filter(
        (elem) => elem.source_id && elem.format === "urn:x-nmos:format:multi"
      )
      .map((elem) => elem.id),
    formatPrecedence
      .map((format) =>
        entities
          .filter((elem) => elem.source_id && elem.format === format)
          .map((elem) => elem.id)
      )
      .flat(),
  ];
  const rowLength = Math.max(...rows.map((row) => row.length));
  return Object.fromEntries(
    rows.flatMap((row, y) =>
      row.map((id, x) => [
        id,
        {
          x:
            (nodeSize.width + nodeSpacing.horizontal) *
            ((rowLength - row.length) / 2 + x),
          y: (nodeSize.height + nodeSpacing.vertical) * y,
        },
      ])
    )
  );
};

export const getElements = async (path) => {
  // Get a list of all Sources and Flows related to the input entity.
  const entities = await getEntities(path).then((graph) =>
    Object.values(graph)
  );
  const positions = getPositions(entities);

  // Create a lookup to allow translation of flowId -> sourceId
  const flowSourceMap = Object.fromEntries(
    entities
      .filter((elem) => elem.source_id)
      .map((flow) => [flow.id, flow.source_id])
  );

  // Create list of Elements representing the nodes alone
  const nodes = entities.map((node) => {
    const type = node.source_id ? "flow" : "source";
    return {
      data: {
        id: `${type}s/${node.id}`,
        label: `${type.toUpperCase()} (${node.format.split(":")[3]})\n\nid: ${
          node.id
        }\n\ndesc: ${node.description}\n\nlabel: ${node.label}`,
      },
      selectable: false,
      selected: node.id == path.split("/")[2],
      classes: [type, node.format.split(":")[3]],
      position: positions[node.id],
    };
  });

  // Create list of elements representing the collects relationships, either for Flows or Sources
  const collectsEdges = entities
    .filter((elem) => elem.source_id)
    .flatMap((flow) =>
      flow.flow_collection?.flatMap((col) => [
        {
          data: {
            source: `flows/${flow.id}`,
            target: `flows/${col.id}`,
            id: `${flow.id}|${col.id}`,
          },
          classes: ["collects"],
        },
        {
          data: {
            source: `sources/${flowSourceMap[flow.id]}`,
            target: `sources/${flowSourceMap[col.id]}`,
            id: `${flowSourceMap[flow.id]}|${flowSourceMap[col.id]}`,
          },
          classes: ["collects", "implied"],
        },
      ])
    )
    .filter((elem) => elem)
    .filter(
      (value, index, self) =>
        index === self.findIndex((t) => t.data.id === value.data.id)
    );

  // Create list of elements representing the represents relationships
  const representsEdges = entities
    .filter((elem) => elem.source_id)
    .map((flow) => ({
      data: {
        source: `flows/${flow.id}`,
        target: `sources/${flow.source_id}`,
        id: `${flow.id}|${flow.source_id}`,
      },
      classes: ["represents"],
    }));

  // return combined list of all elements
  return [...nodes, ...collectsEdges, ...representsEdges];
};

export default getElements;
