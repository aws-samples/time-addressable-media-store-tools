import React from "react";
import { IconProps } from "./icons";

export const CaretDownIcon = ({ width, height }: IconProps) => {
  return (
    <svg
      width={width ?? 24}
      height={height ?? 24}
      viewBox={`0 0 ${width ?? 24} ${height ?? 24}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.95 5.11L13.57 4.72L8.05 10.29C8.05 10.29 8.02 10.305 8 10.305C7.985 10.305 7.965 10.3 7.97 10.305L2.435 4.72L2.055 5.105C2.02 5.16 2 5.22 2 5.285C2 5.35 2.02 5.415 2.07 5.485L7.785 11.155C7.805 11.19 7.83 11.215 7.865 11.235C7.905 11.26 7.95 11.275 8 11.275C8.05 11.275 8.095 11.26 8.135 11.235C8.17 11.215 8.195 11.185 8.215 11.155L13.95 5.465C13.985 5.41 14 5.35 14 5.285C14 5.22 13.985 5.16 13.95 5.11Z"
        fill="white"
      />
    </svg>
  );
};
