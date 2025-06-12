import { DateTime } from "luxon";

export const parseTimerangeStr = (timerange) => {
  const regexMatch = timerange.match(
    /^(?<startInclusive>\[|\()?(?:-?(?<startSeconds>\d+):(?<startNanoseconds>\d+))?(?:_(?:-?(?<endSeconds>\d+):(?<endNanoseconds>\d+))?)?(?<endInclusive>\]|\))?$/
  );
  const {
    startInclusive,
    startSeconds,
    startNanoseconds,
    endSeconds,
    endNanoseconds,
    endInclusive,
  } = regexMatch.groups;
  const includesStart = startInclusive
    ? startInclusive === "["
      ? true
      : startInclusive === "("
      ? false
      : undefined
    : true;
  const includesEnd = endInclusive
    ? endInclusive === "]"
      ? true
      : endInclusive === ")"
      ? false
      : undefined
    : true;
  const start =
    startSeconds && startNanoseconds
      ? DateTime.fromSeconds(
          parseInt(startSeconds, 10) + parseInt(startNanoseconds, 10) / 10 ** 9
        )
      : undefined;
  const end =
    endSeconds && endNanoseconds
      ? DateTime.fromSeconds(
          parseInt(endSeconds, 10) + parseInt(endNanoseconds, 10) / 10 ** 9
        )
      : undefined;
  return {
    start,
    end,
    includesStart,
    includesEnd,
  };
};

export const parseTimerangeObj = ({
  start,
  end,
  includesStart = true,
  includesEnd = false,
}) => {
  const startInclusive = includesStart ? "[" : "(";
  const endInclusive = includesEnd ? "]" : ")";
  const startSeconds = start === undefined ? "" : Math.floor(start.toSeconds());
  const endSeconds = end === undefined ? "" : Math.floor(end.toSeconds());
  const startNanoseconds =
    start === undefined
      ? ""
      : Math.floor(
          (start.toSeconds() - Math.floor(start.toSeconds())) * 10 ** 9
        );
  const endNanoseconds =
    end === undefined
      ? ""
      : Math.floor((end.toSeconds() - Math.floor(end.toSeconds())) * 10 ** 9);
  const startTimerange =
    start === undefined ? "" : `${startSeconds}:${startNanoseconds}`;
  const endTimerange =
    end === undefined ? "" : `${endSeconds}:${endNanoseconds}`;
  return `${startInclusive}${startTimerange}_${endTimerange}${endInclusive}`;
};
