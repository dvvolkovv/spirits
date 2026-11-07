import { expect, it } from 'vitest';
import { compatibilityErrorKey } from './compatibilityError';

it('maps privacy errors without treating them as stream failures', () => {
  expect(compatibilityErrorKey(404, 'PROFILE_NOT_AVAILABLE')).toBe('compatibility.error_profile_not_available');
  expect(compatibilityErrorKey(422, 'PROFILE_DATA_UNAVAILABLE')).toBe('compatibility.error_profile_data_unavailable');
  expect(compatibilityErrorKey(500, null)).toBe('compatibility.error_analysis');
});
