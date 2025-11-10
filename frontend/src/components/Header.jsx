import { useState } from "react";
import { TopNavigation } from "@cloudscape-design/components";
import { useAuthStore } from "@/stores/useAuthStore";
import { Mode, applyMode } from "@cloudscape-design/global-styles";
import { APP_TITLE, APP_TITLE_LOGO } from "@/constants";
import "./Header.css";

const Header = () => {
  const [mode, setMode] = useState(Mode.Dark);
  const user = useAuthStore((state) => state.user);
  const userEmail = useAuthStore((state) => state.userEmail);
  const signOut = useAuthStore((state) => state.signOut);

  applyMode(mode);

  const handleDropdownClick = async ({ detail }) => {
    if (detail.id === "signout") {
      await signOut();
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
          text: userEmail || user?.username || "User",
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
