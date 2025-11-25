import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { TextContent } from "@cloudscape-design/components";

const AuthGuard = ({ children }) => {
  const auth = useAuth();

  useEffect(() => {
    if (
      !auth.isAuthenticated &&
      !auth.isLoading &&
      auth.activeNavigator !== "signoutRedirect"
    ) {
      auth.signinRedirect();
    }
  }, [auth.isAuthenticated, auth.isLoading, auth.activeNavigator]);

  if (auth.isLoading) {
    return <TextContent>Loading...</TextContent>;
  }

  if (auth.error) {
    return (
      <TextContent>Authentication error: {auth.error.message}</TextContent>
    );
  }

  if (!auth.isAuthenticated) {
    return <TextContent>Redirecting to login...</TextContent>;
  }

  return children;
};

export default AuthGuard;
