import {
  ConfigWithOptionalStyle,
  ImageButtonConfig,
  MarkerLaneConfig,
  MarkerListConfig,
  PeriodMarkerStyle,
  ScrubberLaneStyle,
  TextLabelStyle,
  TimelineConfig,
  TimelineLaneStyle,
  TimelineStyle,
} from "@byomakase/omakase-player";

export const VARIABLES = {
  text: {
    fontFamily: `"Nunito Sans", sans-serif`,
    fontStyle: "400",
    fill: "#FFFFFF",
  },

  entitiesColors: [
    "#989BFF",
    "#43F4FF",
    "#B2BAD6",
    "#D69D9D",
    "#FFE790",
    "#9ED78D",
    "#A3D7E2",
    "#C993F3",
    "#FF8E9C",
    "#FFD1C2",
    "#F58428",
    "#D3D3D3",
    "#F1FFBB",
  ],

  lineColors: [
    "#C306E2",
    "#1079DA",
    "#37E03E",
    "#F54A4A",
    "#F9D726",
    "#CECECE",
  ],

  markerColors: [
    "#00A3E9",
    "#33F2AE",
    "#F27833",
    "#C8B2A5",
    "#799CAB",
    "#62C0A4",
    "#E98F99",
    "#78F1EC",
    "#BDEB5A",
    "#D89366",
    "#D79DEE",
    "#EAC9E8",
    "#E2F9ED",
    "#7E7BDC",
    "#CECECE",
    "#C306E2",
    "#1079DA",
    "#37E03E",
    "#F54A4A",
    "#F9D726",
  ],

  timelineLaneMarginBottom: 1,

  audioTrackLaneFillGradientColorStops: [
    0,
    "#747DAF",
    0.33,
    "#8D8BB0",
    0.5,
    "#A499B1",
    0.59,
    "#C2AAB1",
    0.78,
    "#D5B5B2",
    0.93,
    "#E2BDB2",
    1,
    "#F3C6B3",
  ],
};

export const TIMELINE_STYLE: Partial<TimelineStyle> = {
  stageMinHeight: 200,

  backgroundFill: "#353644",
  backgroundOpacity: 1,
  headerHeight: 10,
  headerBackgroundFill: "#353644",

  footerHeight: 50,
  footerMarginTop: 1,
  footerBackgroundFill: "#353644",
  footerBackgroundOpacity: 0.6,

  leftPaneWidth: 235,
  rightPaneMarginLeft: 20,
  rightPaneMarginRight: 20,
  rightPaneClipPadding: 20,

  // scrollbar
  scrollbarHeight: 15,
  scrollbarBackgroundFill: "#2839D4",
  scrollbarBackgroundFillOpacity: 0.3,
  scrollbarHandleBarFill: "#662D91",
  scrollbarHandleBarOpacity: 0.7,
  scrollbarHandleOpacity: 1,

  // playhead
  playheadFill: "#43F4FF",
  playheadBufferedFill: "#989BFF",
  playheadBufferedOpacity: 1,
  playheadBackgroundFill: "#83899E",
  playheadBackgroundOpacity: 1,
  playheadTextYOffset: -14,

  playheadLineWidth: 2,
  playheadSymbolHeight: 12,
  playheadScrubberHeight: 9,

  playheadPlayProgressFill: "#662D91",
  playheadPlayProgressOpacity: 1,
  playheadTextFill: "rgb(0,0,0,0)",
  // playhead hover
  scrubberFill: "#B2BAD6",
  scrubberSnappedFill: "#9ED78D",
  scrubberSymbolHeight: 12,
  scrubberTextYOffset: -15,

  scrubberMarginBottom: 1,
};

export const TIMELINE_CONFIG: Partial<ConfigWithOptionalStyle<TimelineConfig>> =
  {
    timelineHTMLElementId: "omakase-timeline",
    style: TIMELINE_STYLE,
  };

export const TIMELINE_LANE_STYLE: Partial<TimelineLaneStyle> = {
  backgroundFill: "#292D43",
  rightBackgroundFill: "#454857",
  descriptionTextFill: "#ffffff",
  marginBottom: VARIABLES.timelineLaneMarginBottom,
  height: 50,

  descriptionTextFontSize: 12,
};

export const SCRUBBER_LANE_STYLE: Partial<ScrubberLaneStyle> = {
  backgroundFill: "#292D43",
  //leftBackgroundFill: "#454857",
  leftBackgroundFill: "#292D43",
  leftBackgroundOpacity: 1,
  rightBackgroundFill: "#3A3D4B",
  rightBackgroundOpacity: 1,
  backgroundOpacity: 0.1,
  marginBottom: 1,

  tickFill: VARIABLES.text.fill,

  timecodeFill: VARIABLES.text.fill,

  descriptionTextFill: VARIABLES.text.fill,

  descriptionTextFontSize: 20,
};

export const MARKER_LANE_STYLE: Partial<TimelineLaneStyle> = {
  ...TIMELINE_LANE_STYLE,

  //height: 36,
};

export const THUMBNAIL_LANE_STYLE: Partial<TimelineLaneStyle> = {
  ...TIMELINE_LANE_STYLE,
  height: 70,
};

export const PERIOD_MARKER_STYLE: Partial<PeriodMarkerStyle> & {
  color: string;
} = {
  symbolType: "square",
  symbolSize: 15,
  selectedAreaOpacity: 0.2,
  lineOpacity: 0.5,
  markerHandleAreaOpacity: 0.5,
  renderType: "lane",
  color: "#00A3E9",
};

export const SEGMENT_PERIOD_MARKER_STYLE: Partial<PeriodMarkerStyle> = {
  symbolType: "triangle",
  symbolSize: 15,
  selectedAreaOpacity: 0.2,
  lineOpacity: 0.5,
  markerHandleAreaOpacity: 0.5,
  renderType: "lane",
  color: "#00A3E9",
};

export const HIGHLIGHTED_PERIOD_MARKER_STYLE: Partial<PeriodMarkerStyle> & {
  color: string;
} = {
  symbolType: "square",
  symbolSize: 15,
  selectedAreaOpacity: 0.2,
  lineOpacity: 0.5,
  markerHandleAreaOpacity: 0.5,
  renderType: "lane",
  color: "#E98F99",
};

export const MARKER_LIST_CONFIG: MarkerListConfig = {
  markerListHTMLElementId: "marker-list-component",
  templateHTMLElementId: "row-template",
  headerHTMLElementId: "header-template",
  emptyHTMLElementId: "empty-template",
};

export const SOUND_BUTTON_CONFIG: ImageButtonConfig = {
  src: "/sound-inactive-button.svg",
  width: 14,
  height: 20,
  listening: true,
  style: {},
};

export const MARKER_LANE_TEXT_LABEL_STYLE: TextLabelStyle = {
  verticalAlign: "middle",
  fill: "#ffffff",
  align: "right",
  wrap: "char",
  offsetX: 0,
  textAreaStretch: true,
};
