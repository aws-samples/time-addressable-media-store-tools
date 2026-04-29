import { useEffect } from "react";

const RowTemplate = () => {
  useEffect(() => {
    const templateId = "row-template";

    if (!document.getElementById(templateId)) {
      const template = document.createElement("template");
      template.id = templateId;

      const rowHeight = "65px";
      const timestampHeight = "30px";
      const closeIcon = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.5268 2.75758L9.28485 6.99993L13.5268 11.2421C14.1577 11.8733 14.1577 12.8958 13.5268 13.527C13.2115 13.8422 12.7982 14 12.385 14C11.9712 14 11.5579 13.8425 11.2428 13.527L7.00001 9.28433L2.7575 13.5269C2.44228 13.8422 2.02891 13.9999 1.61542 13.9999C1.20205 13.9999 0.788965 13.8424 0.473464 13.5269C-0.1575 12.896 -0.1575 11.8735 0.473464 11.242L4.71525 6.99989L0.473222 2.75758C-0.157741 2.12662 -0.157741 1.10391 0.473222 0.472945C1.10407 -0.157536 2.12617 -0.157536 2.75725 0.472945L6.99997 4.7153L11.2424 0.472945C11.8736 -0.157536 12.8958 -0.157536 13.5265 0.472945C14.1577 1.10391 14.1577 2.12662 13.5268 2.75758Z" fill="#CACFEA"/> 
        </svg>
        `;

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
            background-opacity: 0.1;
          }

          .flex-row.bordered {
            border-left: 1px solid #655372;
            border-right: 1px solid #655372;
          }

          .flex-row.bordered:last-child {
            border-left: 1px solid #655372;
            border-right: 1px solid #655372;
            border-bottom: 0px
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
          }

          .active {
            background-color: #00A3E94D
          }
          
          .remove-cell {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            margin-right: 1em;
          }

          .header-cell {
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .timestamp-container {
            display: flex;
            flex-direction: column;
            flex-grow: 1
          }

          .label-container {
            display: flex;
            flex-direction: column;
            width: 70px;
            padding-left: 1em;
          }

          .timestamp-container div {
            height: ${timestampHeight};
            line-height: ${timestampHeight};
            text-align: left;
          }
          .label-container div {
            height: ${timestampHeight};
            line-height: ${timestampHeight};
            text-align: left;
          }
          .timestamp {
            height: ${timestampHeight};
          }

          .drag-ghost {
            background-color: #6825991A;
            color: transparent;
            opacity: 1;
            border-top: 1px solid #655372 !important;
            border-left: 1px solid #655372 !important;
            border-right: 1px solid #655372 !important;
            border-bottom: none;
          }

          .drag-item {
           border-top: 1px solid #655372;
           border-bottom: 1px solid #655372 !important;
          }
        </style>

        <div class="flex-row bordered">
          <div class="flex-cell">
            <span slot="color" class="drag-handle" style="display:inline-block; height:${rowHeight}; width:10px"></span>
          </div>
          <div class="flex-cell drag-handle" style="width:100px;height:${rowHeight}">
            <img slot="thumbnail" height="${rowHeight}px">
          </div>
          <div class="flex-cell label-container">
            <div>IN</div>
            <div>OUT</div>
          </div>
          
          <div class="flex-cell timestamp-container">
            <div class="timestamp" slot="start"></div>
            <div class="timestamp" slot="end"></div>
          </div>
          <div class="flex-cell remove-cell">
            <span slot="remove">${closeIcon}</span>
          </div>
        </div>
      `;

      document.body.appendChild(template);
    }
  }, []);

  return null;
};

export default RowTemplate;
