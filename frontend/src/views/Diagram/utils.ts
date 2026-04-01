import { formatPrecedence, nodeSize } from "./constants";
import type { Flow, Source } from "@/types/tams";
import type { ApiClient } from "@/types/utils";

type Entity = Flow | Source;
type EntityGraph = Record<string, Entity>;

const isFlow = (entity: Entity): entity is Flow => {
  return "source_id" in entity;
};

const getEntities = async (
  api: ApiClient,
  path: string,
  graph: EntityGraph = {},
) => {
  // If we've already processed this path, return
  if (graph[path]) return graph;

  // Fetch current path data
  const { data: resp } = await api.get<Entity>(path);
  graph[path] = resp;

  // Collect all promises for parallel execution
  const promises = [];

  if (isFlow(resp)) {
    const sourcePath = `/sources/${resp.source_id}`;
    if (!graph[sourcePath]) {
      promises.push(getEntities(api, sourcePath, graph));
    }
  } else {
    // Handle source flows in parallel
    const { data: source_flows } = await api.get<Flow[]>(
      `/flows?source_id=${resp.id}`,
    );
    source_flows.forEach((flow) => {
      const flowPath = `/flows/${flow.id}`;
      graph[flowPath] = flow;
    });
  }

  // Handle collected_by
  if (resp.collected_by) {
    const type = isFlow(resp) ? "flows" : "sources";
    const collectedPromises = resp.collected_by
      .filter((collection) => !graph[`/${type}/${collection}`])
      .map((collection) => getEntities(api, `/${type}/${collection}`, graph));
    promises.push(...collectedPromises);
  }

  // Handle flow collections
  if (isFlow(resp) && resp.flow_collection) {
    const flowPromises = resp.flow_collection
      .filter((collection) => !graph[`/flows/${collection.id}`])
      .map((collection) => getEntities(api, `/flows/${collection.id}`, graph));
    promises.push(...flowPromises);
  }

  // Handle source collections
  if (!isFlow(resp) && resp.source_collection) {
    const sourcePromises = resp.source_collection
      .filter((collection) => !graph[`/sources/${collection.id}`])
      .map((collection) =>
        getEntities(api, `/sources/${collection.id}`, graph),
      );
    promises.push(...sourcePromises);
  }

  // Wait for all recursive calls to complete
  await Promise.all(promises);

  return graph;
};

const getPositions = (entities: Entity[]) => {
  const nodeSpacing = {
    horizontal: 30,
    vertical: 15,
  };
  const rows = [
    entities
      .filter(
        (elem) => !isFlow(elem) && elem.format === "urn:x-nmos:format:multi",
      )
      .map((elem) => elem.id),
    formatPrecedence
      .map((format) =>
        entities
          .filter((elem) => !isFlow(elem) && elem.format === format)
          .map((elem) => elem.id),
      )
      .flat(),
    entities
      .filter(
        (elem) => isFlow(elem) && elem.format === "urn:x-nmos:format:multi",
      )
      .map((elem) => elem.id),
    formatPrecedence
      .map((format) =>
        entities
          .filter((elem) => isFlow(elem) && elem.format === format)
          .map((elem) => elem.id),
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
      ]),
    ),
  );
};

export const getElements = async (api: ApiClient, path: string) => {
  // Get a list of all Sources and Flows related to the input entity.
  const entities = await getEntities(api, path).then((graph) =>
    Object.values(graph),
  );
  const positions = getPositions(entities);

  // Create a lookup to allow translation of flowId -> sourceId
  const flowSourceMap = Object.fromEntries(
    entities
      .filter((elem) => isFlow(elem))
      .map((flow) => [flow.id, flow.source_id]),
  );

  // Create list of Elements representing the nodes alone
  const nodes = entities.map((node) => {
    const type = isFlow(node) ? "flow" : "source";
    const classes = [type, node.format.split(":")[3]];
    if (isFlow(node) && node.container) classes.push("container");
    return {
      data: {
        id: `${type}s/${node.id}`,
        label: `${type.toUpperCase()} (${node.format.split(":")[3]})\n\nid: ${
          node.id
        }\n\ndesc: ${node.description}\n\nlabel: ${node.label}`,
      },
      selectable: false,
      selected: node.id == path.split("/")[2],
      classes,
      position: positions[node.id],
    };
  });

  // Create list of elements representing the collects relationships, either for Flows or Sources
  const collectsEdges = entities
    .filter((elem) => isFlow(elem))
    .flatMap((flow) =>
      (flow.flow_collection || []).flatMap((col) => [
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
      ]),
    )
    .filter(
      (value, index, self) =>
        index === self.findIndex((t) => t.data.id === value?.data.id),
    );

  // Create list of elements representing the represents relationships
  const representsEdges = entities
    .filter((elem) => isFlow(elem))
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
