import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import {
  AWS_REGION,
  AWS_IDENTITY_POOL_ID,
  OIDC_AUTHORITY,
} from "@/constants";

export const getAwsCredentials = (idToken) => {
  return fromCognitoIdentityPool({
    clientConfig: { region: AWS_REGION },
    identityPoolId: AWS_IDENTITY_POOL_ID,
    logins: {
      [OIDC_AUTHORITY]: idToken,
    },
  });
};
