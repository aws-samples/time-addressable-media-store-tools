import { useState } from "react";
import { TopNavigation } from "@cloudscape-design/components";
import { useAuth } from "react-oidc-context";
import { Mode, applyMode } from "@cloudscape-design/global-styles";
import { APP_TITLE, APP_TITLE_LOGO } from "@/constants";
import "./Header.css";

const Header = () => {
  const [mode, setMode] = useState(Mode.Dark);
  const auth = useAuth();

  applyMode(mode);

  const handleDropdownClick = ({ detail }) => {
    if (detail.id === "signout") {
      auth.signoutRedirect({
        extraQueryParams: {
          client_id: auth.settings.client_id,
          logout_uri: auth.settings.redirect_uri,
          response_type: "code",
        },
      });
    }
    if (detail.id === "dark") {
      setMode(Mode.Dark);
    }
    if (detail.id === "light") {
      setMode(Mode.Light);
    }
  };

  return (
    <TopNavigation
      identity={{
        href: "/",
        title: APP_TITLE ?? "TAMS Tools",
        logo: { src: APP_TITLE_LOGO ?? "/aws.svg" },
      }}
      utilities={[
        {
          type: "menu-dropdown",
          text:
            auth.user?.profile?.email ||
            auth.user?.profile?.preferred_username ||
            "User",
          iconName: "user-profile",
          onItemClick: handleDropdownClick,
          items: [
            { id: "signout", text: "Sign out" },
            { id: "dark", text: "Dark Mode", disabled: mode === Mode.Dark },
            { id: "light", text: "Light Mode", disabled: mode === Mode.Light },
          ],
        },
      ]}
    />
  );
};

export default Header;
