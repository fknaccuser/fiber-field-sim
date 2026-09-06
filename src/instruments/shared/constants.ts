/**
 * Physics constants and model defaults shared by every instrument. Nothing that
 * describes the instrument or the fiber may appear as an inline literal in engine code
 * outside this file (or otdr/constants.ts for OTDR-specific values) — everything else
 * comes from a profile.
 */
export const C_M_PER_S = 299_792_458;

/** For 'mismatched-fiber-splice' events without an explicit trueLossDb. */
export const MISMATCH_TRUE_LOSS_DB = 0.05;
/** Reflectance of an un-patched/dark fiber end left open in a tray or splitter port. */
export const UNTERMINATED_END_REFLECTANCE_DB = -14;
/** Reflectance of a properly patched connector at equipment (ONT/OLT), UPC/APC class. */
export const END_CONNECTOR_REFLECTANCE_DB = -50;
/** Effective insertion loss (dB) of a complete fiber break — enough to sit at the noise floor beyond it. */
export const FIBER_BREAK_LOSS_DB = 60;
