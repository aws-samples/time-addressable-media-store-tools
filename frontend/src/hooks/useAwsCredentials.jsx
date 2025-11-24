import { useAuth } from "react-oidc-context";
import { useMemo } from "react";
import { getAwsCredentials } from "@/utils/getAwsCredentials";

export const useAwsCredentials = () => {
  const auth = useAuth();
  const idToken = auth.user?.id_token;

  return useMemo(() => {
    if (!idToken) {
      throw new Error("No ID token available");
    }
    return getAwsCredentials(idToken);
  }, [idToken]);
};

export default useAwsCredentials;
