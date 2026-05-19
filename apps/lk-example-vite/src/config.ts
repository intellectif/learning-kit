/**
 * The mock LRS endpoint. Shared by the MSW request handler and the `useXAPI`
 * hook so the interception target and the POST target cannot drift apart.
 */
export const LRS_ENDPOINT = 'https://mock-lrs.learning-kit.test/xapi/statements';
