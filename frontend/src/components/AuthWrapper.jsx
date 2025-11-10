import { useEffect } from "react";
import { signInWithRedirect } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { useAuthStore } from "@/stores/useAuthStore";

const AuthWrapper = ({ children }) => {
  const { user, loading, isSigningOut, checkUser } = useAuthStore();

  useEffect(() => {
    checkUser();

    const hubListener = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") {
        checkUser();
      }
      if (payload.event === "signOut") {
        console.log("User signed out");
      }
    });

    return () => hubListener();
  }, [checkUser]);

  if (loading || isSigningOut) {
    return <div>Loading...</div>;
  }

  if (!user) {
    signInWithRedirect();
    return <div>Redirecting to sign in...</div>;
  }

  return children;
};

export default AuthWrapper;
