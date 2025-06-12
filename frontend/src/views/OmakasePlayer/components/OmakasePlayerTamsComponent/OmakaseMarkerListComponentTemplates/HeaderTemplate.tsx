import { useEffect } from "react";

const HeaderTemplate = () => {
  useEffect(() => {
    const templateId = "header-template";

    if (!document.getElementById(templateId)) {
      const template = document.createElement("template");
      template.id = templateId;

      template.innerHTML = `
        <div></div>
      `;

      document.body.appendChild(template);
    }
  }, []);

  return null;
};

export default HeaderTemplate;
