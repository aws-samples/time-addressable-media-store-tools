import { OmakaseTimeRangePicker } from "@byomakase/omakase-react-components";
import { TIME_RANGE_PICKER_CONFIG } from "../constants";

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
        {...TIME_RANGE_PICKER_CONFIG}
        timeRange={timerange}
        maxTimeRange={maxTimerange}
        onCheckmarkClickCallback={onTimeRangeChange}
      />
    </div>
  );
};

export default TimeRangePicker;
