export function buildUnsupportedParameterMessage(reason: 'custom_time_window' | 'date_range'): string {
  if (reason === 'custom_time_window') {
    return 'I can currently check appointments within the standard 2-hour window, but not custom time ranges yet.';
  }
  return "I can't check custom date ranges in data chat yet. I can check appointments coming up soon, today's appointment count, room usage, or a daily summary.";
}

export function buildUnsupportedScopeMessage(_reason: 'broad_next_appointment'): string {
  return 'I can currently check appointments within the next 2 hours, but not the general next appointment yet.';
}

/** Deliberately one generic message for every sensitive reason — the
 *  point is never to reveal in the response itself which category of
 *  patient data was being asked about. */
export function buildUnsupportedSensitiveScopeMessage(
  _reason: 'patient_identity' | 'patient_contact' | 'patient_clinical' | 'treatment_reason' | 'staff_identity'
): string {
  return "Patient-specific and treatment details aren't available through data chat yet.";
}
