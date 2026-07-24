import { AWS_REGION, AWS_IDENTITY_POOL_ID, OIDC_AUTHORITY } from "@/constants";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";

export const getAwsCredentials = (idToken: string) => {
  return fromCognitoIdentityPool({
    clientConfig: { region: AWS_REGION },
    identityPoolId: AWS_IDENTITY_POOL_ID,
    logins: {
      [OIDC_AUTHORITY.split("//")[1] || OIDC_AUTHORITY]: idToken,
    },
  });
};
