import React from "react";
import { IconProps } from "./icons";

export const CheckedIcon = ({ width, height }: IconProps) => {
  return (
    <svg
      width={width ?? 18}
      height={height ?? 18}
      viewBox={`0 0 ${width ?? 18} ${height ?? 18}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_5761_217)">
        <path
          d="M13.2225 6.75C13.545 6.4275 13.545 5.91 13.2225 5.595C12.9 5.2725 12.3825 5.2725 12.0675 5.595L7.7475 9.915L5.9475 8.055C5.6325 7.7325 5.115 7.725 4.7925 8.04C4.47 8.355 4.4625 8.8725 4.7775 9.195L7.155 11.6475C7.305 11.805 7.515 11.895 7.7325 11.895C7.95 11.895 8.16 11.8125 8.3175 11.655L13.23 6.7425L13.2225 6.75Z"
          fill="#00A3E9"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.27 0C1.485 0 0 1.485 0 3.27V14.7225C0 16.515 1.485 17.9925 3.27 17.9925H14.7225C16.515 17.9925 17.9925 16.5075 17.9925 14.7225V3.27C18 1.485 16.515 0 14.73 0H3.27ZM1.635 3.27C1.635 2.385 2.385 1.635 3.27 1.635H14.7225C15.6075 1.635 16.3575 2.385 16.3575 3.27V14.7225C16.3575 15.6075 15.6075 16.3575 14.7225 16.3575H3.27C2.385 16.3575 1.635 15.6075 1.635 14.7225V3.27Z"
          fill="#00A3E9"
        />
      </g>
      <defs>
        <clipPath id="clip0_5761_217">
          <rect width={width ?? 18} height={height ?? 18} fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};
