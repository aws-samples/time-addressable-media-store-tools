import { Mode } from "@cloudscape-design/global-styles";
import {
  PeriodMarkerStyle,
  TimelineStyle,
  TimelineLaneStyle,
  ScrubberLaneStyle,
  TextLabelStyle,
  SubtitlesLaneStyle,
  ImageButtonConfig,
} from "@byomakase/omakase-player";

export const FONT_CONFIG = {
  fontFamily: `"Nunito Sans", sans-serif`,
  fontStyle: "400",
};

export const TIME_RANGE_PICKER_CONFIG = {
  numberOfSegments: 6,
  maxSliderRange: 1800,
  segmentSize: 600,
};

export const TIMELINE_DIMENSIONS = {
  stageMinHeight: 200,
  headerHeight: 10,
  footerHeight: 50,
  footerMarginTop: 1,
  leftPaneWidth: 270,
  rightPaneMarginLeft: 20,
  rightPaneMarginRight: 20,
  rightPaneClipPadding: 20,
};

export const SCROLLBAR_CONFIG = {
  scrollbarHeight: 15,
  scrollbarBackgroundFillOpacity: 0.3,
  scrollbarHandleBarOpacity: 0.7,
  scrollbarHandleOpacity: 1,
};

export const PLAYHEAD_CONFIG = {
  playheadBufferedOpacity: 1,
  playheadBackgroundOpacity: 1,
  playheadTextYOffset: -14,
  playheadLineWidth: 2,
  playheadSymbolHeight: 12,
  playheadScrubberHeight: 9,
  playheadPlayProgressOpacity: 1,
  playheadTextFill: "rgb(0,0,0,0)",
};

export const SCRUBBER_CONFIG = {
  scrubberSymbolHeight: 12,
  scrubberTextYOffset: -15,
  scrubberMarginBottom: 1,
};

export const LANE_CONFIG = {
  marginBottom: 1,
  height: 50,
  descriptionTextFontSize: 12,
};

export const SCRUBBER_LANE_CONFIG = {
  leftBackgroundOpacity: 1,
  rightBackgroundOpacity: 1,
  backgroundOpacity: 0.1,
  marginBottom: 1,
  descriptionTextFontSize: 20,
};

export const THUMBNAIL_LANE_CONFIG = {
  height: 70,
};

export const SEGMENT_PERIOD_MARKER_STYLE: Partial<PeriodMarkerStyle> = {
  symbolType: "triangle",
  symbolSize: 15,
  selectedAreaOpacity: 0.2,
  lineOpacity: 0.5,
  markerHandleAreaOpacity: 0.5,
  renderType: "lane",
};

export const SEGMENTATION_PERIOD_MARKER_STYLE: Partial<PeriodMarkerStyle> = {
  symbolType: "square",
  symbolSize: 15,
  selectedAreaOpacity: 0.2,
  lineOpacity: 0.5,
  markerHandleAreaOpacity: 0.5,
  renderType: "lane",
};

const COLORS = {
  [Mode.Dark]: {
    general: {
      text: "hsl(0, 0%, 100%)",
      backgroundDarkest: "hsl(231, 24%, 21%)",
      backgroundDark: "hsl(236, 12%, 24%)",
      backgroundMedium: "hsl(229, 13%, 26%)",
      backgroundLight: "hsl(230, 12%, 31%)",
      scrollbarBackground: "hsl(234, 68%, 49%)",
      scrollbarHandle: "hsl(274, 53%, 37%)",
      playheadPrimary: "hsl(184, 100%, 63%)",
      playheadBuffered: "hsl(238, 100%, 80%)",
      playheadBackground: "hsl(227, 12%, 57%)",
      scrubberDefault: "hsl(227, 31%, 77%)",
      scrubberSnapped: "hsl(106, 48%, 70%)",
      segmentationMarker: "hsl(198, 100%, 46%)",
      segmentationMarkerHighlighted: "hsl(353, 67%, 74%)",
    },
    marker: [
      "hsl(198, 100%, 46%)",
      "hsl(159, 88%, 57%)",
      "hsl(22, 88%, 57%)",
      "hsl(22, 24%, 72%)",
      "hsl(198, 23%, 57%)",
      "hsl(162, 43%, 57%)",
      "hsl(353, 67%, 74%)",
      "hsl(178, 81%, 71%)",
      "hsl(79, 78%, 64%)",
      "hsl(24, 59%, 62%)",
      "hsl(283, 70%, 77%)",
      "hsl(304, 44%, 85%)",
      "hsl(149, 66%, 93%)",
      "hsl(242, 58%, 67%)",
      "hsl(0, 0%, 81%)",
      "hsl(292, 95%, 45%)",
      "hsl(209, 86%, 46%)",
      "hsl(122, 73%, 55%)",
      "hsl(0, 90%, 63%)",
      "hsl(50, 95%, 56%)",
    ],
  },

  [Mode.Light]: {
    general: {
      text: "hsl(0, 0%, 0%)",
      backgroundDarkest: "hsl(231, 7%, 95%)",
      backgroundDark: "hsl(236, 4%, 95%)",
      backgroundMedium: "hsl(229, 4%, 95%)",
      backgroundLight: "hsl(230, 4%, 85%)",
      scrollbarBackground: "hsl(234, 58%, 37%)",
      scrollbarHandle: "hsl(274, 45%, 30%)",
      playheadPrimary: "hsl(184, 85%, 38%)",
      playheadBuffered: "hsl(238, 85%, 66%)",
      playheadBackground: "hsl(227, 20%, 64%)",
      scrubberDefault: "hsl(227, 26%, 35%)",
      scrubberSnapped: "hsl(106, 41%, 42%)",
      segmentationMarker: "hsl(198, 85%, 65%)",
      segmentationMarkerHighlighted: "hsl(353, 57%, 33%)",
    },
    marker: [
      "hsl(198, 85%, 35%)",
      "hsl(159, 75%, 34%)",
      "hsl(22, 75%, 34%)",
      "hsl(22, 20%, 32%)",
      "hsl(198, 20%, 34%)",
      "hsl(162, 37%, 34%)",
      "hsl(353, 57%, 33%)",
      "hsl(178, 69%, 32%)",
      "hsl(79, 66%, 38%)",
      "hsl(24, 50%, 37%)",
      "hsl(283, 60%, 35%)",
      "hsl(304, 37%, 38%)",
      "hsl(149, 56%, 42%)",
      "hsl(242, 49%, 40%)",
      "hsl(0, 0%, 36%)",
      "hsl(292, 81%, 34%)",
      "hsl(209, 73%, 35%)",
      "hsl(122, 62%, 41%)",
      "hsl(0, 77%, 38%)",
      "hsl(50, 81%, 34%)",
    ],
  },
};

function buildThemeConfig(mode: Mode) {
  const colors = COLORS[mode].general;
  const markerColors = COLORS[mode].marker;

  return {
    text: {
      ...FONT_CONFIG,
      fill: colors.text,
    },

    colors: {
      // Timeline backgrounds
      background: colors.backgroundDark,

      // Lane backgrounds
      laneBackground: colors.backgroundDarkest,
      laneRightBackground: colors.backgroundLight,
      scrubberRightBackground: colors.backgroundMedium,

      // Scrollbar
      scrollbarBackground: colors.scrollbarBackground,
      scrollbarHandle: colors.scrollbarHandle,

      // Playhead
      playhead: colors.playheadPrimary,
      playheadBuffered: colors.playheadBuffered,
      playheadBackground: colors.playheadBackground,
      playheadProgress: colors.scrollbarHandle, // Same purple as scrollbar

      // Scrubber
      scrubber: colors.scrubberDefault,
      scrubberSnapped: colors.scrubberSnapped,

      // Segmentation Marker
      segmentationMarker: colors.segmentationMarker,
      segmentationMarkerHighlighted: colors.segmentationMarkerHighlighted,
    },

    markerColors,

    timelineStyle: {
      ...TIMELINE_DIMENSIONS,
      ...SCROLLBAR_CONFIG,
      ...PLAYHEAD_CONFIG,
      ...SCRUBBER_CONFIG,

      backgroundFill: colors.backgroundDark,
      backgroundOpacity: 1,
      headerBackgroundFill: colors.backgroundDark,
      footerBackgroundFill: colors.backgroundDark,
      footerBackgroundOpacity: 0.6,

      scrollbarBackgroundFill: colors.scrollbarBackground,
      scrollbarHandleBarFill: colors.scrollbarHandle,

      playheadFill: colors.playheadPrimary,
      playheadBufferedFill: colors.playheadBuffered,
      playheadBackgroundFill: colors.playheadBackground,
      playheadPlayProgressFill: colors.scrollbarHandle,

      scrubberFill: colors.scrubberDefault,
      scrubberSnappedFill: colors.scrubberSnapped,
    } as Partial<TimelineStyle>,

    timelineLaneStyle: {
      ...LANE_CONFIG,
      backgroundFill: colors.backgroundDarkest,
      rightBackgroundFill: colors.backgroundLight,
      descriptionTextFill: colors.text,
    } as Partial<TimelineLaneStyle>,

    scrubberLaneStyle: {
      ...SCRUBBER_LANE_CONFIG,
      backgroundFill: colors.backgroundDarkest,
      leftBackgroundFill: colors.backgroundDarkest,
      rightBackgroundFill: colors.backgroundMedium,
      tickFill: colors.text,
      timecodeFill: colors.text,
      descriptionTextFill: colors.text,
    } as Partial<ScrubberLaneStyle>,

    thumbnailLaneStyle: {
      ...LANE_CONFIG,
      ...THUMBNAIL_LANE_CONFIG,
      backgroundFill: colors.backgroundDarkest,
      rightBackgroundFill: colors.backgroundLight,
      descriptionTextFill: colors.text,
    } as Partial<TimelineLaneStyle>,

    subtitlesLaneStyle: {
      ...LANE_CONFIG,
      backgroundFill: colors.backgroundDarkest,
      rightBackgroundFill: colors.backgroundLight,
      descriptionTextFill: colors.text,
      paddingTop: 12,
      paddingBottom: 12,
    } as Partial<SubtitlesLaneStyle>,
  };
}

export const THEME = {
  [Mode.Dark]: buildThemeConfig(Mode.Dark),
  [Mode.Light]: buildThemeConfig(Mode.Light),
};

export const MARKER_LIST_CONFIG = {
  markerListHTMLElementId: "marker-list-component",
  templateHTMLElementId: "row-template",
  headerHTMLElementId: "header-template",
  emptyHTMLElementId: "empty-template",
};

export const MARKER_LANE_TEXT_LABEL_STYLE: Partial<TextLabelStyle> = {
  verticalAlign: "middle",
  fill: "#ffffff",
  align: "right",
  wrap: "char",
  offsetX: 0,
  textAreaStretch: true,
};

export const CHEVRON_DOWN_SVG_SOURCE = `/chevron-down.svg`;
export const CHEVRON_RIGHT_SVG_SOURCE = `/chevron-right.svg`;
export const CHATBOX_SVG_SOURCE = `/chatbox.svg`;
export const CHATBOX_ACTIVE_SVG_SOURCE = `/chatbox-active.svg`;

export const DROPDOWN_BUTTON_CONFIG: ImageButtonConfig = {
  src: CHEVRON_RIGHT_SVG_SOURCE,
  width: 24,
  height: 24,
  listening: true,
  style: {},
};

export const SUBTITLES_BUTTON_CONFIG: ImageButtonConfig = {
  src: CHATBOX_SVG_SOURCE,
  width: 24,
  height: 24,
  listening: true,
  style: {},
};

export const SOUND_BUTTON_CONFIG: ImageButtonConfig = {
  src: "/sound-inactive-button.svg",
  width: 14,
  height: 20,
  listening: true,
  style: {},
};

export const ROW_TEMPLATE_HTML = `
  <style>
    .flex-table {
      display: flex;
      flex-direction: column;
    }

    .flex-row {
      display: flex;
      flex-direction: row;
      cursor: pointer;
      border: 1px solid #655372;
      background-color: #6825991A;
      background-opacity: 0.1;
    }

    .flex-row.bordered {
      border-left: 1px solid #655372;
      border-right: 1px solid #655372;
    }

    .flex-row.bordered:last-child {
      border-left: 1px solid #655372;
      border-right: 1px solid #655372;
      border-bottom: 0px
    }

    .active.flex-row {
      background-color: rgba(0, 0, 0, 0.2);
    }

    .flex-cell {
      height: 65px;
      line-height: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
    }

    .active {
      background-color: #00A3E94D
    }

    .remove-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      margin-right: 1em;
    }

    .header-cell {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .timestamp-container {
      display: flex;
      flex-direction: column;
      flex-grow: 1
    }

    .label-container {
      display: flex;
      flex-direction: column;
      width: 70px;
      padding-left: 1em;
    }

    .timestamp-container div {
      height: 30px;
      line-height: 30px;
      text-align: left;
    }
    .label-container div {
      height: 30px;
      line-height: 30px;
      text-align: left;
    }
    .timestamp {
      height: 30px;
    }

    .drag-ghost {
      background-color: #6825991A;
      color: transparent;
      opacity: 1;
      border-top: 1px solid #655372 !important;
      border-left: 1px solid #655372 !important;
      border-right: 1px solid #655372 !important;
      border-bottom: none;
    }

    .drag-item {
      border-top: 1px solid #655372;
      border-bottom: 1px solid #655372 !important;
    }
  </style>

  <div class="flex-row bordered">
    <div class="flex-cell">
      <span slot="color" class="drag-handle" style="display:inline-block; height:65px; width:10px"></span>
    </div>
    <div class="flex-cell drag-handle" style="width:100px;height:65px">
      <img slot="thumbnail" height="65px">
    </div>
    <div class="flex-cell label-container">
      <div>IN</div>
      <div>OUT</div>
    </div>

    <div class="flex-cell timestamp-container">
      <div class="timestamp" slot="start"></div>
      <div class="timestamp" slot="end"></div>
    </div>
    <div class="flex-cell remove-cell">
      <span slot="remove"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5268 2.75758L9.28485 6.99993L13.5268 11.2421C14.1577 11.8733 14.1577
12.8958 13.5268 13.527C13.2115 13.8422 12.7982 14 12.385 14C11.9712 14 11.5579 13.8425 11.2428 13.527L7.00001 9.28433L2.7575 13.5269C2.44228 13.8422 2.02891 13.9999 1.61542 13.9999C1.20205 13.9999 0.788965
13.8424 0.473464 13.5269C-0.1575 12.896 -0.1575 11.8735 0.473464 11.242L4.71525 6.99989L0.473222 2.75758C-0.157741 2.12662 -0.157741 1.10391 0.473222 0.472945C1.10407 -0.157536 2.12617 -0.157536 2.75725
0.472945L6.99997 4.7153L11.2424 0.472945C11.8736 -0.157536 12.8958 -0.157536 13.5265 0.472945C14.1577 1.10391 14.1577 2.12662 13.5268 2.75758Z" fill="#CACFEA"/></svg></span>
    </div>
  </div>
`;

export const EMPTY_TEMPLATE_HTML = `
  <style>
    .flex-table {
      display: flex;
      flex-direction: column;
    }

    .flex-row {
      display: flex;
      flex-direction: row;
      cursor: pointer;
      border: 1px solid #655372;
      background-color: #6825991A;
      backgroun-opacity: 0.1;
    }

    .flex-row.bordered {
      border-left: 1px solid #655372;
      border-right: 1px solid #655372;
    }

    .active.flex-row {
      background-color: rgba(0, 0, 0, 0.2);
    }

    .flex-cell {
      height: 65px;
      line-height: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
      padding-left: 1em;
    }


  </style>

  <div class="flex-row bordered">
    <div class="flex-cell">
      <span>No markers defined</span>
    </div>
  </div>
`;

export const HEADER_TEMPLATE_HTML = `<div></div>`;
