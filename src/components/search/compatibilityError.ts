export function compatibilityErrorKey(status: number, code: string | null): string {
  if (status === 404 && code === 'PROFILE_NOT_AVAILABLE') return 'compatibility.error_profile_not_available';
  if (status === 422 && code === 'PROFILE_DATA_UNAVAILABLE') return 'compatibility.error_profile_data_unavailable';
  return 'compatibility.error_analysis';
}
