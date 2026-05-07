export type SegmentationLaneSnapshot = {
  id: string;
  description: string | undefined;
  markers: Array<{ start: number; end: number; editable: boolean }>;
};
