// Public root entry: pet-function
export { MolarExperienceProvider, MolarExperienceLayer, useMolarExperienceConfig, useMolarExperienceConfigOptional } from './core';
export type { MolarExperienceProviderProps, MolarExperienceLayerProps } from './core';
export { SharedCatMascot } from './cat';
export { SharedMolarAI } from './ai';
export { SnaiError, getSnaiErrorUserMessage, toSnaiError } from './ai';
export { createDiagnosticId, emitSnabbbDiagnostic } from './observability';
export type { SnabbbDiagnosticEvent, SnabbbDiagnosticEventType } from './observability';
export { SharedVirtualPet } from './pet';
