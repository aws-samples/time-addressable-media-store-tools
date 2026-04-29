import { useEffect } from "react";

const EmptyTemplate = () => {
  useEffect(() => {
    const templateId = "empty-template";

    if (!document.getElementById(templateId)) {
      const template = document.createElement("template");
      template.id = templateId;

      const rowHeight = "65px";
      const timestampHeight = "30px";

      template.innerHTML = `
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
            height: ${rowHeight};
            line-height: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            user-select: none;
            padding-left: 1em;
          }
          

        </style>

        <div class="flex-row bordered">
          <div class="flex-cell">
            <span >No markers defined</span>
          </div>
        </div>
      `;

      document.body.appendChild(template);
    }
  }, []);

  return null;
};

export default EmptyTemplate;
