import React from "react";
import { IconProps } from "./icons";

export const UncheckedIcon = ({ width, height }: IconProps) => {
  return (
    <svg
      width={width ?? 24}
      height={height ?? 24}
      viewBox={`0 0 ${width ?? 24} ${height ?? 24}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_5761_221)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.27 0C1.485 0 0 1.485 0 3.27V14.7225C0 16.515 1.485 17.9925 3.27 17.9925H14.7225C16.515 17.9925 17.9925 16.5075 17.9925 14.7225V3.27C18 1.485 16.515 0 14.73 0H3.27ZM1.635 3.27C1.635 2.385 2.385 1.635 3.27 1.635H14.7225C15.6075 1.635 16.3575 2.385 16.3575 3.27V14.7225C16.3575 15.6075 15.6075 16.3575 14.7225 16.3575H3.27C2.385 16.3575 1.635 15.6075 1.635 14.7225V3.27Z"
          fill="white"
        />
      </g>
      <defs>
        <clipPath id="clip0_5761_221">
          <rect width="18" height="18" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};
