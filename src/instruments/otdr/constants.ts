export { C_M_PER_S, END_CONNECTOR_REFLECTANCE_DB, FIBER_BREAK_LOSS_DB, MISMATCH_TRUE_LOSS_DB, UNTERMINATED_END_REFLECTANCE_DB } from '../shared/constants';

export const OTDR_SETUP_OVERHEAD_SECONDS = 20;
/** Floor for the noise-clamped sample power, as a fraction of the noise power itself, so a sample never reads literal zero/-Infinity dB. */
export const NOISE_CLAMP_FRACTION = 0.1;
/** A section must span at least this many event dead zones before a slope (dB/km) is reported for it. */
export const MIN_SECTION_FOR_SLOPE_EDZ_MULTIPLE = 2;
/** Below this SNR (dB) above the noise floor, an event is flagged 'near-noise-floor' rather than 'ok'. */
export const SNR_NEAR_FLOOR_DB = 6;
/** Loss and reflectance of the synthetic connector inserted at the end of a launch or receive cable. */
export const SYNTHETIC_CONNECTOR_LOSS_DB = 0.3;
