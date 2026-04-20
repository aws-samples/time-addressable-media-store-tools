import { OmakaseTimeRangePicker } from "@byomakase/omakase-react-components";

type TimeRangePickerProps = {
  timerange: string;
  maxTimerange: string;
  onTimeRangeChange: (start: number, end: number) => void;
};

const TimeRangePicker = ({
  timerange,
  maxTimerange,
  onTimeRangeChange,
}: TimeRangePickerProps) => {
  return (
    <div className="time-range-picker-wrapper">
      <OmakaseTimeRangePicker
        numberOfSegments={6}
        maxSliderRange={1800}
        segmentSize={600}
        timeRange={timerange}
        maxTimeRange={maxTimerange}
        onCheckmarkClickCallback={onTimeRangeChange}
      />
    </div>
  );
};

export default TimeRangePicker;
