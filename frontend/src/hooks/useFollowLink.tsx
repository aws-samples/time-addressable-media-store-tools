import { useNavigate } from "react-router-dom";
import type { ButtonProps } from "@cloudscape-design/components";

export const useFollowLink = () => {
  const navigate = useNavigate();

  const followLink = (e: CustomEvent<ButtonProps.FollowDetail>) => {
    e.preventDefault();
    if (e.detail.href) {
      navigate(e.detail.href);
    }
  };

  return followLink;
};
