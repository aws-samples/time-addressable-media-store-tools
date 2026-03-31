import { colorTextLabel } from "@cloudscape-design/design-tokens";
import { styles } from "../constants.js";

const Legend = () => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="48rem" viewBox="0 0 782 40">
      <g id="source">
        <rect
          x="0"
          y="0"
          width="140"
          height="40"
          rx="7"
          fill={styles.nodes.source.backgroundColor}
        />
        <text x="49" y="25" fill="#000000" fontWeight="bold">
          Source
        </text>
      </g>
      <g id="flow">
        <rect
          x="160"
          y="0"
          width="140"
          height="40"
          rx="7"
          fill={styles.nodes.flow.backgroundColor}
        />
        <text x="216" y="25" fill="#000000" fontWeight="bold">
          Flow
        </text>
      </g>
      <g id="represents">
        <line
          x1="320"
          y1="14"
          x2="460"
          y2="14"
          stroke={styles.edges.represents.lineColor}
          strokeWidth="2"
        />
        <line
          x1="456"
          y1="10"
          x2="460"
          y2="14"
          stroke={styles.edges.represents.targetArrowColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="456"
          y1="18"
          x2="460"
          y2="14"
          stroke={styles.edges.represents.targetArrowColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x="322" y="30" fill={colorTextLabel} fontWeight="bold">
          Represents
        </text>
      </g>
      <g id="collects-flow">
        <line
          x1="480"
          y1="14"
          x2="620"
          y2="14"
          stroke={styles.edges.collects.lineColor}
          strokeWidth="2"
        />
        <line
          x1="616"
          y1="10"
          x2="620"
          y2="14"
          stroke={styles.edges.collects.targetArrowColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="616"
          y1="18"
          x2="620"
          y2="14"
          stroke={styles.edges.collects.targetArrowColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x="482" y="30" fill={colorTextLabel} fontWeight="bold">
          Collects
        </text>
      </g>
      <g id="collects-source">
        <line
          x1="640"
          y1="14"
          x2="780"
          y2="14"
          stroke={styles.edges.collects.lineColor}
          strokeWidth="2"
          strokeDasharray="10 5"
        />
        <line
          x1="776"
          y1="10"
          x2="780"
          y2="14"
          stroke={styles.edges.collects.targetArrowColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="776"
          y1="18"
          x2="780"
          y2="14"
          stroke={styles.edges.collects.targetArrowColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x="642" y="30" fill={colorTextLabel} fontWeight="bold">
          Collects (Implied)
        </text>
      </g>
    </svg>
  );
};

export default Legend;
