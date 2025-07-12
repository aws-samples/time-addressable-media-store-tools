import { DateTime } from "luxon";

const NANOS_PER_SECOND = 1_000_000_000n;
const TIMERANGE_REGEX =
  /^(?<startInclusive>\[|\()?(?:(?<startSeconds>-?(?:0|[1-9][0-9]*)):(?<startNanos>0|[1-9][0-9]{0,8}))?(?:_(?:(?<endSeconds>-?(?:0|[1-9][0-9]*)):(?<endNanos>0|[1-9][0-9]{0,8}))?)?(?<endInclusive>\]|\))?$/;
const INFINITE_PATTERNS = new Set([
  "_",
  "(_)",
  "[_]",
  "(_]",
  "[_)",
  "(_",
  "[_",
  "_)",
  "_]",
]);
const EMPTY_PATTERNS = new Set([
  "",
  "()",
  "[]",
  "(]",
  "[)",
  ")",
  "]",
  "(",
  "[",
]);

const isInclusive = (bracket) => bracket !== "(";
const isEndInclusive = (bracket) => bracket !== ")";

const createTimerangeResult = (includesStart, start, end, includesEnd) => ({
  includesStart,
  start,
  end,
  includesEnd,
});

/**
 * Converts seconds and nanoseconds to a BigInt representing total nanoseconds
 *
 * @param {string} seconds - Seconds from epoch (string needed to handle negative values correctly)
 * @param {number} nanos - Nanoseconds component
 * @returns {BigInt} Total nanoseconds as BigInt
 */
const secondsNanosToBigInt = (secondsStr, nanos) => {
  const isNegative = secondsStr?.toString().startsWith("-");
  const absSeconds = Math.abs(parseInt(secondsStr || "0", 10));
  const absTotalNanoSeconds =
    BigInt(absSeconds) * NANOS_PER_SECOND + BigInt(nanos);
  return isNegative ? -absTotalNanoSeconds : absTotalNanoSeconds;
};

/**
 * Parses a timerange string into an object with BigInt values
 *
 * @param {string} timerange - The timerange string to parse
 * @returns {Object} Object with start and end as BigInt nanoseconds
 * @throws {Error} If the timerange string format is invalid
 */
export const parseTimerange = (timerange) => {
  // Handle special case: infinite timerange
  if (INFINITE_PATTERNS.has(timerange)) {
    return createTimerangeResult(true, null, null, true);
  }

  // Handle special case: empty timerange
  if (EMPTY_PATTERNS.has(timerange)) {
    return createTimerangeResult(false, 0n, 0n, false);
  }

  // Regular expression to match timerange components
  const match = timerange.match(TIMERANGE_REGEX);
  if (!match) {
    throw new Error("Invalid timerange string format");
  }
  const {
    startInclusive,
    startSeconds,
    startNanos,
    endNanos,
    endSeconds,
    endInclusive,
  } = match.groups;

  const hasStart = startSeconds || startNanos;
  const hasEnd = endSeconds || endNanos;

  // Calculate times only when needed
  const startTime = hasStart
    ? secondsNanosToBigInt(startSeconds, parseInt(startNanos || "0", 10))
    : null;
  const endTime = hasEnd
    ? secondsNanosToBigInt(endSeconds, parseInt(endNanos || "0", 10))
    : null;

  // Single timestamp (no underscore)
  if (!timerange.includes("_") && hasStart) {
    return createTimerangeResult(true, startTime, startTime, true);
  }

  // Start only
  if (hasStart && !hasEnd) {
    return createTimerangeResult(
      isInclusive(startInclusive),
      startTime,
      null,
      isEndInclusive(endInclusive)
    );
  }

  // End only
  if (!hasStart && hasEnd) {
    return createTimerangeResult(
      isInclusive(startInclusive),
      null,
      endTime,
      isEndInclusive(endInclusive)
    );
  }

  // Both start and end - check for invalid ranges
  if (
    startTime > endTime ||
    (startTime === endTime && (startInclusive === "(" || endInclusive === ")"))
  ) {
    return createTimerangeResult(false, 0n, 0n, false);
  }

  return createTimerangeResult(
    isInclusive(startInclusive),
    startTime,
    endTime,
    isEndInclusive(endInclusive)
  );
};

/**
 * Converts a timerange object with BigInt values to a string
 *
 * @param {Object} obj - Object with start and end as BigInt nanoseconds
 * @returns {string} The formatted timerange string
 * @throws {Error} If the timerangeObj is invalid
 */
export const toTimerangeString = (obj) => {
  const { start, end, includesStart = true, includesEnd = false } = obj;

  // Handle special cases
  if (start === null && end === null) {
    if (includesStart === false && includesEnd === false) {
      return "()";
    }
    return "_";
  }

  // Format BigInt value as "seconds:nanos"
  const formatBigInt = (value) => {
    const isNegative = value < 0n;
    const absValue = isNegative ? -value : value;
    const seconds = absValue / NANOS_PER_SECOND;
    const nanos = absValue % NANOS_PER_SECOND;
    return `${isNegative ? "-" : ""}${seconds}:${nanos}`;
  };

  let result = "";

  if (start !== null) {
    result += includesStart ? "[" : "(";
    result += formatBigInt(start);
  }

  result += "_";

  if (end !== null) {
    result += formatBigInt(end);
    result += includesEnd ? "]" : ")";
  }

  return result;
};

/**
 * Parses a timerange string into an object with Luxon DateTime values
 *
 * @param {string} timerange - The timerange string to parse
 * @returns {Object} Object with start and end as Luxon DateTimes
 * @throws {Error} If the timerange string format is invalid
 */
export const parseTimerangeDateTime = (timerange) => {
  const { start, end, includesStart, includesEnd } = parseTimerange(timerange);
  return {
    start: start !== null ? DateTime.fromMillis(Number(start / 1_000_000n)) : undefined,
    end: end !== null ? DateTime.fromMillis(Number(end / 1_000_000n)) : undefined,
    includesStart,
    includesEnd,
  };
};
