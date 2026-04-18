module.exports = async function signStudioBuild(configuration) {
  const requiredEnvVars = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'AZURE_TRUSTED_SIGNING_ACCOUNT_NAME',
    'AZURE_TRUSTED_SIGNING_ENDPOINT',
  ];

  const missing = requiredEnvVars.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return;
  }

  let signFile;
  try {
    ({ signFile } = require('@azure/trusted-signing-client'));
  } catch (error) {
    throw new Error(
      `Azure Trusted Signing is configured but @azure/trusted-signing-client is unavailable: ${String(error)}`,
    );
  }

  await signFile({
    endpoint: process.env.AZURE_TRUSTED_SIGNING_ENDPOINT,
    codeSigningAccountName: process.env.AZURE_TRUSTED_SIGNING_ACCOUNT_NAME,
    certificateProfileName: process.env.AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME ?? 'default',
    files: [configuration.path],
    credentials: {
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tenantId: process.env.AZURE_TENANT_ID,
    },
  });
};
