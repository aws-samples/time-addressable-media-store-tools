import { TimecodeUtil } from "./timecode-util";
import { FrameRateUtil } from "./frame-rate-util";

export interface AuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface AuthSession {
  authResponse: AuthResponse;
  refreshAtLatestByUtcTimestamp: number;
  expiresUtcTimestamp: number;
}

export type TimeMoment = [number, number]; //  [seconds, nanoseconds]

export interface TimeRange {
  start?: TimeMoment; // [seconds, nanoseconds]
  end?: TimeMoment; // [seconds, nanoseconds]
  isStartInclusive: boolean;
  isEndInclusive: boolean;
}

export class TimeRangeUtil {
  private static timeRangePattern =
    /^(\[|\()?(-?\d+:\d+)?(_(-?\d+:\d+)?)?(\]|\))?$/;

  static parseTimeMoment(timeMomentText: string): TimeMoment {
    const [seconds, nanoseconds] = timeMomentText.split(":").map(Number);
    return [seconds, nanoseconds];
  }

  static parseTimeRange(timeRangeStr: string): TimeRange {
    const match = timeRangeStr.match(this.timeRangePattern);
    if (!match) {
      throw new Error("Not valid timerange: " + timeRangeStr);
    }

    // Parse inclusivity markers
    const isStartInclusive = match[1] === "[";
    const isEndInclusive = match[5] === "]";

    // Parse start timestamp (optional)
    const start = match[2] ? this.parseTimeMoment(match[2]) : undefined;

    // Parse end timestamp (optional)
    const end = match[4] ? this.parseTimeMoment(match[4]) : undefined;

    return {
      start: start,
      end: end,
      isStartInclusive: isStartInclusive,
      isEndInclusive: isEndInclusive,
    };
  }

  static timeMomentToSeconds(timeMoment: TimeMoment): number {
    return TimeRangeUtil.timeMomentToMilliseconds(timeMoment) / 1000;
  }

  static timeMomentToMilliseconds(timeMoment: TimeMoment): number {
    const milliseconds = timeMoment[0] * 1000;
    return milliseconds + timeMoment[1] / 1_000_000;
  }

  static timeMomentToDate(timeMoment: TimeMoment): Date {
    const milliseconds = timeMoment[0] * 1000;
    // Convert nanoseconds to milliseconds and add to total milliseconds
    const adjustedMilliseconds = milliseconds + timeMoment[1] / 1_000_000;
    return new Date(adjustedMilliseconds);
  }

  static formatTimeMomentToTimecodeText(
    timeMoment: TimeMoment,
    frameRateFraction: string,
    audioOnly: boolean = false
  ): string {
    let frameRate =
      FrameRateUtil.resolveFrameRateValueFromFraction(frameRateFraction);
    return TimecodeUtil.formatToTimecode(
      TimeRangeUtil.timeMomentToSeconds(timeMoment),
      frameRate,
      audioOnly
    );
  }

  static formatTimerangeToTimecodeText(
    timerange: string,
    frameRateFraction: string,
    audioOnly: boolean = false
  ): string {
    let timeRange = TimeRangeUtil.parseTimeRange(timerange);
    let from = timeRange.start
      ? TimeRangeUtil.formatTimeMomentToTimecodeText(
          timeRange.start,
          frameRateFraction,
          audioOnly
        )
      : "?";
    let to = timeRange.end
      ? TimeRangeUtil.formatTimeMomentToTimecodeText(
          timeRange.end,
          frameRateFraction,
          audioOnly
        )
      : "?";
    return `${from} - ${to}`;
  }

  static nanosecondsToSeconds(nanoseconds: number): number {
    return nanoseconds / 1_000_000_000;
  }

  static nanosecondsToTimeMoment(nanoseconds: number): TimeMoment {
    const seconds = Math.floor(nanoseconds / 1_000_000_000);
    const restNanoseconds = Math.ceil(nanoseconds % 1_000_000_000);
    return [seconds, restNanoseconds];
  }

  static secondsToTimeMoment(seconds: number): TimeMoment {
    return this.nanosecondsToTimeMoment(seconds * 1_000_000_000);
  }

  static timerangeExprDuration(timerange: string): number {
    return this.timeRangeDuration(this.parseTimeRange(timerange));
  }

  static timeRangeDuration(timeRange: TimeRange): number {
    const { start, end } = timeRange;

    if (start === void 0 || end === void 0) {
      return 0;
    } else {
      // Calculate difference in seconds
      const secondsDiff = end[0] - start[0];
      const nanosecondsDiff = end[1] - start[1];
      const totalSeconds = secondsDiff + nanosecondsDiff / 1e9;

      // Round to three decimal places
      return parseFloat(totalSeconds.toFixed(3));
    }
  }

  static formatTimeMomentExpr(timeMoment: TimeMoment): string {
    return `${timeMoment[0]}:${timeMoment[1]}`;
  }

  static formatNanosecondsToTimeMomentExpr(nanoseconds: number): string {
    return this.formatTimeMomentExpr(this.nanosecondsToTimeMoment(nanoseconds));
  }

  static toTimeRange(
    start?: TimeMoment,
    end?: TimeMoment,
    isStartInclusive = true,
    isEndInclusive = true
  ): TimeRange {
    return {
      start: start,
      end: end,
      isStartInclusive: isStartInclusive,
      isEndInclusive: isEndInclusive,
    };
  }

  static formatTimeRangeExpr(timeRange: TimeRange): string {
    const startBound = timeRange.isStartInclusive ? "[" : "(";
    const endBound = timeRange.isEndInclusive ? "]" : ")";
    const start = timeRange.start
      ? `${timeRange.start[0]}:${timeRange.start[1]}`
      : "";
    const end = timeRange.end ? `${timeRange.end[0]}:${timeRange.end[1]}` : "";
    return `${startBound}${start}_${end}${endBound}`;
  }

  static timerangeDuration(timerangeExpr: string): number {
    let timeRange = TimeRangeUtil.parseTimeRange(timerangeExpr);
    if (timeRange.start === undefined || timeRange.end === undefined) {
      return Infinity;
    } else {
      let timerangeStart = TimeRangeUtil.timeMomentToSeconds(timeRange.start!);
      let timerangeEnd = TimeRangeUtil.timeMomentToSeconds(timeRange.end!);
      return timerangeEnd - timerangeStart;
    }
  }

  private static padZero(num: number): string {
    return num < 10 ? `0${num}` : `${num}`;
  }
}
