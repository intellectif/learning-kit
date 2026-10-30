# @intellectif/lk-azure — public API surface

Generated from the BUILT `.d.ts` by `pnpm api-report`. A diff here is a
semver question, not an error: decide patch / minor / major, then commit
this file with the changeset that explains it.

## @intellectif/lk-azure

```ts
function assessmentFromAzure: declare function assessmentFromAzure(results: readonly AzureResult[], request: AzureAssessmentRequest): AzureAssessmentResult;
interface AzureAssessmentRequest: interface AzureAssessmentRequest { referenceText: string; locale: string; recordingKey: string; miscue: boolean; gradingSystem: 'FivePoint' | 'HundredMark'; phonemeAlphabet?: 'IPA' | 'SAPI'; assessorId?: string; }
type AzureAssessmentResult: type AzureAssessmentResult = { assessment: SpeechAssessment; ok: true; } | { code: AzureRefusalCode; errors?: ValidationError[]; message: string; ok: false; };
type AzureRefusalCode: type AzureRefusalCode = 'five_point_scale' | 'invalid_assessment' | 'miscue_across_results' | 'no_match' | 'not_a_result' | 'recognition_failed';
type AzureResult: type AzureResult = object | string;
```
