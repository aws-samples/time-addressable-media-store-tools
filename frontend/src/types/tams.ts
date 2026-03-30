import type { components } from "./tams.generated";

type Schemas = components["schemas"];

export type Uuid = Schemas["uuid"];
export type Flow = Schemas["flow"];
export type Source = Schemas["source"];
export type Segment = Schemas["flow-segment"];
export type Object = Schemas["object"];
export type Timerange = Schemas["timerange"];
export type FlowCollection = Schemas["flow-collection"];
export type CollectionItem = Schemas["collection-item"];

// Manually defined types
export type TagName = string;
export type TagValue = string | string[];
